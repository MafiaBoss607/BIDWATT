-- 0004_billing_ledger_and_disputes.sql
-- Implements trusted server-side usage records, double-entry financial ledger,
-- payment transaction tracking, receipts, host earnings/payouts, and dispute workflows.

-- 1. App setting for platform commission percentage if not set
INSERT INTO public.app_settings (key, value)
VALUES ('platform_commission_pct', '15')
ON CONFLICT (key) DO NOTHING;

-- 2. Payment transactions (authorizations, collections, refunds, captures)
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  renter_id uuid NOT NULL REFERENCES public.profiles(id),
  provider text NOT NULL DEFAULT 'sandbox' CHECK (provider IN ('sandbox', 'razorpay', 'cashfree')),
  provider_order_id text UNIQUE,
  provider_payment_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'captured', 'partially_refunded', 'refunded', 'failed')),
  amount_inr numeric(12, 2) NOT NULL CHECK (amount_inr >= 0),
  currency text NOT NULL DEFAULT 'INR',
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_booking ON public.payment_intents(booking_id);
GRANT SELECT ON public.payment_intents TO authenticated;
GRANT ALL ON public.payment_intents TO service_role;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "renter and host view payment intents" ON public.payment_intents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_id AND auth.uid() IN (b.renter_id, b.host_id)
  ));

-- 3. Webhook idempotency events
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  signature text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_provider_event UNIQUE (provider, event_id)
);
GRANT SELECT, INSERT ON public.webhook_events TO service_role;

-- 4. Server-verified append-only usage telemetry records (heartbeats/metrics)
CREATE TABLE IF NOT EXISTS public.usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES public.profiles(id),
  device_id uuid REFERENCES public.host_devices(id),
  interval_start timestamptz NOT NULL,
  interval_end timestamptz NOT NULL,
  delivered_seconds integer NOT NULL CHECK (delivered_seconds >= 0),
  gpu_utilization_pct numeric(5, 2) NOT NULL DEFAULT 0 CHECK (gpu_utilization_pct >= 0 AND gpu_utilization_pct <= 100),
  memory_used_mb integer NOT NULL DEFAULT 0 CHECK (memory_used_mb >= 0),
  power_draw_watts numeric(6, 2) NOT NULL DEFAULT 0 CHECK (power_draw_watts >= 0),
  is_verified boolean NOT NULL DEFAULT true,
  raw_signature text NOT NULL DEFAULT '',
  reported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_interval CHECK (interval_end >= interval_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_records_booking ON public.usage_records(booking_id, reported_at);
GRANT SELECT ON public.usage_records TO authenticated;
GRANT ALL ON public.usage_records TO service_role;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties view usage records" ON public.usage_records
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_id AND auth.uid() IN (b.renter_id, b.host_id)
  ));

-- 5. Double-Entry Financial Ledger
-- Every transaction consists of matched balanced entries where Sum(amount_inr) = 0
-- Accounts:
--   renter_holding: funds held on booking authorization/deposit
--   platform_revenue: marketplace commission (15%)
--   host_payable: earnings credited to host for delivered compute
--   renter_refund_payable: unspent/failed time returned to renter
--   tax_payable: GST collected on platform fees
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  account text NOT NULL CHECK (account IN (
    'renter_holding',
    'platform_revenue',
    'host_payable',
    'renter_refund_payable',
    'tax_payable',
    'cash_gateway'
  )),
  entry_type text NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount_inr numeric(12, 2) NOT NULL CHECK (amount_inr > 0),
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_tx ON public.ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_booking ON public.ledger_entries(booking_id);
GRANT SELECT ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties view booking ledger entries" ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (booking_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_id AND auth.uid() IN (b.renter_id, b.host_id)
  ));

-- 6. Invoices & Receipts
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id),
  issuer_type text NOT NULL CHECK (issuer_type IN ('platform', 'host')),
  total_amount_inr numeric(12, 2) NOT NULL,
  subtotal_inr numeric(12, 2) NOT NULL,
  tax_inr numeric(12, 2) NOT NULL DEFAULT 0,
  delivered_seconds integer NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user ON public.billing_invoices(recipient_id);
GRANT SELECT ON public.billing_invoices TO authenticated;
GRANT ALL ON public.billing_invoices TO service_role;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user views own invoices" ON public.billing_invoices
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- 7. Host Payout Requests & Tracking
CREATE TABLE IF NOT EXISTS public.host_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_inr numeric(12, 2) NOT NULL CHECK (amount_inr >= 100), -- minimum payout ₹100
  payout_method text NOT NULL DEFAULT 'upi' CHECK (payout_method IN ('upi', 'bank_account')),
  payout_target text NOT NULL CHECK (char_length(payout_target) BETWEEN 3 AND 80),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  provider_reference text,
  failure_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_host_payouts_host ON public.host_payouts(host_id);
GRANT SELECT, INSERT ON public.host_payouts TO authenticated;
GRANT ALL ON public.host_payouts TO service_role;
ALTER TABLE public.host_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts manage own payouts" ON public.host_payouts
  FOR ALL TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

-- 8. Disputes Workflow
CREATE TABLE IF NOT EXISTS public.booking_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  initiator_id uuid NOT NULL REFERENCES public.profiles(id),
  respondent_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 200),
  details text NOT NULL CHECK (char_length(details) BETWEEN 10 AND 2000),
  claimed_refund_inr numeric(12, 2) CHECK (claimed_refund_inr >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved_renter_refund', 'resolved_host_paid', 'appealed', 'closed')),
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_booking ON public.booking_disputes(booking_id);
GRANT SELECT, INSERT, UPDATE ON public.booking_disputes TO authenticated;
GRANT ALL ON public.booking_disputes TO service_role;
ALTER TABLE public.booking_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties view disputes" ON public.booking_disputes
  FOR SELECT TO authenticated
  USING (auth.uid() IN (initiator_id, respondent_id));
CREATE POLICY "parties open dispute" ON public.booking_disputes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = initiator_id);

CREATE TABLE IF NOT EXISTS public.dispute_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES public.booking_disputes(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES public.profiles(id),
  file_url text NOT NULL,
  description text NOT NULL CHECK (char_length(description) <= 500),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.dispute_evidence TO authenticated;
GRANT ALL ON public.dispute_evidence TO service_role;
ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispute parties view evidence" ON public.dispute_evidence
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.booking_disputes d
    WHERE d.id = dispute_id AND auth.uid() IN (d.initiator_id, d.respondent_id)
  ));
CREATE POLICY "dispute parties upload evidence" ON public.dispute_evidence
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploader_id);

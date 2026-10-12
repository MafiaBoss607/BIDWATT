-- Migration 0006: Reliability, Recovery, Trust, Reviews & Moderation
-- P2P GPU Rental Marketplace (India-first, INR)

-- 1. Reliability Events & Progressive Enforcement
CREATE TABLE IF NOT EXISTS public.reliability_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'host_early_cancel',
    'host_last_minute_cancel',
    'host_no_show',
    'hardware_failure_recovered',
    'hardware_failure_fatal',
    'renter_early_cancel',
    'renter_late_cancel',
    'abuse_suspected',
    'dispute_lost'
  )),
  cause_category TEXT NOT NULL CHECK (cause_category IN ('preventable_human', 'genuine_technical', 'suspected_abuse', 'other')),
  score_delta NUMERIC(5,2) NOT NULL DEFAULT 0.0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  appealed BOOLEAN NOT NULL DEFAULT false,
  appeal_status TEXT CHECK (appeal_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Host reliability profiles & tier statuses
CREATE TABLE IF NOT EXISTS public.host_reliability_profiles (
  host_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'provisional' CHECK (tier IN ('provisional', 'verified', 'standard', 'restricted', 'suspended')),
  reliability_score NUMERIC(5,2) NOT NULL DEFAULT 100.0,
  completed_bookings_count INT NOT NULL DEFAULT 0,
  last_minute_cancel_count INT NOT NULL DEFAULT 0,
  uptime_pct NUMERIC(5,2) NOT NULL DEFAULT 100.0,
  failure_recovery_pct NUMERIC(5,2) NOT NULL DEFAULT 100.0,
  warning_count INT NOT NULL DEFAULT 0,
  active_restrictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  appeal_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Replacement Offers (Disaster recovery without guaranteed replacement false promises)
CREATE TABLE IF NOT EXISTS public.replacement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  failed_booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  renter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'seeking_replacements' CHECK (status IN ('seeking_replacements', 'offers_ready', 'accepted', 'refunded', 'expired')),
  target_gpu_model TEXT NOT NULL,
  min_vram_gb INT NOT NULL,
  remaining_duration_hours NUMERIC(6,2) NOT NULL,
  max_unit_price_inr NUMERIC(10,2) NOT NULL,
  checkpoint_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.replacement_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.replacement_requests(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.host_devices(id) ON DELETE SET NULL,
  unit_price_inr NUMERIC(10,2) NOT NULL,
  billing_unit TEXT NOT NULL CHECK (billing_unit IN ('hour', 'minute', 'session')),
  can_resume_checkpoint BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Reviews & Reputation System (Both Parties)
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('renter', 'host')),
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  comment TEXT NOT NULL,
  hardware_accuracy_rating INT CHECK (hardware_accuracy_rating >= 1 AND hardware_accuracy_rating <= 5),
  communication_rating INT CHECK (communication_rating >= 1 AND communication_rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_review_per_role_booking UNIQUE (booking_id, reviewer_role)
);

-- 4. Abuse Reports & Admin Moderation Queue
CREATE TABLE IF NOT EXISTS public.abuse_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'sandbox_escape_attempt',
    'mining_unauthorized',
    'credential_harvesting',
    'abusive_cancellation',
    'payment_tampering',
    'hardware_spoofing',
    'harassment',
    'other'
  )),
  evidence_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'action_taken', 'dismissed')),
  action_summary TEXT,
  moderator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. System Observability & Host Heartbeat Incidents
CREATE TABLE IF NOT EXISTS public.system_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id UUID REFERENCES public.host_devices(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  incident_type TEXT NOT NULL CHECK (incident_type IN ('heartbeat_timeout', 'oom_killed', 'gpu_falloff', 'network_disconnect', 'unauthorized_probe')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security
ALTER TABLE public.reliability_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_reliability_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_incidents ENABLE ROW LEVEL SECURITY;

-- Read policies
CREATE POLICY "Users can view public host reliability profiles"
  ON public.host_reliability_profiles FOR SELECT USING (true);

CREATE POLICY "Users can view reviews"
  ON public.reviews FOR SELECT USING (true);

CREATE POLICY "Users view own reliability events"
  ON public.reliability_events FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create reviews on their bookings"
  ON public.reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Users can submit abuse reports"
  ON public.abuse_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

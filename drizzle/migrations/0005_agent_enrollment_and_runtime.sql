-- 0005_agent_enrollment_and_runtime.sql
-- Implements agent enrollment tokens, device daemon telemetry,
-- session runtime credentials, benchmark verification, and job isolation states.

-- 1. Agent Enrollment Tokens (One-time, short-lived, linked to host account)
CREATE TABLE IF NOT EXISTS public.agent_enrollment_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  device_label text NOT NULL DEFAULT 'Linux-GPU-Rig',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.agent_enrollment_tokens TO authenticated;
GRANT ALL ON public.agent_enrollment_tokens TO service_role;
ALTER TABLE public.agent_enrollment_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts manage own enrollment tokens" ON public.agent_enrollment_tokens
  FOR ALL TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

-- 2. Hardware telemetry, benchmarks, and driver status
ALTER TABLE public.host_devices
  ADD COLUMN IF NOT EXISTS agent_version text DEFAULT '',
  ADD COLUMN IF NOT EXISTS os_version text DEFAULT '',
  ADD COLUMN IF NOT EXISTS kernel_version text DEFAULT '',
  ADD COLUMN IF NOT EXISTS driver_version text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cuda_version text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cpu_model text DEFAULT '',
  ADD COLUMN IF NOT EXISTS cpu_cores integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS disk_free_gb numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_paused boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_key text DEFAULT '',
  ADD COLUMN IF NOT EXISTS benchmark_details jsonb DEFAULT '{}'::jsonb;

-- 3. Session Credentials (Short-lived, ephemeral, rotated/revoked per session)
CREATE TABLE IF NOT EXISTS public.session_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  renter_id uuid NOT NULL REFERENCES public.profiles(id),
  host_id uuid NOT NULL REFERENCES public.profiles(id),
  device_id uuid REFERENCES public.host_devices(id),
  proxy_token text NOT NULL UNIQUE,
  proxy_endpoint text NOT NULL,
  ssh_public_key text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

GRANT SELECT ON public.session_credentials TO authenticated;
GRANT ALL ON public.session_credentials TO service_role;
ALTER TABLE public.session_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties view session credentials" ON public.session_credentials
  FOR SELECT TO authenticated
  USING (auth.uid() IN (renter_id, host_id));

-- 4. Session Readiness Checks (Pre-session audit before READY_TO_START)
CREATE TABLE IF NOT EXISTS public.session_readiness_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.host_devices(id),
  agent_online boolean NOT NULL DEFAULT false,
  gpu_idle boolean NOT NULL DEFAULT false,
  runtime_ready boolean NOT NULL DEFAULT false,
  temp_celsius numeric(5,1) NOT NULL DEFAULT 0,
  temp_within_limit boolean NOT NULL DEFAULT false,
  disk_gb_available numeric(10,2) NOT NULL DEFAULT 0,
  disk_sufficient boolean NOT NULL DEFAULT false,
  memory_mb_available numeric(10,2) NOT NULL DEFAULT 0,
  memory_sufficient boolean NOT NULL DEFAULT false,
  network_latency_ms numeric(8,2) NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  failure_reasons text[] DEFAULT '{}',
  checked_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.session_readiness_checks TO authenticated;
GRANT ALL ON public.session_readiness_checks TO service_role;
ALTER TABLE public.session_readiness_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties view readiness check" ON public.session_readiness_checks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_id AND auth.uid() IN (b.renter_id, b.host_id)
  ));

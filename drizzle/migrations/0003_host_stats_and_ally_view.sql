CREATE OR REPLACE FUNCTION public.host_stats(_hosts uuid[]) RETURNS TABLE (host_id uuid, completed int, failed int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h, count(*) FILTER (WHERE b.state IN ('COMPLETED'))::int, count(*) FILTER (WHERE b.state IN ('FAILED'))::int
  FROM unnest(_hosts) h LEFT JOIN public.bookings b ON b.host_id = h GROUP BY h
$$;

CREATE OR REPLACE FUNCTION public.ally_view(_other uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.privacy_settings; out jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.are_allies(auth.uid(), _other) THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.privacy_settings WHERE user_id = _other;
  IF coalesce(p.allies_see_devices, true) THEN
    out := out || jsonb_build_object('devices', (SELECT coalesce(jsonb_agg(jsonb_build_object('gpu_model', gpu_model, 'vram_gb', vram_gb, 'hourly_rate_inr', hourly_rate_inr)), '[]') FROM public.host_devices WHERE host_id = _other));
  END IF;
  IF coalesce(p.allies_see_availability, true) THEN
    out := out || jsonb_build_object('available', EXISTS (SELECT 1 FROM public.host_devices WHERE host_id = _other AND available));
  END IF;
  IF coalesce(p.allies_see_completed_count, true) THEN
    out := out || jsonb_build_object('completed', (SELECT count(*) FROM public.bookings WHERE host_id = _other AND state = 'COMPLETED'));
  END IF;
  RETURN out;
END $$;
REVOKE EXECUTE ON FUNCTION public.ally_view(uuid) FROM public, anon;
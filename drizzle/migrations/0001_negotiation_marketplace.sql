ALTER TABLE public.gpu_requests
  ADD COLUMN runtime text NOT NULL DEFAULT '' CHECK (char_length(runtime) <= 80),
  ADD COLUMN start_by timestamptz,
  ADD COLUMN budget_max_inr integer CHECK (budget_max_inr IS NULL OR budget_max_inr > 0),
  ADD COLUMN interruption_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN storage_gb integer NOT NULL DEFAULT 0 CHECK (storage_gb BETWEEN 0 AND 10000),
  ADD COLUMN bandwidth_note text NOT NULL DEFAULT '' CHECK (char_length(bandwidth_note) <= 200),
  ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days');

CREATE TABLE public.app_settings (key text PRIMARY KEY, value text NOT NULL);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable" ON public.app_settings FOR SELECT USING (true);
INSERT INTO public.app_settings VALUES ('ally_unlock', 'chat');

CREATE TABLE public.privacy_settings (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  allies_see_devices boolean NOT NULL DEFAULT true,
  allies_see_availability boolean NOT NULL DEFAULT true,
  allies_see_completed_count boolean NOT NULL DEFAULT true,
  email_notifications boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE ON public.privacy_settings TO authenticated;
GRANT ALL ON public.privacy_settings TO service_role;
ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own privacy" ON public.privacy_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id), CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own blocks read" ON public.blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "own blocks delete" ON public.blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

CREATE OR REPLACE FUNCTION public.is_blocked(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a))
$$;

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "file report" ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id AND reporter_id <> target_id);
CREATE POLICY "own reports" ON public.reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);

CREATE TABLE public.host_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gpu_model text NOT NULL CHECK (char_length(gpu_model) BETWEEN 2 AND 80),
  vram_gb integer NOT NULL CHECK (vram_gb BETWEEN 1 AND 192),
  ram_gb integer NOT NULL DEFAULT 16 CHECK (ram_gb BETWEEN 1 AND 2048),
  benchmark_score integer NOT NULL DEFAULT 0 CHECK (benchmark_score >= 0),
  hourly_rate_inr numeric(10,2) NOT NULL CHECK (hourly_rate_inr > 0),
  runtimes text[] NOT NULL DEFAULT '{}',
  available boolean NOT NULL DEFAULT true,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.host_devices TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.host_devices TO authenticated;
GRANT ALL ON public.host_devices TO service_role;
ALTER TABLE public.host_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devices readable" ON public.host_devices FOR SELECT USING (true);
CREATE POLICY "own devices insert" ON public.host_devices FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id AND verified = false);
CREATE POLICY "own devices update" ON public.host_devices FOR UPDATE TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);
CREATE POLICY "own devices delete" ON public.host_devices FOR DELETE TO authenticated USING (auth.uid() = host_id);
CREATE OR REPLACE FUNCTION public.protect_verified() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' AND NEW.verified IS DISTINCT FROM OLD.verified THEN RAISE EXCEPTION 'verified is set by Bidwatt'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER host_devices_verified BEFORE UPDATE ON public.host_devices FOR EACH ROW EXECUTE FUNCTION public.protect_verified();

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  renter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.gpu_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CHECK (renter_id <> host_id)
);
CREATE UNIQUE INDEX conversations_pair_req ON public.conversations (renter_id, host_id, COALESCE(request_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read" ON public.conversations FOR SELECT TO authenticated USING (auth.uid() IN (renter_id, host_id));

CREATE OR REPLACE FUNCTION public.is_participant(conv uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversations WHERE id = conv AND uid IN (renter_id, host_id))
$$;
CREATE OR REPLACE FUNCTION public.other_party(conv uuid, uid uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN renter_id = uid THEN host_id ELSE renter_id END FROM public.conversations WHERE id = conv
$$;

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  attachment_path text,
  attachment_name text CHECK (attachment_name IS NULL OR char_length(attachment_name) <= 200),
  attachment_size integer CHECK (attachment_size IS NULL OR attachment_size BETWEEN 1 AND 5242880),
  attachment_type text CHECK (attachment_type IS NULL OR attachment_type IN ('image/png','image/jpeg','image/webp','application/pdf','text/plain')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(body) > 0 OR attachment_path IS NOT NULL)
);
CREATE INDEX messages_conv ON public.messages (conversation_id, created_at);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read messages" ON public.messages FOR SELECT TO authenticated USING (public.is_participant(conversation_id, auth.uid()));
CREATE POLICY "participants send unblocked" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND public.is_participant(conversation_id, auth.uid())
  AND NOT public.is_blocked(auth.uid(), public.other_party(conversation_id, auth.uid()))
  AND (attachment_path IS NULL OR attachment_path LIKE conversation_id::text || '/%')
);

CREATE TABLE public.conversation_reads (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.conversation_reads TO authenticated;
GRANT ALL ON public.conversation_reads TO service_role;
ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read receipts" ON public.conversation_reads FOR SELECT TO authenticated USING (public.is_participant(conversation_id, auth.uid()));
CREATE POLICY "own receipt write" ON public.conversation_reads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.is_participant(conversation_id, auth.uid()));
CREATE POLICY "own receipt update" ON public.conversation_reads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  link text,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user ON public.notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "mark own read" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.notify(uid uuid, k text, t text, l text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (user_id, kind, title, link) VALUES (uid, k, t, l)
$$;
REVOKE EXECUTE ON FUNCTION public.notify(uuid, text, text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.on_message_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_after_insert AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.on_message_insert();

CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  proposer_id uuid NOT NULL REFERENCES public.profiles(id),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id),
  supersedes_id uuid REFERENCES public.offers(id),
  gpu_model text NOT NULL CHECK (char_length(gpu_model) BETWEEN 1 AND 80),
  min_specs text NOT NULL DEFAULT '' CHECK (char_length(min_specs) <= 300),
  vram_gb integer NOT NULL CHECK (vram_gb BETWEEN 1 AND 192),
  start_at timestamptz NOT NULL,
  duration_hours numeric(6,2) NOT NULL CHECK (duration_hours > 0 AND duration_hours <= 720),
  billing_unit text NOT NULL CHECK (billing_unit IN ('minute','hour','session')),
  unit_price_inr numeric(10,2) NOT NULL CHECK (unit_price_inr > 0),
  est_total_inr numeric(12,2) NOT NULL CHECK (est_total_inr > 0),
  runtime text NOT NULL DEFAULT '' CHECK (char_length(runtime) <= 120),
  interruption_allowed boolean NOT NULL DEFAULT false,
  storage_terms text NOT NULL DEFAULT '' CHECK (char_length(storage_terms) <= 300),
  bandwidth_terms text NOT NULL DEFAULT '' CHECK (char_length(bandwidth_terms) <= 300),
  cancellation_terms text NOT NULL DEFAULT '' CHECK (char_length(cancellation_terms) <= 500),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','countered','expired','withdrawn')),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offers_conv ON public.offers (conversation_id, created_at);
GRANT SELECT ON public.offers TO authenticated;
GRANT ALL ON public.offers TO service_role;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read offers" ON public.offers FOR SELECT TO authenticated USING (auth.uid() IN (proposer_id, recipient_id));

CREATE OR REPLACE FUNCTION public.offers_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.conversation_id, NEW.proposer_id, NEW.recipient_id, NEW.supersedes_id, NEW.gpu_model, NEW.min_specs, NEW.vram_gb, NEW.start_at,
      NEW.duration_hours, NEW.billing_unit, NEW.unit_price_inr, NEW.est_total_inr, NEW.runtime, NEW.interruption_allowed,
      NEW.storage_terms, NEW.bandwidth_terms, NEW.cancellation_terms, NEW.expires_at, NEW.created_at)
     IS DISTINCT FROM
     (OLD.conversation_id, OLD.proposer_id, OLD.recipient_id, OLD.supersedes_id, OLD.gpu_model, OLD.min_specs, OLD.vram_gb, OLD.start_at,
      OLD.duration_hours, OLD.billing_unit, OLD.unit_price_inr, OLD.est_total_inr, OLD.runtime, OLD.interruption_allowed,
      OLD.storage_terms, OLD.bandwidth_terms, OLD.cancellation_terms, OLD.expires_at, OLD.created_at) THEN
    RAISE EXCEPTION 'Offer terms are immutable; send a new offer instead' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status <> 'pending' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Offer is already %', OLD.status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER offers_immutable BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.offers_immutable();
CREATE OR REPLACE FUNCTION public.offers_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'accepted' THEN RAISE EXCEPTION 'Accepted offers cannot be deleted'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER offers_no_delete BEFORE DELETE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.offers_no_delete();

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL UNIQUE REFERENCES public.offers(id),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id),
  renter_id uuid NOT NULL REFERENCES public.profiles(id),
  host_id uuid NOT NULL REFERENCES public.profiles(id),
  state text NOT NULL DEFAULT 'BOOKING_CONFIRMED' CHECK (state IN ('OFFER_PENDING','BOOKING_CONFIRMED','HOST_PREPARING','READY_TO_START','RUNNING','COMPLETED','CANCELLED','FAILED','REFUND_PENDING','REFUNDED','DISPUTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties read bookings" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() IN (renter_id, host_id));

CREATE TABLE public.booking_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_state text NOT NULL,
  to_state text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id),
  note text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.booking_events TO authenticated;
GRANT ALL ON public.booking_events TO service_role;
ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties read events" ON public.booking_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND auth.uid() IN (b.renter_id, b.host_id)));

CREATE TABLE public.booking_transitions (
  from_state text NOT NULL, to_state text NOT NULL, actor text NOT NULL CHECK (actor IN ('host','renter','either')),
  PRIMARY KEY (from_state, to_state)
);
GRANT SELECT ON public.booking_transitions TO anon, authenticated;
GRANT ALL ON public.booking_transitions TO service_role;
ALTER TABLE public.booking_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transitions readable" ON public.booking_transitions FOR SELECT USING (true);
INSERT INTO public.booking_transitions VALUES
 ('OFFER_PENDING','BOOKING_CONFIRMED','either'),
 ('BOOKING_CONFIRMED','HOST_PREPARING','host'),
 ('BOOKING_CONFIRMED','CANCELLED','either'),
 ('HOST_PREPARING','READY_TO_START','host'),
 ('HOST_PREPARING','CANCELLED','either'),
 ('HOST_PREPARING','FAILED','host'),
 ('READY_TO_START','RUNNING','renter'),
 ('READY_TO_START','CANCELLED','either'),
 ('READY_TO_START','FAILED','host'),
 ('RUNNING','COMPLETED','either'),
 ('RUNNING','FAILED','either'),
 ('RUNNING','DISPUTED','either'),
 ('COMPLETED','DISPUTED','renter'),
 ('CANCELLED','REFUND_PENDING','either'),
 ('FAILED','REFUND_PENDING','either'),
 ('DISPUTED','REFUND_PENDING','host'),
 ('DISPUTED','COMPLETED','renter'),
 ('REFUND_PENDING','REFUNDED','host');

CREATE OR REPLACE FUNCTION public.transition_booking(_booking uuid, _to text, _note text DEFAULT '') RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings; rule text; me uuid := auth.uid(); role text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR me NOT IN (b.renter_id, b.host_id) THEN RAISE EXCEPTION 'Booking not found'; END IF;
  role := CASE WHEN me = b.host_id THEN 'host' ELSE 'renter' END;
  SELECT actor INTO rule FROM public.booking_transitions WHERE from_state = b.state AND to_state = _to;
  IF rule IS NULL THEN RAISE EXCEPTION 'Illegal transition % -> %', b.state, _to USING ERRCODE = 'P0001'; END IF;
  IF rule <> 'either' AND rule <> role THEN RAISE EXCEPTION 'Only the % can move % -> %', rule, b.state, _to USING ERRCODE = 'P0001'; END IF;
  UPDATE public.bookings SET state = _to, updated_at = now() WHERE id = _booking;
  INSERT INTO public.booking_events (booking_id, from_state, to_state, actor_id, note) VALUES (_booking, b.state, _to, me, left(coalesce(_note,''), 500));
  PERFORM public.notify(CASE WHEN role = 'host' THEN b.renter_id ELSE b.host_id END, 'booking', 'Booking is now ' || replace(_to, '_', ' '), '/bookings/' || _booking);
  RETURN _to;
END $$;

CREATE OR REPLACE FUNCTION public.start_conversation(_other uuid, _request uuid DEFAULT NULL, _i_am_host boolean DEFAULT true) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); r uuid; h uuid; cid uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF _other = me THEN RAISE EXCEPTION 'Cannot chat with yourself'; END IF;
  IF public.is_blocked(me, _other) THEN RAISE EXCEPTION 'You cannot contact this user' USING ERRCODE = 'P0001'; END IF;
  IF _request IS NOT NULL THEN
    SELECT renter_id INTO r FROM public.gpu_requests WHERE id = _request;
    IF r IS NULL OR r NOT IN (me, _other) THEN RAISE EXCEPTION 'Request mismatch'; END IF;
    h := CASE WHEN r = me THEN _other ELSE me END;
  ELSE
    IF _i_am_host THEN h := me; r := _other; ELSE h := _other; r := me; END IF;
  END IF;
  SELECT id INTO cid FROM public.conversations WHERE renter_id = r AND host_id = h AND request_id IS NOT DISTINCT FROM _request;
  IF cid IS NULL THEN
    INSERT INTO public.conversations (renter_id, host_id, request_id) VALUES (r, h, _request) RETURNING id INTO cid;
    PERFORM public.notify(_other, 'chat', 'New conversation started', '/chat/' || cid);
  END IF;
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.create_offer(
  _conversation uuid, _gpu_model text, _min_specs text, _vram_gb int, _start_at timestamptz, _duration_hours numeric,
  _billing_unit text, _unit_price_inr numeric, _runtime text, _interruption_allowed boolean, _storage_terms text,
  _bandwidth_terms text, _cancellation_terms text, _expires_at timestamptz, _supersedes uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); other uuid; prev public.offers; total numeric; oid uuid;
BEGIN
  IF me IS NULL OR NOT public.is_participant(_conversation, me) THEN RAISE EXCEPTION 'Not your conversation'; END IF;
  other := public.other_party(_conversation, me);
  IF public.is_blocked(me, other) THEN RAISE EXCEPTION 'You cannot contact this user' USING ERRCODE = 'P0001'; END IF;
  IF _expires_at <= now() THEN RAISE EXCEPTION 'Expiry must be in the future'; END IF;
  IF _expires_at > _start_at THEN RAISE EXCEPTION 'Offer must expire before the session starts'; END IF;
  total := round(CASE _billing_unit WHEN 'minute' THEN _unit_price_inr * _duration_hours * 60
                                    WHEN 'hour' THEN _unit_price_inr * _duration_hours
                                    ELSE _unit_price_inr END, 2);
  IF _supersedes IS NOT NULL THEN
    SELECT * INTO prev FROM public.offers WHERE id = _supersedes FOR UPDATE;
    IF NOT FOUND OR prev.conversation_id <> _conversation THEN RAISE EXCEPTION 'Offer not found'; END IF;
    IF prev.status <> 'pending' THEN RAISE EXCEPTION 'Offer is already %', prev.status USING ERRCODE = 'P0001'; END IF;
    IF prev.recipient_id = me THEN
      UPDATE public.offers SET status = 'countered', responded_at = now() WHERE id = prev.id;
    ELSE
      UPDATE public.offers SET status = 'withdrawn', responded_at = now() WHERE id = prev.id;
    END IF;
  END IF;
  INSERT INTO public.offers (conversation_id, proposer_id, recipient_id, supersedes_id, gpu_model, min_specs, vram_gb, start_at,
    duration_hours, billing_unit, unit_price_inr, est_total_inr, runtime, interruption_allowed, storage_terms, bandwidth_terms,
    cancellation_terms, expires_at)
  VALUES (_conversation, me, other, _supersedes, _gpu_model, coalesce(_min_specs,''), _vram_gb, _start_at, _duration_hours,
    _billing_unit, _unit_price_inr, total, coalesce(_runtime,''), _interruption_allowed, coalesce(_storage_terms,''),
    coalesce(_bandwidth_terms,''), coalesce(_cancellation_terms,''), _expires_at)
  RETURNING id INTO oid;
  UPDATE public.conversations SET last_message_at = now() WHERE id = _conversation;
  PERFORM public.notify(other, 'offer', CASE WHEN _supersedes IS NULL THEN 'New offer received' ELSE 'Counter-offer received' END, '/chat/' || _conversation);
  RETURN oid;
END $$;

CREATE TABLE public.ally_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX ally_pair ON public.ally_links (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
GRANT SELECT ON public.ally_links TO authenticated;
GRANT ALL ON public.ally_links TO service_role;
ALTER TABLE public.ally_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ally links" ON public.ally_links FOR SELECT TO authenticated USING (auth.uid() IN (requester_id, addressee_id));

CREATE TABLE public.ally_mutes (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, muted_id)
);
GRANT SELECT, INSERT, DELETE ON public.ally_mutes TO authenticated;
GRANT ALL ON public.ally_mutes TO service_role;
ALTER TABLE public.ally_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own mutes" ON public.ally_mutes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ally_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.gpu_requests(id) ON DELETE SET NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','responded','declined','expired','converted')),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ally_requests TO authenticated;
GRANT ALL ON public.ally_requests TO service_role;
ALTER TABLE public.ally_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ally asks" ON public.ally_requests FOR SELECT TO authenticated USING (auth.uid() IN (sender_id, recipient_id));

CREATE OR REPLACE FUNCTION public.respond_offer(_offer uuid, _action text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); o public.offers; c public.conversations; bid uuid;
BEGIN
  IF _action NOT IN ('accept','reject') THEN RAISE EXCEPTION 'Unknown action'; END IF;
  SELECT * INTO o FROM public.offers WHERE id = _offer FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR o.recipient_id <> me THEN RAISE EXCEPTION 'Only the recipient can respond' USING ERRCODE = 'P0001'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Offer is already %', o.status USING ERRCODE = 'P0001'; END IF;
  IF o.expires_at <= now() THEN
    RAISE EXCEPTION 'Offer has expired' USING ERRCODE = 'P0001';
  END IF;
  IF public.is_blocked(o.proposer_id, o.recipient_id) THEN RAISE EXCEPTION 'You cannot contact this user' USING ERRCODE = 'P0001'; END IF;
  IF _action = 'reject' THEN
    UPDATE public.offers SET status = 'rejected', responded_at = now() WHERE id = _offer;
    PERFORM public.notify(o.proposer_id, 'offer', 'Your offer was declined', '/chat/' || o.conversation_id);
    RETURN NULL;
  END IF;
  SELECT * INTO c FROM public.conversations WHERE id = o.conversation_id;
  UPDATE public.offers SET status = 'accepted', responded_at = now() WHERE id = _offer;
  INSERT INTO public.bookings (offer_id, conversation_id, renter_id, host_id) VALUES (o.id, c.id, c.renter_id, c.host_id) RETURNING id INTO bid;
  INSERT INTO public.booking_events (booking_id, from_state, to_state, actor_id, note) VALUES (bid, 'OFFER_PENDING', 'BOOKING_CONFIRMED', me, 'Offer accepted');
  UPDATE public.ally_requests SET status = 'converted' WHERE conversation_id = c.id AND status IN ('sent','responded');
  PERFORM public.notify(o.proposer_id, 'booking', 'Offer accepted — booking confirmed', '/bookings/' || bid);
  RETURN bid;
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_offer(_offer uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.offers;
BEGIN
  SELECT * INTO o FROM public.offers WHERE id = _offer FOR UPDATE;
  IF NOT FOUND OR o.proposer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your offer'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Offer is already %', o.status USING ERRCODE = 'P0001'; END IF;
  UPDATE public.offers SET status = 'withdrawn', responded_at = now() WHERE id = _offer;
END $$;

CREATE OR REPLACE FUNCTION public.are_allies(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.ally_links WHERE status = 'accepted' AND LEAST(requester_id, addressee_id) = LEAST(a,b) AND GREATEST(requester_id, addressee_id) = GREATEST(a,b))
$$;

CREATE OR REPLACE FUNCTION public.can_become_allies(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE (SELECT value FROM public.app_settings WHERE key = 'ally_unlock')
    WHEN 'booking' THEN EXISTS (SELECT 1 FROM public.bookings WHERE state = 'COMPLETED' AND ((renter_id = a AND host_id = b) OR (renter_id = b AND host_id = a)))
    ELSE EXISTS (SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id
                 WHERE (c.renter_id = a AND c.host_id = b) OR (c.renter_id = b AND c.host_id = a))
  END
$$;

CREATE OR REPLACE FUNCTION public.request_ally(_target uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); lid uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF public.is_blocked(me, _target) THEN RAISE EXCEPTION 'You cannot contact this user' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.can_become_allies(me, _target) THEN RAISE EXCEPTION 'You can add Allies only after interacting on Bidwatt' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.ally_links (requester_id, addressee_id) VALUES (me, _target) RETURNING id INTO lid;
  PERFORM public.notify(_target, 'ally', 'New Ally request', '/allies');
  RETURN lid;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'An Ally request already exists' USING ERRCODE = 'P0001';
END $$;

CREATE OR REPLACE FUNCTION public.respond_ally(_link uuid, _accept boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.ally_links;
BEGIN
  SELECT * INTO l FROM public.ally_links WHERE id = _link FOR UPDATE;
  IF NOT FOUND OR l.addressee_id <> auth.uid() OR l.status <> 'pending' THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _accept THEN
    UPDATE public.ally_links SET status = 'accepted', accepted_at = now() WHERE id = _link;
    PERFORM public.notify(l.requester_id, 'ally', 'Your Ally request was accepted', '/allies');
  ELSE
    DELETE FROM public.ally_links WHERE id = _link;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.remove_ally(_other uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.ally_links WHERE LEAST(requester_id, addressee_id) = LEAST(auth.uid(), _other) AND GREATEST(requester_id, addressee_id) = GREATEST(auth.uid(), _other);
$$;

CREATE OR REPLACE FUNCTION public.ask_allies(_recipients uuid[], _message text, _request uuid DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); rid uuid; n int := 0;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF array_length(_recipients, 1) IS NULL OR array_length(_recipients, 1) > 20 THEN RAISE EXCEPTION 'Pick 1–20 Allies'; END IF;
  IF _request IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.gpu_requests WHERE id = _request AND renter_id = me) THEN RAISE EXCEPTION 'Not your request'; END IF;
  FOREACH rid IN ARRAY _recipients LOOP
    IF NOT public.are_allies(me, rid) OR public.is_blocked(me, rid) THEN RAISE EXCEPTION 'You can only ask your Allies' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO public.ally_requests (sender_id, recipient_id, request_id, message) VALUES (me, rid, _request, _message);
    IF NOT EXISTS (SELECT 1 FROM public.ally_mutes WHERE user_id = rid AND muted_id = me) THEN
      PERFORM public.notify(rid, 'ally_ask', 'An Ally asked you for GPU time', '/allies');
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.respond_ally_ask(_ask uuid, _accept boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.ally_requests; cid uuid;
BEGIN
  SELECT * INTO a FROM public.ally_requests WHERE id = _ask FOR UPDATE;
  IF NOT FOUND OR a.recipient_id <> auth.uid() THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF a.status <> 'sent' THEN RAISE EXCEPTION 'Request is already %', a.status USING ERRCODE = 'P0001'; END IF;
  IF a.expires_at <= now() THEN RAISE EXCEPTION 'Request has expired' USING ERRCODE = 'P0001'; END IF;
  IF public.is_blocked(a.sender_id, a.recipient_id) THEN RAISE EXCEPTION 'You cannot contact this user' USING ERRCODE = 'P0001'; END IF;
  IF NOT _accept THEN
    UPDATE public.ally_requests SET status = 'declined' WHERE id = _ask;
    PERFORM public.notify(a.sender_id, 'ally_ask', 'An Ally can''t help this time', '/allies');
    RETURN NULL;
  END IF;
  cid := public.start_conversation(a.sender_id, a.request_id, true);
  UPDATE public.ally_requests SET status = 'responded', conversation_id = cid WHERE id = _ask;
  PERFORM public.notify(a.sender_id, 'ally_ask', 'An Ally replied to your request', '/chat/' || cid);
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.block_user(_target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL OR _target = me THEN RAISE EXCEPTION 'Invalid target'; END IF;
  INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (me, _target) ON CONFLICT DO NOTHING;
  UPDATE public.ally_requests SET status = 'declined' WHERE status = 'sent' AND ((sender_id = me AND recipient_id = _target) OR (sender_id = _target AND recipient_id = me));
  UPDATE public.offers SET status = 'withdrawn', responded_at = now() WHERE status = 'pending' AND ((proposer_id = me AND recipient_id = _target) OR (proposer_id = _target AND recipient_id = me));
  DELETE FROM public.ally_links WHERE LEAST(requester_id, addressee_id) = LEAST(me, _target) AND GREATEST(requester_id, addressee_id) = GREATEST(me, _target);
END $$;

REVOKE EXECUTE ON FUNCTION public.transition_booking(uuid, text, text), public.start_conversation(uuid, uuid, boolean),
  public.create_offer(uuid, text, text, int, timestamptz, numeric, text, numeric, text, boolean, text, text, text, timestamptz, uuid),
  public.respond_offer(uuid, text), public.withdraw_offer(uuid), public.request_ally(uuid), public.respond_ally(uuid, boolean),
  public.remove_ally(uuid), public.ask_allies(uuid[], text, uuid), public.respond_ally_ask(uuid, boolean), public.block_user(uuid)
  FROM public, anon;

CREATE POLICY "participants upload attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND public.is_participant(((storage.foldername(name))[1])::uuid, auth.uid())
    AND NOT public.is_blocked(auth.uid(), public.other_party(((storage.foldername(name))[1])::uuid, auth.uid())));
CREATE POLICY "participants read attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments' AND public.is_participant(((storage.foldername(name))[1])::uuid, auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages, public.offers, public.bookings, public.notifications, public.conversation_reads;
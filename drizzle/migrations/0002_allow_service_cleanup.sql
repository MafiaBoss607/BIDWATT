CREATE OR REPLACE FUNCTION public.offers_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'accepted' AND current_user <> 'service_role' THEN RAISE EXCEPTION 'Accepted offers cannot be deleted'; END IF;
  RETURN OLD;
END $$;
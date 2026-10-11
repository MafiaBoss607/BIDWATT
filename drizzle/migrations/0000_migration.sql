CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'New user',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated, anon;
GRANT UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), NULLIF(NEW.raw_user_meta_data->>'display_name',''), split_part(NEW.email,'@',1), 'New user'));
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.gpu_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  renter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 2000),
  min_vram_gb integer NOT NULL CHECK (min_vram_gb BETWEEN 1 AND 192),
  duration_hours numeric(6,2) NOT NULL CHECK (duration_hours > 0 AND duration_hours <= 720),
  budget_inr integer NOT NULL CHECK (budget_inr > 0 AND budget_inr <= 10000000),
  preferred_gpu text NOT NULL DEFAULT '' CHECK (char_length(preferred_gpu) <= 80),
  gpu_flexible boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gpu_requests TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.gpu_requests TO authenticated;
GRANT ALL ON public.gpu_requests TO service_role;
ALTER TABLE public.gpu_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requests readable" ON public.gpu_requests FOR SELECT USING (true);
CREATE POLICY "renter inserts" ON public.gpu_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = renter_id);
CREATE POLICY "renter updates" ON public.gpu_requests FOR UPDATE TO authenticated USING (auth.uid() = renter_id) WITH CHECK (auth.uid() = renter_id);
CREATE POLICY "renter deletes" ON public.gpu_requests FOR DELETE TO authenticated USING (auth.uid() = renter_id);

CREATE TABLE public.request_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.gpu_requests(id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, host_id)
);
GRANT SELECT, INSERT, DELETE ON public.request_responses TO authenticated;
GRANT ALL ON public.request_responses TO service_role;
ALTER TABLE public.request_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "responses visible to host or renter" ON public.request_responses FOR SELECT TO authenticated
  USING (auth.uid() = host_id OR auth.uid() = (SELECT renter_id FROM public.gpu_requests r WHERE r.id = request_id));
CREATE POLICY "host responds to others open requests" ON public.request_responses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id AND EXISTS (SELECT 1 FROM public.gpu_requests r WHERE r.id = request_id AND r.status = 'open' AND r.renter_id <> auth.uid()));
CREATE POLICY "host withdraws" ON public.request_responses FOR DELETE TO authenticated USING (auth.uid() = host_id);
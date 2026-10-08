CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'משק בית',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.households TO authenticated;
GRANT ALL ON public.households TO service_role;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_household_members_household ON public.household_members(household_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members TO authenticated;
GRANT ALL ON public.household_members TO service_role;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_user_household(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT household_id FROM public.household_members WHERE user_id = _user_id LIMIT 1
$$;

CREATE POLICY "Members view household" ON public.households FOR SELECT TO authenticated
  USING (id = public.get_user_household(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Members update household" ON public.households FOR UPDATE TO authenticated
  USING (id = public.get_user_household(auth.uid()));
CREATE POLICY "Admins manage households" ON public.households FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Members view household members" ON public.household_members FOR SELECT TO authenticated
  USING (household_id = public.get_user_household(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage household members" ON public.household_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Backfill: partner pairs share a household
DO $$
DECLARE r record; h uuid;
BEGIN
  FOR r IN SELECT * FROM public.partner_connections LOOP
    h := COALESCE(public.get_user_household(r.user_id_1), public.get_user_household(r.user_id_2));
    IF h IS NULL THEN
      INSERT INTO public.households DEFAULT VALUES RETURNING id INTO h;
    END IF;
    INSERT INTO public.household_members(household_id,user_id) VALUES (h, r.user_id_1) ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.household_members(household_id,user_id) VALUES (h, r.user_id_2) ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
  FOR r IN SELECT p.user_id FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM public.household_members m WHERE m.user_id = p.user_id) LOOP
    INSERT INTO public.households DEFAULT VALUES RETURNING id INTO h;
    INSERT INTO public.household_members(household_id,user_id) VALUES (h, r.user_id);
  END LOOP;
END $$;

-- Family members
CREATE TABLE public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  avatar text DEFAULT '🙂',
  color text DEFAULT '#0ea5e9',
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_family_members_household ON public.family_members(household_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household manages family members" ON public.family_members FOR ALL TO authenticated
  USING (household_id = public.get_user_household(auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (household_id = public.get_user_household(auth.uid()) OR public.has_role(auth.uid(),'admin'));

INSERT INTO public.family_members(household_id, name, user_id, is_default)
SELECT m.household_id, COALESCE(NULLIF(trim(p.first_name || ' ' || p.last_name),''),'משתמש'), m.user_id, false
FROM public.household_members m LEFT JOIN public.profiles p ON p.user_id = m.user_id;

-- Categories
ALTER TABLE public.categories ADD COLUMN parent_id uuid REFERENCES public.categories(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
CREATE INDEX idx_categories_parent ON public.categories(parent_id);
CREATE INDEX idx_categories_household ON public.categories(household_id);
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;
CREATE POLICY "View system and household categories" ON public.categories FOR SELECT
  USING (household_id IS NULL OR household_id = public.get_user_household(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Household inserts categories" ON public.categories FOR INSERT TO authenticated
  WITH CHECK (household_id = public.get_user_household(auth.uid()));
CREATE POLICY "Household updates categories" ON public.categories FOR UPDATE TO authenticated
  USING (household_id = public.get_user_household(auth.uid()));
CREATE POLICY "Household deletes categories" ON public.categories FOR DELETE TO authenticated
  USING (household_id = public.get_user_household(auth.uid()));

-- Transactions
ALTER TABLE public.transactions ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN subcategory_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN family_member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN payment_method text;
ALTER TABLE public.transactions ADD COLUMN is_recurring boolean NOT NULL DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN notes text;
UPDATE public.transactions t SET household_id = m.household_id FROM public.household_members m WHERE m.user_id = t.user_id AND t.household_id IS NULL;
CREATE INDEX idx_transactions_household_date ON public.transactions(household_id, transaction_date);
CREATE INDEX idx_transactions_category ON public.transactions(category_id);
CREATE INDEX idx_transactions_member ON public.transactions(family_member_id);

CREATE OR REPLACE FUNCTION public.set_transaction_household()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.household_id IS NULL THEN
    NEW.household_id := public.get_user_household(NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER set_transaction_household BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_transaction_household();

CREATE POLICY "Household views transactions" ON public.transactions FOR SELECT TO authenticated
  USING (household_id = public.get_user_household(auth.uid()));
CREATE POLICY "Household updates transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (household_id = public.get_user_household(auth.uid()));
CREATE POLICY "Household deletes transactions" ON public.transactions FOR DELETE TO authenticated
  USING (household_id = public.get_user_household(auth.uid()));

-- Profiles: household members can see each other's names
CREATE POLICY "Household views profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.get_user_household(user_id) = public.get_user_household(auth.uid()));

-- New users (ID number or Google)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h uuid; fn text; ln text;
BEGIN
  fn := COALESCE(NEW.raw_user_meta_data ->> 'first_name', NEW.raw_user_meta_data ->> 'given_name', split_part(COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''), ' ', 1), '');
  ln := COALESCE(NEW.raw_user_meta_data ->> 'last_name', NEW.raw_user_meta_data ->> 'family_name', '');
  INSERT INTO public.profiles (user_id, first_name, last_name, id_number)
  VALUES (NEW.id, fn, ln, COALESCE(NEW.raw_user_meta_data ->> 'id_number', ''))
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.household_members WHERE user_id = NEW.id) THEN
    INSERT INTO public.households DEFAULT VALUES RETURNING id INTO h;
    INSERT INTO public.household_members(household_id, user_id) VALUES (h, NEW.id);
    INSERT INTO public.family_members(household_id, name, user_id, is_default)
    VALUES (h, COALESCE(NULLIF(trim(fn || ' ' || ln), ''), 'משתמש'), NEW.id, true);
  END IF;
  RETURN NEW;
END $$;

-- Admin helper: move a user into another household (keeps their transactions)
CREATE OR REPLACE FUNCTION public.admin_move_user_household(_user_id uuid, _household_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.household_members(household_id, user_id) VALUES (_household_id, _user_id)
    ON CONFLICT (user_id) DO UPDATE SET household_id = EXCLUDED.household_id;
  UPDATE public.transactions SET household_id = _household_id WHERE user_id = _user_id;
  UPDATE public.family_members SET household_id = _household_id WHERE user_id = _user_id;
END $$;
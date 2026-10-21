CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_account text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS import_key text,
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS charged_date date,
  ADD COLUMN IF NOT EXISTS original_amount numeric,
  ADD COLUMN IF NOT EXISTS original_currency text,
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS installments_total integer,
  ADD COLUMN IF NOT EXISTS external_status text,
  ADD COLUMN IF NOT EXISTS user_modified_fields text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS linked_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_import_key_uq
  ON public.transactions (household_id, source, external_account, import_key)
  WHERE import_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_fingerprint_idx
  ON public.transactions (household_id, source, external_account, fingerprint)
  WHERE fingerprint IS NOT NULL;

-- Track fields the user edited manually (sync never overwrites them)
CREATE OR REPLACE FUNCTION public.track_user_modified_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('app.sync', true), '') = 'on' THEN RETURN NEW; END IF;
  IF NEW.category_id IS DISTINCT FROM OLD.category_id THEN NEW.user_modified_fields := array_append(array_remove(NEW.user_modified_fields,'category'),'category'); END IF;
  IF NEW.subcategory_id IS DISTINCT FROM OLD.subcategory_id THEN NEW.user_modified_fields := array_append(array_remove(NEW.user_modified_fields,'subcategory'),'subcategory'); END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN NEW.user_modified_fields := array_append(array_remove(NEW.user_modified_fields,'description'),'description'); END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN NEW.user_modified_fields := array_append(array_remove(NEW.user_modified_fields,'notes'),'notes'); END IF;
  IF NEW.family_member_id IS DISTINCT FROM OLD.family_member_id THEN NEW.user_modified_fields := array_append(array_remove(NEW.user_modified_fields,'member'),'member'); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS track_user_modified_fields ON public.transactions;
CREATE TRIGGER track_user_modified_fields BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.track_user_modified_fields();

-- API keys
CREATE TABLE public.sync_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  name text NOT NULL DEFAULT 'ישראכרט',
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);
GRANT SELECT (id, household_id, created_by, name, key_prefix, created_at, revoked_at, last_used_at) ON public.sync_api_keys TO authenticated;
GRANT ALL ON public.sync_api_keys TO service_role;
ALTER TABLE public.sync_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household views sync keys" ON public.sync_api_keys FOR SELECT TO authenticated
  USING (household_id = public.get_user_household(auth.uid()));

-- Sync logs
CREATE TABLE public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  api_key_id uuid,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  received integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  existing integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  pending_to_completed integer NOT NULL DEFAULT 0,
  needs_review integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  error_details jsonb
);
GRANT SELECT ON public.sync_logs TO authenticated;
GRANT ALL ON public.sync_logs TO service_role;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household views sync logs" ON public.sync_logs FOR SELECT TO authenticated
  USING (household_id = public.get_user_household(auth.uid()));
CREATE INDEX sync_logs_key_time_idx ON public.sync_logs (api_key_id, created_at DESC);

-- Key management (user-facing)
CREATE OR REPLACE FUNCTION public.create_sync_api_key(_name text DEFAULT 'ישראכרט')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE h uuid; k text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  h := public.get_user_household(auth.uid());
  IF h IS NULL THEN RAISE EXCEPTION 'no household'; END IF;
  k := 'hbk_' || encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.sync_api_keys(household_id, created_by, name, key_hash, key_prefix)
  VALUES (h, auth.uid(), coalesce(nullif(trim(_name),''),'ישראכרט'), encode(extensions.digest(k, 'sha256'), 'hex'), left(k, 12));
  RETURN k;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_sync_api_key(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sync_api_keys SET revoked_at = now()
  WHERE id = _id AND revoked_at IS NULL AND household_id = public.get_user_household(auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
END $$;

-- Review resolution (user-facing)
CREATE OR REPLACE FUNCTION public.resolve_sync_review(_id uuid, _action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.transactions WHERE id = _id AND review_status = 'pending_review'
    AND household_id = public.get_user_household(auth.uid()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  PERFORM set_config('app.sync', 'on', true);
  IF _action = 'approve' THEN
    UPDATE public.transactions SET review_status = NULL, review_reason = NULL WHERE id = _id;
  ELSIF _action = 'reject' THEN
    UPDATE public.transactions SET review_status = 'rejected' WHERE id = _id;
  ELSIF _action = 'link' THEN
    IF t.linked_transaction_id IS NULL THEN RAISE EXCEPTION 'nothing to link'; END IF;
    -- free the import key, then move identity onto the existing (manual) transaction; user data untouched
    DELETE FROM public.transactions WHERE id = _id;
    UPDATE public.transactions SET
      external_account = t.external_account, external_id = t.external_id, import_key = t.import_key,
      fingerprint = t.fingerprint, charged_date = t.charged_date, original_amount = t.original_amount,
      original_currency = t.original_currency, installment_number = t.installment_number,
      installments_total = t.installments_total, external_status = t.external_status, last_seen_at = t.last_seen_at,
      source = t.source
    WHERE id = t.linked_transaction_id AND household_id = t.household_id;
  ELSE RAISE EXCEPTION 'bad action'; END IF;
END $$;

-- Ingest (service role only). _txns = normalized array built by the edge function.
CREATE OR REPLACE FUNCTION public.sync_ingest(_household uuid, _user uuid, _source text, _txns jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb; ex public.transactions%ROWTYPE; cnt int; mid uuid; cand uuid;
  c_ins int := 0; c_ex int := 0; c_upd int := 0; c_p2c int := 0; c_rev int := 0;
  failed jsonb := '[]'::jsonb;
  exp_cat uuid; inc_cat uuid; fp record; n_extra int; i int;
  amt numeric; typ public.transaction_type; cat uuid; tdate date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(_household::text || ':' || _source));
  PERFORM set_config('app.sync', 'on', true);

  SELECT id INTO exp_cat FROM categories WHERE type='expense' AND parent_id IS NULL
    AND (household_id = _household OR household_id IS NULL)
    ORDER BY (name = 'הוצאות אחרות') DESC, (household_id IS NULL) DESC LIMIT 1;
  SELECT id INTO inc_cat FROM categories WHERE type='income' AND parent_id IS NULL
    AND (household_id = _household OR household_id IS NULL)
    ORDER BY (name = 'זיכוי') DESC, (name ILIKE '%אחר%') DESC LIMIT 1;

  CREATE TEMP TABLE _in (ord int, j jsonb) ON COMMIT DROP;
  INSERT INTO _in SELECT o::int, v FROM jsonb_array_elements(_txns) WITH ORDINALITY AS x(v, o);

  -- ===== Pass 1: strong keys =====
  FOR r IN SELECT j FROM _in WHERE j->>'import_key' IS NOT NULL ORDER BY ord LOOP
    BEGIN
      amt := abs((r->>'charged_amount')::numeric);
      typ := CASE WHEN (r->>'charged_amount')::numeric > 0 THEN 'income' ELSE 'expense' END;
      cat := CASE WHEN typ='income' THEN inc_cat ELSE exp_cat END;
      tdate := (r->>'txn_date')::date;

      SELECT * INTO ex FROM transactions WHERE household_id=_household AND source=_source
        AND external_account = r->>'account' AND import_key = r->>'import_key' FOR UPDATE;
      IF FOUND THEN
        IF ex.amount IS DISTINCT FROM amt OR ex.charged_date IS DISTINCT FROM (r->>'charged_date')::date
           OR ex.external_status IS DISTINCT FROM r->>'status' THEN
          IF ex.external_status='pending' AND r->>'status'='completed' THEN c_p2c := c_p2c+1; ELSE c_upd := c_upd+1; END IF;
          UPDATE transactions SET amount=amt, charged_date=(r->>'charged_date')::date,
            external_status=r->>'status', last_seen_at=now() WHERE id=ex.id;
        ELSE
          c_ex := c_ex+1;
          UPDATE transactions SET last_seen_at=now() WHERE id=ex.id;
        END IF;
        CONTINUE;
      END IF;

      -- pending (without identifier) becoming completed
      IF r->>'status' = 'completed' THEN
        SELECT count(*), min(id::text)::uuid INTO cnt, cand FROM transactions
          WHERE household_id=_household AND source=_source AND external_account=r->>'account'
            AND external_status='pending' AND import_key IS NULL AND coalesce(review_status,'')<>'rejected'
            AND original_amount = (r->>'original_amount')::numeric
            AND lower(regexp_replace(coalesce(description,''),'\s+','','g')) = r->>'desc_norm'
            AND abs(transaction_date - tdate) <= 5;
        IF cnt = 1 THEN
          UPDATE transactions SET import_key=r->>'import_key', external_id=r->>'external_id',
            external_status='completed', amount=amt, charged_date=(r->>'charged_date')::date,
            fingerprint=r->>'fingerprint', last_seen_at=now() WHERE id=cand;
          c_p2c := c_p2c+1; CONTINUE;
        END IF;
      END IF;

      -- manual-entry match
      SELECT id INTO mid FROM transactions WHERE household_id=_household AND source='manual'
        AND import_key IS NULL AND review_status IS NULL AND type=typ AND amount=amt
        AND abs(transaction_date - tdate) <= 3
        AND NOT EXISTS (SELECT 1 FROM transactions l WHERE l.linked_transaction_id = transactions.id AND l.review_status IS NULL)
        ORDER BY abs(transaction_date - tdate) LIMIT 1;

      INSERT INTO transactions(user_id, household_id, type, amount, category_id, description, transaction_date,
        payment_method, source, external_account, external_id, import_key, fingerprint, charged_date,
        original_amount, original_currency, installment_number, installments_total, external_status,
        review_status, review_reason, linked_transaction_id, last_seen_at)
      VALUES (_user, _household, typ, amt, cat, r->>'description', tdate, 'כרטיס אשראי', _source,
        r->>'account', r->>'external_id', r->>'import_key', r->>'fingerprint', (r->>'charged_date')::date,
        (r->>'original_amount')::numeric, r->>'currency', (r->>'inst_num')::int, (r->>'inst_total')::int, r->>'status',
        CASE WHEN cnt > 1 OR mid IS NOT NULL OR (r->>'needs_review')::boolean THEN 'pending_review' END,
        CASE WHEN cnt > 1 THEN 'multiple_pending_matches' WHEN mid IS NOT NULL THEN 'possible_manual_duplicate'
             WHEN (r->>'needs_review')::boolean THEN r->>'review_reason' END,
        mid, now());
      IF cnt > 1 OR mid IS NOT NULL OR (r->>'needs_review')::boolean THEN c_rev := c_rev+1; ELSE c_ins := c_ins+1; END IF;
      cnt := 0;
    EXCEPTION WHEN OTHERS THEN
      failed := failed || jsonb_build_object('index', r->'index', 'account', r->>'account', 'identifier', r->>'external_id', 'reason', 'db_error');
    END;
  END LOOP;

  -- ===== Pass 2: fingerprint only (count-based) =====
  FOR fp IN SELECT j->>'account' acc, j->>'fingerprint' f, count(*)::int n, min(ord) first_ord
            FROM _in WHERE j->>'import_key' IS NULL GROUP BY 1,2 LOOP
    BEGIN
      SELECT j INTO r FROM _in WHERE ord = fp.first_ord;
      amt := abs((r->>'charged_amount')::numeric);
      typ := CASE WHEN (r->>'charged_amount')::numeric > 0 THEN 'income' ELSE 'expense' END;
      cat := CASE WHEN typ='income' THEN inc_cat ELSE exp_cat END;
      tdate := (r->>'txn_date')::date;

      SELECT count(*) INTO cnt FROM transactions WHERE household_id=_household AND source=_source
        AND external_account=fp.acc AND fingerprint=fp.f;
      -- refresh status / amount on existing (non-user fields only)
      UPDATE transactions SET last_seen_at=now(), external_status=r->>'status', amount=amt,
          charged_date=(r->>'charged_date')::date
        WHERE household_id=_household AND source=_source AND external_account=fp.acc AND fingerprint=fp.f
          AND import_key IS NULL;
      c_ex := c_ex + least(fp.n, cnt);
      n_extra := fp.n - cnt;
      IF n_extra <= 0 THEN CONTINUE; END IF;

      mid := NULL;
      IF fp.n = 1 AND cnt = 0 THEN
        SELECT id INTO mid FROM transactions WHERE household_id=_household AND source='manual'
          AND import_key IS NULL AND fingerprint IS NULL AND review_status IS NULL AND type=typ AND amount=amt
          AND abs(transaction_date - tdate) <= 3
          AND NOT EXISTS (SELECT 1 FROM transactions l WHERE l.linked_transaction_id = transactions.id AND l.review_status IS NULL)
          ORDER BY abs(transaction_date - tdate) LIMIT 1;
      END IF;

      FOR i IN 1..n_extra LOOP
        INSERT INTO transactions(user_id, household_id, type, amount, category_id, description, transaction_date,
          payment_method, source, external_account, fingerprint, charged_date, original_amount, original_currency,
          installment_number, installments_total, external_status, review_status, review_reason, linked_transaction_id, last_seen_at)
        VALUES (_user, _household, typ, amt, cat, r->>'description', tdate, 'כרטיס אשראי', _source,
          fp.acc, fp.f, (r->>'charged_date')::date, (r->>'original_amount')::numeric, r->>'currency',
          (r->>'inst_num')::int, (r->>'inst_total')::int, r->>'status',
          CASE WHEN fp.n = 1 AND cnt = 0 AND mid IS NULL AND NOT (r->>'needs_review')::boolean THEN NULL ELSE 'pending_review' END,
          CASE WHEN mid IS NOT NULL THEN 'possible_manual_duplicate'
               WHEN fp.n > 1 OR cnt > 0 THEN 'identical_without_id'
               WHEN (r->>'needs_review')::boolean THEN r->>'review_reason' END,
          mid, now());
        IF fp.n = 1 AND cnt = 0 AND mid IS NULL AND NOT (r->>'needs_review')::boolean THEN c_ins := c_ins+1; ELSE c_rev := c_rev+1; END IF;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      failed := failed || jsonb_build_object('index', r->'index', 'account', fp.acc, 'reason', 'db_error');
    END;
  END LOOP;

  -- stale pending (not seen 14 days)
  UPDATE transactions SET review_status='pending_review', review_reason='stale_pending'
    WHERE household_id=_household AND source=_source AND external_status='pending'
      AND review_status IS NULL AND last_seen_at < now() - interval '14 days';

  RETURN jsonb_build_object('inserted',c_ins,'existing',c_ex,'updated',c_upd,
    'pending_to_completed',c_p2c,'needs_review',c_rev,'failed',failed);
END $$;

REVOKE ALL ON FUNCTION public.sync_ingest(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_ingest(uuid, uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.create_sync_api_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sync_api_key(text) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_sync_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_sync_api_key(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_sync_review(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_sync_review(uuid, text) TO authenticated;
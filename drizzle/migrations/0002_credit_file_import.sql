ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS report_date date,
  ADD COLUMN IF NOT EXISTS credit_kind text;

UPDATE public.transactions SET report_date = CASE WHEN source = 'manual' THEN transaction_date ELSE charged_date END;

CREATE INDEX IF NOT EXISTS transactions_report_date_idx ON public.transactions (household_id, report_date);

CREATE OR REPLACE FUNCTION public.set_report_date()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.report_date := CASE WHEN NEW.source = 'manual' THEN NEW.transaction_date ELSE NEW.charged_date END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS set_report_date ON public.transactions;
CREATE TRIGGER set_report_date BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_report_date();

ALTER TABLE public.sync_logs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'script',
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS billing_month date,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS result jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS sync_logs_idempotency_uq ON public.sync_logs (household_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public._try_date(t text) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF t IS NULL OR t !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
  RETURN t::date;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public._try_num(t text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF t IS NULL OR t !~ '^-?\d{1,9}(\.\d+)?$' THEN RETURN NULL; END IF;
  RETURN t::numeric;
END $$;

-- Shared matching engine for file imports. _dry_run=true never writes.
CREATE OR REPLACE FUNCTION public._credit_file_engine(_household uuid, _user uuid, _rows jsonb, _dry_run boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  src constant text := 'isracard_file';
  r record; ex record; mt record; lk record;
  outr jsonb := '[]'::jsonb; exp_cat uuid;
  cnt int; seen int; st text; why text; match_id uuid; link_id uuid; new_id uuid; upd boolean;
BEGIN
  IF _household IS NULL THEN RAISE EXCEPTION 'no household'; END IF;
  IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'rows must be an array'; END IF;
  IF jsonb_array_length(_rows) > 3000 THEN RAISE EXCEPTION 'too_many_rows'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(_household::text || ':credit'));
  PERFORM set_config('app.sync', 'on', true);

  SELECT id INTO exp_cat FROM categories WHERE type = 'expense' AND parent_id IS NULL
    AND (household_id = _household OR household_id IS NULL)
    ORDER BY (name = 'הוצאות אחרות') DESC, (household_id IS NULL) DESC LIMIT 1;

  DROP TABLE IF EXISTS _cf;
  CREATE TEMP TABLE _cf ON COMMIT DROP AS
  SELECT (o - 1)::int AS ord,
    right(regexp_replace(coalesce(v->>'account', ''), '\D', '', 'g'), 4) AS account,
    nullif(left(trim(coalesce(v->>'external_id', '')), 64), '') AS ext_id,
    public._try_date(v->>'txn_date') AS txn_date,
    public._try_date(v->>'charged_date') AS charged_date,
    round(public._try_num(v->>'amount'), 2) AS amount,
    coalesce((v->>'is_refund')::boolean, false) AS is_refund,
    round(public._try_num(v->>'original_amount'), 2) AS orig_amount,
    upper(left(coalesce(nullif(v->>'currency', ''), 'ILS'), 3)) AS currency,
    left(trim(coalesce(v->>'description', '')), 300) AS descr,
    lower(regexp_replace(left(trim(coalesce(v->>'description', '')), 300), '\s+', '', 'g')) AS desc_norm,
    public._try_num(v->>'inst_num')::int AS inst_num,
    public._try_num(v->>'inst_total')::int AS inst_total,
    CASE WHEN v->>'status' = 'pending' THEN 'pending' ELSE 'completed' END AS ext_status,
    nullif(left(coalesce(v->>'flag', ''), 40), '') AS flag,
    true AS valid, NULL::text AS invalid_reason, NULL::text AS fp, NULL::text AS ikey
  FROM jsonb_array_elements(_rows) WITH ORDINALITY AS x(v, o);

  UPDATE _cf SET valid = false, invalid_reason = CASE
      WHEN txn_date IS NULL THEN 'bad_date'
      WHEN amount IS NULL OR amount <= 0 OR amount > 1000000 THEN 'bad_amount'
      WHEN descr = '' THEN 'no_description' END
    WHERE txn_date IS NULL OR amount IS NULL OR amount <= 0 OR amount > 1000000 OR descr = '';

  UPDATE _cf SET flag = coalesce(flag, 'installment_without_number') WHERE inst_total > 1 AND inst_num IS NULL;
  UPDATE _cf SET flag = coalesce(flag, 'no_charged_date') WHERE charged_date IS NULL;

  UPDATE _cf SET fp = md5(concat_ws('|', src, account, txn_date, amount, currency, desc_norm,
      coalesce(inst_num::text, ''), coalesce(inst_total::text, ''), is_refund::text)) WHERE valid;
  UPDATE _cf SET ikey = 'ref:' || ext_id || ':' || coalesce(inst_num, 0) || CASE WHEN is_refund THEN ':r' ELSE ':c' END
    WHERE valid AND ext_id IS NOT NULL AND NOT (inst_total > 1 AND inst_num IS NULL);
  -- a reference repeated inside the same file with different details is not a stable identifier
  UPDATE _cf c SET ikey = NULL WHERE ikey IS NOT NULL AND EXISTS (
    SELECT 1 FROM _cf d WHERE d.ord <> c.ord AND d.ikey = c.ikey AND d.account = c.account AND d.fp IS DISTINCT FROM c.fp);
  -- an identical reference repeated: treat duplicates by fingerprint counting
  UPDATE _cf c SET ikey = NULL WHERE ikey IS NOT NULL AND EXISTS (
    SELECT 1 FROM _cf d WHERE d.ord <> c.ord AND d.ikey = c.ikey AND d.account = c.account);

  FOR r IN SELECT * FROM _cf ORDER BY ord LOOP
    st := NULL; why := NULL; match_id := NULL; link_id := NULL; new_id := NULL; upd := false;
    IF NOT r.valid THEN
      st := 'invalid'; why := r.invalid_reason;
    ELSIF r.ikey IS NOT NULL THEN
      SELECT id, charged_date, source INTO ex FROM transactions
        WHERE household_id = _household AND source = src AND external_account = r.account AND import_key = r.ikey;
      IF FOUND THEN
        match_id := ex.id;
        IF ex.charged_date IS NULL AND r.charged_date IS NOT NULL THEN st := 'complete'; why := 'missing_charged_date';
        ELSIF ex.charged_date IS DISTINCT FROM r.charged_date AND r.charged_date IS NOT NULL THEN st := 'existing'; why := 'charged_date_changed'; upd := true;
        ELSE st := 'existing'; why := 'same_reference'; END IF;
      ELSE
        SELECT id INTO ex FROM transactions WHERE household_id = _household AND source = src
          AND external_account = r.account AND fingerprint = r.fp AND import_key IS NULL ORDER BY created_at LIMIT 1;
        IF FOUND THEN st := 'complete'; why := 'missing_reference'; match_id := ex.id; END IF;
      END IF;
    ELSE
      SELECT count(*) INTO cnt FROM transactions
        WHERE household_id = _household AND source = src AND external_account = r.account AND fingerprint = r.fp;
      SELECT count(*) INTO seen FROM _cf WHERE valid AND ikey IS NULL AND account = r.account AND fp = r.fp AND ord < r.ord;
      IF seen < cnt THEN
        SELECT id, charged_date INTO ex FROM transactions
          WHERE household_id = _household AND source = src AND external_account = r.account AND fingerprint = r.fp
          ORDER BY created_at, id OFFSET seen LIMIT 1;
        match_id := ex.id;
        IF ex.charged_date IS NULL AND r.charged_date IS NOT NULL THEN st := 'complete'; why := 'missing_charged_date';
        ELSIF ex.charged_date IS DISTINCT FROM r.charged_date AND r.charged_date IS NOT NULL THEN st := 'existing'; why := 'charged_date_changed'; upd := true;
        ELSE st := 'existing'; why := 'same_details'; END IF;
      ELSIF cnt > 0 THEN
        st := 'review'; why := 'identical_extra';
        SELECT id INTO match_id FROM transactions WHERE household_id = _household AND source = src
          AND external_account = r.account AND fingerprint = r.fp ORDER BY created_at LIMIT 1;
      END IF;
    END IF;

    IF st IS NULL THEN
      IF NOT r.is_refund THEN
        SELECT t.id INTO mt FROM transactions t WHERE t.household_id = _household AND t.source = 'manual'
          AND t.type = 'expense' AND coalesce(t.credit_kind, '') <> 'refund' AND t.review_status IS NULL
          AND t.amount = r.amount AND abs(t.transaction_date - r.txn_date) <= 3
          AND NOT EXISTS (SELECT 1 FROM transactions l WHERE l.linked_transaction_id = t.id)
          ORDER BY abs(t.transaction_date - r.txn_date) LIMIT 1;
        IF FOUND THEN st := 'review'; why := 'possible_manual_duplicate'; match_id := mt.id; END IF;
      ELSE
        SELECT t.id INTO lk FROM transactions t WHERE t.household_id = _household AND t.type = 'expense'
          AND coalesce(t.credit_kind, '') <> 'refund' AND t.amount >= r.amount
          AND lower(regexp_replace(coalesce(t.description, ''), '\s+', '', 'g')) = r.desc_norm
          AND t.transaction_date BETWEEN r.txn_date - 180 AND r.txn_date
          ORDER BY t.transaction_date DESC LIMIT 1;
        IF FOUND THEN link_id := lk.id; END IF;
      END IF;
      IF st IS NULL THEN
        IF r.flag IS NOT NULL THEN st := 'review'; why := r.flag;
        ELSE st := 'new'; why := CASE WHEN r.is_refund THEN 'refund' END; END IF;
      END IF;
    END IF;

    IF NOT _dry_run THEN
      BEGIN
        IF st IN ('new', 'review') THEN
          INSERT INTO transactions(user_id, household_id, type, amount, category_id, description, transaction_date,
            payment_method, source, external_account, external_id, import_key, fingerprint, charged_date,
            original_amount, original_currency, installment_number, installments_total, external_status,
            review_status, review_reason, linked_transaction_id, credit_kind, last_seen_at)
          VALUES (_user, _household, 'expense', r.amount, exp_cat, r.descr, r.txn_date, 'כרטיס אשראי', src,
            r.account, r.ext_id, r.ikey, r.fp, r.charged_date, r.orig_amount, r.currency, r.inst_num, r.inst_total,
            r.ext_status, CASE WHEN st = 'review' THEN 'pending_review' END, CASE WHEN st = 'review' THEN why END,
            coalesce(match_id, link_id), CASE WHEN r.is_refund THEN 'refund' ELSE 'charge' END, now())
          RETURNING id INTO new_id;
        ELSIF st = 'complete' THEN
          UPDATE transactions SET
            charged_date = coalesce(charged_date, r.charged_date),
            import_key = coalesce(import_key, r.ikey),
            external_id = coalesce(external_id, r.ext_id),
            installment_number = coalesce(installment_number, r.inst_num),
            installments_total = coalesce(installments_total, r.inst_total),
            external_status = r.ext_status, last_seen_at = now()
          WHERE id = match_id AND household_id = _household;
        ELSIF st = 'existing' THEN
          UPDATE transactions SET last_seen_at = now(), external_status = r.ext_status,
            charged_date = CASE WHEN upd THEN r.charged_date ELSE charged_date END
          WHERE id = match_id AND household_id = _household AND source = src;
        END IF;
      EXCEPTION WHEN unique_violation THEN
        st := 'existing'; why := 'same_reference';
      END;
    END IF;

    outr := outr || jsonb_build_object('ord', r.ord, 'status', st, 'reason', why, 'id', new_id,
      'updated', upd, 'link_id', link_id,
      'match', (SELECT jsonb_build_object('id', t.id, 'date', t.transaction_date, 'charged_date', t.charged_date,
                 'amount', t.amount, 'description', t.description, 'source', t.source, 'review_status', t.review_status)
                FROM transactions t WHERE t.id = match_id AND t.household_id = _household));
  END LOOP;

  RETURN jsonb_build_object(
    'rows', outr,
    'received', jsonb_array_length(_rows),
    'inserted', (SELECT count(*) FROM jsonb_array_elements(outr) e WHERE e->>'status' = 'new'),
    'existing', (SELECT count(*) FROM jsonb_array_elements(outr) e WHERE e->>'status' = 'existing'),
    'completed', (SELECT count(*) FROM jsonb_array_elements(outr) e WHERE e->>'status' = 'complete'),
    'updated', (SELECT count(*) FROM jsonb_array_elements(outr) e WHERE (e->>'updated')::boolean),
    'needs_review', (SELECT count(*) FROM jsonb_array_elements(outr) e WHERE e->>'status' = 'review'),
    'invalid', (SELECT count(*) FROM jsonb_array_elements(outr) e WHERE e->>'status' = 'invalid'));
END $$;
REVOKE ALL ON FUNCTION public._credit_file_engine(uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.preview_credit_import(_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  h := public.get_user_household(auth.uid());
  IF h IS NULL THEN RAISE EXCEPTION 'no household'; END IF;
  RETURN public._credit_file_engine(h, auth.uid(), _rows, true);
END $$;
REVOKE ALL ON FUNCTION public.preview_credit_import(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_credit_import(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.import_credit_file(_idempotency_key uuid, _file_name text, _billing_month date, _rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h uuid; prev jsonb; res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _idempotency_key IS NULL THEN RAISE EXCEPTION 'idempotency key required'; END IF;
  h := public.get_user_household(auth.uid());
  IF h IS NULL THEN RAISE EXCEPTION 'no household'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(h::text || ':credit'));
  SELECT result INTO prev FROM sync_logs WHERE household_id = h AND idempotency_key = _idempotency_key;
  IF FOUND THEN RETURN prev || jsonb_build_object('replayed', true); END IF;
  res := public._credit_file_engine(h, auth.uid(), _rows, false);
  INSERT INTO sync_logs(household_id, source, kind, file_name, billing_month, idempotency_key, user_id,
    received, inserted, existing, updated, needs_review, errors, status, result)
  VALUES (h, 'isracard_file', 'file', left(coalesce(_file_name, ''), 200), _billing_month, _idempotency_key, auth.uid(),
    (res->>'received')::int, (res->>'inserted')::int, (res->>'existing')::int + (res->>'completed')::int,
    (res->>'updated')::int, (res->>'needs_review')::int, (res->>'invalid')::int,
    CASE WHEN (res->>'invalid')::int > 0 THEN 'partial' ELSE 'ok' END, res);
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.import_credit_file(uuid, text, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_credit_file(uuid, text, date, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_review_charged_date(_id uuid, _date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _date IS NULL THEN RAISE EXCEPTION 'date required'; END IF;
  PERFORM set_config('app.sync', 'on', true);
  UPDATE transactions SET charged_date = _date,
    review_status = CASE WHEN review_reason = 'no_charged_date' THEN NULL ELSE review_status END,
    review_reason = CASE WHEN review_reason = 'no_charged_date' THEN NULL ELSE review_reason END
  WHERE id = _id AND source <> 'manual' AND household_id = public.get_user_household(auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_review_charged_date(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_review_charged_date(uuid, date) TO authenticated;
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { normalizeTxn, sha256Hex, type NormalizedTxn, type RawTxn } from './normalize.ts';

const MAX_BYTES = 1_000_000;
const MAX_TXNS = 2000;
const MAX_PER_HOUR = 30;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const apiKey = req.headers.get('x-api-key') ?? '';
  if (!/^hbk_[0-9a-f]{64}$/.test(apiKey)) return json({ ok: false, error: 'unauthorized' }, 401);

  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BYTES) return json({ ok: false, error: 'payload_too_large' }, 413);
  const text = await req.text();
  if (text.length > MAX_BYTES) return json({ ok: false, error: 'payload_too_large' }, 413);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: key } = await db
    .from('sync_api_keys')
    .select('id, household_id, created_by, revoked_at')
    .eq('key_hash', await sha256Hex(apiKey))
    .maybeSingle();
  if (!key || key.revoked_at) return json({ ok: false, error: 'unauthorized' }, 401);

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db
    .from('sync_logs')
    .select('id', { count: 'exact', head: true })
    .eq('api_key_id', key.id)
    .gte('created_at', since);
  if ((count ?? 0) >= MAX_PER_HOUR) return json({ ok: false, error: 'rate_limited' }, 429);

  let body: { source?: string; accounts?: { accountNumber?: string; txns?: RawTxn[] }[] };
  try {
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }
  if (body?.source !== 'isracard') return json({ ok: false, error: 'unsupported_source' }, 400);
  if (!Array.isArray(body.accounts)) return json({ ok: false, error: 'accounts_required' }, 400);

  const normalized: NormalizedTxn[] = [];
  const failed: unknown[] = [];
  let received = 0;
  for (const acc of body.accounts) {
    if (!acc?.accountNumber || !Array.isArray(acc.txns)) {
      failed.push({ reason: 'invalid_account' });
      continue;
    }
    for (const t of acc.txns) {
      const index = received++;
      if (received > MAX_TXNS) return json({ ok: false, error: 'too_many_transactions', max: MAX_TXNS }, 413);
      try {
        normalized.push(await normalizeTxn(String(acc.accountNumber), t, index));
      } catch (e) {
        failed.push({ index, identifier: t?.identifier ?? null, reason: (e as Error).message });
      }
    }
  }

  const { data: result, error } = await db.rpc('sync_ingest', {
    _household: key.household_id,
    _user: key.created_by,
    _source: 'isracard',
    _txns: normalized as unknown as never,
  });

  if (error) {
    console.error('sync_ingest failed', error.code);
    await db.from('sync_logs').insert({
      household_id: key.household_id, api_key_id: key.id, source: 'isracard', received, errors: received, status: 'failed',
    });
    return json({ ok: false, error: 'ingest_failed', retry_safe: true }, 500);
  }

  const r = result as Record<string, number | unknown[]>;
  const allFailed = [...failed, ...((r.failed as unknown[]) ?? [])];
  const summary = {
    received,
    inserted: r.inserted as number,
    existing: r.existing as number,
    updated: r.updated as number,
    pending_to_completed: r.pending_to_completed as number,
    needs_review: r.needs_review as number,
    errors: allFailed.length,
  };
  const { data: log } = await db
    .from('sync_logs')
    .insert({
      household_id: key.household_id, api_key_id: key.id, source: 'isracard', ...summary,
      status: allFailed.length ? 'partial' : 'ok', error_details: allFailed.length ? allFailed : null,
    })
    .select('id')
    .single();
  await db.from('sync_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id);

  return json({ ok: true, sync_id: log?.id ?? null, ...summary, failed: allFailed, retry_safe: true });
});

// Pure helpers (no Deno APIs) so they can be unit-tested with bun.

export interface RawTxn {
  identifier?: string | number | null;
  type?: string;
  status?: string;
  date: string;
  processedDate?: string | null;
  originalAmount: number;
  originalCurrency?: string | null;
  chargedAmount?: number | null;
  chargedCurrency?: string | null;
  description: string;
  memo?: string | null;
  installments?: { number?: number; total?: number } | null;
}

export interface NormalizedTxn {
  index: number;
  account: string;
  external_id: string | null;
  import_key: string | null;
  fingerprint: string;
  status: 'pending' | 'completed';
  txn_date: string;
  charged_date: string | null;
  original_amount: number;
  charged_amount: number;
  currency: string;
  description: string;
  desc_norm: string;
  inst_num: number | null;
  inst_total: number | null;
  needs_review: boolean;
  review_reason: string | null;
}

/** Local Israel date (YYYY-MM-DD) from an ISO timestamp. Scrapers emit midnight Israel time as UTC (e.g. 21:00Z the day before). */
export const toIsraelDate = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) throw new Error('invalid date');
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

export const normalizeDesc = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** Only the last 4 digits of the card/account are kept. */
export const maskAccount = (a: string) => {
  const digits = String(a).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : String(a).slice(-4);
};

export const sha256Hex = async (s: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Strong key: stable identifier from the issuer + installment number. Never depends on order in the request. */
export const strongKey = (identifier: string, instNum: number | null) => `id:${identifier}:${instNum ?? 0}`;

/** Fingerprint without any per-request ordinal. */
export const fingerprintOf = (account: string, t: RawTxn) =>
  sha256Hex(
    [
      account,
      toIsraelDate(t.date),
      Number(t.originalAmount).toFixed(2),
      (t.originalCurrency || 'ILS').toUpperCase(),
      normalizeDesc(t.description || ''),
      t.installments?.number ?? '',
      t.installments?.total ?? '',
    ].join('|'),
  );

export const normalizeTxn = async (account: string, t: RawTxn, index: number): Promise<NormalizedTxn> => {
  const acc = maskAccount(account);
  if (typeof t.originalAmount !== 'number' || !isFinite(t.originalAmount)) throw new Error('invalid originalAmount');
  if (!t.description || typeof t.description !== 'string') throw new Error('missing description');
  const charged = typeof t.chargedAmount === 'number' && isFinite(t.chargedAmount) ? t.chargedAmount : t.originalAmount;
  if (charged === 0) throw new Error('zero amount');
  const txnDate = toIsraelDate(t.date);
  const chargedDate = t.processedDate ? toIsraelDate(t.processedDate) : null;
  const isInst = t.type === 'installments' || !!t.installments;
  const instNum = t.installments?.number ?? null;
  const instTotal = t.installments?.total ?? null;
  const id = t.identifier !== undefined && t.identifier !== null && String(t.identifier).trim() !== '' ? String(t.identifier).trim() : null;
  const missingInst = isInst && !instNum;
  return {
    index,
    account: acc,
    external_id: id,
    import_key: id && !missingInst ? strongKey(id, instNum) : null,
    fingerprint: await fingerprintOf(acc, t),
    status: t.status === 'pending' ? 'pending' : 'completed',
    // installments are recorded on the billing date; regular purchases on the purchase date
    txn_date: isInst && chargedDate ? chargedDate : txnDate,
    charged_date: chargedDate,
    original_amount: t.originalAmount,
    // scrapers report expenses as negative; positive = refund/credit
    charged_amount: charged,
    currency: (t.originalCurrency || 'ILS').toUpperCase(),
    description: t.description.trim().slice(0, 300),
    desc_norm: normalizeDesc(t.description.trim().slice(0, 300)),
    inst_num: instNum,
    inst_total: instTotal,
    needs_review: missingInst,
    review_reason: missingInst ? 'installment_without_number' : null,
  };
};

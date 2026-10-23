// Pure parsing helpers for credit card statement files (Isracard first). No DOM / IO here.

export type Field =
  | 'txn_date'
  | 'charged_date'
  | 'description'
  | 'amount'
  | 'original_amount'
  | 'currency'
  | 'card'
  | 'installments'
  | 'reference'
  | 'status'
  | 'kind';

export const FIELD_LABELS: Record<Field, string> = {
  txn_date: 'תאריך עסקה',
  charged_date: 'תאריך חיוב',
  description: 'בית עסק / תיאור',
  amount: 'סכום חיוב (₪)',
  original_amount: 'סכום עסקה מקורי',
  currency: 'מטבע',
  card: 'כרטיס (4 ספרות)',
  installments: 'תשלומים',
  reference: 'אסמכתה / מזהה',
  status: 'סטטוס',
  kind: 'סוג עסקה',
};

export const REQUIRED: Field[] = ['txn_date', 'description', 'amount'];

const ALIASES: Record<Field, string[]> = {
  txn_date: ['תאריך רכישה', 'תאריך עסקה', 'תאריך העסקה', 'ת.עסקה', 'תאריך ביצוע'],
  charged_date: ['תאריך חיוב', 'מועד חיוב', 'ת.חיוב', 'תאריך החיוב'],
  description: ['שם בית עסק', 'שם בית העסק', 'בית עסק', 'שם העסק', 'תיאור', 'פירוט'],
  amount: ['סכום חיוב', 'סכום החיוב', 'סכום לחיוב', 'חיוב בש"ח', 'סכום בש"ח', 'סכום חיוב ₪'],
  original_amount: ['סכום עסקה', 'סכום העסקה', 'סכום מקורי', 'סכום קנייה', 'סכום רכישה'],
  currency: ['מטבע עסקה', 'מטבע מקור', 'מטבע', 'מטבע חיוב'],
  card: ['4 ספרות אחרונות', 'ספרות אחרונות', 'מספר כרטיס', 'כרטיס'],
  installments: ['תשלומים', 'מספר תשלום', 'תשלום'],
  reference: ['מספר שובר', 'אסמכתא', 'אסמכתה', 'מס. שובר', 'מספר אסמכתא', 'שובר'],
  status: ['סטטוס'],
  kind: ['סוג עסקה', 'פירוט נוסף', 'הערות', 'סוג'],
};

const clean = (v: unknown) => String(v ?? '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/\s+/g, ' ').trim();

/** Match a header cell to a field. Longer aliases win, so "סכום חיוב" never becomes "סכום עסקה". */
export const matchHeader = (cell: unknown): Field | null => {
  const c = clean(cell).replace(/[:*]/g, '');
  if (!c || c.length > 40) return null;
  let best: { f: Field; len: number } | null = null;
  for (const f of Object.keys(ALIASES) as Field[]) {
    for (const a of ALIASES[f]) {
      if (c === a || c.includes(a)) {
        if (!best || a.length > best.len) best = { f, len: a.length };
      }
    }
  }
  return best?.f ?? null;
};

export type Mapping = Partial<Record<Field, number>>;

export const mapHeaderRow = (row: unknown[]): Mapping => {
  const m: Mapping = {};
  row.forEach((cell, i) => {
    const f = matchHeader(cell);
    if (f && m[f] === undefined) m[f] = i;
  });
  return m;
};

export const isConfident = (m: Mapping) => REQUIRED.every((f) => m[f] !== undefined);

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

/** Israeli date formats, ISO, Excel serial numbers and Date objects -> YYYY-MM-DD. Never guesses. */
export const parseDate = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null; // Excel serial range ~1954..2119
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = clean(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(y, +m[2], +m[1]);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseDate(Number(s));
  return null;
};

export interface Money {
  value: number;
  currency: string | null;
}

/** "₪1,234.50", "1.234,50", "(50)", "50-", "$ 12" -> signed number + currency. */
export const parseAmount = (v: unknown): Money | null => {
  if (typeof v === 'number') return isFinite(v) ? { value: Math.round(v * 100) / 100, currency: null } : null;
  let s = clean(v);
  if (!s) return null;
  let currency: string | null = null;
  if (/₪|ש"ח|ש״ח|NIS|ILS/i.test(s)) currency = 'ILS';
  else if (/\$|USD/i.test(s)) currency = 'USD';
  else if (/€|EUR/i.test(s)) currency = 'EUR';
  else if (/£|GBP/i.test(s)) currency = 'GBP';
  let neg = false;
  if (/^\(.*\)$/.test(s)) neg = true;
  s = s.replace(/[^\d.,-]/g, '');
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg || neg; s = s.slice(1); neg = true; }
  if (!/\d/.test(s) || s.includes('-')) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastComma > lastDot && s.length - lastComma - 1 <= 2 && lastDot !== -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastComma > -1 && lastDot === -1 && s.length - lastComma - 1 <= 2 && (s.match(/,/g) || []).length === 1 && s.length - lastComma - 1 !== 3) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!isFinite(n)) return null;
  return { value: Math.round((neg ? -n : n) * 100) / 100, currency };
};

export const parseCurrency = (v: unknown): string | null => {
  const s = clean(v);
  if (!s) return null;
  if (/₪|ש"ח|ש״ח|NIS|ILS|שקל/i.test(s)) return 'ILS';
  if (/\$|USD|דולר/i.test(s)) return 'USD';
  if (/€|EUR|אירו|יורו/i.test(s)) return 'EUR';
  if (/£|GBP|ליש/i.test(s)) return 'GBP';
  return /^[A-Z]{3}$/i.test(s) ? s.toUpperCase() : null;
};

/** "תשלום 3 מתוך 12", "3 מ-12", "3/12" */
export const parseInstallments = (v: unknown): { num: number | null; total: number | null } | null => {
  const s = clean(v);
  if (!s) return null;
  let m = s.match(/(\d{1,2})\s*(?:מתוך|מ-|מ־|מ |\/|out of)\s*(\d{1,2})/);
  if (m) return { num: +m[1], total: +m[2] };
  if (/תשלומים/.test(s)) {
    m = s.match(/(\d{1,2})\s*תשלומים/);
    return { num: null, total: m ? +m[1] : null };
  }
  return null;
};

const SUMMARY_RE = /סה"כ|סה״כ|סך הכל|סך הכול|סיכום|total/i;
const REFUND_RE = /זיכוי|החזר|ביטול/;
const CARD_RE = /(?:כרטיס|המסתיים ב|מסתיים ב|ספרות)\D{0,20}(\d{4})(?!\d)/;

export interface ParsedRow {
  ord: number;
  sheet: string;
  line: number;
  account: string;
  external_id: string | null;
  txn_date: string | null;
  charged_date: string | null;
  amount: number | null; // positive ILS charge for this month
  is_refund: boolean;
  original_amount: number | null;
  currency: string;
  description: string;
  inst_num: number | null;
  inst_total: number | null;
  status: 'pending' | 'completed';
  flag: string | null;
  error: string | null; // 'summary' | 'bad_date' | 'bad_amount' | 'no_description'
}

export interface SheetTable {
  sheet: string;
  rows: unknown[][];
}

export interface DetectResult {
  confident: boolean;
  sheet: string;
  headerRow: number;
  headers: string[];
  mapping: Mapping;
}

/** Find the best header row across all sheets (first 60 rows of each). */
export const detectTable = (tables: SheetTable[]): DetectResult | null => {
  let best: (DetectResult & { score: number }) | null = null;
  for (const t of tables) {
    const limit = Math.min(t.rows.length, 60);
    for (let i = 0; i < limit; i++) {
      const m = mapHeaderRow(t.rows[i] || []);
      const score = Object.keys(m).length + (isConfident(m) ? 10 : 0);
      if (score >= 2 && (!best || score > best.score)) {
        best = { confident: isConfident(m), sheet: t.sheet, headerRow: i, headers: (t.rows[i] || []).map(clean), mapping: m, score };
      }
    }
  }
  if (!best) return null;
  const { score: _s, ...rest } = best;
  return rest;
};

const cell = (row: unknown[], m: Mapping, f: Field) => (m[f] === undefined ? undefined : row[m[f]!]);

/**
 * Turn sheet rows into transactions. Rows that look like another header row reset the mapping
 * (multiple tables / cards in one sheet). Card number is taken from a column or from a section title above.
 */
export const parseRows = (tables: SheetTable[], startSheet: string, headerRow: number, mapping: Mapping): ParsedRow[] => {
  const out: ParsedRow[] = [];
  let ord = 0;
  const startIdx = Math.max(0, tables.findIndex((t) => t.sheet === startSheet));
  for (let ti = startIdx; ti < tables.length; ti++) {
    const t = tables[ti];
    let m: Mapping | null = ti === startIdx ? mapping : null;
    let card = '';
    const firstRow = ti === startIdx ? 0 : 0;
    for (let i = firstRow; i < t.rows.length; i++) {
      const row = t.rows[i] || [];
      const nonEmpty = row.filter((c) => clean(c) !== '');
      if (!nonEmpty.length) continue;
      const joined = nonEmpty.map(clean).join(' ');
      const hm = mapHeaderRow(row);
      if ((ti === startIdx && i === headerRow) || (isConfident(hm) && Object.keys(hm).length >= 3)) {
        if (!(ti === startIdx && i === headerRow)) m = { ...mapping, ...hm };
        // a card title may sit inside the header line itself
        const cm = joined.match(CARD_RE);
        if (cm) card = cm[1];
        continue;
      }
      if (!m || (ti === startIdx && i < headerRow)) {
        const cm = joined.match(CARD_RE);
        if (cm) card = cm[1];
        continue;
      }
      // section title for another card between tables
      if (nonEmpty.length <= 2 && CARD_RE.test(joined) && !parseDate(cell(row, m, 'txn_date'))) {
        card = joined.match(CARD_RE)![1];
        continue;
      }
      const description = clean(cell(row, m, 'description'));
      const txnDate = parseDate(cell(row, m, 'txn_date'));
      const chargedDate = parseDate(cell(row, m, 'charged_date'));
      const amt = parseAmount(cell(row, m, 'amount'));
      const orig = parseAmount(cell(row, m, 'original_amount'));
      const kindText = clean(cell(row, m, 'kind'));
      const instInfo =
        parseInstallments(cell(row, m, 'installments')) || parseInstallments(kindText) || parseInstallments(description);
      const rowCard = clean(cell(row, m, 'card')).replace(/\D/g, '').slice(-4);
      const ref = clean(cell(row, m, 'reference')).replace(/\s/g, '');
      const statusText = clean(cell(row, m, 'status'));

      let error: string | null = null;
      if (SUMMARY_RE.test(joined) && !txnDate) error = 'summary';
      else if (SUMMARY_RE.test(description)) error = 'summary';
      else if (!txnDate) error = 'bad_date';
      else if (!description) error = 'no_description';
      else if (!amt || amt.value === 0) error = 'bad_amount';

      const value = amt?.value ?? 0;
      const kwRefund = REFUND_RE.test(kindText) || /^זיכוי|זיכוי$/.test(description);
      // Isracard profile: charges are positive, credits are negative.
      const signRefund = value < 0;
      const is_refund = signRefund || kwRefund;
      let flag: string | null = null;
      if (kwRefund && !signRefund && value > 0 && /חיוב/.test(kindText)) flag = 'ambiguous_sign';
      if (instInfo && instInfo.total && instInfo.total > 1 && !instInfo.num) flag = flag || 'installment_without_number';

      const currency = parseCurrency(cell(row, m, 'currency')) || orig?.currency || amt?.currency || 'ILS';

      out.push({
        ord: ord++,
        sheet: t.sheet,
        line: i + 1,
        account: rowCard || card || '0000',
        external_id: ref && /\d/.test(ref) ? ref.slice(0, 64) : null,
        txn_date: txnDate,
        charged_date: chargedDate,
        amount: amt ? Math.abs(amt.value) : null,
        is_refund,
        original_amount: orig ? Math.abs(orig.value) : null,
        currency,
        description: description.slice(0, 300),
        inst_num: instInfo?.num ?? null,
        inst_total: instInfo?.total ?? null,
        status: /ממתין|pending|בקליטה/i.test(statusText) ? 'pending' : 'completed',
        flag,
        error,
      });
    }
  }
  return out;
};

/** Payload for the server. Invalid rows are sent too so the server reports them consistently. */
export const toServerRow = (r: ParsedRow) => ({
  account: r.account,
  external_id: r.external_id,
  txn_date: r.txn_date,
  charged_date: r.charged_date,
  amount: r.error === 'summary' ? null : r.amount !== null ? r.amount.toFixed(2) : null,
  is_refund: r.is_refund,
  original_amount: r.original_amount !== null ? r.original_amount.toFixed(2) : null,
  currency: r.currency,
  description: r.error === 'summary' ? '' : r.description,
  inst_num: r.inst_num,
  inst_total: r.inst_total,
  status: r.status,
  flag: r.flag,
});

export const monthKey = (isoDate: string | null) => (isoDate ? isoDate.slice(0, 7) : null);

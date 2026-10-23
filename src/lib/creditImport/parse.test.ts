import { describe, expect, test } from 'bun:test';
import { detectTable, parseAmount, parseDate, parseInstallments, parseRows, matchHeader } from './parse';

const isracard = [
  ['פירוט עסקאות לכרטיס המסתיים ב-1234'],
  [''],
  ['תאריך רכישה', 'שם בית עסק', 'סכום עסקה', 'מטבע עסקה', 'סכום חיוב', 'מספר שובר', 'פירוט נוסף', 'תאריך חיוב'],
  ['05/10/2026', 'שופרסל', '250.00', '₪', '250.00', '111', '', '10/11/2026'],
  ['06/10/2026', 'חנות חשמל', '1,200.00', '₪', '200.00', '222', 'תשלום 2 מתוך 6', '10/11/2026'],
  ['07/10/2026', 'אמזון', '$30.00', 'USD', '110.50', '333', '', '10/11/2026'],
  ['08/10/2026', 'זארה', '-90', '₪', '-90', '444', 'זיכוי', '10/11/2026'],
  ['', 'סה"כ', '', '', '470.50', '', '', ''],
  ['כרטיס המסתיים ב-9876'],
  ['תאריך רכישה', 'שם בית עסק', 'סכום עסקה', 'מטבע עסקה', 'סכום חיוב', 'מספר שובר', 'פירוט נוסף', 'תאריך חיוב'],
  ['09/10/2026', 'פז', '180', '₪', '180', '', '', ''],
];

describe('credit file parsing', () => {
  test('Israeli and Excel date formats', () => {
    expect(parseDate('05/10/2026')).toBe('2026-10-05');
    expect(parseDate('5.10.26')).toBe('2026-10-05');
    expect(parseDate(46300)).toBe('2026-10-04');
    expect(parseDate('31/02/2026')).toBeNull();
  });

  test('amount formats', () => {
    expect(parseAmount('₪1,234.50')).toEqual({ value: 1234.5, currency: 'ILS' });
    expect(parseAmount('(50)')?.value).toBe(-50);
    expect(parseAmount('50-')?.value).toBe(-50);
    expect(parseAmount('$ 12')).toEqual({ value: 12, currency: 'USD' });
  });

  test('installments text', () => {
    expect(parseInstallments('תשלום 3 מתוך 12')).toEqual({ num: 3, total: 12 });
    expect(parseInstallments('3/12')).toEqual({ num: 3, total: 12 });
  });

  test('charged amount header is not confused with transaction amount', () => {
    expect(matchHeader('סכום חיוב')).toBe('amount');
    expect(matchHeader('סכום עסקה')).toBe('original_amount');
  });

  test('finds header after title rows, skips summary, splits cards', () => {
    const tables = [{ sheet: 'Sheet1', rows: isracard }];
    const d = detectTable(tables)!;
    expect(d.confident).toBe(true);
    expect(d.headerRow).toBe(2);
    const rows = parseRows(tables, d.sheet, d.headerRow, d.mapping);
    const valid = rows.filter((r) => !r.error);
    expect(valid.length).toBe(5);
    expect(rows.find((r) => r.error === 'summary')).toBeTruthy();
    expect(valid[0].account).toBe('1234');
    expect(valid[4].account).toBe('9876');
  });

  test('installment imports only the monthly charge', () => {
    const tables = [{ sheet: 's', rows: isracard }];
    const d = detectTable(tables)!;
    const r = parseRows(tables, d.sheet, d.headerRow, d.mapping).find((x) => x.description === 'חנות חשמל')!;
    expect(r.amount).toBe(200);
    expect(r.inst_num).toBe(2);
    expect(r.inst_total).toBe(6);
    expect(r.original_amount).toBe(1200);
  });

  test('refunds and foreign currency', () => {
    const tables = [{ sheet: 's', rows: isracard }];
    const d = detectTable(tables)!;
    const rows = parseRows(tables, d.sheet, d.headerRow, d.mapping);
    const z = rows.find((x) => x.description === 'זארה')!;
    expect(z.is_refund).toBe(true);
    expect(z.amount).toBe(90);
    const a = rows.find((x) => x.description === 'אמזון')!;
    expect(a.currency).toBe('USD');
    expect(a.amount).toBe(110.5);
  });

  test('missing charged date is not guessed', () => {
    const tables = [{ sheet: 's', rows: isracard }];
    const d = detectTable(tables)!;
    const p = parseRows(tables, d.sheet, d.headerRow, d.mapping).find((x) => x.description === 'פז')!;
    expect(p.charged_date).toBeNull();
  });

  test('unclear structure is not confident', () => {
    expect(detectTable([{ sheet: 's', rows: [['א', 'ב'], ['1', '2']] }])).toBeNull();
  });
});

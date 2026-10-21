import { describe, expect, test } from 'bun:test';
import { normalizeTxn, fingerprintOf, maskAccount } from './normalize';

const base = {
  date: '2026-10-19T21:00:00.000Z',
  originalAmount: -50,
  chargedAmount: -50,
  originalCurrency: 'ILS',
  description: 'שופרסל דיל',
  status: 'completed',
  type: 'normal',
};

describe('sync normalization', () => {
  test('strong key uses identifier + installment number, independent of order', async () => {
    const a = await normalizeTxn('4580123456781234', { ...base, identifier: 98765 }, 0);
    const b = await normalizeTxn('4580123456781234', { ...base, identifier: 98765 }, 37);
    expect(a.import_key).toBe('id:98765:0');
    expect(b.import_key).toBe(a.import_key);
  });

  test('fingerprint has no per-request ordinal: identical txns share it', async () => {
    const a = await normalizeTxn('1234', base, 0);
    const b = await normalizeTxn('1234', base, 1);
    expect(a.import_key).toBeNull();
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  test('each installment gets its own key and counts only the monthly charge', async () => {
    const inst = { ...base, identifier: 555, type: 'installments', originalAmount: -1200, chargedAmount: -100, processedDate: '2026-11-01T22:00:00.000Z' };
    const p3 = await normalizeTxn('1234', { ...inst, installments: { number: 3, total: 12 } }, 0);
    const p4 = await normalizeTxn('1234', { ...inst, installments: { number: 4, total: 12 } }, 1);
    expect(p3.import_key).toBe('id:555:3');
    expect(p4.import_key).toBe('id:555:4');
    expect(p3.charged_amount).toBe(-100);
    expect(p3.txn_date).toBe('2026-11-02');
  });

  test('installment without number goes to review and gets no strong key', async () => {
    const t = await normalizeTxn('1234', { ...base, identifier: 7, type: 'installments' }, 0);
    expect(t.import_key).toBeNull();
    expect(t.needs_review).toBe(true);
  });

  test('dates are interpreted in Israel time', async () => {
    const t = await normalizeTxn('1234', base, 0);
    expect(t.txn_date).toBe('2026-10-20');
  });

  test('only last 4 digits of the card are kept', () => {
    expect(maskAccount('4580-1234-5678-9012')).toBe('9012');
  });

  test('different amount produces different fingerprint', async () => {
    expect(await fingerprintOf('1234', base)).not.toBe(await fingerprintOf('1234', { ...base, originalAmount: -51 }));
  });
});

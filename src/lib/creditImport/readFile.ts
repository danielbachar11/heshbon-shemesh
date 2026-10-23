import * as XLSX from 'xlsx';
import type { SheetTable } from './parse';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 3000;
const OK_EXT = /\.(xlsx|xls|csv)$/i;

export const readStatementFile = async (file: File): Promise<SheetTable[]> => {
  if (!OK_EXT.test(file.name)) throw new Error('סוג קובץ לא נתמך. יש להעלות xlsx, xls או csv');
  if (file.size > MAX_FILE_BYTES) throw new Error('הקובץ גדול מ-5MB');
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  if (/\.csv$/i.test(file.name)) {
    // Israeli CSV exports are often windows-1255; fall back if UTF-8 decoding produced garbage
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('\uFFFD')) text = new TextDecoder('windows-1255').decode(buf);
    wb = XLSX.read(text, { type: 'string', raw: true });
  } else {
    wb = XLSX.read(buf, { type: 'array', cellDates: true });
  }
  const tables = wb.SheetNames.map((sheet) => ({
    sheet,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, raw: true, defval: '' }),
  }));
  const total = tables.reduce((s, t) => s + t.rows.length, 0);
  if (total > MAX_ROWS + 200) throw new Error(`הקובץ מכיל יותר מ-${MAX_ROWS} שורות`);
  return tables;
};

import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';
import { TRANSACTION_SELECT, Transaction } from '@/hooks/useTransactions';

const toDDMMYYYY = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const exportTransactionsToExcel = async () => {
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_SELECT)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data || []) as unknown as Transaction[];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('תנועות', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'תאריך', key: 'date', width: 14 },
    { header: 'סוג תנועה', key: 'type', width: 12 },
    { header: 'סכום', key: 'amount', width: 14 },
    { header: 'קטגוריה', key: 'category', width: 22 },
    { header: 'הערות', key: 'notes', width: 40 },
  ];

  rows.forEach((t) => {
    const cat = [t.category?.name, t.subcategory?.name].filter(Boolean).join(' / ');
    const notes = [t.description, t.notes].filter(Boolean).join(' – ');
    ws.addRow({
      date: toDDMMYYYY(t.transaction_date),
      type: t.type === 'income' ? 'הכנסה' : 'הוצאה',
      amount: Number(t.amount),
      category: cat || 'ללא קטגוריה',
      notes,
    });
  });

  ws.eachRow((row, i) => {
    row.eachCell((cell) => {
      cell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' };
      cell.font = { name: 'Arial', bold: i === 1 };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
    });
    if (i === 1) row.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5EEF5' } }));
  });
  ws.getColumn('amount').numFmt = '₪#,##0.00';
  ws.autoFilter = { from: 'A1', to: 'E1' };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `תנועות-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
};

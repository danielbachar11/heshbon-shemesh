import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { REASON_LABEL, ils, ddmmyyyy } from './labels';

interface Row {
  id: string;
  description: string | null;
  amount: number;
  transaction_date: string;
  charged_date: string | null;
  review_reason: string | null;
  linked_transaction_id: string | null;
  credit_kind: string | null;
  external_account: string | null;
  installment_number: number | null;
  installments_total: number | null;
}

export const ReviewList: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [linked, setLinked] = useState<Record<string, Row>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('transactions')
      .select('id, description, amount, transaction_date, charged_date, review_reason, linked_transaction_id, credit_kind, external_account, installment_number, installments_total')
      .eq('review_status', 'pending_review')
      .order('transaction_date', { ascending: false });
    const list = (data || []) as Row[];
    setRows(list);
    const ids = list.map((r) => r.linked_transaction_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: l } = await supabase.from('transactions').select('id, description, amount, transaction_date, charged_date').in('id', ids);
      setLinked(Object.fromEntries((l || []).map((x) => [x.id, x as Row])));
    }
  };
  useEffect(() => { load(); }, []);

  const act = async (id: string, action: 'approve' | 'reject' | 'link') => {
    setBusy(id);
    const { error } = await supabase.rpc('resolve_sync_review', { _id: id, _action: action });
    setBusy(null);
    if (error) return toast({ title: 'שגיאה', description: 'הפעולה נכשלה', variant: 'destructive' });
    toast({ title: action === 'approve' ? 'אושר' : action === 'reject' ? 'נדחה – לא ייספר ולא יעלה שוב' : 'קושר להוצאה הקיימת' });
    load();
  };

  const setDate = async (id: string) => {
    if (!dates[id]) return;
    setBusy(id);
    const { error } = await supabase.rpc('set_review_charged_date', { _id: id, _date: dates[id] });
    setBusy(null);
    if (error) return toast({ title: 'שגיאה', variant: 'destructive' });
    toast({ title: 'תאריך החיוב נשמר' });
    load();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">עסקאות לבדיקה ({rows.length})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {!rows.length && <p className="text-sm text-muted-foreground text-center py-6">אין עסקאות שממתינות לבדיקה</p>}
        {rows.map((r) => {
          const l = r.linked_transaction_id ? linked[r.linked_transaction_id] : null;
          return (
            <div key={r.id} className="rounded-xl border p-3 space-y-2">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-medium">{r.description}</p>
                  <p className="text-xs text-muted-foreground">
                    עסקה {ddmmyyyy(r.transaction_date)} • חיוב {ddmmyyyy(r.charged_date)} • כרטיס {r.external_account}
                    {r.installments_total ? ` • תשלום ${r.installment_number ?? '?'} מתוך ${r.installments_total}` : ''}
                  </p>
                </div>
                <span className="font-bold whitespace-nowrap">{r.credit_kind === 'refund' ? '+' : ''}{ils(Number(r.amount))}</span>
              </div>
              <p className="text-sm text-expense">{REASON_LABEL[r.review_reason || ''] || r.review_reason}</p>
              {l && r.review_reason === 'possible_manual_duplicate' && (
                <p className="text-xs bg-muted/50 rounded-lg p-2">
                  הוצאה קיימת: {l.description || '—'} • {ddmmyyyy(l.transaction_date)} • {ils(Number(l.amount))}
                </p>
              )}
              {r.review_reason === 'no_charged_date' && (
                <div className="flex gap-2">
                  <Input type="date" value={dates[r.id] || ''} onChange={(e) => setDates((d) => ({ ...d, [r.id]: e.target.value }))} />
                  <Button size="sm" onClick={() => setDate(r.id)} disabled={busy === r.id || !dates[r.id]}>קבע תאריך חיוב</Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {r.review_reason !== 'no_charged_date' && (
                  <Button size="sm" onClick={() => act(r.id, 'approve')} disabled={busy === r.id}>
                    {r.review_reason === 'possible_manual_duplicate' ? 'זו עסקה נפרדת – הוסף' : 'אשר'}
                  </Button>
                )}
                {l && r.review_reason === 'possible_manual_duplicate' && (
                  <Button size="sm" variant="secondary" onClick={() => act(r.id, 'link')} disabled={busy === r.id}>
                    זו אותה הוצאה – קשר
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => act(r.id, 'reject')} disabled={busy === r.id}>דחה</Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

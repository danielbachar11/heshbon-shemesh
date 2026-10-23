import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { STATUS_LABEL, REASON_LABEL } from './labels';

interface Log {
  id: string;
  created_at: string;
  file_name: string | null;
  kind: string;
  billing_month: string | null;
  received: number;
  inserted: number;
  existing: number;
  needs_review: number;
  errors: number;
  result: { rows?: { ord: number; status: string; reason: string | null }[] } | null;
}

export const ImportHistory: React.FC = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('sync_logs')
      .select('id, created_at, file_name, kind, billing_month, received, inserted, existing, needs_review, errors, result')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setLogs((data || []) as unknown as Log[]));
  }, []);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">היסטוריית ייבוא</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {!logs.length && <p className="text-sm text-muted-foreground text-center py-6">עדיין לא בוצעו ייבואים</p>}
        {logs.map((l) => {
          const counts: Record<string, number> = {};
          l.result?.rows?.forEach((r) => {
            const k = `${r.status}|${r.reason || ''}`;
            counts[k] = (counts[k] || 0) + 1;
          });
          return (
            <button key={l.id} onClick={() => setOpen(open === l.id ? null : l.id)} className="w-full text-right rounded-xl border p-3 hover:bg-muted/50">
              <div className="flex justify-between">
                <span className="font-medium truncate">{l.kind === 'file' ? l.file_name || 'קובץ' : 'סנכרון אוטומטי'}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(l.created_at), 'dd/MM/yyyy HH:mm', { locale: he })}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {l.billing_month ? `חודש חיוב ${l.billing_month.slice(5, 7)}/${l.billing_month.slice(0, 4)} • ` : ''}
                נקראו {l.received} • נוספו {l.inserted} • כפילויות שנמנעו {l.existing} • לבדיקה {l.needs_review} • נכשלו {l.errors}
              </p>
              {open === l.id && (
                <ul className="mt-2 text-xs space-y-1">
                  {Object.entries(counts).map(([k, n]) => {
                    const [s, r] = k.split('|');
                    return <li key={k}>{STATUS_LABEL[s] || s}{r ? ` – ${REASON_LABEL[r] || r}` : ''}: {n}</li>;
                  })}
                </ul>
              )}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
};

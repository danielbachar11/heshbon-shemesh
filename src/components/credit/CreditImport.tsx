import React, { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { readStatementFile } from '@/lib/creditImport/readFile';
import {
  detectTable, parseRows, toServerRow, monthKey, FIELD_LABELS, REQUIRED,
  type DetectResult, type Field, type Mapping, type ParsedRow, type SheetTable,
} from '@/lib/creditImport/parse';
import { STATUS_LABEL, REASON_LABEL, ils, ddmmyyyy } from './labels';

interface RowResult {
  ord: number;
  status: 'new' | 'existing' | 'review' | 'complete' | 'invalid';
  reason: string | null;
  match: { id: string; date: string; charged_date: string | null; amount: number; description: string | null; source: string } | null;
}

const statusVariant = (s: string) =>
  s === 'new' ? 'default' : s === 'review' ? 'destructive' : s === 'complete' ? 'secondary' : 'outline';

const now = new Date();
const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

export const CreditImport: React.FC<{ onImported?: () => void }> = ({ onImported }) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [tables, setTables] = useState<SheetTable[] | null>(null);
  const [detect, setDetect] = useState<DetectResult | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [needMapping, setNeedMapping] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<Record<number, RowResult>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [month, setMonth] = useState(defaultMonth);
  const [includeOther, setIncludeOther] = useState(false);
  const [idemKey, setIdemKey] = useState<string>(crypto.randomUUID());
  const [done, setDone] = useState<Record<string, number> | null>(null);

  const reset = () => {
    setTables(null); setDetect(null); setRows([]); setResults({}); setSelected(new Set());
    setNeedMapping(false); setDone(null); setFileName(''); setIdemKey(crypto.randomUUID());
  };

  const runPreview = async (parsed: ParsedRow[], m = month, other = includeOther) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('preview_credit_import', { _rows: parsed.map(toServerRow) as never });
    setBusy(false);
    if (error) {
      toast({ title: 'שגיאה', description: 'הבדיקה המקדימה נכשלה', variant: 'destructive' });
      return;
    }
    const res: Record<number, RowResult> = {};
    ((data as { rows: RowResult[] }).rows || []).forEach((r) => (res[r.ord] = r));
    setRows(parsed);
    setResults(res);
    setSelected(defaultSelection(parsed, res, m, other));
  };

  const defaultSelection = (parsed: ParsedRow[], res: Record<number, RowResult>, m: string, other: boolean) =>
    new Set(
      parsed
        .filter((r) => ['new', 'complete', 'review'].includes(res[r.ord]?.status))
        .filter((r) => other || monthKey(r.charged_date) === m || (!r.charged_date && res[r.ord]?.status === 'review'))
        .map((r) => r.ord),
    );

  const onFile = async (file: File) => {
    reset();
    setFileName(file.name);
    setBusy(true);
    try {
      const t = await readStatementFile(file);
      const d = detectTable(t);
      setTables(t);
      setDetect(d);
      setMapping(d?.mapping ?? {});
      if (!d || !d.confident) {
        setNeedMapping(true);
        setBusy(false);
        return;
      }
      const parsed = parseRows(t, d.sheet, d.headerRow, d.mapping);
      setBusy(false);
      await runPreview(parsed);
    } catch (e) {
      setBusy(false);
      toast({ title: 'לא ניתן לקרוא את הקובץ', description: (e as Error).message, variant: 'destructive' });
    }
  };

  // manual mapping: choose header row, then columns
  const [manualSheet, setManualSheet] = useState<string>('');
  const [manualHeaderRow, setManualHeaderRow] = useState<number>(0);
  const mSheet = manualSheet || detect?.sheet || tables?.[0]?.sheet || '';
  const mHeaderRow = detect && !manualSheet ? detect.headerRow : manualHeaderRow;
  const headerCells = (tables?.find((t) => t.sheet === mSheet)?.rows[mHeaderRow] || []).map((c) => String(c ?? ''));

  const applyMapping = async () => {
    if (!tables) return;
    if (!REQUIRED.every((f) => mapping[f] !== undefined)) {
      toast({ title: 'חסר מיפוי', description: 'יש לבחור עמודות לתאריך עסקה, בית עסק וסכום חיוב', variant: 'destructive' });
      return;
    }
    setNeedMapping(false);
    await runPreview(parseRows(tables, mSheet, mHeaderRow, mapping));
  };

  const doImport = async () => {
    const chosen = rows.filter((r) => selected.has(r.ord));
    if (!chosen.length) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('import_credit_file', {
      _idempotency_key: idemKey,
      _file_name: fileName,
      _billing_month: `${month}-01`,
      _rows: chosen.map(toServerRow) as never,
    });
    setBusy(false);
    if (error) {
      // same key is kept, so retrying after a dropped connection cannot import twice
      toast({ title: 'הייבוא נכשל', description: 'לא נשמר דבר. אפשר לנסות שוב בבטחה.', variant: 'destructive' });
      return;
    }
    const r = data as Record<string, number>;
    setDone(r);
    toast({ title: 'הייבוא הושלם', description: `${r.inserted} עסקאות נוספו` });
    onImported?.();
  };

  const view = useMemo(() => {
    const valid = rows.filter((r) => results[r.ord]);
    const inMonth = valid.filter((r) => monthKey(r.charged_date) === month);
    const other = valid.filter((r) => r.charged_date && monthKey(r.charged_date) !== month);
    const noDate = valid.filter((r) => !r.charged_date);
    const count = (s: string) => valid.filter((r) => results[r.ord]?.status === s).length;
    const net = (list: ParsedRow[]) =>
      list.filter((r) => !r.error).reduce((s, r) => s + (r.is_refund ? -1 : 1) * (r.amount || 0), 0);
    const newNet = net(inMonth.filter((r) => selected.has(r.ord) && results[r.ord]?.status === 'new'));
    return { valid, inMonth, other, noDate, count, monthNet: net(inMonth), newNet };
  }, [rows, results, month, selected]);

  const toggle = (ord: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(ord) ? n.delete(ord) : n.add(ord);
      return n;
    });

  const Table = ({ list, title }: { list: ParsedRow[]; title: string }) =>
    list.length ? (
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">{title} ({list.length})</h4>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-right">
                <th className="p-2 w-8"></th>
                <th className="p-2">תאריך חיוב</th>
                <th className="p-2">תאריך עסקה</th>
                <th className="p-2">בית עסק</th>
                <th className="p-2">סכום</th>
                <th className="p-2">תשלומים</th>
                <th className="p-2">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map((r) => {
                const res = results[r.ord];
                const selectable = res && ['new', 'complete', 'review'].includes(res.status);
                const reason = res?.reason || r.error;
                return (
                  <tr key={r.ord} className="align-top">
                    <td className="p-2">
                      <Checkbox checked={selected.has(r.ord)} disabled={!selectable} onCheckedChange={() => toggle(r.ord)} />
                    </td>
                    <td className="p-2 whitespace-nowrap">{ddmmyyyy(r.charged_date)}</td>
                    <td className="p-2 whitespace-nowrap text-muted-foreground">{ddmmyyyy(r.txn_date)}</td>
                    <td className="p-2">
                      {r.description || '—'}
                      <span className="block text-xs text-muted-foreground">כרטיס {r.account}{r.currency !== 'ILS' && r.original_amount ? ` • ${r.original_amount} ${r.currency}` : ''}</span>
                    </td>
                    <td className={`p-2 whitespace-nowrap font-medium ${r.is_refund ? 'text-income' : ''}`}>
                      {r.amount !== null ? `${r.is_refund ? '+' : ''}${ils(r.amount)}` : '—'}
                      {r.is_refund && <span className="block text-xs">זיכוי</span>}
                    </td>
                    <td className="p-2 whitespace-nowrap">{r.inst_total ? `${r.inst_num ?? '?'} מתוך ${r.inst_total}` : 'רגיל'}</td>
                    <td className="p-2">
                      {res && <Badge variant={statusVariant(res.status) as never}>{STATUS_LABEL[res.status]}</Badge>}
                      {reason && <span className="block text-xs text-muted-foreground mt-1">{REASON_LABEL[reason] || reason}</span>}
                      {res?.match && (
                        <span className="block text-xs text-muted-foreground">
                          קיימת: {ddmmyyyy(res.match.date)} • {ils(Number(res.match.amount))} • {res.match.description || '—'}
                          {res.match.source === 'manual' ? ' (הוזנה ידנית)' : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    ) : null;

  if (done) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 mx-auto text-income" />
          <h3 className="text-lg font-bold">הייבוא הושלם{(done as unknown as { replayed?: boolean }).replayed ? ' (כבר בוצע קודם)' : ''}</h3>
          <p className="text-sm text-muted-foreground">
            נוספו {done.inserted} • כבר קיימות {done.existing} • הושלמו {done.completed} • לבדיקה {done.needs_review} • לא תקינות {done.invalid}
          </p>
          <Button onClick={reset}>ייבוא קובץ נוסף</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">ייבוא חיובי אשראי</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>חודש חיוב</Label>
              <Input type="month" value={month} onChange={(e) => {
                setMonth(e.target.value);
                if (rows.length) setSelected(defaultSelection(rows, results, e.target.value, includeOther));
              }} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <Checkbox checked={includeOther} onCheckedChange={(v) => {
                setIncludeOther(!!v);
                if (rows.length) setSelected(defaultSelection(rows, results, month, !!v));
              }} />
              לייבא גם חודשים אחרים
            </label>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${drag ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}`}
          >
            {busy ? <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" /> : <Upload className="h-8 w-8 mx-auto text-primary" />}
            <p className="mt-2 font-medium">{fileName || 'גררו לכאן קובץ או לחצו לבחירה'}</p>
            <p className="text-xs text-muted-foreground">Excel ‏(xlsx, xls) או CSV, עד 5MB. הקובץ לא נשמר במערכת.</p>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
          </div>
        </CardContent>
      </Card>

      {needMapping && tables && (
        <Card>
          <CardHeader><CardTitle className="text-base">מיפוי עמודות</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">לא הצלחנו לזהות בוודאות את מבנה הקובץ. בחרו את שורת הכותרות ואת העמודות.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>גיליון</Label>
                <Select value={mSheet} onValueChange={(v) => { setManualSheet(v); setManualHeaderRow(0); setMapping({}); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{tables.map((t) => <SelectItem key={t.sheet} value={t.sheet}>{t.sheet}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>שורת כותרות (מספר)</Label>
                <Input type="number" min={1} value={mHeaderRow + 1}
                  onChange={(e) => { setManualSheet(mSheet); setManualHeaderRow(Math.max(0, Number(e.target.value) - 1)); }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(FIELD_LABELS) as Field[]).map((f) => (
                <div key={f} className="space-y-1">
                  <Label>{FIELD_LABELS[f]}{REQUIRED.includes(f) ? ' *' : ''}</Label>
                  <Select value={mapping[f] !== undefined ? String(mapping[f]) : 'none'}
                    onValueChange={(v) => setMapping((m) => { const n = { ...m }; if (v === 'none') delete n[f]; else n[f] = Number(v); return n; })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— ללא —</SelectItem>
                      {headerCells.map((h, i) => <SelectItem key={i} value={String(i)}>{h || `עמודה ${i + 1}`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <Button onClick={applyMapping} disabled={busy}>המשך לתצוגה מקדימה</Button>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">תצוגה מקדימה – שום דבר עוד לא נשמר</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              {[
                ['נמצאו בקובץ', view.valid.length],
                ['חדשות', view.count('new')],
                ['כבר קיימות', view.count('existing') + view.count('complete')],
                ['דורשות בדיקה', view.count('review')],
                ['לא תקינות', view.count('invalid')],
                ['נבחרו לייבוא', selected.size],
                ['חדש נטו לחודש', ils(view.newNet)],
                ['סך החודש בקובץ (נטו)', ils(view.monthNet)],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="font-bold">{v}</p>
                </div>
              ))}
            </div>
            <Table list={view.inMonth} title="חיובים בחודש הנבחר" />
            <Table list={view.other} title="חיובים מחודשים אחרים" />
            <Table list={view.noDate} title="ללא תאריך חיוב" />
            <p className="text-xs text-muted-foreground">
              עסקאות "דורש בדיקה" שנבחרו יישמרו ברשימת הבדיקה ולא ייספרו ביתרה עד שתאשרו אותן.
            </p>
            <div className="flex gap-2">
              <Button size="lg" className="flex-1" onClick={doImport} disabled={busy || !selected.size}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                אשר ייבוא ({selected.size})
              </Button>
              <Button size="lg" variant="outline" onClick={reset} disabled={busy}>ביטול</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

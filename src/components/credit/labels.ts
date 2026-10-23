export const STATUS_LABEL: Record<string, string> = {
  new: 'חדש',
  existing: 'כבר קיים',
  review: 'דורש בדיקה',
  complete: 'השלמת פרטים',
  invalid: 'שורה לא תקינה',
};

export const REASON_LABEL: Record<string, string> = {
  same_reference: 'אותה אסמכתה כבר יובאה',
  same_details: 'עסקה זהה כבר קיימת',
  charged_date_changed: 'קיימת – תאריך החיוב עודכן',
  missing_charged_date: 'קיימת – חסר בה תאריך חיוב, יושלם',
  missing_reference: 'קיימת – חסרה בה אסמכתה, תושלם',
  identical_extra: 'בקובץ יש יותר עסקאות זהות ממה שקיים באתר – ייתכן שזו עסקה נוספת אמיתית',
  possible_manual_duplicate: 'ייתכן שזו הוצאה שכבר הוזנה ידנית',
  installment_without_number: 'עסקה בתשלומים ללא מספר תשלום',
  no_charged_date: 'אין תאריך חיוב בקובץ',
  ambiguous_sign: 'לא ברור אם זה חיוב או זיכוי',
  refund: 'זיכוי',
  summary: 'שורת סיכום – לא תיובא',
  bad_date: 'תאריך לא תקין',
  bad_amount: 'סכום לא תקין',
  no_description: 'חסר שם בית עסק',
  identical_without_id: 'עסקה זהה ללא מזהה',
  multiple_pending_matches: 'כמה התאמות אפשריות',
  stale_pending: 'עסקה ממתינה שלא התעדכנה',
};

export const ils = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

export const ddmmyyyy = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

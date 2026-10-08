import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Transaction {
  id: string;
  user_id: string;
  type: 'income' | 'expense';
  amount: number;
  category_id: string;
  subcategory_id: string | null;
  family_member_id: string | null;
  payment_method: string | null;
  is_recurring: boolean;
  notes: string | null;
  description: string | null;
  transaction_date: string;
  created_at: string;
  category?: { id: string; name: string; type: string; icon: string | null; color: string | null };
  subcategory?: { id: string; name: string } | null;
  member?: { id: string; name: string; color: string | null; avatar: string | null } | null;
  profile?: { first_name: string; last_name: string };
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  icon: string | null;
  color: string | null;
  parent_id: string | null;
  household_id: string | null;
}

export interface TransactionInput {
  type: 'income' | 'expense';
  amount: number;
  categoryId: string | null;
  subcategoryId: string | null;
  familyMemberId: string | null;
  paymentMethod: string | null;
  isRecurring: boolean;
  description: string;
  notes: string;
  date: string;
}

export const PAYMENT_METHODS = ['כרטיס אשראי', 'מזומן', 'העברה בנקאית', 'הוראת קבע', 'ביט / פייבוקס', "צ'ק", 'אחר'];

export const toLocalDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const TRANSACTION_SELECT = `
  *,
  category:categories!transactions_category_id_fkey(id, name, type, icon, color),
  subcategory:categories!transactions_subcategory_id_fkey(id, name),
  member:family_members(id, name, color, avatar)
`;

export const useTransactions = (month?: number, year?: number) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) {
      console.error('Error fetching categories:', error);
      return;
    }
    setCategories(data as Category[]);
  }, []);

  const fetchTransactions = async () => {
    if (!user) return;
    setIsLoading(true);

    let query = supabase.from('transactions').select(TRANSACTION_SELECT).order('transaction_date', { ascending: false });

    if (month !== undefined && year !== undefined) {
      const startDate = toLocalDateString(new Date(year, month, 1));
      const endDate = toLocalDateString(new Date(year, month + 1, 0));
      query = query.gte('transaction_date', startDate).lte('transaction_date', endDate);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching transactions:', error);
      toast({ title: 'שגיאה', description: 'לא ניתן לטעון את התנועות', variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    const userIds = [...new Set((data || []).map((t) => t.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);

    setTransactions(
      (data || []).map((t) => ({ ...t, profile: profiles?.find((p) => p.user_id === t.user_id) })) as unknown as Transaction[]
    );
    setIsLoading(false);
  };

  const resolveCategory = (input: TransactionInput) => {
    if (input.categoryId) return input.categoryId;
    const fallback =
      categories.find((c) => c.type === input.type && !c.parent_id && c.name === 'הוצאות אחרות') ||
      categories.find((c) => c.type === input.type && !c.parent_id);
    return fallback?.id ?? null;
  };

  const toRow = (input: TransactionInput, categoryId: string) => ({
    type: input.type,
    amount: input.amount,
    category_id: categoryId,
    subcategory_id: input.subcategoryId,
    family_member_id: input.familyMemberId,
    payment_method: input.paymentMethod,
    is_recurring: input.isRecurring,
    description: input.description || null,
    notes: input.notes || null,
    transaction_date: input.date,
  });

  const addTransaction = async (input: TransactionInput) => {
    if (!user) return { error: new Error('לא מחובר') };
    const categoryId = resolveCategory(input);
    if (!categoryId) {
      toast({ title: 'שגיאה', description: 'לא נמצאה קטגוריה מתאימה', variant: 'destructive' });
      return { error: new Error('No category found') };
    }
    const { error } = await supabase.from('transactions').insert({ user_id: user.id, ...toRow(input, categoryId) });
    if (error) {
      toast({ title: 'שגיאה', description: 'לא ניתן להוסיף את התנועה', variant: 'destructive' });
      return { error };
    }
    toast({ title: 'התנועה נוספה בהצלחה', description: input.type === 'income' ? 'ההכנסה נרשמה' : 'ההוצאה נרשמה' });
    await fetchTransactions();
    return { error: null };
  };

  const updateTransaction = async (id: string, input: TransactionInput) => {
    const categoryId = resolveCategory(input);
    if (!categoryId) return { error: new Error('No category found') };
    const { error } = await supabase.from('transactions').update(toRow(input, categoryId)).eq('id', id);
    if (error) {
      toast({ title: 'שגיאה', description: 'לא ניתן לעדכן את התנועה', variant: 'destructive' });
      return { error };
    }
    toast({ title: 'התנועה עודכנה' });
    await fetchTransactions();
    return { error: null };
  };

  const deleteTransaction = async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) {
      toast({ title: 'שגיאה', description: 'לא ניתן למחוק את התנועה', variant: 'destructive' });
      return { error };
    }
    toast({ title: 'התנועה נמחקה' });
    await fetchTransactions();
    return { error: null };
  };

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('transactions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchTransactions())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, month, year]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories, user]);

  useEffect(() => {
    fetchTransactions();
  }, [user, month, year]);

  return {
    transactions,
    categories,
    isLoading,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    refreshTransactions: fetchTransactions,
    refreshCategories: fetchCategories,
  };
};

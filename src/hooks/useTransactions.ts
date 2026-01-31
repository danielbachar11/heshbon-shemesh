import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Transaction {
  id: string;
  user_id: string;
  type: 'income' | 'expense';
  amount: number;
  category_id: string;
  description: string | null;
  transaction_date: string;
  created_at: string;
  category?: {
    id: string;
    name: string;
    type: string;
    icon: string | null;
    color: string | null;
  };
  profile?: {
    first_name: string;
    last_name: string;
  };
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  icon: string | null;
  color: string | null;
}

export const useTransactions = (month?: number, year?: number) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  // IMPORTANT: avoid Date#toISOString() here, because converting local midnight to UTC
  // can shift the date back a day (timezone), causing monthly ranges to exclude the
  // last day of the month (e.g. 31/01 becomes 30/01).
  const toLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching categories:', error);
      return;
    }

    setCategories(data as Category[]);
  };

  const fetchTransactions = async () => {
    if (!user) return;

    setIsLoading(true);

    let query = supabase
      .from('transactions')
      .select(`
        *,
        category:categories(id, name, type, icon, color)
      `)
      .order('transaction_date', { ascending: false });

    if (month !== undefined && year !== undefined) {
      const startDate = toLocalDateString(new Date(year, month, 1));
      const endDate = toLocalDateString(new Date(year, month + 1, 0));
      query = query.gte('transaction_date', startDate).lte('transaction_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching transactions:', error);
      toast({
        title: 'שגיאה',
        description: 'לא ניתן לטעון את התנועות',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    // Fetch profiles for each transaction
    const userIds = [...new Set((data || []).map(t => t.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', userIds);

    const transactionsWithProfiles = (data || []).map(t => ({
      ...t,
      profile: profiles?.find(p => p.user_id === t.user_id),
    }));

    setTransactions(transactionsWithProfiles as Transaction[]);
    setIsLoading(false);
  };

  const addTransaction = async (
    type: 'income' | 'expense',
    amount: number,
    categoryId: string | null,
    description: string,
    transactionDate: string
  ) => {
    if (!user) return { error: new Error('לא מחובר') };

    // Get a default category if none is provided
    let finalCategoryId = categoryId;
    if (!categoryId) {
      const defaultCategory = categories.find(c => c.type === type);
      if (defaultCategory) {
        finalCategoryId = defaultCategory.id;
      }
    }

    if (!finalCategoryId) {
      toast({
        title: 'שגיאה',
        description: 'לא נמצאה קטגוריה מתאימה',
        variant: 'destructive',
      });
      return { error: new Error('No category found') };
    }

    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      type,
      amount,
      category_id: finalCategoryId,
      description: description || null,
      transaction_date: transactionDate,
    });

    if (error) {
      toast({
        title: 'שגיאה',
        description: 'לא ניתן להוסיף את התנועה',
        variant: 'destructive',
      });
      return { error };
    }

    toast({
      title: 'התנועה נוספה בהצלחה',
      description: type === 'income' ? 'ההכנסה נרשמה' : 'ההוצאה נרשמה',
    });

    await fetchTransactions();
    return { error: null };
  };

  const deleteTransaction = async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);

    if (error) {
      toast({
        title: 'שגיאה',
        description: 'לא ניתן למחוק את התנועה',
        variant: 'destructive',
      });
      return { error };
    }

    toast({
      title: 'התנועה נמחקה',
    });

    await fetchTransactions();
    return { error: null };
  };

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('transactions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
        },
        () => {
          fetchTransactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, month, year]);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [user, month, year]);

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const balance = totalIncome - totalExpense;

  return {
    transactions,
    categories,
    isLoading,
    totalIncome,
    totalExpense,
    balance,
    addTransaction,
    deleteTransaction,
    refreshTransactions: fetchTransactions,
  };
};

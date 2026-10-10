import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Plus, LogOut, Settings } from 'lucide-react';
import { BalanceCards } from '@/components/budget/BalanceCards';
import { ExpenseChart } from '@/components/budget/ExpenseChart';
import { TransactionList } from '@/components/budget/TransactionList';
import { AddTransactionDialog } from '@/components/budget/AddTransactionDialog';
import { MonthSelector } from '@/components/budget/MonthSelector';
import { useTransactions } from '@/hooks/useTransactions';
import { useNavigate } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { profile, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const {
    transactions,
    categories,
    isLoading,
    addTransaction,
    deleteTransaction,
  } = useTransactions(selectedMonth, selectedYear);

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const balance = totalIncome - totalExpense;

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="gradient-primary text-primary-foreground p-4 pb-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm opacity-80">שלום,</p>
            <h1 className="text-xl font-bold">
              {profile?.first_name} {profile?.last_name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => navigate('/admin')}
              >
                <Settings className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary-foreground/20"
              onClick={handleSignOut}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-4 -mt-4 space-y-6">
        <BalanceCards
          balance={balance}
          totalIncome={totalIncome}
          totalExpense={totalExpense}
        />

        <MonthSelector
          month={selectedMonth}
          year={selectedYear}
          onChange={(m, y) => {
            setSelectedMonth(m);
            setSelectedYear(y);
          }}
        />

        <ExpenseChart transactions={transactions} />

        <TransactionList
          transactions={transactions}
          onDelete={deleteTransaction}
        />
      </main>

      {/* FAB */}
      <Button
        variant="fab"
        size="fab"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        onClick={() => setShowAddDialog(true)}
      >
        <Plus className="h-8 w-8" />
      </Button>

      {/* Add Transaction Dialog */}
      <AddTransactionDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        categories={categories}
        onSubmit={(type, amount, categoryId, description, date) =>
          addTransaction({
            type,
            amount,
            categoryId,
            subcategoryId: null,
            familyMemberId: null,
            paymentMethod: null,
            isRecurring: false,
            description,
            notes: '',
            date,
          })
        }
      />

      {/* Footer with Admin Link */}
      <footer className="fixed bottom-0 left-0 right-0 bg-background border-t py-2 px-4">
        <div className="flex justify-center">
          <button
            onClick={() => navigate('/admin-login')}
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            ניהול
          </button>
        </div>
      </footer>
    </div>
  );
};

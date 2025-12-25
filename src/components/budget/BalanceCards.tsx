import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';

interface BalanceCardsProps {
  balance: number;
  totalIncome: number;
  totalExpense: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const BalanceCards: React.FC<BalanceCardsProps> = ({
  balance,
  totalIncome,
  totalExpense,
}) => {
  return (
    <div className="space-y-4 animate-slide-up">
      {/* Main Balance Card */}
      <Card variant="balance" className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80 mb-1">יתרה נוכחית</p>
              <p className="text-3xl font-bold">{formatCurrency(balance)}</p>
            </div>
            <div className="h-14 w-14 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Wallet className="h-7 w-7" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Income and Expense Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card variant="income" className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-income-foreground/20 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs opacity-80">הכנסות</p>
                <p className="text-lg font-bold truncate">{formatCurrency(totalIncome)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="expense" className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-expense-foreground/20 flex items-center justify-center shrink-0">
                <TrendingDown className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs opacity-80">הוצאות</p>
                <p className="text-lg font-bold truncate">{formatCurrency(totalExpense)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

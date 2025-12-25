import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Category } from '@/hooks/useTransactions';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface AddTransactionDialogProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  onSubmit: (
    type: 'income' | 'expense',
    amount: number,
    categoryId: string,
    description: string,
    date: string
  ) => Promise<{ error: Error | null }>;
}

export const AddTransactionDialog: React.FC<AddTransactionDialogProps> = ({
  open,
  onClose,
  categories,
  onSubmit,
}) => {
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(false);

  const filteredCategories = categories.filter((c) => c.type === type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !categoryId) return;

    setIsLoading(true);
    const result = await onSubmit(type, parseFloat(amount), categoryId, description, date);
    setIsLoading(false);

    if (!result.error) {
      setAmount('');
      setCategoryId('');
      setDescription('');
      setDate(new Date().toISOString().split('T')[0]);
      onClose();
    }
  };

  const handleTypeChange = (newType: 'income' | 'expense') => {
    setType(newType);
    setCategoryId('');
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md mx-4">
        <DialogHeader>
          <DialogTitle className="text-center">הוספת תנועה</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant={type === 'income' ? 'income' : 'outline'}
              className="h-14"
              onClick={() => handleTypeChange('income')}
            >
              <TrendingUp className="h-5 w-5 ml-2" />
              הכנסה
            </Button>
            <Button
              type="button"
              variant={type === 'expense' ? 'expense' : 'outline'}
              className="h-14"
              onClick={() => handleTypeChange('expense')}
            >
              <TrendingDown className="h-5 w-5 ml-2" />
              הוצאה
            </Button>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">סכום</Label>
            <Input
              id="amount"
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-14 text-2xl text-center font-bold"
              min="0"
              step="0.01"
              required
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>קטגוריה</Label>
            <Select value={categoryId} onValueChange={setCategoryId} required>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="בחר קטגוריה" />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="date">תאריך</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-12"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">תיאור (אופציונלי)</Label>
            <Input
              id="description"
              placeholder="הערות..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-12"
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            variant={type === 'income' ? 'income' : 'expense'}
            className="w-full h-14 text-lg"
            disabled={isLoading || !amount || !categoryId}
          >
            {isLoading ? 'מוסיף...' : 'הוסף תנועה'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

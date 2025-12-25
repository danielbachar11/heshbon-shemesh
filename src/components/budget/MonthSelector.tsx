import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface MonthSelectorProps {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
}

export const MonthSelector: React.FC<MonthSelectorProps> = ({
  month,
  year,
  onChange,
}) => {
  const goToPrevious = () => {
    if (month === 0) {
      onChange(11, year - 1);
    } else {
      onChange(month - 1, year);
    }
  };

  const goToNext = () => {
    if (month === 11) {
      onChange(0, year + 1);
    } else {
      onChange(month + 1, year);
    }
  };

  const currentDate = new Date(year, month);
  const isCurrentMonth =
    month === new Date().getMonth() && year === new Date().getFullYear();

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <Button variant="ghost" size="icon" onClick={goToNext}>
        <ChevronRight className="h-5 w-5" />
      </Button>
      <div className="min-w-[140px] text-center">
        <span className="font-medium text-lg">
          {format(currentDate, 'MMMM yyyy', { locale: he })}
        </span>
        {isCurrentMonth && (
          <span className="block text-xs text-muted-foreground">חודש נוכחי</span>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={goToPrevious}>
        <ChevronLeft className="h-5 w-5" />
      </Button>
    </div>
  );
};

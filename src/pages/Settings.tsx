import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight } from 'lucide-react';
import { CreditImport } from '@/components/credit/CreditImport';
import { ReviewList } from '@/components/credit/ReviewList';
import { ImportHistory } from '@/components/credit/ImportHistory';

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('import');
  const [stamp, setStamp] = useState(0);
  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="gradient-primary text-primary-foreground p-4 pb-6 rounded-b-3xl shadow-lg flex items-center gap-2">
        <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/20" onClick={() => navigate('/')}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">הגדרות</h1>
      </header>
      <main className="px-4 -mt-3 max-w-4xl mx-auto">
        <Tabs value={tab} onValueChange={setTab} dir="rtl">
          <TabsList className="w-full grid grid-cols-3 h-12">
            <TabsTrigger value="import">ייבוא חיובי אשראי</TabsTrigger>
            <TabsTrigger value="review">לבדיקה</TabsTrigger>
            <TabsTrigger value="history">היסטוריה</TabsTrigger>
          </TabsList>
          <TabsContent value="import"><CreditImport onImported={() => setStamp((s) => s + 1)} /></TabsContent>
          <TabsContent value="review"><ReviewList key={`r${stamp}`} /></TabsContent>
          <TabsContent value="history"><ImportHistory key={`h${stamp}`} /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Shield, Eye, EyeOff, ArrowRight } from 'lucide-react';

const ADMIN_PASSWORD = 'Efrat40@@';

export const AdminLogin: React.FC = () => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem('adminAuthenticated', 'true');
      toast({
        title: 'התחברת בהצלחה',
        description: 'ברוך הבא לממשק הניהול',
      });
      navigate('/admin');
    } else {
      toast({
        title: 'שגיאה',
        description: 'סיסמה שגויה',
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-secondary/30">
      <Card className="w-full max-w-md animate-scale-in">
        <CardHeader className="text-center space-y-4 pb-8">
          <div className="h-20 w-20 rounded-2xl bg-primary flex items-center justify-center mx-auto shadow-lg">
            <Shield className="h-10 w-10 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">ממשק ניהול</CardTitle>
            <p className="text-muted-foreground mt-2">הזן סיסמת מנהל</p>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">סיסמה</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 pl-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full h-12 text-lg" disabled={isLoading}>
              {isLoading ? 'מתחבר...' : 'כניסה לממשק ניהול'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="text-primary hover:underline text-sm flex items-center justify-center gap-2 mx-auto"
            >
              <ArrowRight className="h-4 w-4" />
              חזרה להתחברות רגילה
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

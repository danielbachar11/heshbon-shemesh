import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowRight,
  Users,
  Link2,
  Trash2,
  Pencil,
  Plus,
  Unlink,
} from 'lucide-react';

interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  id_number: string;
}

interface PartnerConnection {
  id: string;
  user_id_1: string;
  user_id_2: string;
  created_at: string;
  profile1?: Profile;
  profile2?: Profile;
}

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [connections, setConnections] = useState<PartnerConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedUser1, setSelectedUser1] = useState('');
  const [selectedUser2, setSelectedUser2] = useState('');

  // Check admin authentication
  useEffect(() => {
    const isAdmin = sessionStorage.getItem('adminAuthenticated');
    if (!isAdmin) {
      navigate('/admin-login');
    }
  }, [navigate]);

  const fetchData = async () => {
    setIsLoading(true);
    
    // Fetch all profiles
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('first_name');

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
    } else {
      setProfiles(profilesData || []);
    }

    // Fetch partner connections
    const { data: connectionsData, error: connectionsError } = await supabase
      .from('partner_connections')
      .select('*');

    if (connectionsError) {
      console.error('Error fetching connections:', connectionsError);
    } else {
      // Enrich connections with profile data
      const enrichedConnections = (connectionsData || []).map(conn => ({
        ...conn,
        profile1: profilesData?.find(p => p.user_id === conn.user_id_1),
        profile2: profilesData?.find(p => p.user_id === conn.user_id_2),
      }));
      setConnections(enrichedConnections);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEditProfile = async () => {
    if (!editingProfile) return;

    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: editingProfile.first_name,
        last_name: editingProfile.last_name,
      })
      .eq('id', editingProfile.id);

    if (error) {
      toast({
        title: 'שגיאה',
        description: 'לא ניתן לעדכן את הפרופיל',
        variant: 'destructive',
      });
    } else {
      toast({ title: 'הפרופיל עודכן בהצלחה' });
      setShowEditDialog(false);
      setEditingProfile(null);
      fetchData();
    }
  };

  const handleDeleteProfile = async (profile: Profile) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את ${profile.first_name} ${profile.last_name}?`)) {
      return;
    }

    // Delete from auth (this will cascade to profiles due to trigger)
    const { error } = await supabase.auth.admin.deleteUser(profile.user_id);
    
    if (error) {
      // If admin API fails, try deleting profile directly
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profile.id);

      if (profileError) {
        toast({
          title: 'שגיאה',
          description: 'לא ניתן למחוק את המשתמש',
          variant: 'destructive',
        });
        return;
      }
    }

    toast({ title: 'המשתמש נמחק בהצלחה' });
    fetchData();
  };

  const handleLinkAccounts = async () => {
    if (!selectedUser1 || !selectedUser2 || selectedUser1 === selectedUser2) {
      toast({
        title: 'שגיאה',
        description: 'נא לבחור שני משתמשים שונים',
        variant: 'destructive',
      });
      return;
    }

    // Check if connection already exists
    const existingConnection = connections.find(
      c =>
        (c.user_id_1 === selectedUser1 && c.user_id_2 === selectedUser2) ||
        (c.user_id_1 === selectedUser2 && c.user_id_2 === selectedUser1)
    );

    if (existingConnection) {
      toast({
        title: 'שגיאה',
        description: 'החשבונות כבר מחוברים',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase.from('partner_connections').insert({
      user_id_1: selectedUser1,
      user_id_2: selectedUser2,
      created_by: selectedUser1,
    });

    if (error) {
      toast({
        title: 'שגיאה',
        description: 'לא ניתן לחבר את החשבונות',
        variant: 'destructive',
      });
    } else {
      toast({ title: 'החשבונות חוברו בהצלחה' });
      setShowLinkDialog(false);
      setSelectedUser1('');
      setSelectedUser2('');
      fetchData();
    }
  };

  const handleUnlinkAccounts = async (connectionId: string) => {
    if (!confirm('האם אתה בטוח שברצונך לנתק את החשבונות?')) {
      return;
    }

    const { error } = await supabase
      .from('partner_connections')
      .delete()
      .eq('id', connectionId);

    if (error) {
      toast({
        title: 'שגיאה',
        description: 'לא ניתן לנתק את החשבונות',
        variant: 'destructive',
      });
    } else {
      toast({ title: 'החשבונות נותקו בהצלחה' });
      fetchData();
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminAuthenticated');
    navigate('/auth');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">ממשק ניהול</h1>
        <Button variant="outline" onClick={handleLogout}>
          <ArrowRight className="h-4 w-4 ml-2" />
          יציאה
        </Button>
      </header>

      {/* Users Section */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            ניהול משתמשים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">שם פרטי</TableHead>
                <TableHead className="text-right">שם משפחה</TableHead>
                <TableHead className="text-right">ת.ז.</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell>{profile.first_name}</TableCell>
                  <TableCell>{profile.last_name}</TableCell>
                  <TableCell>{profile.id_number}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingProfile(profile);
                          setShowEditDialog(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteProfile(profile)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Partner Connections Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            חיבור חשבונות משפחתיים
          </CardTitle>
          <Button onClick={() => setShowLinkDialog(true)}>
            <Plus className="h-4 w-4 ml-2" />
            חבר חשבונות
          </Button>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              אין חשבונות מחוברים
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">משתמש 1</TableHead>
                  <TableHead className="text-right">משתמש 2</TableHead>
                  <TableHead className="text-right">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((connection) => (
                  <TableRow key={connection.id}>
                    <TableCell>
                      {connection.profile1
                        ? `${connection.profile1.first_name} ${connection.profile1.last_name}`
                        : 'לא נמצא'}
                    </TableCell>
                    <TableCell>
                      {connection.profile2
                        ? `${connection.profile2.first_name} ${connection.profile2.last_name}`
                        : 'לא נמצא'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleUnlinkAccounts(connection.id)}
                      >
                        <Unlink className="h-4 w-4 ml-2" />
                        נתק
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת משתמש</DialogTitle>
          </DialogHeader>
          {editingProfile && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>שם פרטי</Label>
                <Input
                  value={editingProfile.first_name}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      first_name: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>שם משפחה</Label>
                <Input
                  value={editingProfile.last_name}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      last_name: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              ביטול
            </Button>
            <Button onClick={handleEditProfile}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Accounts Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>חיבור חשבונות</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>משתמש 1</Label>
              <Select value={selectedUser1} onValueChange={setSelectedUser1}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר משתמש" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.user_id} value={profile.user_id}>
                      {profile.first_name} {profile.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>משתמש 2</Label>
              <Select value={selectedUser2} onValueChange={setSelectedUser2}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר משתמש" />
                </SelectTrigger>
                <SelectContent>
                  {profiles
                    .filter((p) => p.user_id !== selectedUser1)
                    .map((profile) => (
                      <SelectItem key={profile.user_id} value={profile.user_id}>
                        {profile.first_name} {profile.last_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
              ביטול
            </Button>
            <Button onClick={handleLinkAccounts}>חבר חשבונות</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface FamilyMember {
  id: string;
  household_id: string;
  name: string;
  avatar: string | null;
  color: string | null;
  is_active: boolean;
  is_default: boolean;
  user_id: string | null;
}

export const useFamilyMembers = () => {
  const { user, householdId } = useAuth();
  const [members, setMembers] = useState<FamilyMember[]>([]);

  const refresh = useCallback(async () => {
    if (!user || !householdId) return;
    const { data } = await supabase
      .from('family_members')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at');
    setMembers((data as FamilyMember[]) || []);
  }, [user, householdId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = async (m: Partial<FamilyMember> & { name: string }) => {
    if (!householdId) return { error: new Error('אין משק בית') };
    if (m.is_default) {
      await supabase.from('family_members').update({ is_default: false }).eq('household_id', householdId);
    }
    const payload = {
      name: m.name,
      avatar: m.avatar ?? '🙂',
      color: m.color ?? '#0ea5e9',
      is_active: m.is_active ?? true,
      is_default: m.is_default ?? false,
    };
    const { error } = m.id
      ? await supabase.from('family_members').update(payload).eq('id', m.id)
      : await supabase.from('family_members').insert({ ...payload, household_id: householdId });
    await refresh();
    return { error };
  };

  const defaultMember =
    members.find((m) => m.is_default && m.is_active) ||
    members.find((m) => m.user_id === user?.id && m.is_active) ||
    null;

  return { members, activeMembers: members.filter((m) => m.is_active), defaultMember, save, refresh };
};

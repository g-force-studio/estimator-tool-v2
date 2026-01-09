import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: members, error } = await supabase
      .from('workspace_members')
      .select('user_id, role, created_at, profiles!workspace_members_user_id_profiles_fkey(email)')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const formattedMembers = members.map((member: { user_id: string; role: string; created_at: string; profiles?: { email?: string | null } | null }) => ({
      user_id: member.user_id,
      role: member.role,
      created_at: member.created_at,
      user_email: member.profiles?.email || null,
    }));

    return NextResponse.json(formattedMembers);
  } catch (error) {
    console.error('Error fetching workspace members:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
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
      .select(`
        user_id,
        role,
        joined_at,
        users:user_id (email)
      `)
      .order('joined_at', { ascending: true });

    if (error) throw error;

    const formattedMembers = members.map((member: any) => ({
      user_id: member.user_id,
      role: member.role,
      joined_at: member.joined_at,
      user_email: member.users?.email || 'Unknown',
    }));

    return NextResponse.json(formattedMembers);
  } catch (error) {
    console.error('Error fetching workspace members:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

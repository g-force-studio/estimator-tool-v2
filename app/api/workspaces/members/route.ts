import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

    const formattedMembers = (Array.isArray(members) ? members : []).map((member) => {
      const profile = isObject(member.profiles) ? member.profiles : null;
      return {
        user_id: String(member.user_id),
        role: String(member.role),
        created_at: String(member.created_at),
        user_email: typeof profile?.email === 'string' ? profile.email : null,
      };
    });

    return NextResponse.json(formattedMembers);
  } catch (error) {
    console.error('Error fetching workspace members:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

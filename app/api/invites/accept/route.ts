import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { INVITE_TOKEN_PEPPER } from '@/lib/config';

function hashToken(token: string): string {
  return createHash('sha256')
    .update(token + INVITE_TOKEN_PEPPER)
    .digest('hex');
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    const tokenHash = hashToken(token);

    const { data, error: inviteError } = await supabase
      .from('workspace_invites')
      .select('*, workspaces(name)')
      .eq('token_hash', tokenHash)
      .single();

    const invite = data as (null | {
      id: string;
      workspace_id: string;
      role: 'admin' | 'member';
      accepted_at: string | null;
      expires_at: string;
      workspaces?: { name: string } | null;
    });

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 });
    }

    if (invite.accepted_at) {
      return NextResponse.json({ error: 'Invite already accepted' }, { status: 400 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite expired' }, { status: 400 });
    }

    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      return NextResponse.json(
        { error: 'You already belong to a workspace. Each user can only be in one workspace.' },
        { status: 400 }
      );
    }

    const { error: memberError } = await supabase.from('workspace_members').insert({
      workspace_id: invite.workspace_id,
      user_id: user.id,
      role: invite.role,
    });

    if (memberError) {
      if (memberError.code === '23505') {
        return NextResponse.json(
          { error: 'You already belong to a workspace' },
          { status: 400 }
        );
      }
      throw memberError;
    }

    const { error: updateError } = await supabase
      .from('workspace_invites')
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: user.id,
      })
      .eq('id', invite.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      workspace: invite.workspaces,
      role: invite.role,
    });
  } catch (error: any) {
    console.error('Invite acceptance error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to accept invite' },
      { status: 500 }
    );
  }
}

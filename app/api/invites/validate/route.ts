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
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    const supabase = await createClient();
    const tokenHash = hashToken(token);

    const { data: invite, error } = await supabase
      .from('workspace_invites')
      .select('*, workspaces(name)')
      .eq('token_hash', tokenHash)
      .single();

    if (error || !invite) {
      return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 });
    }

    if (invite.accepted_at) {
      return NextResponse.json({ error: 'This invite has already been accepted' }, { status: 400 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite has expired' }, { status: 400 });
    }

    return NextResponse.json({ invite });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to validate invite';
    console.error('Invite validation error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

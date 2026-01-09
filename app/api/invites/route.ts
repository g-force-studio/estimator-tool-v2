import { createClient } from '@/lib/supabase/server';
import { inviteSchema } from '@/lib/validations';
import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import { APP_BASE_URL, INVITE_TOKEN_PEPPER } from '@/lib/config';

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

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .single();

    if (!member || !['admin', 'owner'].includes(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validated = inviteSchema.parse(body);

    const token = nanoid(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data: invite, error } = await supabase
      .from('workspace_invites')
      .insert({
        workspace_id: member.workspace_id,
        email: validated.email,
        role: validated.role,
        token_hash: tokenHash,
        invited_by_user_id: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    const inviteLink = `${APP_BASE_URL}/invite/${token}`;

    console.log('='.repeat(80));
    console.log('INVITE CREATED');
    console.log('='.repeat(80));
    console.log(`Email: ${validated.email}`);
    console.log(`Role: ${validated.role}`);
    console.log(`Invite Link: ${inviteLink}`);
    console.log(`Expires: ${expiresAt.toISOString()}`);
    console.log('='.repeat(80));

    return NextResponse.json({
      invite,
      inviteLink,
      message: 'Invite created. Copy the link above to share with the invitee.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create invite';
    console.error('Invite creation error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .single();

    if (!member || !['admin', 'owner'].includes(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: invites, error } = await supabase
      .from('workspace_invites')
      .select('*')
      .eq('workspace_id', member.workspace_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ invites });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch invites';
    console.error('Invites fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

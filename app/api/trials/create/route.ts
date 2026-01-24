import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { APP_BASE_URL, TRIAL_LINK_TTL_DAYS, TRIAL_TOKEN_PEPPER } from '@/lib/config';

function hashToken(token: string): string {
  return createHash('sha256')
    .update(token + TRIAL_TOKEN_PEPPER)
    .digest('hex');
}

export async function POST() {
  try {
    if (!TRIAL_TOKEN_PEPPER) {
      return NextResponse.json({ error: 'Missing TRIAL_TOKEN_PEPPER' }, { status: 500 });
    }

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

    const serviceClient = createServiceClient();
    const { data: workspace, error: workspaceError } = await serviceClient
      .from('workspaces')
      .select('id, subscription_status, trial_ends_at')
      .eq('id', member.workspace_id)
      .single();

    if (workspaceError || !workspace) {
      throw workspaceError ?? new Error('Workspace not found');
    }

    const now = new Date();
    const trialEndsAt = workspace.trial_ends_at ? new Date(workspace.trial_ends_at) : null;

    if (workspace.subscription_status === 'active') {
      return NextResponse.json({ error: 'Workspace already active.' }, { status: 409 });
    }

    if (trialEndsAt && trialEndsAt > now) {
      return NextResponse.json({ error: 'Trial already active.' }, { status: 409 });
    }

    await serviceClient
      .from('trial_links')
      .update({ status: 'expired' })
      .eq('workspace_id', member.workspace_id)
      .eq('status', 'active')
      .lte('expires_at', now.toISOString());

    const { data: activeLink } = await serviceClient
      .from('trial_links')
      .select('id, expires_at')
      .eq('workspace_id', member.workspace_id)
      .eq('status', 'active')
      .gt('expires_at', now.toISOString())
      .maybeSingle();

    if (activeLink) {
      return NextResponse.json(
        { error: 'An active trial link already exists.' },
        { status: 409 }
      );
    }

    const token = nanoid(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + TRIAL_LINK_TTL_DAYS);

    const { data: trialLink, error: linkError } = await serviceClient
      .from('trial_links')
      .insert({
        workspace_id: member.workspace_id,
        token_hash: tokenHash,
        created_by_user_id: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (linkError) {
      throw linkError;
    }

    return NextResponse.json({
      trial_link: trialLink,
      link: `${APP_BASE_URL}/trial/${token}`,
      token,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create trial link';
    console.error('Trial link creation error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

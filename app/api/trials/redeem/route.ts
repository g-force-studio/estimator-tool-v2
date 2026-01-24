import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { TRIAL_TOKEN_PEPPER } from '@/lib/config';

const TRIAL_LENGTH_DAYS = 30;

function hashToken(token: string): string {
  return createHash('sha256')
    .update(token + TRIAL_TOKEN_PEPPER)
    .digest('hex');
}

export async function POST(request: Request) {
  try {
    if (!TRIAL_TOKEN_PEPPER) {
      return NextResponse.json({ error: 'Missing TRIAL_TOKEN_PEPPER' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token.trim() : '';

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    const tokenHash = hashToken(token);
    const serviceClient = createServiceClient();
    const { data: trialLink, error: linkError } = await serviceClient
      .from('trial_links')
      .select('*')
      .eq('token_hash', tokenHash)
      .single();

    if (linkError || !trialLink) {
      return NextResponse.json({ error: 'Invalid or expired trial link.' }, { status: 404 });
    }

    const now = new Date();
    const expiresAt = new Date(trialLink.expires_at);

    if (trialLink.status !== 'active') {
      return NextResponse.json({ error: 'Trial link is no longer active.' }, { status: 409 });
    }

    if (expiresAt <= now) {
      await serviceClient
        .from('trial_links')
        .update({ status: 'expired' })
        .eq('id', trialLink.id);
      return NextResponse.json({ error: 'Trial link has expired.' }, { status: 410 });
    }

    const { data: workspace, error: workspaceError } = await serviceClient
      .from('workspaces')
      .select('subscription_status, trial_ends_at')
      .eq('id', trialLink.workspace_id)
      .single();

    if (workspaceError || !workspace) {
      throw workspaceError ?? new Error('Workspace not found');
    }

    const currentTrialEndsAt = workspace.trial_ends_at ? new Date(workspace.trial_ends_at) : null;

    if (workspace.subscription_status === 'active') {
      return NextResponse.json({ error: 'Workspace already active.' }, { status: 409 });
    }

    if (currentTrialEndsAt && currentTrialEndsAt > now) {
      return NextResponse.json({ error: 'Trial already active.' }, { status: 409 });
    }

    const newTrialEndsAt = new Date(now);
    newTrialEndsAt.setDate(newTrialEndsAt.getDate() + TRIAL_LENGTH_DAYS);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: workspaceUpdateError } = await serviceClient
      .from('workspaces')
      .update({
        subscription_status: 'trialing',
        trial_ends_at: newTrialEndsAt.toISOString(),
      })
      .eq('id', trialLink.workspace_id);

    if (workspaceUpdateError) {
      throw workspaceUpdateError;
    }

    const { error: linkUpdateError } = await serviceClient
      .from('trial_links')
      .update({
        status: 'redeemed',
        redeemed_at: now.toISOString(),
        redeemed_by_user_id: user?.id ?? null,
      })
      .eq('id', trialLink.id);

    if (linkUpdateError) {
      throw linkUpdateError;
    }

    return NextResponse.json({
      workspace_id: trialLink.workspace_id,
      subscription_status: 'trialing',
      trial_ends_at: newTrialEndsAt.toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to redeem trial link';
    console.error('Trial redemption error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

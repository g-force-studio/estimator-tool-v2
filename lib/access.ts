import { createServiceClient } from '@/lib/supabase/service';

export async function hasAccess(workspaceId: string) {
  const serviceClient = createServiceClient();
  const { data: workspace, error } = await serviceClient
    .from('workspaces')
    .select('subscription_status, trial_ends_at')
    .eq('id', workspaceId)
    .single();

  if (error || !workspace) {
    return false;
  }

  if (workspace.subscription_status === 'active') {
    return true;
  }

  if (workspace.trial_ends_at) {
    return new Date(workspace.trial_ends_at) > new Date();
  }

  return false;
}

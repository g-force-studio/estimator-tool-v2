const { createClient } = require('@supabase/supabase-js');

async function main() {
  const workspaceId = process.env.WORKSPACE_ID;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!workspaceId) {
    throw new Error('Missing WORKSPACE_ID');
  }
  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const serviceClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (process.env.RUN_BACKFILL === '1') {
    const { error } = await serviceClient.rpc('backfill_workspace_ai_reference_configs');
    if (error) {
      throw new Error(`Backfill failed: ${error.message}`);
    }
  }

  const { data: workspace, error: workspaceError } = await serviceClient
    .from('workspaces')
    .select('id, trade, default_ai_reference_config_id')
    .eq('id', workspaceId)
    .single();

  if (workspaceError || !workspace) {
    throw new Error(`Workspace lookup failed: ${workspaceError?.message || 'not found'}`);
  }

  const { data: defaultConfig } = await serviceClient
    .from('ai_reference_configs')
    .select('id, trade, name, is_default, created_at')
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .maybeSingle();

  console.log('Workspace:', workspace);
  console.log('Default AI config:', defaultConfig || 'none');

  const jobId = process.env.JOB_ID;
  if (jobId) {
    const { data: aiOutput } = await serviceClient
      .from('ai_outputs')
      .select('ai_json, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const metadata = aiOutput?.ai_json?.metadata ?? null;
    console.log('Latest AI output metadata:', metadata || 'none');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

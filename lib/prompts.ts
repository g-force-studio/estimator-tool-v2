import { createServiceClient } from '@/lib/supabase/service';

type Trade = 'plumbing' | 'electrical' | 'hvac' | 'general_contractor';

type WorkspacePromptResult = {
  id: string | null;
  systemPrompt: string | null;
  trade: Trade;
  source:
    | 'customer_override'
    | 'workspace_default_id'
    | 'workspace_default_flag'
    | 'template'
    | 'fallback';
};

export async function getWorkspacePrompt(
  workspaceId: string,
  trade: Trade,
  customerId?: string | null
): Promise<WorkspacePromptResult> {
  const serviceClient = createServiceClient();

  const { data: workspace, error: workspaceError } = await serviceClient
    .from('workspaces')
    .select('default_ai_reference_config_id, trade')
    .eq('id', workspaceId)
    .maybeSingle();

  if (workspaceError) {
    throw workspaceError;
  }

  if (customerId) {
    const { data: customerConfig, error: customerError } = await serviceClient
      .from('ai_reference_configs')
      .select('id, system_prompt, trade')
      .eq('workspace_id', workspaceId)
      .eq('customer_id', customerId)
      .maybeSingle();

    if (customerError) {
      throw customerError;
    }

    if (customerConfig?.system_prompt) {
      return {
        id: customerConfig.id,
        systemPrompt: customerConfig.system_prompt,
        trade: customerConfig.trade ?? workspace?.trade ?? trade,
        source: 'customer_override' as const,
      };
    }
  }

  if (workspace?.default_ai_reference_config_id) {
    const { data: config, error: configError } = await serviceClient
      .from('ai_reference_configs')
      .select('id, system_prompt, trade')
      .eq('id', workspace.default_ai_reference_config_id)
      .maybeSingle();

    if (configError) {
      throw configError;
    }

    if (config?.system_prompt) {
      return {
        id: config.id,
        systemPrompt: config.system_prompt,
        trade: config.trade ?? workspace?.trade ?? trade,
        source: 'workspace_default_id' as const,
      };
    }
  }

  const { data: defaultConfig, error: defaultError } = await serviceClient
    .from('ai_reference_configs')
    .select('id, system_prompt, trade')
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .maybeSingle();

  if (defaultError) {
    throw defaultError;
  }

  if (defaultConfig?.system_prompt) {
    return {
      id: defaultConfig.id,
      systemPrompt: defaultConfig.system_prompt,
      trade: defaultConfig.trade ?? workspace?.trade ?? trade,
      source: 'workspace_default_flag' as const,
    };
  }

  const fallbackTrade = workspace?.trade ?? trade;
  const { data: template, error: templateError } = await serviceClient
    .from('prompt_templates')
    .select('id, system_prompt')
    .eq('trade', fallbackTrade)
    .eq('active', true)
    .order('version', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (templateError) {
    throw templateError;
  }

  if (template?.system_prompt) {
    return {
      id: template.id,
      systemPrompt: template.system_prompt,
      trade: fallbackTrade,
      source: 'template' as const,
    };
  }

  return {
    id: null,
    systemPrompt: null,
    trade: fallbackTrade,
    source: 'fallback' as const,
  };
}

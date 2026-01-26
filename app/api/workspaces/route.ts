import { createClient } from '@/lib/supabase/server';
import { workspaceCreateSchema, workspaceSchema } from '@/lib/validations';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      return NextResponse.json(
        { error: 'User already belongs to a workspace' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validated = workspaceCreateSchema.parse(body);

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({ name: validated.name, trade: validated.trade })
      .select()
      .single();

    if (workspaceError) throw workspaceError;

    const { error: memberError } = await supabase.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner',
    });

    if (memberError) throw memberError;

    const { error: brandError } = await supabase.from('workspace_brand').insert({
      workspace_id: workspace.id,
      brand_name: validated.name,
    });

    if (brandError) throw brandError;

    const { error: settingsError } = await supabase.from('workspace_settings').insert({
      workspace_id: workspace.id,
    });

    if (settingsError) throw settingsError;

    const serviceClient = createServiceClient();
    const { data: template, error: templateError } = await serviceClient
      .from('prompt_templates')
      .select('id, trade, name, system_prompt')
      .eq('trade', validated.trade)
      .eq('active', true)
      .order('version', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (templateError) throw templateError;

    if (template) {
      const { data: config, error: configError } = await serviceClient
        .from('ai_reference_configs')
        .insert({
          workspace_id: workspace.id,
          trade: template.trade,
          name: template.name,
          system_prompt: template.system_prompt,
          is_default: true,
        })
        .select('id')
        .single();

      if (configError) throw configError;

      const { error: updateError } = await serviceClient
        .from('workspaces')
        .update({ default_ai_reference_config_id: config.id })
        .eq('id', workspace.id);

      if (updateError) throw updateError;
    }

    return NextResponse.json(workspace);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create workspace';
    console.error('Workspace creation error:', error);
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
      .select('workspace_id, role, workspaces(*)')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ workspace: null });
    }

    return NextResponse.json(member.workspaces);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch workspace';
    console.error('Workspace fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
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

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validated = workspaceSchema.parse(body);

    const { data: workspace, error } = await supabase
      .from('workspaces')
      .update({ name: validated.name })
      .eq('id', member.workspace_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(workspace);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update workspace';
    console.error('Workspace update error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}



import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { workspaceSettingsSchema } from '@/lib/validations';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: settings, error } = await supabase
      .from('workspace_settings')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!settings) {
      return NextResponse.json({});
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching workspace settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createServerClient();
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
    const validated = workspaceSettingsSchema.parse(body);

    const serviceClient = createServiceClient();
    const { data: settings, error } = await serviceClient
      .from('workspace_settings')
      .upsert({
        workspace_id: member.workspace_id,
        tax_rate_percent: validated.tax_rate_percent ?? 0,
        markup_percent: validated.markup_percent ?? 0,
        hourly_rate: validated.hourly_rate ?? 0,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error updating workspace settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

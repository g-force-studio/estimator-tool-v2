import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/config';

export async function GET(_request: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: brand, error } = await supabase
      .from('workspace_brand')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!brand) {
      return NextResponse.json({});
    }

    let logo_url: string | null = null;
    if (brand.logo_bucket && brand.logo_path) {
      const { data, error: signedError } = await supabase.storage
        .from(brand.logo_bucket)
        .createSignedUrl(brand.logo_path, SIGNED_URL_TTL_SECONDS);

      if (signedError) {
        console.error('Error signing workspace logo:', signedError);
      } else {
        logo_url = data.signedUrl;
      }
    }

    return NextResponse.json({ ...brand, logo_url });
  } catch (error) {
    console.error('Error fetching workspace brand:', error);
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
    const { brand_name, logo_bucket, logo_path, labor_rate } = body;

    let resolvedBrandName = brand_name;
    if (!resolvedBrandName) {
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('name')
        .eq('id', member.workspace_id)
        .single();
      resolvedBrandName = workspace?.name;
    }

    if (!resolvedBrandName) {
      return NextResponse.json({ error: 'Brand name required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const { data: brand, error } = await serviceClient
      .from('workspace_brand')
      .upsert({
        workspace_id: member.workspace_id,
        brand_name: resolvedBrandName,
        logo_bucket,
        logo_path,
        labor_rate,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(brand);
  } catch (error) {
    console.error('Error updating workspace brand:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

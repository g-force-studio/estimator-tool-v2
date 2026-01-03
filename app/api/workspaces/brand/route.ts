import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
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

    return NextResponse.json(brand || {});
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

    const body = await request.json();
    const { logo_url, primary_color, secondary_color } = body;

    const { data: brand, error } = await supabase
      .from('workspace_brand')
      .upsert({
        logo_url,
        primary_color,
        secondary_color,
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

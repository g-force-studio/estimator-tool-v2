import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from('estimate_actuals')
      .select('id, job_type, estimated_materials, actual_materials, estimated_labor_hours, actual_labor_hours, exclude_from_history')
      .eq('job_id', params.id)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ actuals: data ?? null });
  } catch (error) {
    console.error('Error fetching actuals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { actual_materials, actual_labor_hours, exclude_from_history } = body as {
      actual_materials?: Array<{ item: string; qty: number }>;
      actual_labor_hours?: number | null;
      exclude_from_history?: boolean;
    };

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from('estimate_actuals')
      .update({
        ...(actual_materials !== undefined && { actual_materials }),
        ...(actual_labor_hours !== undefined && { actual_labor_hours }),
        ...(exclude_from_history !== undefined && { exclude_from_history }),
      })
      .eq('job_id', params.id)
      .select('id, job_type, estimated_materials, actual_materials, estimated_labor_hours, actual_labor_hours, exclude_from_history')
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'No actuals record found for this job' }, { status: 404 });
    return NextResponse.json({ actuals: data });
  } catch (error) {
    console.error('Error updating actuals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { createClient } from '@/lib/supabase/server';
import { jobSchema, lineItemSchema } from '@/lib/validations';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ jobs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch jobs';
    console.error('Jobs fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    const body = await request.json();
    const { line_items, ...jobPayload } = body;
    const validated = jobSchema.parse(jobPayload);
    const lineItems = line_items ? z.array(lineItemSchema).parse(line_items) : [];

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        ...validated,
        workspace_id: member.workspace_id,
        created_by_user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    let jobItems: Array<Record<string, unknown>> = [];
    if (lineItems.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from('job_items')
        .insert(
          lineItems.map((item, index) => ({
            job_id: job.id,
            type: 'line_item',
            title: item.name,
            content_json: {
              description: item.description || '',
              unit: item.unit,
              unit_price: item.unit_price,
              quantity: item.quantity,
            },
            order_index: index,
          }))
        )
        .select();

      if (itemsError) throw itemsError;
      jobItems = items ?? [];
    }

    return NextResponse.json({ ...job, job_items: jobItems });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create job';
    console.error('Job creation error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

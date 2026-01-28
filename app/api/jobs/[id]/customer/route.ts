import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const customerAssignSchema = z.object({
  customer_id: z.string().uuid().nullable(),
});

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member, error: memberError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    const body = await request.json();
    const validated = customerAssignSchema.parse(body);

    if (validated.customer_id) {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('id', validated.customer_id)
        .eq('workspace_id', member.workspace_id)
        .maybeSingle();

      if (customerError) throw customerError;
      if (!customer) {
        return NextResponse.json({ error: 'Customer not found in workspace' }, { status: 400 });
      }
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .update({ customer_id: validated.customer_id })
      .eq('id', params.id)
      .eq('workspace_id', member.workspace_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(job);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to assign customer';
    console.error('Job customer update error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

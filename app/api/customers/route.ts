import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const customerCreateSchema = z.object({
  name: z.string().min(1, 'Customer name is required').max(200),
});

export async function GET(_request: NextRequest) {
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

    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      .eq('workspace_id', member.workspace_id)
      .order('name', { ascending: true });

    if (error) throw error;

    return NextResponse.json(customers ?? []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch customers';
    console.error('Customers fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
    const validated = customerCreateSchema.parse(body);

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        workspace_id: member.workspace_id,
        name: validated.name,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(customer, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create customer';
    console.error('Customer create error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

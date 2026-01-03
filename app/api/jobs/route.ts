import { createClient } from '@/lib/supabase/server';
import { jobSchema } from '@/lib/validations';
import { NextResponse } from 'next/server';

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
  } catch (error: any) {
    console.error('Jobs fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch jobs' },
      { status: 500 }
    );
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
    const validated = jobSchema.parse(body);

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

    return NextResponse.json(job);
  } catch (error: any) {
    console.error('Job creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create job' },
      { status: 500 }
    );
  }
}

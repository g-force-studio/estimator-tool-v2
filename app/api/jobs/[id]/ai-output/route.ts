import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('ai_outputs')
    .select('id, created_at, ai_json, job_id')
    .eq('job_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ai_output = data?.[0] ?? null;
  return NextResponse.json({ exists: Boolean(ai_output), ai_output });
}

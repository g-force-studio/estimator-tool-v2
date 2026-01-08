import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabase.ts';

type CreateJobPayload = {
  title: string;
  client_name?: string;
  due_date?: string | null;
  description_md?: string;
  raw_input_json?: Record<string, unknown>;
};

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = userData.user;
  const payload = (await req.json()) as CreateJobPayload;

  if (!payload?.title) {
    return new Response(JSON.stringify({ error: 'Title required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single();

  if (memberError || !member) {
    return new Response(JSON.stringify({ error: 'No workspace found' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .insert({
      workspace_id: member.workspace_id,
      created_by_user_id: user.id,
      title: payload.title,
      client_name: payload.client_name ?? null,
      due_date: payload.due_date || null,
      description_md: payload.description_md ?? null,
      status: 'draft',
    })
    .select()
    .single();

  if (jobError) {
    return new Response(JSON.stringify({ error: jobError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (payload.raw_input_json) {
    const { error: inputError } = await supabaseAdmin.from('job_inputs').insert({
      job_id: job.id,
      raw_input_json: payload.raw_input_json,
    });

    if (inputError) {
      await supabaseAdmin
        .from('jobs')
        .update({ status: 'ai_error', error_message: inputError.message })
        .eq('id', job.id);
    }
  }

  return new Response(JSON.stringify({ job }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
});

import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabase.ts';

type RunAiPayload = {
  job_id: string;
  ai_json?: Record<string, unknown>;
};

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const payload = (await req.json()) as RunAiPayload;
  if (!payload?.job_id) {
    return new Response(JSON.stringify({ error: 'job_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const jobId = payload.job_id;

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    return new Response(JSON.stringify({ error: 'Job not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await supabaseAdmin.from('jobs').update({ status: 'ai_pending', error_message: null }).eq('id', jobId);

  let aiJson: Record<string, unknown> | null = payload.ai_json ?? null;

  if (!aiJson) {
    const { data: input, error: inputError } = await supabaseAdmin
      .from('job_inputs')
      .select('raw_input_json')
      .eq('job_id', jobId)
      .single();

    if (inputError || !input) {
      await supabaseAdmin
        .from('jobs')
        .update({ status: 'ai_error', error_message: inputError?.message || 'Missing job inputs' })
        .eq('id', jobId);
      return new Response(JSON.stringify({ error: 'Missing job inputs' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    aiJson = {
      summary: 'AI output placeholder',
      inputs: input.raw_input_json,
    };
  }

  const { error: outputError } = await supabaseAdmin.from('ai_outputs').insert({
    job_id: jobId,
    ai_json: aiJson,
  });

  if (outputError) {
    await supabaseAdmin
      .from('jobs')
      .update({ status: 'ai_error', error_message: outputError.message })
      .eq('id', jobId);
    return new Response(JSON.stringify({ error: outputError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await supabaseAdmin.from('jobs').update({ status: 'ai_ready' }).eq('id', jobId);

  return new Response(JSON.stringify({ job_id: jobId, ai_json: aiJson }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import {
  supabaseAdmin,
  createSupabaseClient,
  ESTIMATES_BUCKET,
} from '../_shared/supabase.ts';

const SIGNED_URL_TTL_SECONDS = 3600;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  console.log('Auth header present:', !!authHeader);

  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Creating supabase client with user token');

  // Use createSupabaseClient to validate the user's JWT
  const supabase = createSupabaseClient(authHeader);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  console.log('Auth result:', { userId: user?.id, error: authError?.message });

  if (authError || !user) {
    return new Response(JSON.stringify({
      error: 'Invalid JWT',
      message: authError?.message
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const jobId = url.searchParams.get('job_id');

  if (!jobId) {
    return new Response(JSON.stringify({ error: 'job_id required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Fetching job:', jobId, 'for user:', user.id);

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('workspace_id')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    console.error('Job fetch error:', jobError?.message);
    return new Response(JSON.stringify({
      error: 'Job not found'
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Checking membership for workspace:', job.workspace_id);

  const { data: membership } = await supabaseAdmin
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', job.workspace_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    console.error('Access denied - no membership found');
    return new Response(JSON.stringify({
      error: 'Access denied'
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Fetching PDF file for job:', jobId);

  const { data: file, error: fileError } = await supabaseAdmin
    .from('job_files')
    .select('storage_path')
    .eq('job_id', jobId)
    .eq('kind', 'pdf')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fileError || !file) {
    console.error('File fetch error:', fileError?.message);
    return new Response(JSON.stringify({
      error: 'PDF not found'
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Creating signed URL for:', file.storage_path);

  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(ESTIMATES_BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signedData?.signedUrl) {
    console.error('Signed URL error:', signedError);
    return new Response(JSON.stringify({
      error: 'Failed to generate PDF link'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Success - returning signed URL');
  return new Response(JSON.stringify({ pdf_url: signedData.signedUrl }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

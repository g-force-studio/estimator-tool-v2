import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import {
  supabaseAdmin,
  createSupabaseClient,
  ESTIMATES_BUCKET,
  ESTIMATES_BUCKET_PUBLIC,
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

  const supabase = createSupabaseClient(authHeader);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  console.log('Auth check - user:', user?.id, 'error:', authError?.message);

  if (authError || !user) {
    return new Response(JSON.stringify({
      error: 'Invalid or expired token',
      details: authError?.message
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

  console.log('Checking job access for user:', user.id, 'job:', jobId);

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('workspace_id')
    .eq('id', jobId)
    .single();

  console.log('Job query result:', { job, error: jobError?.message });

  if (jobError || !job) {
    return new Response(JSON.stringify({
      error: 'Job not found or access denied',
      details: jobError?.message
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Fetching PDF file for job:', jobId);

  const { data: file, error: fileError } = await supabaseAdmin
    .from('job_files')
    .select('*')
    .eq('job_id', jobId)
    .eq('kind', 'pdf')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log('File query result:', { file: file?.storage_path, error: fileError?.message });

  if (fileError || !file) {
    return new Response(JSON.stringify({
      error: 'PDF not found',
      details: fileError?.message,
      job_id: jobId
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (ESTIMATES_BUCKET_PUBLIC) {
    const publicUrl = file.public_url ??
      supabaseAdmin.storage.from(ESTIMATES_BUCKET).getPublicUrl(file.storage_path).data.publicUrl;
    console.log('Returning public URL:', publicUrl);
    return new Response(JSON.stringify({ pdf_url: publicUrl, public: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Creating signed URL for path:', file.storage_path);

  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(ESTIMATES_BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signedData?.signedUrl) {
    console.error('Signed URL error:', signedError);
    return new Response(JSON.stringify({ error: signedError?.message || 'Failed to sign url' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Returning signed URL');
  return new Response(JSON.stringify({ pdf_url: signedData.signedUrl, public: false }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

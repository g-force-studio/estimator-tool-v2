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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const supabaseUser = createSupabaseClient(authHeader);
    const { data: userData, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid JWT' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const jobId = body.job_id;

    if (!jobId) {
      return new Response(JSON.stringify({ error: 'job_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .select('workspace_id')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', job.workspace_id)
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    return new Response(JSON.stringify({ pdf_url: signedData.signedUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('pdf-link error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

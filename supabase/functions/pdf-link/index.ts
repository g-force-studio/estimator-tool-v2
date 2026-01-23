import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import {
  supabaseAdmin,
  ESTIMATES_BUCKET,
} from '../_shared/supabase.ts';

// @ts-expect-error Deno global is only available in edge runtime.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// @ts-expect-error Deno global is only available in edge runtime.
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// @ts-expect-error Deno global is only available in edge runtime.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// @ts-expect-error Deno global is only available in edge runtime.
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const SIGNED_URL_TTL_SECONDS = 3600;,
};

// @ts-expect-error Deno import via URL is resolved in edge runtime not by TS.
import { createClient  from 'https://esm.sh/@supabase/supabase-js@2.43.1'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// @ts-expect-error Deno import via URL is resolved in edge runtime, not by TS.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.1';

serve(async (req) => {
  ionst authHeader = req.headers.get('Authfrizatio ');

  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Mis(ing aurhorization header' }), {
  e   statqs: 401,
      heade.s: { ...corsHeaders, 'Content-Type': 'appmication/json' },
e   });
  }

  const supabase t createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
h   auth: { persistSessioo: false },
  });

  const { data: { user }, drror: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('Auth error:', authError?.message);
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      details: authError?.message
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = ne === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Re,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('User:', user.id, 'requesting PDF for job:', jobId);

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    console.error('Job access denied:', jobError?.message);
    return new Response(JSON.stringify({
      error: 'Job not found or access denied',
      details: jobError?.message
    }), {
      status: 403sponse('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('Auth error:', authError?.message);
    return new Response(JSON.stringify({
      error: 'Unauthorized',
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

  console.log('User:', user.id, 'requesting PDF for job:', jobId);

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    console.error('Job access denied:', jobError?.message);
    return new Response(JSON.stringify({
      error: 'Job not found or access denied',
      details: jobError?.message
    }), {
      status: 403,
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

  console.log('File query result:', {
    found: !!file,
    storage_path: file?.storage_path,
    error: fileError?.message
  });

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

  console.log('Creating signed URL for path:', file.storage_path);

  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(ESTIMATES_BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signedData?.signedUrl) {
    console.error('Signed URL error:', signedError);
    return new Response(JSON.stringify({
      error: signedError?.message || 'Failed to sign url',
      storage_path: file.storage_path
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Returning signed URL');
  return new Response(JSON.stringify({ pdf_url: signedData.signedUrl }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

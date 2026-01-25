import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import {
  supabaseAdmin,
  ESTIMATES_BUCKET,
} from '../_shared/supabase.ts';

const SIGNED_URL_TTL_SECONDS = 3600;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  console.log('=== PDF-LINK FUNCTION INVOKED ===');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const jobId = body.job_id;

    console.log('Job ID:', jobId);

    if (!jobId) {
      return new Response(JSON.stringify({ error: 'job_id required' }), {
        status: 400,
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
  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

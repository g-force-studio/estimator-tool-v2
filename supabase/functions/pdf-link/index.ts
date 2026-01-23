import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import {
  supabaseAdmin,
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

  const url = new URL(req.url);
  const jobId = url.searchParams.get('job_id');

  if (!jobId) {
    return new Response(JSON.stringify({ error: 'job_id required' }), {
      status: 400,
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
    public_url: file?.public_url,
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
    return new Response(JSON.stringify({
      error: signedError?.message || 'Failed to sign url',
      storage_path: file.storage_path
    }), {
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

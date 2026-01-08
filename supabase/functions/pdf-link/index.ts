import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import {
  supabaseAdmin,
  ESTIMATES_BUCKET,
  ESTIMATES_BUCKET_PUBLIC,
} from '../_shared/supabase.ts';

const SIGNED_URL_TTL_SECONDS = 3600;

serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const jobId = url.searchParams.get('job_id');

  if (!jobId) {
    return new Response(JSON.stringify({ error: 'job_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: file, error: fileError } = await supabaseAdmin
    .from('job_files')
    .select('*')
    .eq('job_id', jobId)
    .eq('kind', 'pdf')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fileError || !file) {
    return new Response(JSON.stringify({ error: 'PDF not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (ESTIMATES_BUCKET_PUBLIC) {
    const publicUrl = file.public_url ??
      supabaseAdmin.storage.from(ESTIMATES_BUCKET).getPublicUrl(file.storage_path).data.publicUrl;
    return new Response(JSON.stringify({ pdf_url: publicUrl, public: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(ESTIMATES_BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signedData?.signedUrl) {
    return new Response(JSON.stringify({ error: signedError?.message || 'Failed to sign url' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ pdf_url: signedData.signedUrl, public: false }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

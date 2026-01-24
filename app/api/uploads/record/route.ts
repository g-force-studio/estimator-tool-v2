import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasAccess } from '@/lib/access';
import type { Database } from '@/lib/supabase/database.types';

type RecordUploadRequest = {
  jobId?: string;
  storagePath?: string;
  kind?: 'image' | 'pdf';
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as RecordUploadRequest;
    const jobId = body.jobId?.trim();
    const storagePath = body.storagePath?.trim();
    const kind: 'image' | 'pdf' = body.kind || 'image';

    if (!jobId || !storagePath) {
      return NextResponse.json({ error: 'Missing jobId or storagePath' }, { status: 400 });
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('workspace_id')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const canAccess = await hasAccess(job.workspace_id);
    if (!canAccess) {
      return NextResponse.json({ error: 'Subscription inactive' }, { status: 402 });
    }

    const payload: Database['public']['Tables']['job_files']['Insert'] = {
      job_id: jobId,
      kind,
      storage_path: storagePath,
      public_url: null,
    };

    const { data, error } = await supabase
      .from('job_files')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ file: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record upload';
    console.error('Upload record error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

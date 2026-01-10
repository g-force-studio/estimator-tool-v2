import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type RecordUploadRequest = {
  jobId?: string;
  storagePath?: string;
  kind?: string;
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
    const kind = body.kind || 'image';

    if (!jobId || !storagePath) {
      return NextResponse.json({ error: 'Missing jobId or storagePath' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('job_files')
      .insert({
        job_id: jobId,
        kind,
        storage_path: storagePath,
        public_url: null,
      })
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

import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

type SignedUploadRequest = {
  jobId?: string;
  jobItemId?: string;
  filename?: string;
  mimeType?: string;
};

function getFileExtension(filename?: string, mimeType?: string) {
  const nameExt = filename && filename.includes('.') ? filename.split('.').pop() : '';
  if (nameExt) return nameExt;
  if (mimeType && mimeType.includes('/')) {
    return mimeType.split('/').pop() || '';
  }
  return '';
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    const body = (await request.json()) as SignedUploadRequest;
    const jobId = body.jobId?.trim();
    const jobItemId = body.jobItemId?.trim() || 'general';

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const ext = getFileExtension(body.filename, body.mimeType);
    const fileName = ext ? `${nanoid()}.${ext}` : nanoid();
    const filePath = `${member.workspace_id}/${jobId}/${jobItemId}/${fileName}`;

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient.storage
      .from('job-assets')
      .createSignedUploadUrl(filePath);

    if (error || !data) {
      throw error || new Error('Failed to create signed upload');
    }

    return NextResponse.json({
      signed_url: data.signedUrl,
      token: data.token,
      path: data.path,
      bucket: 'job-assets',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create signed upload';
    console.error('Signed upload error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

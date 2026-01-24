import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { hasAccess } from '@/lib/access';

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

const getKeyStats = (key?: string) => ({
  prefix: key?.slice(0, 8) ?? null,
  len: key?.length ?? null,
  dotCount: key ? key.split('.').length - 1 : null,
  hasNewlines: key ? /[\r\n]/.test(key) : null,
  hasQuotes: key ? /^['"]|['"]$/.test(key) : null,
});

export async function POST(request: Request) {
  try {
    // Parse request URL once
    const requestUrl = new URL(request.url);
    const debug = requestUrl.searchParams.get('debug') === '1';

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

    const canAccess = await hasAccess(member.workspace_id);
    if (!canAccess) {
      return NextResponse.json({ error: 'Subscription inactive' }, { status: 402 });
    }

    const body = (await request.json()) as SignedUploadRequest;
    const jobId = body.jobId?.trim();
    const jobItemId = body.jobItemId?.trim() || 'general';

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    // DEBUG: return runtime info BEFORE any storage calls
    if (debug) {
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      return NextResponse.json({
        debug: true,
        servedBy: {
          NETLIFY: process.env.NETLIFY ?? null,
          CONTEXT: process.env.CONTEXT ?? null,
          URL: process.env.URL ?? null,
          DEPLOY_URL: process.env.DEPLOY_URL ?? null,
          SITE_NAME: process.env.SITE_NAME ?? null,
          COMMIT_REF: process.env.COMMIT_REF ?? null,
          BRANCH: process.env.BRANCH ?? null,
          DEPLOY_ID: process.env.DEPLOY_ID ?? null,
        },
        supabase: {
          urlHost: sbUrl ? sbUrl.replace(/^https?:\/\//, '').split('/')[0] : null,
          serviceRole: getKeyStats(serviceKey),
        },
        request: {
          jobId,
          jobItemId,
          filename: body.filename ?? null,
          mimeType: body.mimeType ?? null,
        },
        workspace: {
          workspaceId: member.workspace_id,
        },
      });
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

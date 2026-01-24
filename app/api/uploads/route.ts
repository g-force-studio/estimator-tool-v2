import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/config';
import { hasAccess } from '@/lib/access';

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
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    const canAccess = await hasAccess(member.workspace_id);
    if (!canAccess) {
      return NextResponse.json({ error: 'Subscription inactive' }, { status: 402 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${nanoid()}.${fileExt}`;
    const serviceClient = createServiceClient();

    if (type === 'logo') {
      if (member.role !== 'owner' && member.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const filePath = `${member.workspace_id}/logo/${fileName}`;
      const { data, error } = await serviceClient.storage
        .from('workspace-logos')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: true,
        });

      if (error) throw error;

      const { data: signedData, error: signedError } = await serviceClient.storage
        .from('workspace-logos')
        .createSignedUrl(data.path, SIGNED_URL_TTL_SECONDS);

      if (signedError) {
        console.error('Error signing logo upload:', signedError);
      }

      return NextResponse.json({
        path: data.path,
        bucket: 'workspace-logos',
        signed_url: signedData?.signedUrl || null,
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
      });
    }

    const jobId = formData.get('jobId') as string;
    const jobItemId = formData.get('jobItemId') as string;

    if (!jobId || !jobItemId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const filePath = `${member.workspace_id}/${jobId}/${jobItemId}/${fileName}`;
    const { data, error } = await serviceClient.storage
      .from('job-assets')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;

    const { error: fileInsertError } = await serviceClient
      .from('job_files')
      .insert({
        job_id: jobId,
        kind: 'image',
        storage_path: data.path,
        public_url: null,
      });

    if (fileInsertError && fileInsertError.code !== 'PGRST205') {
      throw fileInsertError;
    }

    const { data: signedData, error: signedError } = await serviceClient.storage
      .from('job-assets')
      .createSignedUrl(data.path, SIGNED_URL_TTL_SECONDS);

    if (signedError) {
      console.error('Error signing job asset upload:', signedError);
    }

    return NextResponse.json({
      path: data.path,
      bucket: 'job-assets',
      signed_url: signedData?.signedUrl || null,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upload file';
    console.error('Upload error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

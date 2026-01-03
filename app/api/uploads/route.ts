import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

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

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const jobId = formData.get('jobId') as string;
    const jobItemId = formData.get('jobItemId') as string;

    if (!file || !jobId || !jobItemId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${nanoid()}.${fileExt}`;
    const filePath = `${member.workspace_id}/${jobId}/${jobItemId}/${fileName}`;

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient.storage
      .from('job-assets')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;

    return NextResponse.json({
      path: data.path,
      bucket: 'job-assets',
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload file' },
      { status: 500 }
    );
  }
}

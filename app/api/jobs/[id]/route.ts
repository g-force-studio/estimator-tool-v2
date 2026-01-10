import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/config';
import { jobSchema, lineItemSchema } from '@/lib/validations';
import { z } from 'zod';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .select('*, job_items(*)')
      .eq('id', params.id)
      .single();

    if (error) throw error;

    const serviceClient = createServiceClient();
    let photos: Array<{ id: string; url: string; file_name: string }> = [];

    const { data: jobFiles, error: filesError } = await supabase
      .from('job_files')
      .select('id, storage_path, created_at')
      .eq('job_id', params.id)
      .eq('kind', 'image')
      .order('created_at', { ascending: true });

    if (filesError && filesError.code !== 'PGRST205') {
      console.error('Job files fetch error:', filesError);
      return NextResponse.json({ ...job, photos });
    }

    if (jobFiles && jobFiles.length > 0) {
      photos = await Promise.all(
        jobFiles.map(async (file) => {
          const { data: signedData } = await serviceClient.storage
            .from('job-assets')
            .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS);
          const fileName = file.storage_path.split('/').pop() || 'photo';
          return {
            id: file.id,
            url: signedData?.signedUrl || '',
            file_name: fileName,
          };
        })
      );
    } else if (filesError?.code === 'PGRST205') {
      const basePath = `${job.workspace_id}/${params.id}`;
      const { data: jobItemFolders } = await serviceClient.storage
        .from('job-assets')
        .list(basePath, { limit: 100, offset: 0 });

      const storagePaths: string[] = [];
      for (const entry of jobItemFolders || []) {
        if (entry.metadata) {
          storagePaths.push(`${basePath}/${entry.name}`);
          continue;
        }

        const { data: files } = await serviceClient.storage
          .from('job-assets')
          .list(`${basePath}/${entry.name}`, { limit: 200, offset: 0 });
        for (const file of files || []) {
          if (file.metadata?.mimetype?.startsWith('image/')) {
            storagePaths.push(`${basePath}/${entry.name}/${file.name}`);
          }
        }
      }

      photos = await Promise.all(
        storagePaths.map(async (storagePath) => {
          const { data: signedData } = await serviceClient.storage
            .from('job-assets')
            .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
          const fileName = storagePath.split('/').pop() || 'photo';
          return {
            id: storagePath,
            url: signedData?.signedUrl || '',
            file_name: fileName,
          };
        })
      );
    }

    return NextResponse.json({ ...job, photos });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch job';
    console.error('Job fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { line_items, ...jobPayload } = body;
    const validated = jobSchema.parse(jobPayload);

    const { data: job, error } = await supabase
      .from('jobs')
      .update(validated)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    if (line_items === undefined) {
      return NextResponse.json(job);
    }

    const lineItems = z.array(lineItemSchema).parse(line_items);
    const { error: deleteError } = await supabase
      .from('job_items')
      .delete()
      .eq('job_id', params.id)
      .eq('type', 'line_item');

    if (deleteError) throw deleteError;

    let jobItems: Array<Record<string, unknown>> = [];
    if (lineItems.length > 0) {
      const itemsToInsert = lineItems.map((item, index) => ({
        job_id: params.id,
        type: 'line_item' as const,
        title: item.name,
        content_json: {
          description: item.description || '',
          unit: item.unit,
          unit_price: item.unit_price,
          quantity: item.quantity,
        },
        order_index: index,
      }));

      const { data: items, error: itemsError } = await supabase
        .from('job_items')
        .insert(itemsToInsert)
        .select();

      if (itemsError) throw itemsError;
      jobItems = items ?? [];
    }

    return NextResponse.json({ ...job, job_items: jobItems });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update job';
    console.error('Job update error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', params.id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: 'Job not deleted. Check workspace access and RLS policies.' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete job';
    console.error('Job delete error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

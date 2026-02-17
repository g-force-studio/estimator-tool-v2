import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { hasAccess } from '@/lib/access';
import type { Database } from '@/lib/supabase/database.types';

// IMPORTANT: uses serviceClient to bypass RLS and avoid “schema cache” updates
// from breaking the request after the real work succeeded.
async function safeJobUpdate(
  serviceClient: ReturnType<typeof createServiceClient>,
  jobId: string,
  patch: Database['public']['Tables']['jobs']['Update']
) {
  try {
    const { error } = await serviceClient.from('jobs').update(patch).eq('id', jobId);
    if (error) console.error('Non-fatal jobs update failed:', error);
  } catch (e) {
    console.error('Non-fatal jobs update exception:', e);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const serviceClient = createServiceClient();

  const jobId = params.id;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, workspace_id')
      .eq('id', jobId)
      .single();

    if (jobError || !job) throw jobError || new Error('Job not found');

    const canAccess = await hasAccess(job.workspace_id);
    if (!canAccess) {
      return NextResponse.json({ error: 'Subscription inactive' }, { status: 402 });
    }

    await safeJobUpdate(serviceClient, jobId, {
      status: 'ai_pending',
      error_message: null,
      estimate_status: 'pending',
    });

    const { error: queueError } = await serviceClient
      .from('estimate_queue')
      .insert({ job_id: jobId, workspace_id: job.workspace_id });

    if (queueError && queueError.code !== '23505') {
      console.error('Estimate queue insert error:', queueError);
    }

    const functionsBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
      : null;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (functionsBaseUrl && serviceRoleKey) {
      void fetch(`${functionsBaseUrl}/estimate-worker`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ job_id: jobId }),
      }).catch((error) => {
        console.error('Estimate worker trigger failed:', error);
      });
    }

    const { data: updatedJob, error: updatedJobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (updatedJobError) {
      console.error('Non-fatal job refetch failed:', updatedJobError);
      return NextResponse.json({ job: { id: jobId, status: 'ai_pending' } }, { status: 200 });
    }

    return NextResponse.json({ job: updatedJob }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to queue estimate';

    console.error('Estimate enqueue error:', error);

    await safeJobUpdate(serviceClient, jobId, {
      status: 'ai_error',
      error_message: message,
      estimate_status: 'error',
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

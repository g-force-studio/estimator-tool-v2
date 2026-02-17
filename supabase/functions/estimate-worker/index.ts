// @ts-expect-error Deno import via URL is resolved in edge runtime, not by TS.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabase.ts';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings';
const DRAFT_MODEL = 'gpt-4.1-mini';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CONFIDENCE_THRESHOLD = 0.35;

// @ts-expect-error Deno global is only available in edge runtime.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// @ts-expect-error Deno global is only available in edge runtime.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// @ts-expect-error Deno global is only available in edge runtime.
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

type ImageAnalysis = { image_url: string; observations: string };

type LaborLine = { task: string; hours: number; rate: number; total: number };

type MaterialLine = {
  item: string;
  qty: number;
  cost: number;
  pricing_status?: 'matched' | 'missing';
  pricing_source?: 'customer' | 'workspace' | 'catalog' | 'none';
  pricing_confidence?: number;
  missing_reason?: 'no_match' | 'low_confidence' | 'timeout';
};

type EstimateDraft = {
  client?: {
    customerName?: string;
    customerEmail?: string;
    address?: string;
    phone?: string;
    preferredDate?: string;
  };
  estimate?: {
    estimateNumber?: string;
    project?: string;
    jobDescription?: string;
    jobNotes?: string;
    labor?: Array<{ task?: string; hours?: number }>;
    materials?: Array<{ item?: string; qty?: number; cost?: number }>;
  };
  image_analysis?: ImageAnalysis[];
};

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

type WorkspacePromptResult = {
  id: string | null;
  systemPrompt: string | null;
  trade: 'plumbing' | 'electrical' | 'hvac' | 'general_contractor';
  source:
    | 'customer_override'
    | 'workspace_default_id'
    | 'workspace_default_flag'
    | 'template'
    | 'fallback';
};

type QueueRow = {
  id: string;
  job_id: string;
  workspace_id: string;
  attempts: number;
  max_attempts: number;
};

const fallbackSystemPrompt = `
You are a residential estimator. Output strict JSON only.

GOAL
- Produce a draft estimate from the provided job details, Scope Summary, Job Summary, and photos.
- Identify required materials and labor realistically.

PRICING RULES (STRICT)
- Do NOT invent material prices.
- Set ALL "estimate.materials[].cost" values to 0.
- The server will overwrite material pricing using workspace_pricing_materials (customer override, then workspace) or pricing_materials.
 - If you are unsure about an item name, still include it using a clear, human-readable description.

OUTPUT FORMAT (JSON ONLY)
Return exactly one JSON object with this shape and no extra keys:
{
  "client": {
    "customerName": string,
    "customerEmail": string,
    "address": string,
    "phone": string,
    "preferredDate": string
  },
  "estimate": {
    "estimateNumber": string,
    "project": string,
    "jobDescription": string,
    "jobNotes": string,
    "labor": [{ "task": string, "hours": number }],
    "materials": [{ "item": string, "qty": number, "cost": number }]
  },
  "image_analysis": [{ "image_url": string, "observations": string }]
}

RULES
- jobDescription must be a concise Scope Summary.
- jobNotes must include a short Job Summary followed by key assumptions and missing information.
- materials[].cost must always be 0.
`;

const roundToHalf = (value: number) => Math.round(value * 2) / 2;
const formatEstimateNumber = (value: Date) => {
  const pad = (part: number) => String(part).padStart(2, '0');
  const year = value.getUTCFullYear();
  const month = pad(value.getUTCMonth() + 1);
  const day = pad(value.getUTCDate());
  const hours = pad(value.getUTCHours());
  const minutes = pad(value.getUTCMinutes());
  return `${year}${month}${day}-${hours}${minutes}`;
};

const extractOutputText = (payload: OpenAIResponse) => {
  if (typeof payload?.output_text === 'string') return payload.output_text;

  const chunks =
    payload?.output?.flatMap((item) =>
      (item?.content || [])
        .filter((part) => part?.type === 'output_text')
        .map((part) => part?.text)
    ) || [];

  return chunks.join('\n').trim();
};

const errToString = (e: unknown) => {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
};

async function getWorkspacePrompt(
  workspaceId: string,
  trade: WorkspacePromptResult['trade'],
  customerId?: string | null
): Promise<WorkspacePromptResult> {
  const { data: workspace, error: workspaceError } = await supabaseAdmin
    .from('workspaces')
    .select('default_ai_reference_config_id, trade')
    .eq('id', workspaceId)
    .maybeSingle();

  if (workspaceError) {
    throw workspaceError;
  }

  if (customerId) {
    const { data: customerConfig, error: customerError } = await supabaseAdmin
      .from('ai_reference_configs')
      .select('id, system_prompt, trade')
      .eq('workspace_id', workspaceId)
      .eq('customer_id', customerId)
      .maybeSingle();

    if (customerError) throw customerError;

    if (customerConfig?.system_prompt) {
      return {
        id: customerConfig.id,
        systemPrompt: customerConfig.system_prompt,
        trade: (customerConfig.trade as WorkspacePromptResult['trade']) ??
          (workspace?.trade as WorkspacePromptResult['trade']) ??
          trade,
        source: 'customer_override',
      };
    }
  }

  if (workspace?.default_ai_reference_config_id) {
    const { data: config, error: configError } = await supabaseAdmin
      .from('ai_reference_configs')
      .select('id, system_prompt, trade')
      .eq('id', workspace.default_ai_reference_config_id)
      .maybeSingle();

    if (configError) throw configError;

    if (config?.system_prompt) {
      return {
        id: config.id,
        systemPrompt: config.system_prompt,
        trade: (config.trade as WorkspacePromptResult['trade']) ??
          (workspace?.trade as WorkspacePromptResult['trade']) ??
          trade,
        source: 'workspace_default_id',
      };
    }
  }

  const { data: defaultConfig, error: defaultError } = await supabaseAdmin
    .from('ai_reference_configs')
    .select('id, system_prompt, trade')
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .maybeSingle();

  if (defaultError) throw defaultError;

  if (defaultConfig?.system_prompt) {
    return {
      id: defaultConfig.id,
      systemPrompt: defaultConfig.system_prompt,
      trade: (defaultConfig.trade as WorkspacePromptResult['trade']) ??
        (workspace?.trade as WorkspacePromptResult['trade']) ??
        trade,
      source: 'workspace_default_flag',
    };
  }

  const fallbackTrade = (workspace?.trade as WorkspacePromptResult['trade']) ?? trade;
  const { data: template, error: templateError } = await supabaseAdmin
    .from('prompt_templates')
    .select('id, system_prompt')
    .eq('trade', fallbackTrade)
    .eq('active', true)
    .order('version', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (templateError) throw templateError;

  if (template?.system_prompt) {
    return {
      id: template.id,
      systemPrompt: template.system_prompt,
      trade: fallbackTrade,
      source: 'template',
    };
  }

  return {
    id: null,
    systemPrompt: null,
    trade: fallbackTrade,
    source: 'fallback',
  };
}

async function callOpenAI(payload: unknown) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    throw new Error(data?.error?.message || 'OpenAI request failed');
  }

  return data;
}

async function getEmbeddings(inputs: string[]) {
  if (!OPENAI_API_KEY || inputs.length === 0) return [];
  const response = await fetch(OPENAI_EMBED_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding request failed: ${errorText}`);
  }

  const data = await response.json();
  return Array.isArray(data?.data) ? data.data : [];
}

async function markQueueFailure(queueRow: QueueRow | null, message: string) {
  if (!queueRow) return;
  const status = queueRow.attempts >= queueRow.max_attempts ? 'failed' : 'pending';
  await supabaseAdmin
    .from('estimate_queue')
    .update({ status, error_message: message, updated_at: new Date().toISOString() })
    .eq('id', queueRow.id);
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let jobId: string | null = null;
  let queueRow: QueueRow | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    jobId = typeof body?.job_id === 'string' ? body.job_id : null;
  } catch {
    jobId = null;
  }

  if (!jobId) {
    const { data: dequeued, error: dequeueError } = await supabaseAdmin.rpc('dequeue_estimate_job');
    if (dequeueError) {
      return new Response(JSON.stringify({ error: dequeueError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!dequeued || dequeued.length === 0) {
      return new Response(JSON.stringify({ message: 'No pending jobs' }), {
        status: 204,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    queueRow = dequeued[0] as QueueRow;
    jobId = queueRow.job_id;
  } else {
    const { data: existing } = await supabaseAdmin
      .from('estimate_queue')
      .select('id, job_id, workspace_id, status, attempts, max_attempts')
      .eq('job_id', jobId)
      .in('status', ['pending', 'running'])
      .maybeSingle();

    if (existing) {
      queueRow = {
        id: existing.id,
        job_id: existing.job_id,
        workspace_id: existing.workspace_id,
        attempts: existing.attempts,
        max_attempts: existing.max_attempts,
      };

      if (existing.status === 'pending') {
        const nextAttempts = existing.attempts + 1;
        await supabaseAdmin
          .from('estimate_queue')
          .update({
            status: 'running',
            attempts: nextAttempts,
            locked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        queueRow.attempts = nextAttempts;
      }
    }
  }

  if (!jobId) {
    return new Response(JSON.stringify({ error: 'Missing job_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .select('*, job_items(*)')
      .eq('id', jobId)
      .single();

    if (jobError || !job) throw jobError || new Error('Job not found');

    const customerId = job.customer_id ?? null;

    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from('workspace_settings')
      .select('tax_rate_percent, markup_percent, hourly_rate')
      .eq('workspace_id', job.workspace_id)
      .single();

    let settings = settingsData;
    if (settingsError && settingsError.code === 'PGRST116') {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('workspace_settings')
        .upsert({ workspace_id: job.workspace_id })
        .select('tax_rate_percent, markup_percent, hourly_rate')
        .single();
      if (insertError) throw insertError;
      settings = inserted;
    } else if (settingsError) {
      throw settingsError;
    }

    const taxRate = Number(settings?.tax_rate_percent ?? 0);
    const markupPercent = Number(settings?.markup_percent ?? 0);
    const hourlyRate = Number(settings?.hourly_rate ?? 0);

    const { data: workspaceData } = await supabaseAdmin
      .from('workspaces')
      .select('workspace_pricing_id, trade')
      .eq('id', job.workspace_id)
      .maybeSingle();

    const workspacePricingId = workspaceData?.workspace_pricing_id ?? null;

    const { data: jobFiles } = await supabaseAdmin
      .from('job_files')
      .select('id, storage_path')
      .eq('job_id', jobId)
      .eq('kind', 'image')
      .order('created_at', { ascending: true });

    const photos = await Promise.all(
      (jobFiles || []).map(async (file) => {
        const { data } = await supabaseAdmin.storage
          .from('job-assets')
          .createSignedUrl(file.storage_path, 3600);
        return { id: file.id, url: data?.signedUrl || '' };
      })
    );

    const jobItems = Array.isArray(job.job_items) ? job.job_items : job.job_items ? [job.job_items] : [];

    const lineItems = jobItems
      .filter((item: { type?: string }) => item?.type === 'line_item')
      .map((item: { title?: string; content_json?: Record<string, unknown> }) => ({
        name: item.title || '',
        description: String(item.content_json?.description || ''),
        unit: String(item.content_json?.unit || ''),
        unit_price: Number(item.content_json?.unit_price ?? 0),
        quantity: Number(item.content_json?.quantity ?? 0),
      }));

    const promptResult = await getWorkspacePrompt(
      job.workspace_id,
      (workspaceData?.trade as WorkspacePromptResult['trade']) ?? 'general_contractor',
      customerId
    );
    const systemPrompt = promptResult.systemPrompt ?? fallbackSystemPrompt;

    const userText = [
      `Job title: ${job.title}`,
      `Client name: ${job.client_name || ''}`,
      `Due date: ${job.due_date || ''}`,
      `Scope Summary (source): ${job.description_md || ''}`,
      `Job Summary (source): ${job.description_md || ''}`,
      `Existing line items: ${JSON.stringify(lineItems)}`,
      'Use the photos to identify fixtures/materials and include key observations in image_analysis.',
    ].join('\n');

    const userContent: Array<{ type: string; text?: string; image_url?: string }> = [
      { type: 'input_text', text: userText },
    ];

    photos.slice(0, 8).forEach((photo) => {
      if (photo.url) userContent.push({ type: 'input_image', image_url: photo.url });
    });

    const openaiData = await callOpenAI({
      model: DRAFT_MODEL,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
    });

    const outputText = extractOutputText(openaiData);

    let parsed: EstimateDraft;
    try {
      parsed = JSON.parse(outputText) as EstimateDraft;
    } catch (e) {
      await supabaseAdmin
        .from('jobs')
        .update({ status: 'ai_error', error_message: `AI returned invalid JSON: ${errToString(e)}` })
        .eq('id', jobId);
      await markQueueFailure(queueRow, 'AI returned invalid JSON');
      return new Response(JSON.stringify({ error: 'AI returned invalid JSON' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const labor: LaborLine[] = Array.isArray(parsed?.estimate?.labor)
      ? parsed.estimate!.labor!.map((item) => ({
          task: String(item?.task || '').trim(),
          hours: Number(item?.hours ?? 0),
          rate: hourlyRate,
          total: roundToHalf(Number(item?.hours ?? 0) * hourlyRate),
        }))
      : [];

    const materials: MaterialLine[] = Array.isArray(parsed?.estimate?.materials)
      ? parsed.estimate!.materials!.map((item) => ({
          item: String(item?.item || '').trim(),
          qty: Number(item?.qty ?? 0),
          cost: 0,
        }))
      : [];

    const embeddingInputs = materials.map((item) => item.item).filter(Boolean);
    let embeddings: Array<{ embedding?: number[] }> = [];
    try {
      embeddings = await getEmbeddings(embeddingInputs);
    } catch (e) {
      console.error('Embedding fetch error:', e);
    }

    let missingCount = 0;
    let missingTimeoutCount = 0;
    let missingLowConfidenceCount = 0;

    const pricedMaterials: MaterialLine[] = [];

    for (let i = 0; i < materials.length; i += 1) {
      const material = materials[i];
      const queryEmbedding = embeddings[i]?.embedding ?? null;
      const embeddingParam =
        Array.isArray(queryEmbedding) ? `[${queryEmbedding.join(',')}]` : null;
      let candidates: Array<Record<string, unknown>> = [];
      let rpcFailed = false;

      try {
        const { data, error } = await supabaseAdmin.rpc('search_pricing_candidates', {
          query_text: material.item,
          query_embedding: embeddingParam,
          trade: promptResult.trade,
          workspace_id: job.workspace_id,
          workspace_pricing_id: workspacePricingId,
          customer_id: customerId,
          limit_count: 60,
        });
        if (error) {
          rpcFailed = true;
          console.error('Pricing candidate RPC error:', error);
        } else {
          candidates = data || [];
        }
      } catch (e) {
        rpcFailed = true;
        console.error('Pricing candidate RPC exception:', e);
      }

      const topCandidate = candidates[0] ?? null;
      const source = typeof topCandidate?.source === 'string' ? topCandidate.source : 'none';
      const score = Number(topCandidate?.score ?? 0);

      if (!topCandidate || rpcFailed) {
        missingCount += 1;
        if (rpcFailed) missingTimeoutCount += 1;
        pricedMaterials.push({
          ...material,
          pricing_status: 'missing',
          pricing_source: 'none',
          pricing_confidence: 0,
          missing_reason: rpcFailed ? 'timeout' : 'no_match',
        });
        continue;
      }

      if (!Number.isFinite(score) || score < CONFIDENCE_THRESHOLD) {
        missingCount += 1;
        missingLowConfidenceCount += 1;
        pricedMaterials.push({
          ...material,
          pricing_status: 'missing',
          pricing_source: source as MaterialLine['pricing_source'],
          pricing_confidence: Number.isFinite(score) ? score : 0,
          missing_reason: 'low_confidence',
        });
        continue;
      }

      const unitCost = Number(topCandidate?.unit_cost ?? 0);
      const unitPrice = Number(topCandidate?.unit_price ?? 0);
      const resolvedCost = source === 'catalog' ? unitPrice : unitCost;

      pricedMaterials.push({
        ...material,
        cost: Number.isFinite(resolvedCost) ? resolvedCost : 0,
        pricing_status: 'matched',
        pricing_source: source as MaterialLine['pricing_source'],
        pricing_confidence: Number.isFinite(score) ? score : 0,
      });
    }

    const materialsTotal = pricedMaterials.reduce((sum, item) => sum + item.qty * item.cost, 0);
    const laborTotal = labor.reduce((sum, item) => sum + item.total, 0);
    const subtotal = roundToHalf(materialsTotal + laborTotal);
    const markupAmount = roundToHalf((subtotal * markupPercent) / 100);
    const tax = roundToHalf(((subtotal + markupAmount) * taxRate) / 100);
    const total = roundToHalf(subtotal + markupAmount + tax);

    const estimateTimestamp = new Date();
    const aiJson = {
      client: {
        customerName: parsed?.client?.customerName || job.client_name || '',
        customerEmail: parsed?.client?.customerEmail || '',
        address: parsed?.client?.address || '',
        phone: parsed?.client?.phone || '',
        preferredDate: parsed?.client?.preferredDate || job.due_date || '',
      },
      estimate: {
        estimateNumber: formatEstimateNumber(estimateTimestamp),
        project: parsed?.estimate?.project || job.title,
        jobDescription: parsed?.estimate?.jobDescription || job.description_md || '',
        jobNotes: parsed?.estimate?.jobNotes || '',
        formattingStatus: 'success',
        labor,
        materials: pricedMaterials,
        subtotal,
        tax,
        total,
      },
      image_analysis: Array.isArray(parsed?.image_analysis)
        ? parsed.image_analysis
        : ([] as ImageAnalysis[]),
      metadata: {
        tax_rate_percent: taxRate,
        markup_percent: markupPercent,
        hourly_rate: hourlyRate,
        model: DRAFT_MODEL,
        prompt_id: promptResult.id,
        prompt_source: promptResult.source,
        prompt_trade: promptResult.trade,
        generated_at: estimateTimestamp.toISOString(),
        pricing_missing_count: missingCount,
        pricing_missing_timeout_count: missingTimeoutCount,
        pricing_missing_low_confidence_count: missingLowConfidenceCount,
      },
    };

    const { error: aiError } = await supabaseAdmin
      .from('ai_outputs')
      .insert({ job_id: jobId, ai_json: aiJson });

    if (aiError) throw aiError;

    await supabaseAdmin
      .from('jobs')
      .update({
        status: 'ai_ready',
        error_message: null,
        estimate_status: 'complete',
        estimated_at: estimateTimestamp.toISOString(),
      })
      .eq('id', jobId);

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const functionsBaseUrl = `${SUPABASE_URL}/functions/v1`;
      try {
        const pdfResponse = await fetch(`${functionsBaseUrl}/generate-pdf`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ job_id: jobId }),
        });

        if (!pdfResponse.ok) {
          const errorText = await pdfResponse.text();
          console.error('PDF generation failed:', errorText);
        }
      } catch (pdfError) {
        console.error('PDF generation error:', pdfError);
      }
    }

    if (queueRow) {
      await supabaseAdmin.from('estimate_queue').delete().eq('id', queueRow.id);
    }

    return new Response(JSON.stringify({ status: 'ok', job_id: jobId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = errToString(error);
    console.error('Estimate worker error:', error);

    await supabaseAdmin
      .from('jobs')
      .update({ status: 'ai_error', error_message: message, estimate_status: 'error' })
      .eq('id', jobId!);

    await markQueueFailure(queueRow, message);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

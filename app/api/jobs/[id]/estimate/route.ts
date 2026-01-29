import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { hasAccess } from '@/lib/access';
import { getWorkspacePrompt } from '@/lib/prompts';
import type { Database } from '@/lib/supabase/database.types';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DRAFT_MODEL = 'gpt-4.1-mini';

type ImageAnalysis = { image_url: string; observations: string };
type LaborLine = { task: string; hours: number };
type MaterialLine = { item: string; qty: number; cost: number };
type WorkspacePricingRow = {
  normalized_key: string;
  unit_cost: number;
  description: string | null;
  unit: string | null;
};

type JobItem = {
  type?: string;
  title?: string;
  content_json?: {
    description?: string;
    unit?: string;
    unit_price?: number;
    quantity?: number;
  };
};

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
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

const fallbackSystemPrompt = `
You are a residential estimator. Output strict JSON only.

GOAL
- Produce a draft estimate from the provided job details, Scope Summary, Job Summary, and photos.
- Identify required materials and labor realistically.

PRICING RULES (STRICT)
- Do NOT invent material prices.
- Set ALL "estimate.materials[].cost" values to 0.
- The server will overwrite material pricing using workspace_pricing_materials (customer override, then workspace) or pricing_materials.
- If you are unsure about an item name, still include it and add a note in estimate.jobNotes: "MISSING PRICE: <item>".

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
  const requestUrl = new URL(request.url);
  const debug = requestUrl.searchParams.get('debug') === '1';

  const supabase = createServerClient();      // user-scoped (RLS)
  const serviceClient = createServiceClient(); // service role

  const jobId = params.id;

  try {
    // Auth check (keep user-scoped for security)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch job + items (user-scoped)
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*, job_items(*)')
      .eq('id', jobId)
      .single();

    if (jobError) throw jobError;

    const canAccess = await hasAccess(job.workspace_id);
    if (!canAccess) {
      return NextResponse.json({ error: 'Subscription inactive' }, { status: 402 });
    }

    // Mark pending (non-fatal)
    await safeJobUpdate(serviceClient, jobId, {
      status: 'ai_pending',
      error_message: null, // if column is missing this won't kill request
    });

    // Workspace settings (prefer user-scoped read; service upsert if missing)
    let settings: null | {
      tax_rate_percent: number | null;
      markup_percent: number | null;
      hourly_rate: number | null;
    } = null;

    const { data: settingsData, error: settingsError } = await supabase
      .from('workspace_settings')
      .select('tax_rate_percent, markup_percent, hourly_rate')
      .eq('workspace_id', job.workspace_id)
      .single();

    // PGRST116 is "No rows" (single() empty)
    if (settingsError && settingsError.code !== 'PGRST116') {
      throw settingsError;
    }

    if (!settingsData) {
      const { data: inserted, error: insertError } = await serviceClient
        .from('workspace_settings')
        .upsert({ workspace_id: job.workspace_id })
        .select('tax_rate_percent, markup_percent, hourly_rate')
        .single();

      if (insertError) throw insertError;
      settings = inserted;
    } else {
      settings = settingsData;
    }

    const taxRate = Number(settings?.tax_rate_percent ?? 0);
    const markupPercent = Number(settings?.markup_percent ?? 0);
    const hourlyRate = Number(settings?.hourly_rate ?? 0);

    // Job files (photos)
    const { data: jobFiles, error: filesError } = await supabase
      .from('job_files')
      .select('id, storage_path')
      .eq('job_id', jobId)
      .eq('kind', 'image')
      .order('created_at', { ascending: true });

    // ignore missing table or no rows; log other errors
    if (filesError && filesError.code !== 'PGRST205') {
      console.error('Estimate job files fetch error:', filesError);
    }

    const photos = await Promise.all(
      (jobFiles || []).map(async (file) => {
        const { data } = await serviceClient.storage
          .from('job-assets')
          .createSignedUrl(file.storage_path, 3600);

        return { id: file.id, url: data?.signedUrl || '' };
      })
    );

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is missing');
    }

    const jobItems = Array.isArray(job.job_items)
      ? (job.job_items as JobItem[])
      : job.job_items
      ? [job.job_items as JobItem]
      : [];

    const lineItems = jobItems
      .filter((item) => item.type === 'line_item')
      .map((item) => ({
        name: item.title || '',
        description: item.content_json?.description || '',
        unit: item.content_json?.unit || '',
        unit_price: item.content_json?.unit_price ?? 0,
        quantity: item.content_json?.quantity ?? 0,
      }));

    const customerId = job.customer_id ?? null;
    const promptResult = await getWorkspacePrompt(
      job.workspace_id,
      'general_contractor',
      customerId
    );
    const systemPrompt = promptResult.systemPrompt ?? fallbackSystemPrompt;

    const normalizeCatalogKey = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    const catalogQueryText = normalizeCatalogKey(
      [
        job.title,
        job.description_md || '',
        ...lineItems.map((item) => item.name),
        ...lineItems.map((item) => item.description),
      ].join(' ')
    );

    const catalogTokens = new Set(catalogQueryText.split(' ').filter((token) => token.length >= 3));

    const { data: customerPricing } = customerId
      ? await serviceClient
          .from('workspace_pricing_materials')
          .select('normalized_key, unit_cost, description, unit')
          .eq('workspace_id', job.workspace_id)
          .eq('trade', promptResult.trade)
          .eq('customer_id', customerId)
      : { data: [] as WorkspacePricingRow[] };

    const { data: workspacePricing } = await serviceClient
      .from('workspace_pricing_materials')
      .select('normalized_key, unit_cost, description, unit')
      .eq('workspace_id', job.workspace_id)
      .eq('trade', promptResult.trade)
      .is('customer_id', null);

    const hasCustomerPricing = (customerPricing?.length ?? 0) > 0;
    const hasWorkspacePricing = (workspacePricing?.length ?? 0) > 0;

    const pricingCatalogQuery = serviceClient
      .from('pricing_materials')
      .select('item_key, aliases, category, unit');
    const { data: pricingCatalog } =
      promptResult.trade === 'general_contractor'
        ? await pricingCatalogQuery
        : await pricingCatalogQuery.eq('trade', promptResult.trade);

    const catalogDefaults = pricingCatalog || [];
    const customerCatalog =
      hasCustomerPricing && customerPricing
        ? customerPricing.map((row) => ({
            item_key: row.description || row.normalized_key,
            aliases: null,
            category: null,
            unit: row.unit,
          }))
        : [];
    const workspaceCatalog =
      hasWorkspacePricing && workspacePricing
        ? workspacePricing.map((row) => ({
            item_key: row.description || row.normalized_key,
            aliases: null,
            category: null,
            unit: row.unit,
          }))
        : [];

    const catalogSource = (() => {
      const seen = new Set<string>();
      const merged: typeof catalogDefaults = [];
      const catalogKey = (row: { item_key: string }) =>
        normalizeCatalogKey(row.item_key);

      [...customerCatalog, ...workspaceCatalog, ...catalogDefaults].forEach((row) => {
        const key = catalogKey(row);
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(row);
      });

      return merged;
    })();

    const catalogCandidates = catalogSource
      .map((row) => {
        const searchable = normalizeCatalogKey(
          [row.item_key, row.aliases || '', row.category || ''].join(' ')
        );
        const tokens = searchable.split(' ').filter((token) => token.length >= 3);
        const score = tokens.reduce((sum, token) => sum + (catalogTokens.has(token) ? 1 : 0), 0);
        return { ...row, score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);

    const catalogLines = catalogCandidates.map((row) => {
      const extras = [row.category || null, row.aliases || null, row.unit || null].filter(Boolean).join(' | ');
      return `- ${row.item_key}${extras ? ` (${extras})` : ''}`;
    });

    const userText = [
      `Job title: ${job.title}`,
      `Client name: ${job.client_name || ''}`,
      `Due date: ${job.due_date || ''}`,
      `Scope Summary (source): ${job.description_md || ''}`,
      `Job Summary (source): ${job.description_md || ''}`,
      `Existing line items: ${JSON.stringify(lineItems)}`,
      catalogLines.length > 0
        ? `Pricing catalog candidates (choose from these item_key values when possible):\n${catalogLines.join('\n')}`
        : 'Pricing catalog candidates: none found for this scope.',
      'Use the photos to identify fixtures/materials and include key observations in image_analysis.',
    ].join('\n');

    const userContent: Array<{ type: string; text?: string; image_url?: string }> = [
      { type: 'input_text', text: userText },
    ];

    photos.slice(0, 8).forEach((photo) => {
      if (photo.url) userContent.push({ type: 'input_image', image_url: photo.url });
    });

    // OpenAI call
    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DRAFT_MODEL,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
      }),
    });

    const openaiData = (await openaiResponse.json()) as OpenAIResponse;

    if (!openaiResponse.ok) {
      throw new Error(openaiData?.error?.message || 'OpenAI request failed');
    }

    const outputText = extractOutputText(openaiData);

    // Parse JSON
    let parsed: EstimateDraft;
    try {
      parsed = JSON.parse(outputText) as EstimateDraft;
    } catch (e) {
      // Mark error (non-fatal), but fail request because we can’t persist valid estimate JSON
      await safeJobUpdate(serviceClient, jobId, {
        status: 'ai_error',
        error_message: `AI returned invalid JSON: ${errToString(e)}`,
      });
      return NextResponse.json(
        {
          error: 'AI returned invalid JSON',
          ...(debug ? { debug: { outputText: outputText?.slice(0, 2000) } } : {}),
        },
        { status: 500 }
      );
    }

    const labor: LaborLine[] = Array.isArray(parsed?.estimate?.labor)
      ? parsed.estimate!.labor!.map((item) => ({
          task: String(item?.task || '').trim(),
          hours: Number(item?.hours ?? 0),
        }))
      : [];

    const materials: MaterialLine[] = Array.isArray(parsed?.estimate?.materials)
      ? parsed.estimate!.materials!.map((item) => ({
          item: String(item?.item || '').trim(),
          qty: Number(item?.qty ?? 0),
          cost: 0,
        }))
      : [];

    const pricingMaterialsQuery = serviceClient
      .from('pricing_materials')
      .select('item_key, unit_price, aliases');
    const { data: pricingMaterials, error: pricingError } =
      promptResult.trade === 'general_contractor'
        ? await pricingMaterialsQuery
        : await pricingMaterialsQuery.eq('trade', promptResult.trade);

    if (pricingError) {
      console.error('Pricing materials fetch error:', pricingError);
    }

    const customerPriceLookup = new Map<string, number>();
    const workspacePriceLookup = new Map<string, number>();
    const priceLookup = new Map<string, number>();
    const normalizeKey = (value: string) =>
      value
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
    const buildMedianLookup = (rows: WorkspacePricingRow[], target: Map<string, number>) => {
      const buckets = new Map<string, number[]>();
      rows.forEach((row) => {
        const key = normalizeKey(row.normalized_key || row.description || '');
        const cost = Number(row.unit_cost ?? 0);
        if (!key || !Number.isFinite(cost)) return;
        const list = buckets.get(key) ?? [];
        list.push(cost);
        buckets.set(key, list);
      });
      buckets.forEach((values, key) => {
        values.sort((a, b) => a - b);
        const mid = Math.floor(values.length / 2);
        const median =
          values.length % 2 === 0
            ? (values[mid - 1] + values[mid]) / 2
            : values[mid];
        target.set(key, median);
      });
    };

    buildMedianLookup(customerPricing || [], customerPriceLookup);
    buildMedianLookup(workspacePricing || [], workspacePriceLookup);

    (pricingMaterials || []).forEach((material) => {
      const price = Number(material.unit_price ?? 0);
      const baseKey = normalizeKey(material.item_key);
      if (baseKey) priceLookup.set(baseKey, price);
      if (typeof material.aliases === 'string') {
        material.aliases
          .split(/[;,]/)
          .map((alias) => normalizeKey(alias))
          .filter(Boolean)
          .forEach((alias) => priceLookup.set(alias, price));
      }
    });

    const tokenize = (value: string) =>
      value
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);

    const findBestMatch = (lookup: Map<string, number>, key: string) => {
      const direct = lookup.get(key);
      if (typeof direct === 'number') return direct;

      const keyTokens = tokenize(key);
      let bestMatch: { key: string; price: number; score: number } | null = null;
      for (const [priceKey, price] of lookup.entries()) {
        if (!priceKey) continue;
        if (key.includes(priceKey) || priceKey.includes(key)) {
          const score = priceKey.length;
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { key: priceKey, price, score };
          }
          continue;
        }

        const priceTokens = tokenize(priceKey);
        if (priceTokens.length === 0 || keyTokens.length === 0) continue;
        const overlap = priceTokens.filter((token) => keyTokens.includes(token)).length;
        const score = overlap * 10 + Math.min(priceTokens.length, keyTokens.length);
        if (overlap >= 2 || (overlap === 1 && score >= 12)) {
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { key: priceKey, price, score };
          }
        }
      }

      return bestMatch?.price;
    };

    const findUnitPrice = (key: string) =>
      findBestMatch(customerPriceLookup, key) ??
      findBestMatch(workspacePriceLookup, key) ??
      findBestMatch(priceLookup, key);

    const pricedMaterials = materials.map((item) => {
      const key = normalizeKey(item.item);
      const unitPrice = key ? findUnitPrice(key) : undefined;
      return {
        ...item,
        cost: Number.isFinite(unitPrice) ? Number(unitPrice) : 0,
      };
    });

    const normalizedLabor = labor.map((item) => {
      const total = roundToHalf(item.hours * hourlyRate);
      return { task: item.task, hours: item.hours, rate: hourlyRate, total };
    });

    const materialsTotal = pricedMaterials.reduce((sum, item) => sum + item.qty * item.cost, 0);
    const laborTotal = normalizedLabor.reduce((sum, item) => sum + item.total, 0);
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
        labor: normalizedLabor,
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
      },
    };

    // PERSIST AI OUTPUT (this is the critical write)
    const { data: aiOutput, error: aiError } = await supabase
      .from('ai_outputs')
      .insert({ job_id: jobId, ai_json: aiJson })
      .select()
      .single();

    if (aiError) throw aiError;

    // Mark job ready (non-fatal)
    await safeJobUpdate(serviceClient, jobId, {
      status: 'ai_ready',
      error_message: null,
      estimate_status: 'complete',
      estimated_at: estimateTimestamp.toISOString(),
    });

    const functionsBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
      : null;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (functionsBaseUrl && serviceRoleKey) {
      try {
        const pdfResponse = await fetch(`${functionsBaseUrl}/generate-pdf`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
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
    } else {
      console.warn('PDF generation skipped: missing Supabase URL or service role key.');
    }

    // Re-fetch job (user-scoped) for UI; if this fails due to column mismatch,
    // we still return success with ai_output and a minimal job payload.
    const { data: updatedJob, error: updatedJobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (updatedJobError) {
      console.error('Non-fatal job refetch failed:', updatedJobError);
      return NextResponse.json({
        job: { id: jobId, status: 'ai_ready' },
        ai_output: aiOutput,
      });
    }

    return NextResponse.json({ job: updatedJob, ai_output: aiOutput }, { status: 200 });
  } catch (error: unknown) {
    const message = errToString(error);

    const debugInfo = debug
      ? {
          message,
          name: error instanceof Error ? error.name : null,
          stack: error instanceof Error ? error.stack?.split('\n').slice(0, 6).join('\n') : null,
          code: (error as { code?: string })?.code ?? null,
          details: (error as { details?: string })?.details ?? null,
          hint: (error as { hint?: string })?.hint ?? null,
        }
      : undefined;

    console.error('Estimate generation error:', error);

    // Best-effort mark error; do not throw if schema mismatch
    await safeJobUpdate(serviceClient, jobId, {
      status: 'ai_error',
      error_message: message,
      estimate_status: 'error',
    });

    return NextResponse.json(
      { error: message || 'Failed to generate estimate', ...(debugInfo ? { debug: debugInfo } : {}) },
      { status: 500 }
    );
  }
}

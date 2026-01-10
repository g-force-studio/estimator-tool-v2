import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DRAFT_MODEL = 'gpt-4.1-mini';

type ImageAnalysis = {
  image_url: string;
  observations: string;
};

type LaborLine = {
  task: string;
  hours: number;
};

type MaterialLine = {
  item: string;
  qty: number;
  cost: number;
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

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const serviceClient = createServiceClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*, job_items(*)')
      .eq('id', params.id)
      .single();

    if (jobError) throw jobError;

    await supabase
      .from('jobs')
      .update({ status: 'ai_pending', error_message: null })
      .eq('id', params.id);

    let settings = null as null | {
      tax_rate_percent: number | null;
      markup_percent: number | null;
      hourly_rate: number | null;
    };
    const { data: settingsData, error: settingsError } = await supabase
      .from('workspace_settings')
      .select('tax_rate_percent, markup_percent, hourly_rate')
      .eq('workspace_id', job.workspace_id)
      .single();

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

    const { data: jobFiles, error: filesError } = await supabase
      .from('job_files')
      .select('id, storage_path')
      .eq('job_id', params.id)
      .eq('kind', 'image')
      .order('created_at', { ascending: true });

    if (filesError && filesError.code !== 'PGRST205') {
      console.error('Estimate job files fetch error:', filesError);
    }

    const photos = await Promise.all(
      (jobFiles || []).map(async (file) => {
        const { data } = await serviceClient.storage
          .from('job-assets')
          .createSignedUrl(file.storage_path, 3600);
        return {
          id: file.id,
          url: data?.signedUrl || '',
        };
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

    const systemPrompt = [
      'You are an expert estimator for residential services.',
      'Analyze provided photos and job details to create a structured estimate.',
      'Return ONLY valid JSON with this shape:',
      '{',
      '  "client": { "customerName": "", "customerEmail": "", "address": "", "phone": "", "preferredDate": "" },',
      '  "estimate": {',
      '    "estimateNumber": "",',
      '    "project": "",',
      '    "jobDescription": "",',
      '    "jobNotes": "",',
      '    "formattingStatus": "success",',
      '    "labor": [ { "task": "", "hours": 0 } ],',
      '    "materials": [ { "item": "", "qty": 0, "cost": 0 } ]',
      '  },',
      '  "image_analysis": [ { "image_url": "", "observations": "" } ]',
      '}',
      'Do not include markdown or extra commentary.',
    ].join('\n');

    const userText = [
      `Job title: ${job.title}`,
      `Client name: ${job.client_name || ''}`,
      `Due date: ${job.due_date || ''}`,
      `Job description: ${job.description_md || ''}`,
      `Existing line items: ${JSON.stringify(lineItems)}`,
      'Use the photos to identify fixtures/materials and include key observations in image_analysis.',
    ].join('\n');

    const userContent: Array<{ type: string; text?: string; image_url?: string }> = [
      { type: 'input_text', text: userText },
    ];

    photos.slice(0, 8).forEach((photo) => {
      if (photo.url) {
        userContent.push({ type: 'input_image', image_url: photo.url });
      }
    });

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
    const parsed = JSON.parse(outputText) as EstimateDraft;

    const labor: LaborLine[] = Array.isArray(parsed?.estimate?.labor)
      ? parsed.estimate?.labor?.map((item) => ({
          task: String(item?.task || '').trim(),
          hours: Number(item?.hours ?? 0),
        }))
      : [];

    const materials: MaterialLine[] = Array.isArray(parsed?.estimate?.materials)
      ? parsed.estimate?.materials?.map((item) => ({
          item: String(item?.item || '').trim(),
          qty: Number(item?.qty ?? 0),
          cost: Number(item?.cost ?? 0),
        }))
      : [];

    const normalizedLabor = labor.map((item) => {
      const total = roundToHalf(item.hours * hourlyRate);
      return {
        task: item.task,
        hours: item.hours,
        rate: hourlyRate,
        total,
      };
    });

    const materialsTotal = materials.reduce((sum, item) => sum + item.qty * item.cost, 0);
    const laborTotal = normalizedLabor.reduce((sum, item) => sum + item.total, 0);
    const subtotal = roundToHalf(materialsTotal + laborTotal);
    const markupAmount = roundToHalf((subtotal * markupPercent) / 100);
    const tax = roundToHalf(((subtotal + markupAmount) * taxRate) / 100);
    const total = roundToHalf(subtotal + markupAmount + tax);

    const aiJson = {
      client: {
        customerName: parsed?.client?.customerName || job.client_name || '',
        customerEmail: parsed?.client?.customerEmail || '',
        address: parsed?.client?.address || '',
        phone: parsed?.client?.phone || '',
        preferredDate: parsed?.client?.preferredDate || job.due_date || '',
      },
      estimate: {
        estimateNumber: String(parsed?.estimate?.estimateNumber || job.id),
        project: parsed?.estimate?.project || job.title,
        jobDescription: parsed?.estimate?.jobDescription || job.description_md || '',
        jobNotes: parsed?.estimate?.jobNotes || '',
        formattingStatus: 'success',
        labor: normalizedLabor,
        materials,
        subtotal,
        tax,
        total,
      },
      image_analysis: Array.isArray(parsed?.image_analysis) ? parsed.image_analysis : ([] as ImageAnalysis[]),
      metadata: {
        tax_rate_percent: taxRate,
        markup_percent: markupPercent,
        hourly_rate: hourlyRate,
        model: DRAFT_MODEL,
        generated_at: new Date().toISOString(),
      },
    };

    const { data: aiOutput, error: aiError } = await supabase
      .from('ai_outputs')
      .insert({ job_id: params.id, ai_json: aiJson })
      .select()
      .single();

    if (aiError) throw aiError;

    const { data: updatedJob, error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'ai_ready', error_message: null })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ job: updatedJob, ai_output: aiOutput });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'AI error';
    console.error('Estimate generation error:', error);
    await supabase
      .from('jobs')
      .update({ status: 'ai_error', error_message: message })
      .eq('id', params.id);
    return NextResponse.json(
      { error: message || 'Failed to generate estimate' },
      { status: 500 }
    );
  }
}

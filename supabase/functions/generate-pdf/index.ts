import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import {
  supabaseAdmin,
  ESTIMATES_BUCKET,
  ESTIMATES_BUCKET_PUBLIC,
} from '../_shared/supabase.ts';

type GeneratePdfPayload = {
  job_id: string;
  force?: boolean;
};

type LineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  total?: number;
};

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

function normalizeLineItems(items: LineItem[]) {
  return items.map((item) => ({
    ...item,
    total: item.total ?? item.quantity * item.unit_price,
  }));
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const payload = (await req.json()) as GeneratePdfPayload;
  if (!payload?.job_id) {
    return new Response(JSON.stringify({ error: 'job_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const jobId = payload.job_id;
  const force = payload.force === true;

  const { data: existingFile } = await supabaseAdmin
    .from('job_files')
    .select('*')
    .eq('job_id', jobId)
    .eq('kind', 'pdf')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingFile && !force) {
    return new Response(JSON.stringify({ pdf_url: existingFile.public_url, storage_path: existingFile.storage_path }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    return new Response(JSON.stringify({ error: 'Job not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await supabaseAdmin.from('jobs').update({ status: 'pdf_pending', error_message: null }).eq('id', jobId);

  const { data: aiOutput, error: aiError } = await supabaseAdmin
    .from('ai_outputs')
    .select('ai_json')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (aiError || !aiOutput) {
    await supabaseAdmin
      .from('jobs')
      .update({ status: 'pdf_error', error_message: aiError?.message || 'Missing ai output' })
      .eq('id', jobId);
    return new Response(JSON.stringify({ error: 'Missing ai output' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const aiJson = aiOutput.ai_json as Record<string, unknown>;
  const estimate = (aiJson.estimate ?? null) as Record<string, unknown> | null;
  const client = (aiJson.client ?? null) as Record<string, unknown> | null;

  const companyName = (aiJson.company_name as string) || 'RelayKit Estimates';
  const terms = (aiJson.terms as string) || 'Payment due upon receipt.';

  const legacyItems = Array.isArray(aiJson.line_items) ? (aiJson.line_items as LineItem[]) : [];
  const materialItems = Array.isArray(estimate?.materials)
    ? (estimate?.materials as Array<Record<string, unknown>>)
    : [];
  const laborItems = Array.isArray(estimate?.labor)
    ? (estimate?.labor as Array<Record<string, unknown>>)
    : [];

  const lineItems = normalizeLineItems([
    ...legacyItems,
    ...materialItems.map((item) => ({
      description: String(item.item ?? ''),
      quantity: Number(item.qty ?? 0),
      unit_price: Number(item.cost ?? 0),
      total: Number(item.qty ?? 0) * Number(item.cost ?? 0),
    })),
    ...laborItems.map((item) => ({
      description: String(item.task ?? ''),
      quantity: Number(item.hours ?? 0),
      unit_price: Number(item.rate ?? 0),
      total: Number(item.total ?? Number(item.hours ?? 0) * Number(item.rate ?? 0)),
    })),
  ]);

  const subtotal = typeof estimate?.subtotal === 'number'
    ? (estimate.subtotal as number)
    : lineItems.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const tax = typeof estimate?.tax === 'number'
    ? (estimate.tax as number)
    : typeof aiJson.tax === 'number'
      ? (aiJson.tax as number)
      : 0;
  const total = typeof estimate?.total === 'number'
    ? (estimate.total as number)
    : typeof aiJson.total === 'number'
      ? (aiJson.total as number)
      : subtotal + tax;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 48;
  page.drawText(companyName, { x: 48, y, size: 20, font: bold, color: rgb(0.1, 0.1, 0.1) });

  y -= 24;
  const projectName = (estimate?.project as string) || job.title;
  page.drawText(`Estimate for ${projectName}`, { x: 48, y, size: 12, font, color: rgb(0.2, 0.2, 0.2) });

  y -= 16;
  const clientName = (client?.customerName as string) || job.client_name || 'N/A';
  page.drawText(`Client: ${clientName}`, { x: 48, y, size: 11, font });
  page.drawText(`Due Date: ${job.due_date ?? 'N/A'}`, { x: 340, y, size: 11, font });

  y -= 16;
  if (job.description_md) {
    page.drawText(`Description: ${job.description_md}`, { x: 48, y, size: 10, font, maxWidth: width - 96 });
    y -= 24;
  }

  page.drawLine({
    start: { x: 48, y },
    end: { x: width - 48, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  y -= 20;
  page.drawText('Line Items', { x: 48, y, size: 12, font: bold });
  y -= 16;

  page.drawText('Description', { x: 48, y, size: 10, font: bold });
  page.drawText('Qty', { x: 340, y, size: 10, font: bold });
  page.drawText('Unit', { x: 400, y, size: 10, font: bold });
  page.drawText('Total', { x: 480, y, size: 10, font: bold });

  y -= 12;
  for (const item of lineItems) {
    if (y < 120) break;
    page.drawText(item.description, { x: 48, y, size: 10, font, maxWidth: 280 });
    page.drawText(item.quantity.toString(), { x: 340, y, size: 10, font });
    page.drawText(formatCurrency(item.unit_price), { x: 400, y, size: 10, font });
    page.drawText(formatCurrency(item.total ?? 0), { x: 480, y, size: 10, font });
    y -= 14;
  }

  y -= 12;
  page.drawLine({
    start: { x: 48, y },
    end: { x: width - 48, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  y -= 20;
  page.drawText(`Subtotal: ${formatCurrency(subtotal)}`, { x: 400, y, size: 10, font });
  y -= 14;
  page.drawText(`Tax: ${formatCurrency(tax)}`, { x: 400, y, size: 10, font });
  y -= 14;
  page.drawText(`Total: ${formatCurrency(total)}`, { x: 400, y, size: 12, font: bold });

  y -= 24;
  page.drawText('Terms', { x: 48, y, size: 11, font: bold });
  y -= 14;
  page.drawText(terms, { x: 48, y, size: 10, font, maxWidth: width - 96 });

  y -= 28;
  page.drawText('Thank you for your business.', { x: 48, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });

  const pdfBytes = await pdfDoc.save();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const storagePath = `${jobId}/${timestamp}.pdf`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(ESTIMATES_BUCKET)
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false });

  if (uploadError) {
    await supabaseAdmin
      .from('jobs')
      .update({ status: 'pdf_error', error_message: uploadError.message })
      .eq('id', jobId);
    return new Response(JSON.stringify({ error: uploadError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const publicUrl = ESTIMATES_BUCKET_PUBLIC
    ? supabaseAdmin.storage.from(ESTIMATES_BUCKET).getPublicUrl(storagePath).data.publicUrl
    : null;

  await supabaseAdmin.from('job_files').insert({
    job_id: jobId,
    kind: 'pdf',
    storage_path: storagePath,
    public_url: publicUrl,
  });

  const { error: statusError } = await supabaseAdmin
    .from('jobs')
    .update({ status: 'complete' })
    .eq('id', jobId);

  if (statusError) {
    console.error('Failed to update job status to complete:', statusError);
  }

  if (publicUrl) {
    const { error: pdfUrlError } = await supabaseAdmin
      .from('jobs')
      .update({ pdf_url: publicUrl })
      .eq('id', jobId);

    if (pdfUrlError) {
      console.error('Failed to update job pdf_url:', pdfUrlError);
    }
  }

  return new Response(JSON.stringify({ storage_path: storagePath, pdf_url: publicUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

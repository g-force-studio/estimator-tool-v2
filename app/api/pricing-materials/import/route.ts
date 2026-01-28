import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

const TRADE_VALUES = ['plumbing', 'electrical', 'hvac', 'general_contractor'] as const;
type Trade = (typeof TRADE_VALUES)[number];

type CsvParseResult = { headers: string[]; rows: string[][] };

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const parseCsv = (text: string): CsvParseResult => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n' || char === '\r') {
      row.push(field);
      field = '';
      if (row.some((value) => value.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.trim() !== '')) {
      rows.push(row);
    }
  }

  const headers = (rows.shift() || []).map((value) => value.trim());
  return { headers, rows };
};

const createBearerClient = (token: string) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error('Missing Supabase env vars');
  }

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const importToken = request.headers.get('x-import-token') || '';
    const expectedToken = process.env.IMPORT_TOKEN?.trim() || '';
    const isTokenAuth = expectedToken.length > 0 && importToken === expectedToken;
    const authHeader = request.headers.get('authorization') || '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const supabase = bearerMatch ? createBearerClient(bearerMatch[1]) : createServerClient();
    const serviceClient = createServiceClient();
    let workspaceId: string | null = null;

    if (isTokenAuth) {
      const rawWorkspaceId = formData.get('workspace_id');
      workspaceId = typeof rawWorkspaceId === 'string' ? rawWorkspaceId : null;
      if (!workspaceId) {
        return NextResponse.json(
          { error: 'workspace_id is required when using x-import-token' },
          { status: 400 }
        );
      }
    } else {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { data: member, error: memberError } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .single();

      if (memberError || !member) {
        return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
      }

      workspaceId = member.workspace_id;
    }

    const tradeValue = String(formData.get('trade') || '');
    const trade = TRADE_VALUES.includes(tradeValue as Trade)
      ? (tradeValue as Trade)
      : null;

    if (!trade) {
      return NextResponse.json({ error: 'Invalid trade' }, { status: 400 });
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing CSV file' }, { status: 400 });
    }

    const defaultCustomerId =
      typeof formData.get('customer_id') === 'string'
        ? String(formData.get('customer_id'))
        : null;

    const text = await file.text();
    const { headers, rows } = parseCsv(text);

    if (headers.length === 0) {
      return NextResponse.json({ error: 'CSV is missing headers' }, { status: 400 });
    }

    const headerIndex = (names: string[]) => {
      const lower = headers.map((value) => value.toLowerCase().trim());
      for (const name of names) {
        const idx = lower.indexOf(name);
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const descriptionIndex = headerIndex(['description', 'item_key']);
    const unitCostIndex = headerIndex(['unit_cost', 'unit_price', 'price', 'cost']);
    const unitIndex = headerIndex(['unit']);
    const normalizedIndex = headerIndex(['normalized_key']);
    const customerIndex = headerIndex(['customer_id']);

    if (descriptionIndex === -1 || unitCostIndex === -1) {
      return NextResponse.json(
        { error: 'CSV must include description (or item_key) and unit_cost (or unit_price)' },
        { status: 400 }
      );
    }

    const customerIds = new Set<string>();
    if (defaultCustomerId) customerIds.add(defaultCustomerId);

    rows.forEach((row) => {
      const rawCustomer = customerIndex >= 0 ? row[customerIndex]?.trim() : '';
      if (rawCustomer) customerIds.add(rawCustomer);
    });

    if (customerIds.size > 0) {
    const { data: customers, error: customerError } = await serviceClient
      .from('customers')
      .select('id')
      .eq('workspace_id', workspaceId)
      .in('id', Array.from(customerIds));

      if (customerError) throw customerError;

      const validIds = new Set((customers || []).map((customer) => customer.id));
      for (const id of customerIds) {
        if (!validIds.has(id)) {
          return NextResponse.json({ error: `Invalid customer_id: ${id}` }, { status: 400 });
        }
      }
    }

    type PricingInsert =
      Database['public']['Tables']['workspace_pricing_materials']['Insert'];
    const rowsToInsert: PricingInsert[] = [];
    const errors: Array<{ row: number; error: string }> = [];
    let skipped = 0;

    rows.forEach((row, index) => {
      const description = row[descriptionIndex]?.trim() ?? '';
      const unitCostRaw = row[unitCostIndex]?.trim() ?? '';
      const unitCost = Number(unitCostRaw);
      const unit = unitIndex >= 0 ? row[unitIndex]?.trim() || null : null;
      const normalized = normalizedIndex >= 0 ? row[normalizedIndex]?.trim() : '';
      const rowCustomer = customerIndex >= 0 ? row[customerIndex]?.trim() : '';
      const customerId = rowCustomer || defaultCustomerId || null;

      if (!description) {
        skipped += 1;
        errors.push({ row: index + 2, error: 'Missing description' });
        return;
      }

      if (!Number.isFinite(unitCost)) {
        skipped += 1;
        errors.push({ row: index + 2, error: 'Invalid unit_cost' });
        return;
      }

      rowsToInsert.push({
        workspace_id: workspaceId,
        trade,
        description,
        normalized_key: normalized || normalizeKey(description),
        unit,
        unit_cost: unitCost,
        customer_id: customerId,
        source: 'upload',
      });
    });

    const batchSize = 500;
    let inserted = 0;

    for (let i = 0; i < rowsToInsert.length; i += batchSize) {
      const batch = rowsToInsert.slice(i, i + batchSize);
      const { error } = await serviceClient.from('workspace_pricing_materials').insert(batch);
      if (error) throw error;
      inserted += batch.length;
    }

    return NextResponse.json({
      inserted,
      skipped,
      errors: errors.slice(0, 50),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to import pricing materials';
    console.error('Pricing import error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

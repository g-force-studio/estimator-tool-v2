import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export const ESTIMATES_BUCKET = Deno.env.get('ESTIMATES_BUCKET') ?? 'estimates';
export const ESTIMATES_BUCKET_PUBLIC = (Deno.env.get('ESTIMATES_BUCKET_PUBLIC') ?? 'true') === 'true';

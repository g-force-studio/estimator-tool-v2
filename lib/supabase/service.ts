import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  // TEMP DEBUG LOGS (remove after fixed)
  console.error('[service] url host:', url?.replace(/^https?:\/\//, '').split('/')[0]);
  console.error('[service] key prefix:', key?.slice(0, 8));
  console.error('[service] key len:', key?.length);
  console.error('[service] dot count:', (key ?? '').split('.').length - 1);

  const missingEnv = [
    !url ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
    !key ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
  ].filter((v): v is string => v !== null);

  if (missingEnv.length) {
    throw new Error(`Missing Supabase env vars: ${missingEnv.join(', ')}`);
  }

  if (key!.split('.').length !== 3) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not a JWT (expected 2 dots)');
  }

  return createClient<Database>(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

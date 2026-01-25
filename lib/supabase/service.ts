import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

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

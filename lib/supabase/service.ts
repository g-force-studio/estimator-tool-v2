import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

export function createServiceClient() {
  const missingEnv = [
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
  ].filter((value): value is string => value !== null);

  if (missingEnv.length > 0) {
    throw new Error(`Missing Supabase env vars: ${missingEnv.join(', ')}`);
  }

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

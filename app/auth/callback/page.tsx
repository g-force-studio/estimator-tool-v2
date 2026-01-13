'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function CallbackBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';

  useEffect(() => {
    const supabase = createClient();
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace(redirectTo);
        return;
      }

      setTimeout(() => {
        router.replace(`/auth/login?redirectTo=${encodeURIComponent(redirectTo)}`);
      }, 1200);
    };

    void checkSession();
  }, [redirectTo, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-muted-foreground">Signing you in...</div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-muted-foreground">Signing you in...</div>
        </div>
      }
    >
      <CallbackBody />
    </Suspense>
  );
}

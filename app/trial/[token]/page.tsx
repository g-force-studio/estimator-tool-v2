'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type RedeemState = 'idle' | 'working' | 'success' | 'error';

export default function TrialRedeemPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string | undefined;
  const [state, setState] = useState<RedeemState>('idle');
  const [message, setMessage] = useState('Redeeming your trial...');

  useEffect(() => {
    if (!token || state !== 'idle') return;

    const redeem = async () => {
      setState('working');
      try {
        const response = await fetch('/api/trials/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'Failed to redeem trial.');
        }
        setState('success');
        setMessage('Trial activated. Redirecting...');
        setTimeout(() => router.push('/'), 1200);
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Failed to redeem trial.';
        setState('error');
        setMessage(text);
      }
    };

    void redeem();
  }, [router, state, token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-lg dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Trial</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{message}</p>
        {state === 'error' && (
          <button
            onClick={() => router.push('/auth/login')}
            className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Go to sign in
          </button>
        )}
      </div>
    </div>
  );
}

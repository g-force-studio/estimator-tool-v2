'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';

type InviteDetails = {
  workspaces?: { name?: string } | null;
  role?: 'admin' | 'member';
};

type InviteUser = {
  email?: string | null;
};

export default function InvitePage({ params }: { params: { token: string } }) {
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [user, setUser] = useState<InviteUser | null>(null);
  const router = useRouter();

  const validateInvite = useCallback(async () => {
    try {
      const response = await fetch(`/api/invites/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Invalid invite');
      } else {
        setInvite(data.invite);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to validate invite');
    } finally {
      setLoading(false);
    }
  }, [params.token]);

  const checkAuth = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push(`/auth/login?redirectTo=/invite/${params.token}`);
      return;
    }

    setUser(user);
    await validateInvite();
  }, [params.token, router, validateInvite]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleAccept = async () => {
    setAccepting(true);
    setError('');

    try {
      const response = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept invite');
      }

      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Validating invite...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="text-destructive">
            <AlertIcon className="h-12 w-12 mx-auto" />
          </div>
          <h1 className="text-2xl font-bold">Invalid Invite</h1>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">You are Invited!</h1>
          <p className="mt-2 text-muted-foreground">
            Join your team on RelayKit
          </p>
        </div>

        {invite && (
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Workspace</p>
              <p className="text-lg font-semibold">{invite.workspaces?.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Role</p>
              <p className="text-lg font-semibold capitalize">{invite.role}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Your Email</p>
              <p className="text-lg">{user?.email}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg text-sm bg-destructive/10 text-destructive">
            {error}
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={accepting}
          className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {accepting ? 'Accepting...' : 'Accept Invitation'}
        </button>

        <p className="text-center text-sm text-muted-foreground">
          By accepting, you will join this workspace and gain access to all shared jobs and
          templates.
        </p>
      </div>
    </div>
  );
}

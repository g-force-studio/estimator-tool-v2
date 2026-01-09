'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function OnboardingPage() {
  const [workspaceName, setWorkspaceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create workspace');
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Welcome to RelayKit</h1>
          <p className="mt-2 text-muted-foreground">
            Let us create your workspace to get started
          </p>
        </div>

        <form onSubmit={handleCreateWorkspace} className="mt-8 space-y-6">
          <div>
            <label htmlFor="workspace-name" className="block text-sm font-medium mb-2">
              Workspace Name
            </label>
            <input
              id="workspace-name"
              type="text"
              required
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className="w-full px-4 py-3 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              placeholder="My Company"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              This is your company or team name
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-lg text-sm bg-destructive/10 text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Creating workspace...' : 'Create Workspace'}
          </button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          <p>Have an invite link?</p>
          <button
            onClick={() => {
              const token = prompt('Enter your invite token:');
              if (token) router.push(`/invite/${token}`);
            }}
            className="text-primary hover:underline mt-1"
          >
            Accept Invite
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useAppleDialog from '@/lib/use-apple-dialog';

export default function OnboardingPage() {
  const [workspaceName, setWorkspaceName] = useState('');
  const [trade, setTrade] = useState<'plumbing' | 'electrical' | 'hvac' | 'general_contractor'>('plumbing');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { dialog, showPrompt } = useAppleDialog();

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName, trade }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create workspace');
      }

      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {dialog}
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

          <div>
            <label htmlFor="trade" className="block text-sm font-medium mb-2">
              Trade
            </label>
            <select
              id="trade"
              value={trade}
              onChange={(event) => setTrade(event.target.value as 'plumbing' | 'electrical' | 'hvac' | 'general_contractor')}
              className="w-full px-4 py-3 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            >
              <option value="plumbing">Plumbing</option>
              <option value="electrical">Electrical</option>
              <option value="hvac">HVAC</option>
              <option value="general_contractor">General Contractor</option>
            </select>
            <p className="mt-2 text-sm text-muted-foreground">
              This sets your default AI estimating prompt.
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
            onClick={async () => {
              const token = await showPrompt('Enter your invite token:', {
                title: 'Join Workspace',
                primaryLabel: 'Join',
                secondaryLabel: 'Cancel',
                placeholder: 'Invite token',
              });
              if (token) router.push(`/invite/${token.trim()}`);
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

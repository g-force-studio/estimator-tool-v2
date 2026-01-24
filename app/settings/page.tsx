'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/bottom-nav';
import { createClient } from '@/lib/supabase/client';
import useAppleDialog from '@/lib/use-apple-dialog';

type Tab = 'workspace' | 'members' | 'invites';

type ThemePreference = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'relaykit-theme';
const THEME_CHANGE_EVENT = 'relaykit-theme-change';

const resolveTheme = (preference: ThemePreference) => {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
};

const applyTheme = (preference: ThemePreference) => {
  const resolved = resolveTheme(preference);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
};

interface WorkspaceBrand {
  workspace_id: string;
  brand_name?: string;
  accent_color?: string;
  logo_bucket?: string;
  logo_path?: string;
  logo_url?: string | null;
  labor_rate?: number | null;
}

interface Member {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  user_email: string;
  created_at: string;
}

interface Invite {
  id: string;
  email: string;
  role: 'admin' | 'member';
  accepted_at?: string | null;
  status: 'pending' | 'accepted' | 'expired';
  expires_at: string;
  created_at: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('workspace');
  const [brand, setBrand] = useState<WorkspaceBrand | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { dialog, showAlert, showConfirm } = useAppleDialog();

  const [workspaceName, setWorkspaceName] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [markupPercent, setMarkupPercent] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  // const [accentColor, setAccentColor] = useState('#3B82F6');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  useEffect(() => {
    const loadCurrentUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
    };
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const preference =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    setThemePreference(preference);
    applyTheme(preference);
  }, []);

  const handleThemeChange = (next: ThemePreference) => {
    setThemePreference(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: next }));
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const wsResponse = await fetch('/api/workspaces');
      if (wsResponse.ok) {
        const wsData = await wsResponse.json();
        setWorkspaceName(wsData.name);
      }

      if (activeTab === 'workspace') {
        const brandResponse = await fetch('/api/workspaces/brand');
        if (brandResponse.ok) {
          const brandData = await brandResponse.json();
          setBrand(brandData);
          // setAccentColor(brandData.accent_color || '#3B82F6');
          setLogoPreview(brandData.logo_url || null);
        }

        const settingsResponse = await fetch('/api/workspaces/settings');
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          setTaxRate(
            settingsData.tax_rate_percent !== null && settingsData.tax_rate_percent !== undefined
              ? String(settingsData.tax_rate_percent)
              : ''
          );
          setMarkupPercent(
            settingsData.markup_percent !== null && settingsData.markup_percent !== undefined
              ? String(settingsData.markup_percent)
              : ''
          );
          setHourlyRate(
            settingsData.hourly_rate !== null && settingsData.hourly_rate !== undefined
              ? String(settingsData.hourly_rate)
              : ''
          );
        }
      }

      if (activeTab === 'members') {
        const membersResponse = await fetch('/api/workspaces/members');
        if (membersResponse.ok) {
          const membersData = await membersResponse.json();
          setMembers(membersData);
        }
      }

      if (activeTab === 'invites') {
        const invitesResponse = await fetch('/api/invites');
        if (invitesResponse.ok) {
          const invitesData = await invitesResponse.json();
          const normalizedInvites = (invitesData.invites || []).map((invite: Invite) => {
            let status: Invite['status'] = 'pending';
            if (invite.accepted_at) {
              status = 'accepted';
            } else if (new Date(invite.expires_at) < new Date()) {
              status = 'expired';
            }
            return { ...invite, status };
          });
          setInvites(normalizedInvites);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveWorkspace = async () => {
    try {
      const response = await fetch('/api/workspaces', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName }),
      });

      if (!response.ok) throw new Error('Failed to update workspace');

      const brandPayload: Record<string, unknown> = {
        brand_name: workspaceName,
      };
      if (brand?.logo_bucket) {
        brandPayload.logo_bucket = brand.logo_bucket;
      }
      if (brand?.logo_path) {
        brandPayload.logo_path = brand.logo_path;
      }

      const brandResponse = await fetch('/api/workspaces/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandPayload),
      });

      if (!brandResponse.ok) throw new Error('Failed to update workspace settings');

      await showAlert('Workspace updated successfully');
      loadData();
    } catch (error) {
      console.error('Error updating workspace:', error);
      await showAlert('Failed to update workspace');
    }
  };

  const handleSaveSettings = async () => {
    try {
      const parsedTaxRate = taxRate.trim() === '' ? null : Number(taxRate);
      const parsedMarkup = markupPercent.trim() === '' ? null : Number(markupPercent);
      const parsedHourlyRate = hourlyRate.trim() === '' ? null : Number(hourlyRate);

      const response = await fetch('/api/workspaces/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tax_rate_percent: Number.isFinite(parsedTaxRate) ? parsedTaxRate : null,
          markup_percent: Number.isFinite(parsedMarkup) ? parsedMarkup : null,
          hourly_rate: Number.isFinite(parsedHourlyRate) ? parsedHourlyRate : null,
        }),
      });

      if (!response.ok) throw new Error('Failed to update settings');

      await showAlert('Workspace settings updated successfully');
      loadData();
    } catch (error) {
      console.error('Error updating workspace settings:', error);
      await showAlert('Failed to update workspace settings');
    }
  };

  const handleSaveBranding = async () => {
    try {
      let logoBucket = brand?.logo_bucket;
      let logoPath = brand?.logo_path;

      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);
        formData.append('type', 'logo');

        const uploadResponse = await fetch('/api/uploads', {
          method: 'POST',
          body: formData,
        });

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          logoBucket = uploadData.bucket;
          logoPath = uploadData.path;
          setLogoPreview(uploadData.signed_url || null);
        }
      }

      const response = await fetch('/api/workspaces/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: workspaceName,
          // accent_color: accentColor,
          logo_bucket: logoBucket,
          logo_path: logoPath,
        }),
      });

      if (!response.ok) throw new Error('Failed to update branding');

      await showAlert('Branding updated successfully');
      loadData();
    } catch (error) {
      console.error('Error updating branding:', error);
      await showAlert('Failed to update branding');
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail) {
      await showAlert('Please enter an email address');
      return;
    }

    setIsInviting(true);
    try {
      const response = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invite');
      }
      setInviteLink(data.inviteLink);
      setInviteEmail('');
      loadData();
    } catch (error) {
      console.error('Error sending invite:', error);
      await showAlert('Failed to send invite');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!(await showConfirm('Are you sure you want to revoke this invite?', {
      primaryLabel: 'Revoke',
      secondaryLabel: 'Cancel',
    }))) return;

    try {
      const response = await fetch(`/api/invites/${inviteId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to revoke invite');

      await showAlert('Invite revoked successfully');
      loadData();
    } catch (error) {
      console.error('Error revoking invite:', error);
      await showAlert('Failed to revoke invite');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!(await showConfirm('Are you sure you want to remove this member?', {
      primaryLabel: 'Remove',
      secondaryLabel: 'Cancel',
    }))) return;

    try {
      const response = await fetch(`/api/workspaces/members/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to remove member');

      await showAlert('Member removed successfully');
      loadData();
    } catch (error) {
      console.error('Error removing member:', error);
      await showAlert('Failed to remove member');
    }
  };

  const handleSignOut = async () => {
    if (!(await showConfirm('Sign out of this account?', {
      primaryLabel: 'Sign out',
      secondaryLabel: 'Cancel',
    }))) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.push('/auth/login');
    } catch (error) {
      console.error('Error signing out:', error);
      await showAlert('Failed to sign out. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      {dialog}
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>

        <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('workspace')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'workspace'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Workspace
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'members'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Members
          </button>
          <button
            onClick={() => setActiveTab('invites')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'invites'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Invites
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-gray-600 dark:text-gray-400">Loading...</div>
          </div>
        ) : (
          <>
            {activeTab === 'workspace' && (
              <div className="space-y-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Workspace Details
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Workspace Name
                      </label>
                      <input
                        type="text"
                        value={workspaceName}
                        onChange={(e) => setWorkspaceName(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <button
                      onClick={handleSaveWorkspace}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Save Workspace
                    </button>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Estimate Defaults
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Tax Rate (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        placeholder="6.0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Markup (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={markupPercent}
                        onChange={(e) => setMarkupPercent(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        placeholder="10.0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Default Hourly Rate
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        placeholder="85"
                      />
                    </div>
                    <button
                      onClick={handleSaveSettings}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Save Estimate Defaults
                    </button>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Only admins can update these values.
                    </p>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Account
                  </h2>
                  <button
                    onClick={handleSignOut}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Sign Out
                  </button>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Appearance
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {(['system', 'light', 'dark'] as ThemePreference[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleThemeChange(option)}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                          themePreference === option
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {option === 'system' ? 'System' : option === 'light' ? 'Light' : 'Dark'}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    System uses your device theme. You can override it anytime.
                  </p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Branding</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Logo
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                      {logoPreview && (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={logoPreview}
                            alt="Logo preview"
                            className="mt-2 h-20 object-contain"
                          />
                        </>
                      )}
                    </div>
                    {/* Accent color is reserved for future theming. */}
                    {/*
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Accent Color
                      </label>
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-full h-10 border border-gray-300 dark:border-gray-600 rounded-lg"
                      />
                    </div>
                    */}
                    <button
                      onClick={handleSaveBranding}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Save Branding
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'members' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Team Members
                  </h2>
                  {members.length === 0 ? (
                    <p className="text-gray-600 dark:text-gray-400">No members yet</p>
                  ) : (
                    <div className="space-y-3">
                      {[...members]
                        .sort((a, b) => {
                          if (a.user_id === currentUserId) return -1;
                          if (b.user_id === currentUserId) return 1;
                          return 0;
                        })
                        .map((member) => (
                        <div
                          key={member.user_id}
                          className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                              </span>
                              {member.user_id === currentUserId && (
                                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                  You
                                </span>
                              )}
                              {member.role === 'owner' && (
                                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                  Owner
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {member.user_email ? member.user_email : 'Email unavailable'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {member.user_id}
                            </p>
                          </div>
                          {member.role !== 'owner' && (
                            <button
                              onClick={() => handleRemoveMember(member.user_id)}
                              className="text-red-600 dark:text-red-400 text-sm hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'invites' && (
              <div className="space-y-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Send Invitation
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@example.com"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Role
                      </label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <button
                      onClick={handleSendInvite}
                      disabled={isInviting}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isInviting ? 'Sending...' : 'Send Invite'}
                    </button>
                  </div>

                  {inviteLink && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                        Invite sent! Share this link:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={inviteLink}
                          readOnly
                          className="flex-1 px-3 py-2 text-sm border border-green-300 dark:border-green-700 rounded bg-white dark:bg-gray-800"
                        />
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(inviteLink);
                            await showAlert('Link copied!');
                          }}
                          className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Pending Invites
                  </h2>
                  {invites.filter((i) => i.status === 'pending').length === 0 ? (
                    <p className="text-gray-600 dark:text-gray-400">No pending invites</p>
                  ) : (
                    <div className="space-y-3">
                      {invites
                        .filter((i) => i.status === 'pending')
                        .map((invite) => (
                          <div
                            key={invite.id}
                            className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                          >
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {invite.email}
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {invite.role} • Expires {new Date(invite.expires_at).toLocaleDateString()}
                              </p>
                            </div>
                            <button
                              onClick={() => handleRevokeInvite(invite.id)}
                              className="text-red-600 dark:text-red-400 text-sm hover:underline"
                            >
                              Revoke
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

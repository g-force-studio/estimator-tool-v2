'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/bottom-nav';

type Tab = 'workspace' | 'members' | 'invites';

interface Workspace {
  id: string;
  name: string;
  created_at: string;
}

interface WorkspaceBrand {
  workspace_id: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

interface Member {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  user_email: string;
  joined_at: string;
}

interface Invite {
  id: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'expired';
  expires_at: string;
  created_at: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('workspace');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [brand, setBrand] = useState<WorkspaceBrand | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [workspaceName, setWorkspaceName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [secondaryColor, setSecondaryColor] = useState('#1E40AF');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const wsResponse = await fetch('/api/workspaces');
      if (wsResponse.ok) {
        const wsData = await wsResponse.json();
        setWorkspace(wsData);
        setWorkspaceName(wsData.name);
      }

      if (activeTab === 'workspace') {
        const brandResponse = await fetch('/api/workspaces/brand');
        if (brandResponse.ok) {
          const brandData = await brandResponse.json();
          setBrand(brandData);
          setPrimaryColor(brandData.primary_color || '#3B82F6');
          setSecondaryColor(brandData.secondary_color || '#1E40AF');
          setLogoPreview(brandData.logo_url || null);
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
          setInvites(invitesData);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

      alert('Workspace updated successfully');
      loadData();
    } catch (error) {
      console.error('Error updating workspace:', error);
      alert('Failed to update workspace');
    }
  };

  const handleSaveBranding = async () => {
    try {
      let logoUrl = brand?.logo_url;

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
          logoUrl = uploadData.url;
        }
      }

      const response = await fetch('/api/workspaces/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logo_url: logoUrl,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
        }),
      });

      if (!response.ok) throw new Error('Failed to update branding');

      alert('Branding updated successfully');
      loadData();
    } catch (error) {
      console.error('Error updating branding:', error);
      alert('Failed to update branding');
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail) {
      alert('Please enter an email address');
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

      if (!response.ok) throw new Error('Failed to send invite');

      const data = await response.json();
      setInviteLink(data.invite_link);
      setInviteEmail('');
      loadData();
    } catch (error) {
      console.error('Error sending invite:', error);
      alert('Failed to send invite');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm('Are you sure you want to revoke this invite?')) return;

    try {
      const response = await fetch(`/api/invites/${inviteId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to revoke invite');

      alert('Invite revoked successfully');
      loadData();
    } catch (error) {
      console.error('Error revoking invite:', error);
      alert('Failed to revoke invite');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      const response = await fetch(`/api/workspaces/members/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to remove member');

      alert('Member removed successfully');
      loadData();
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Failed to remove member');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
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
                        <img
                          src={logoPreview}
                          alt="Logo preview"
                          className="mt-2 h-20 object-contain"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Primary Color
                      </label>
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-full h-10 border border-gray-300 dark:border-gray-600 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Secondary Color
                      </label>
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-full h-10 border border-gray-300 dark:border-gray-600 rounded-lg"
                      />
                    </div>
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
                      {members.map((member) => (
                        <div
                          key={member.user_id}
                          className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {member.user_email}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {member.role}
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
                          onClick={() => {
                            navigator.clipboard.writeText(inviteLink);
                            alert('Link copied!');
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

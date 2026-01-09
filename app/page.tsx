import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/bottom-nav';
import { WorkspaceLogo } from '@/components/workspace-logo';
import { HomeContent } from './home-content';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, workspaces(name)')
    .eq('user_id', user.id)
    .single();

  if (!member) {
    redirect('/onboarding');
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card border-b border-border safe-top z-40">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <WorkspaceLogo className="h-10 w-10 rounded-md object-contain" />
            <div>
              <h1 className="text-2xl font-bold text-primary">RelayKit</h1>
              <p className="text-sm text-muted-foreground">{member.workspaces?.name}</p>
            </div>
          </div>
        </div>
      </header>

      <HomeContent workspaceId={member.workspace_id} />

      <BottomNav />
    </div>
  );
}

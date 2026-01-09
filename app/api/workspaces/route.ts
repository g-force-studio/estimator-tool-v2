import { createClient } from '@/lib/supabase/server';
import { workspaceSchema } from '@/lib/validations';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      return NextResponse.json(
        { error: 'User already belongs to a workspace' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validated = workspaceSchema.parse(body);

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({ name: validated.name })
      .select()
      .single();

    if (workspaceError) throw workspaceError;

    const { error: memberError } = await supabase.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner',
    });

    if (memberError) throw memberError;

    const { error: brandError } = await supabase.from('workspace_brand').insert({
      workspace_id: workspace.id,
      brand_name: validated.name,
    });

    if (brandError) throw brandError;

    const { error: settingsError } = await supabase.from('workspace_settings').insert({
      workspace_id: workspace.id,
    });

    if (settingsError) throw settingsError;

    return NextResponse.json(workspace);
  } catch (error: any) {
    console.error('Workspace creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create workspace' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role, workspaces(*)')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ workspace: null });
    }

    return NextResponse.json(member.workspaces);
  } catch (error: any) {
    console.error('Workspace fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch workspace' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .single();

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validated = workspaceSchema.parse(body);

    const { data: workspace, error } = await supabase
      .from('workspaces')
      .update({ name: validated.name })
      .eq('id', member.workspace_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(workspace);
  } catch (error: any) {
    console.error('Workspace update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update workspace' },
      { status: 500 }
    );
  }
}



// import { createClient } from '@/lib/supabase/server';
// import { workspaceSchema } from '@/lib/validations';
// import { NextResponse } from 'next/server';

// export async function POST(request: Request) {
//   try {
//     const supabase = await createClient();
//     const {
//       data: { user },
//     } = await supabase.auth.getUser();

//     if (!user) {
//       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
//     }

//     const body = await request.json();
//     const validated = workspaceSchema.parse(body);

//     console.log('--- DEBUG: Starting Workspace Creation ---');

//     // 1. Try inserting the workspace
//     const { data: workspace, error: workspaceError } = await supabase
//       .from('workspaces')
//       .insert({ name: validated.name })
//       .select()
//       .single();

//     if (workspaceError) {
//       console.error('DEBUG ERROR [workspaces table]:', workspaceError);
//       return NextResponse.json({ error: `Workspaces RLS Error: ${workspaceError.message}` }, { status: 500 });
//     }

//     console.log('DEBUG SUCCESS: Workspace created with ID:', workspace.id);

//     // 2. Try inserting the member
//     const { error: memberError } = await supabase.from('workspace_members').insert({
//       workspace_id: workspace.id,
//       user_id: user.id,
//       role: 'owner',
//     });

//     if (memberError) {
//       console.error('DEBUG ERROR [workspace_members table]:', memberError);
//       return NextResponse.json({ error: `Members RLS Error: ${memberError.message}` }, { status: 500 });
//     }

//     console.log('DEBUG SUCCESS: Member added');

//     // 3. Try inserting the brand
//     const { error: brandError } = await supabase.from('workspace_brand').insert({
//       workspace_id: workspace.id,
//       brand_name: validated.name,
//     });

//     if (brandError) {
//       console.error('DEBUG ERROR [workspace_brand table]:', brandError);
//       return NextResponse.json({ error: `Brand RLS Error: ${brandError.message}` }, { status: 500 });
//     }

//     console.log('DEBUG SUCCESS: Brand added');

//     return NextResponse.json(workspace);
//   } catch (error: any) {
//     console.error('DEBUG ERROR [Unexpected]:', error);
//     return NextResponse.json(
//       { error: error.message || 'Failed to create workspace' },
//       { status: 500 }
//     );
//   }
//   console.log('DEBUG SUPABASE URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
// }

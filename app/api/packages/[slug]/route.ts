import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  try {
    const serviceClient = createServiceClient();

    const { data: pkg, error } = await serviceClient
      .from('packages')
      .select('*')
      .eq('public_slug', params.slug)
      .eq('is_public', true)
      .single();

    if (error || !pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    return NextResponse.json({
      package: {
        id: pkg.id,
        public_slug: pkg.public_slug,
        brand_header_json: pkg.brand_header_json,
        snapshot_json: pkg.snapshot_json,
        generated_at: pkg.generated_at,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch package';
    console.error('Package fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

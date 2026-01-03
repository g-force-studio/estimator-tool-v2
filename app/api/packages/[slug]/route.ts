import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/config';

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
  } catch (error: any) {
    console.error('Package fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch package' },
      { status: 500 }
    );
  }
}

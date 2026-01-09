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

    const assetPaths: Array<{ bucket: string; path: string; type: string }> = [];

    if (pkg.brand_header_json?.logo_bucket && pkg.brand_header_json?.logo_path) {
      assetPaths.push({
        bucket: pkg.brand_header_json.logo_bucket,
        path: pkg.brand_header_json.logo_path,
        type: 'logo',
      });
    }

    if (pkg.snapshot_json?.items) {
      for (const item of pkg.snapshot_json.items) {
        if (item.type === 'file' && item.content_json?.storage_bucket && item.content_json?.storage_path) {
          assetPaths.push({
            bucket: item.content_json.storage_bucket,
            path: item.content_json.storage_path,
            type: 'file',
          });
        }
      }
    }

    const signedAssets = await Promise.all(
      assetPaths.map(async (asset) => {
        try {
          const { data, error } = await serviceClient.storage
            .from(asset.bucket)
            .createSignedUrl(asset.path, SIGNED_URL_TTL_SECONDS);

          if (error) throw error;

          return {
            bucket: asset.bucket,
            path: asset.path,
            type: asset.type,
            signed_url: data.signedUrl,
            expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
          };
        } catch (err) {
          console.error(`Failed to sign ${asset.path}:`, err);
          return null;
        }
      })
    );

    const validAssets = signedAssets.filter((a) => a !== null);

    return NextResponse.json({ assets: validAssets });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to sign assets';
    console.error('Assets signing error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

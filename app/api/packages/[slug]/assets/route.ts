import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/config';

type BrandHeaderJson = {
  logo_bucket?: string;
  logo_path?: string;
};

type SnapshotItem = {
  type?: string;
  content_json?: {
    storage_bucket?: string;
    storage_path?: string;
  };
};

type SnapshotJson = {
  items?: SnapshotItem[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getBrandHeader(value: unknown): BrandHeaderJson | null {
  if (!isObject(value)) return null;
  return {
    logo_bucket: typeof value.logo_bucket === 'string' ? value.logo_bucket : undefined,
    logo_path: typeof value.logo_path === 'string' ? value.logo_path : undefined,
  };
}

function getSnapshot(value: unknown): SnapshotJson | null {
  if (!isObject(value)) return null;
  const items = Array.isArray(value.items)
    ? value.items
        .filter((item) => isObject(item))
        .map((item) => ({
          type: typeof item.type === 'string' ? item.type : undefined,
          content_json: isObject(item.content_json)
            ? {
                storage_bucket:
                  typeof item.content_json.storage_bucket === 'string'
                    ? item.content_json.storage_bucket
                    : undefined,
                storage_path:
                  typeof item.content_json.storage_path === 'string' ? item.content_json.storage_path : undefined,
              }
            : undefined,
        }))
    : undefined;

  return { items };
}

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

    const brandHeader = getBrandHeader(pkg.brand_header_json);
    if (brandHeader?.logo_bucket && brandHeader?.logo_path) {
      assetPaths.push({
        bucket: brandHeader.logo_bucket,
        path: brandHeader.logo_path,
        type: 'logo',
      });
    }

    const snapshot = getSnapshot(pkg.snapshot_json);
    if (snapshot?.items) {
      for (const item of snapshot.items) {
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

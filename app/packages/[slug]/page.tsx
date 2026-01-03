'use client';

import { useEffect, useState } from 'react';
import { cachePackage, getCachedPackage } from '@/lib/db/idb';

export default function PackagePage({ params }: { params: { slug: string } }) {
  const [pkg, setPkg] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPackage();
  }, [params.slug]);

  const loadPackage = async () => {
    try {
      const cached = await getCachedPackage(params.slug);
      if (cached) {
        setPkg(cached.package);
        setAssets(cached.assets || []);
        setLoading(false);
      }

      if (navigator.onLine) {
        const response = await fetch(`/api/packages/${params.slug}`);
        if (!response.ok) throw new Error('Package not found');

        const data = await response.json();
        setPkg(data.package);

        const assetsResponse = await fetch(`/api/packages/${params.slug}/assets`);
        if (assetsResponse.ok) {
          const assetsData = await assetsResponse.json();
          setAssets(assetsData.assets);

          await cachePackage({
            public_slug: params.slug,
            package: data.package,
            assets: assetsData.assets,
          });
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load package');
    } finally {
      setLoading(false);
    }
  };

  const getSignedUrl = (bucket: string, path: string) => {
    const asset = assets.find((a) => a.bucket === bucket && a.path === path);
    return asset?.signed_url;
  };

  const handleImageError = async () => {
    if (navigator.onLine) {
      const assetsResponse = await fetch(`/api/packages/${params.slug}/assets`);
      if (assetsResponse.ok) {
        const assetsData = await assetsResponse.json();
        setAssets(assetsData.assets);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !pkg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <p className="text-destructive text-xl">{error || 'Package not found'}</p>
        </div>
      </div>
    );
  }

  const brand = pkg.brand_header_json || {};
  const snapshot = pkg.snapshot_json || {};
  const logoUrl = brand.logo_bucket && brand.logo_path ? getSignedUrl(brand.logo_bucket, brand.logo_path) : null;

  return (
    <div className="min-h-screen bg-background">
      <header
        className="p-6 border-b"
        style={{ backgroundColor: brand.accent_color || '#3b82f6' }}
      >
        <div className="max-w-4xl mx-auto">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={brand.brand_name}
              className="h-12 mb-3"
              onError={handleImageError}
            />
          )}
          <h1 className="text-2xl font-bold text-white">{brand.brand_name}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">{snapshot.title}</h2>
          {snapshot.client_name && (
            <p className="text-muted-foreground">Client: {snapshot.client_name}</p>
          )}
        </div>

        {snapshot.description_md && (
          <div className="prose dark:prose-invert">
            <p>{snapshot.description_md}</p>
          </div>
        )}

        {snapshot.items && snapshot.items.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Items</h3>
            {snapshot.items.map((item: any, index: number) => (
              <div key={index} className="bg-card border border-border rounded-lg p-4">
                <h4 className="font-semibold mb-2">{item.title}</h4>
                {item.type === 'text' && <p className="text-sm">{item.content_json?.text}</p>}
                {item.type === 'link' && (
                  <a
                    href={item.content_json?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    {item.content_json?.url}
                  </a>
                )}
                {item.type === 'file' && item.content_json?.storage_bucket && (
                  <div>
                    {item.content_json.mime_type?.startsWith('image/') ? (
                      <img
                        src={getSignedUrl(item.content_json.storage_bucket, item.content_json.storage_path)}
                        alt={item.content_json.original_name}
                        className="max-w-full h-auto rounded"
                        onError={handleImageError}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        📎 {item.content_json.original_name}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {snapshot.totals_json && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Total</h3>
            <p className="text-2xl font-bold">${snapshot.totals_json.total || '0.00'}</p>
          </div>
        )}
      </main>

      <footer className="border-t mt-12 py-6 text-center text-sm text-muted-foreground">
        <p>Powered by RelayKit</p>
      </footer>
    </div>
  );
}

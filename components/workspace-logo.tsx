'use client';

import { useEffect, useState } from 'react';

type WorkspaceBrand = {
  brand_name?: string | null;
  logo_url?: string | null;
};

export function WorkspaceLogo({ className }: { className?: string }) {
  const [brand, setBrand] = useState<WorkspaceBrand | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadBrand = async () => {
      try {
        const response = await fetch('/api/workspaces/brand');
        if (!response.ok) return;
        const data = (await response.json()) as WorkspaceBrand;
        if (isMounted) {
          setBrand(data);
        }
      } catch (error) {
        console.error('Failed to load workspace brand:', error);
      }
    };

    loadBrand();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!brand?.logo_url) return null;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brand.logo_url}
        alt={brand.brand_name || 'Workspace logo'}
        className={className}
      />
    </>
  );
}

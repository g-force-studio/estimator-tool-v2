-- Extensions for hybrid search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- Estimate queue table
CREATE TABLE IF NOT EXISTS public.estimate_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.estimate_queue ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS estimate_queue_job_active_unique
  ON public.estimate_queue(job_id)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS estimate_queue_status_idx
  ON public.estimate_queue(status, created_at);

-- Add embeddings for hybrid search (optional)
ALTER TABLE public.pricing_materials
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

ALTER TABLE public.workspace_pricing_materials
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS pricing_materials_item_key_trgm_idx
  ON public.pricing_materials USING gin (item_key gin_trgm_ops);

CREATE INDEX IF NOT EXISTS pricing_materials_aliases_trgm_idx
  ON public.pricing_materials USING gin (aliases gin_trgm_ops);

CREATE INDEX IF NOT EXISTS workspace_pricing_materials_norm_trgm_idx
  ON public.workspace_pricing_materials USING gin (normalized_key gin_trgm_ops);

CREATE INDEX IF NOT EXISTS workspace_pricing_materials_desc_trgm_idx
  ON public.workspace_pricing_materials USING gin (description gin_trgm_ops);

-- Vector indexes (only used when embeddings are populated)
CREATE INDEX IF NOT EXISTS pricing_materials_embedding_idx
  ON public.pricing_materials USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS workspace_pricing_materials_embedding_idx
  ON public.workspace_pricing_materials USING ivfflat (embedding vector_cosine_ops);

-- Dequeue the next estimate job (worker uses SKIP LOCKED for concurrency)
CREATE OR REPLACE FUNCTION public.dequeue_estimate_job()
RETURNS TABLE (
  id UUID,
  job_id UUID,
  workspace_id UUID,
  attempts INTEGER,
  max_attempts INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH next_job AS (
    SELECT id
    FROM public.estimate_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.estimate_queue
  SET
    status = 'running',
    attempts = attempts + 1,
    locked_at = NOW(),
    updated_at = NOW()
  WHERE id IN (SELECT id FROM next_job)
  RETURNING estimate_queue.id, estimate_queue.job_id, estimate_queue.workspace_id,
            estimate_queue.attempts, estimate_queue.max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hybrid pricing candidate search (vector + trigram)
CREATE OR REPLACE FUNCTION public.search_pricing_candidates(
  query_text TEXT,
  query_embedding vector(1536),
  trade TEXT,
  workspace_id UUID,
  workspace_pricing_id UUID,
  customer_id UUID,
  limit_count INTEGER DEFAULT 60
)
RETURNS TABLE (
  source TEXT,
  item_key TEXT,
  description TEXT,
  unit TEXT,
  unit_cost NUMERIC,
  unit_price NUMERIC,
  score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH params AS (
    SELECT
      lower(regexp_replace(coalesce(query_text, ''), '[^a-z0-9]+', ' ', 'g')) AS normalized_query
  ),
  customer_rows AS (
    SELECT
      'customer'::text AS source,
      wpm.description AS item_key,
      wpm.description,
      wpm.unit,
      wpm.unit_cost,
      NULL::numeric AS unit_price,
      similarity(wpm.normalized_key, params.normalized_query) AS trigram_score,
      CASE
        WHEN query_embedding IS NOT NULL AND wpm.embedding IS NOT NULL
          THEN 1 - (wpm.embedding <=> query_embedding)
        ELSE 0
      END AS vector_score
    FROM public.workspace_pricing_materials wpm, params
    WHERE wpm.workspace_id = search_pricing_candidates.workspace_id
      AND wpm.workspace_pricing_id = search_pricing_candidates.workspace_pricing_id
      AND wpm.trade = search_pricing_candidates.trade
      AND wpm.customer_id = search_pricing_candidates.customer_id
  ),
  workspace_rows AS (
    SELECT
      'workspace'::text AS source,
      wpm.description AS item_key,
      wpm.description,
      wpm.unit,
      wpm.unit_cost,
      NULL::numeric AS unit_price,
      similarity(wpm.normalized_key, params.normalized_query) AS trigram_score,
      CASE
        WHEN query_embedding IS NOT NULL AND wpm.embedding IS NOT NULL
          THEN 1 - (wpm.embedding <=> query_embedding)
        ELSE 0
      END AS vector_score
    FROM public.workspace_pricing_materials wpm, params
    WHERE wpm.workspace_id = search_pricing_candidates.workspace_id
      AND wpm.workspace_pricing_id = search_pricing_candidates.workspace_pricing_id
      AND wpm.trade = search_pricing_candidates.trade
      AND wpm.customer_id IS NULL
  ),
  catalog_rows AS (
    SELECT
      'catalog'::text AS source,
      pm.item_key,
      pm.item_key AS description,
      pm.unit,
      NULL::numeric AS unit_cost,
      pm.unit_price,
      similarity(
        lower(regexp_replace(coalesce(pm.item_key, '') || ' ' || coalesce(pm.aliases, '') || ' ' || coalesce(pm.category, ''), '[^a-z0-9]+', ' ', 'g')),
        params.normalized_query
      ) AS trigram_score,
      CASE
        WHEN query_embedding IS NOT NULL AND pm.embedding IS NOT NULL
          THEN 1 - (pm.embedding <=> query_embedding)
        ELSE 0
      END AS vector_score
    FROM public.pricing_materials pm, params
    WHERE pm.trade::text = search_pricing_candidates.trade
  )
  SELECT
    source,
    item_key,
    description,
    unit,
    unit_cost,
    unit_price,
    (vector_score * 0.6 + trigram_score * 0.4) AS score
  FROM (
    SELECT * FROM customer_rows
    UNION ALL
    SELECT * FROM workspace_rows
    UNION ALL
    SELECT * FROM catalog_rows
  ) combined
  WHERE (trigram_score > 0.1 OR vector_score > 0.1)
  ORDER BY score DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

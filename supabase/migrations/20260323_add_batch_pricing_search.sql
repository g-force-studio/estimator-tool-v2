-- Batch pricing candidate search: single round-trip for all materials in an estimate.
-- Replaces N sequential search_pricing_candidates calls with one query.
-- Uses LATERAL join on pricing_materials so Postgres can use the GIN trigram index per input.

CREATE OR REPLACE FUNCTION public.search_pricing_candidates_batch(
  query_texts        TEXT[],
  query_embeddings   TEXT[],       -- parallel array of vector JSON strings; NULL elements or NULL array = no vector search
  p_trade            TEXT,
  p_workspace_id     UUID,
  p_workspace_pricing_id UUID,     -- NULL → skip workspace/customer rows
  p_customer_id      UUID,         -- NULL → skip customer override rows
  limit_per_item     INTEGER DEFAULT 1
)
RETURNS TABLE (
  input_idx   INTEGER,
  source      TEXT,
  item_key    TEXT,
  description TEXT,
  unit        TEXT,
  unit_cost   NUMERIC,
  unit_price  NUMERIC,
  score       NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH inputs AS (
    -- Unpack query array, compute normalised form and cast embedding once per row.
    SELECT
      (row_num - 1)::integer AS input_idx,
      lower(regexp_replace(qt, '[^a-z0-9]+', ' ', 'g')) AS normalized_query,
      CASE
        WHEN query_embeddings IS NOT NULL
          AND array_length(query_embeddings, 1) >= row_num::int
          AND query_embeddings[row_num] IS NOT NULL
        THEN (query_embeddings[row_num])::vector(1536)
        ELSE NULL::vector(1536)
      END AS embedding
    FROM UNNEST(query_texts) WITH ORDINALITY AS t(qt, row_num)
  ),

  -- Customer-specific workspace pricing (small table → cross join is fine)
  customer_rows AS (
    SELECT
      i.input_idx,
      'customer'::text                                                           AS source,
      wpm.description                                                            AS item_key,
      wpm.description,
      wpm.unit,
      wpm.unit_cost,
      NULL::numeric                                                              AS unit_price,
      similarity(wpm.normalized_key, i.normalized_query)                        AS trigram_score,
      CASE
        WHEN i.embedding IS NOT NULL AND wpm.embedding IS NOT NULL
          THEN (1 - (wpm.embedding <=> i.embedding))::numeric
        ELSE 0::numeric
      END                                                                        AS vector_score
    FROM inputs i
    CROSS JOIN public.workspace_pricing_materials wpm
    WHERE wpm.workspace_id        = p_workspace_id
      AND wpm.workspace_pricing_id = p_workspace_pricing_id
      AND wpm.trade               = p_trade
      AND wpm.customer_id         = p_customer_id
  ),

  -- Workspace-level pricing without customer override (small table → cross join is fine)
  workspace_rows AS (
    SELECT
      i.input_idx,
      'workspace'::text                                                          AS source,
      wpm.description                                                            AS item_key,
      wpm.description,
      wpm.unit,
      wpm.unit_cost,
      NULL::numeric                                                              AS unit_price,
      similarity(wpm.normalized_key, i.normalized_query)                        AS trigram_score,
      CASE
        WHEN i.embedding IS NOT NULL AND wpm.embedding IS NOT NULL
          THEN (1 - (wpm.embedding <=> i.embedding))::numeric
        ELSE 0::numeric
      END                                                                        AS vector_score
    FROM inputs i
    CROSS JOIN public.workspace_pricing_materials wpm
    WHERE wpm.workspace_id        = p_workspace_id
      AND wpm.workspace_pricing_id = p_workspace_pricing_id
      AND wpm.trade               = p_trade
      AND wpm.customer_id IS NULL
  ),

  -- Global catalog (potentially large).
  -- LATERAL lets Postgres execute one GIN index scan per input row instead of
  -- a full table scan shared across all inputs.
  catalog_rows AS (
    SELECT
      i.input_idx,
      'catalog'::text                                                            AS source,
      pm.item_key,
      pm.item_key                                                                AS description,
      pm.unit,
      NULL::numeric                                                              AS unit_cost,
      pm.unit_price,
      similarity(
        lower(regexp_replace(
          coalesce(pm.item_key, '') || ' ' ||
          coalesce(pm.aliases,  '') || ' ' ||
          coalesce(pm.category, ''),
          '[^a-z0-9]+', ' ', 'g'
        )),
        i.normalized_query
      )                                                                          AS trigram_score,
      CASE
        WHEN i.embedding IS NOT NULL AND pm.embedding IS NOT NULL
          THEN (1 - (pm.embedding <=> i.embedding))::numeric
        ELSE 0::numeric
      END                                                                        AS vector_score
    FROM inputs i
    CROSS JOIN LATERAL (
      -- similarity() > 0.1 on item_key uses the GIN trigram index per outer row.
      SELECT pm_i.item_key, pm_i.unit, pm_i.unit_price, pm_i.aliases, pm_i.category, pm_i.embedding
      FROM public.pricing_materials pm_i
      WHERE pm_i.trade::text = p_trade
        AND similarity(pm_i.item_key, i.normalized_query) > 0.1
      LIMIT 30
    ) pm
  ),

  all_candidates AS (
    SELECT
      input_idx, source, item_key, description, unit, unit_cost, unit_price,
      (vector_score * 0.6 + trigram_score * 0.4) AS combined_score
    FROM (
      SELECT * FROM customer_rows
      UNION ALL
      SELECT * FROM workspace_rows
      UNION ALL
      SELECT * FROM catalog_rows
    ) combined
    WHERE trigram_score > 0.1 OR vector_score > 0.1
  ),

  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY input_idx ORDER BY combined_score DESC) AS rn
    FROM all_candidates
  )

  SELECT input_idx, source, item_key, description, unit, unit_cost, unit_price, combined_score
  FROM ranked
  WHERE rn <= limit_per_item;
END;
$$;


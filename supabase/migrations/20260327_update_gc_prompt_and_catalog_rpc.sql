-- 1. RPC to fetch catalog category samples for prompt injection.
--    Returns up to `samples_per_category` item_keys per category for a given trade.
--    Used by estimate-worker to build the PRICING CATALOG REFERENCE section of the prompt.

CREATE OR REPLACE FUNCTION public.get_catalog_category_samples(
  p_trade             TEXT,
  samples_per_category INTEGER DEFAULT 3
)
RETURNS TABLE (category TEXT, item_key TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT category, item_key
  FROM (
    SELECT
      coalesce(nullif(trim(pm.category), ''), 'General') AS category,
      pm.item_key,
      ROW_NUMBER() OVER (
        PARTITION BY coalesce(nullif(trim(pm.category), ''), 'General')
        ORDER BY pm.item_key
      ) AS rn
    FROM public.pricing_materials pm
    WHERE pm.trade::text = p_trade
  ) ranked
  WHERE rn <= samples_per_category
  ORDER BY category, item_key;
$$;


-- 2. Insert updated general_contractor prompt template (version 2).
--    Tells the AI about the catalog naming convention and that a reference is injected.

INSERT INTO public.prompt_templates (trade, name, system_prompt, active, version)
VALUES (
  'general_contractor',
  'default',
  $gc$
You are a residential GENERAL CONTRACTOR estimator. Output strict JSON only.

GOAL
- Produce a practical draft estimate from the provided job details, Scope Summary, Job Summary, and photos.
- Focus on clear scope definition, realistic labor, and materials drawn from the pricing catalog.

PRICING RULES (STRICT)
- Do NOT invent material prices. Set ALL "estimate.materials[].cost" values to 0.
- The server will look up prices from the pricing catalog using your item names.
- A PRICING CATALOG REFERENCE is included in the user message. It lists available categories and example item names.
- Use item names that match the catalog format as closely as possible.
- The catalog uses uppercase names with spaces between dimensions (e.g. "2 X 4 X 8", "1/2 DRYWALL 4X8", "3/4 PLYWOOD 4X8").
- If a needed item is not in the catalog, describe it clearly using the same naming convention.

SCOPE RULES
- Cover the likely scope implied by the job details and photos.
- Prefer describing work in clear, customer-friendly language.
- Call out major exclusions and assumptions in jobNotes.

OUTPUT FORMAT (JSON ONLY)
Return exactly one JSON object with this shape and no extra keys:
{
  "client": {
    "customerName": string,
    "customerEmail": string,
    "address": string,
    "phone": string,
    "preferredDate": string
  },
  "estimate": {
    "estimateNumber": string,
    "project": string,
    "jobDescription": string,
    "jobNotes": string,
    "labor": [{ "task": string, "hours": number }],
    "materials": [{ "item": string, "qty": number, "cost": number }]
  },
  "image_analysis": [{ "image_url": string, "observations": string }]
}

RULES
- jobDescription must be a concise Scope Summary.
- jobNotes must include a short Job Summary followed by key assumptions and missing information.
- Labor hours must be realistic and non-zero when work is described.
- materials[].qty must be numeric.
- materials[].cost must always be 0.
$gc$,
  TRUE,
  2
)
ON CONFLICT (trade, name, version) DO UPDATE
  SET system_prompt = EXCLUDED.system_prompt,
      active = TRUE;


-- 3. Update existing default general_contractor ai_reference_configs to use the new prompt.
--    Only updates configs where is_default = TRUE and trade = 'general_contractor',
--    which are the auto-generated ones (not custom workspace overrides).

UPDATE public.ai_reference_configs
SET system_prompt = (
  SELECT system_prompt
  FROM public.prompt_templates
  WHERE trade = 'general_contractor' AND name = 'default'
  ORDER BY version DESC
  LIMIT 1
)
WHERE trade = 'general_contractor'
  AND is_default = TRUE;

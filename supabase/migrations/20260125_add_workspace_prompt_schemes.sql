CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspaces'
      AND column_name = 'trade'
  ) THEN
    ALTER TABLE public.workspaces
      ADD COLUMN trade TEXT NOT NULL DEFAULT 'general_contractor'
      CHECK (trade IN ('plumbing', 'electrical', 'hvac', 'general_contractor'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade TEXT NOT NULL CHECK (trade IN ('plumbing', 'electrical', 'hvac', 'general_contractor')),
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS prompt_templates_trade_name_version_unique
  ON public.prompt_templates(trade, name, version);

CREATE TABLE IF NOT EXISTS public.ai_reference_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  trade TEXT NOT NULL CHECK (trade IN ('plumbing', 'electrical', 'hvac', 'general_contractor')),
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_reference_configs'
  ) THEN
    ALTER TABLE public.ai_reference_configs
      ADD COLUMN IF NOT EXISTS trade TEXT;
    ALTER TABLE public.ai_reference_configs
      ADD COLUMN IF NOT EXISTS system_prompt TEXT;
    ALTER TABLE public.ai_reference_configs
      ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.ai_reference_configs
      DROP COLUMN IF EXISTS config_json;
    ALTER TABLE public.ai_reference_configs
      DROP COLUMN IF EXISTS is_active;

    UPDATE public.ai_reference_configs
    SET trade = COALESCE(trade, 'general_contractor');

    UPDATE public.ai_reference_configs
    SET system_prompt = COALESCE(system_prompt, '');

    ALTER TABLE public.ai_reference_configs
      ALTER COLUMN trade SET NOT NULL,
      ALTER COLUMN system_prompt SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_reference_configs_workspace_id_idx
  ON public.ai_reference_configs(workspace_id);

CREATE INDEX IF NOT EXISTS ai_reference_configs_workspace_trade_idx
  ON public.ai_reference_configs(workspace_id, trade);

CREATE UNIQUE INDEX IF NOT EXISTS ai_reference_configs_one_default_per_workspace
  ON public.ai_reference_configs(workspace_id)
  WHERE is_default = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspaces'
      AND column_name = 'default_ai_reference_config_id'
  ) THEN
    ALTER TABLE public.workspaces
      ADD COLUMN default_ai_reference_config_id UUID NULL REFERENCES public.ai_reference_configs(id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_ai_reference_configs_updated_at ON public.ai_reference_configs;
CREATE TRIGGER update_ai_reference_configs_updated_at
  BEFORE UPDATE ON public.ai_reference_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reference_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view prompt templates" ON public.prompt_templates;
CREATE POLICY "Authenticated users can view prompt templates"
  ON public.prompt_templates
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Members can view AI reference configs" ON public.ai_reference_configs;
CREATE POLICY "Members can view AI reference configs"
  ON public.ai_reference_configs
  FOR SELECT
  USING (public.is_member_of(workspace_id));

DROP POLICY IF EXISTS "Admins can update AI reference configs" ON public.ai_reference_configs;
CREATE POLICY "Admins can update AI reference configs"
  ON public.ai_reference_configs
  FOR UPDATE
  USING (public.is_admin_of(workspace_id));

DROP POLICY IF EXISTS "Service role can insert AI reference configs" ON public.ai_reference_configs;
CREATE POLICY "Service role can insert AI reference configs"
  ON public.ai_reference_configs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

WITH templates AS (
  SELECT *
  FROM (VALUES
    (
      'plumbing'::TEXT,
      'default',
      $plumbing$
You are a residential PLUMBING estimator. Output strict JSON only.

GOAL
- Produce a plumbing-only estimate from the provided job details, Scope Summary, Job Summary, and photos.
- Identify required plumbing materials and labor realistically.

PRICING RULES (STRICT)
- Do NOT invent material prices.
- Set ALL "estimate.materials[].cost" values to 0.
- The server will overwrite material pricing using pricing_materials for the workspace and trade.
- Choose material names that map cleanly to pricing_materials.item_key or pricing_materials.aliases.
- If unsure, still include the item and note it in estimate.jobNotes using: "MISSING PRICE: <item>".

SCOPE RULES
Include plumbing scope only, such as:
- Fixture remove/replace (faucets, toilets, shower valves/trim, tub spouts, showerheads)
- Supply lines, stops, angle valves, p-traps, drain assemblies
- Shower valve rough-in, cartridge/trim, diverter, mixing valve changes
- Testing, leak checks, caulk/silicone at plumbing penetrations
- Disposal of plumbing debris (plumbing only)

Exclude / do NOT estimate:
- Tile, backer board, waterproofing membranes, grout, thinset
- Drywall, framing, paint
- Cabinets/vanity carpentry (unless explicitly "connect plumbing only")
- Electrical

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
$plumbing$
    ),
    (
      'general_contractor'::TEXT,
      'default',
      $gc$
You are a residential GENERAL CONTRACTOR estimator. Output strict JSON only.

GOAL
- Produce a practical draft estimate from the provided job details, Scope Summary, Job Summary, and photos.
- Focus on clear scope definition, realistic labor, and materials suitable for later pricing.

PRICING RULES (STRICT)
- Do NOT invent material prices.
- Set ALL "estimate.materials[].cost" values to 0.
- The server will overwrite material pricing using pricing_materials for the workspace and trade when available.
- Choose material names that map cleanly to pricing_materials.item_key or pricing_materials.aliases.
- If unsure, still include the item and note it in estimate.jobNotes using: "MISSING PRICE: <item>".

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
$gc$
    )
  ) AS v(trade, name, system_prompt)
)
INSERT INTO public.prompt_templates (trade, name, system_prompt, active, version)
SELECT trade, name, system_prompt, TRUE, 1
FROM templates
ON CONFLICT (trade, name, version) DO UPDATE
SET system_prompt = EXCLUDED.system_prompt,
    active = TRUE;

CREATE OR REPLACE FUNCTION public.backfill_workspace_ai_reference_configs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ws RECORD;
  template RECORD;
  new_config_id UUID;
BEGIN
  FOR ws IN
    SELECT id, trade
    FROM public.workspaces
    WHERE default_ai_reference_config_id IS NULL
  LOOP
    SELECT id, name, system_prompt, trade
    INTO template
    FROM public.prompt_templates
    WHERE trade = ws.trade AND active = TRUE
    ORDER BY version DESC, created_at DESC
    LIMIT 1;

    IF template.id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.ai_reference_configs (workspace_id, trade, name, system_prompt, is_default)
    VALUES (ws.id, template.trade, template.name, template.system_prompt, TRUE)
    RETURNING id INTO new_config_id;

    UPDATE public.workspaces
    SET default_ai_reference_config_id = new_config_id
    WHERE id = ws.id;
  END LOOP;
END;
$$;

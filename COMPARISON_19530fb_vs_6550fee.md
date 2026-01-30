Comparison: 19530fb → 6550fee

Scope
- This file lists changes introduced after commit 19530fb, grouped by commit.
- Use this to cherry-pick or re-implement specific features after reverting.

Commits after 19530fb (newest → oldest)

6550fee Update project notes and state
- Files: NOTES.md, code_state.txt
- Notes/state only. Safe to ignore for functionality.

d71d83a Improve pricing alias matching
- File: app/api/jobs/[id]/estimate/route.ts
- Change: Alias parsing now splits on commas AND semicolons; snake_case tokens normalized for matching.
- Effect: Improves match rate when aliases are semicolon-delimited or items are snake_case.

0ada82c Allow GC pricing lookup across trades
- File: app/api/jobs/[id]/estimate/route.ts
- Change: When prompt trade = general_contractor, pricing_materials catalog and price lookup query drop trade filter.
- Effect: General contractor estimates can pull defaults across all trades.

04a7a7c Merge default pricing with workspace overrides
- File: app/api/jobs/[id]/estimate/route.ts
- Change: Merge pricing sources with override priority:
  - customer workspace_pricing_materials
  - workspace workspace_pricing_materials
  - pricing_materials defaults
- Also changes catalog generation to merge customer/workspace/default.
- Effect: Missing items fall back to defaults; overrides take precedence.

b4aa30d Update notes and code state
- Files: NOTES.md, code_state.txt
- Notes/state only. Safe to ignore for functionality.

79d183b Sync job estimate fields in schema and types
- Files: supabase/schema.sql, lib/supabase/database.types.ts
- Change: Adds/syncs jobs.estimate_status and jobs.estimated_at in schema/types.
- Effect: Schema/type alignment for estimate metadata.

628200b Update notes and code state
- Files: NOTES.md, code_state.txt
- Notes/state only.

9a56a81 Fix lint warnings in estimate and job views
- Files: app/api/jobs/[id]/estimate/route.ts, app/jobs/[id]/page.tsx
- Change: Lint cleanup only (no intended behavior change).

276f20f Fix pricing import insert typing
- File: app/api/pricing-materials/import/route.ts
- Change: Typed batch insert fix for pricing import.
- Effect: Fixes TypeScript/build error for import endpoint.

874ada0 Allow import token for pricing CSV uploads
- File: app/api/pricing-materials/import/route.ts
- Change: Adds x-import-token auth path for CSV import (avoids cookies/JWT).
- Effect: Enables CLI/automation imports.

cba830f Add customers, workspace pricing import, and overrides
- Files:
  - supabase/migrations/20260128_add_customers_and_workspace_pricing_materials.sql
  - supabase/schema.sql
  - lib/supabase/database.types.ts
  - app/api/customers/route.ts
  - app/api/jobs/[id]/customer/route.ts
  - app/api/pricing-materials/import/route.ts
  - app/api/jobs/[id]/estimate/route.ts
  - app/home-content.tsx
  - app/jobs/[id]/page.tsx
  - lib/prompts.ts
- Changes:
  - New customers table, job.customer_id, workspace_pricing_materials.
  - Prompt selection now supports customer-specific ai_reference_configs.
  - Estimate pipeline uses workspace/customer pricing overrides.
  - New pricing import API endpoint.
- Effect: Enables customer-specific prompts and workspace-level pricing overrides.

Behavioral deltas vs 19530fb

Pricing matching
- 19530fb: Single-source pricing_materials per trade/workspace; smaller catalogs matched more cleanly.
- 6550fee: Multiple sources (customer/workspace/default), alias splitting, snake_case normalization, and GC cross-trade defaults.

Prompt selection
- 19530fb: Workspace default prompt only.
- 6550fee: Customer overrides + prompt trade can come from ai_reference_configs, not just workspace trade.

New data model
- 19530fb: No customers table or workspace_pricing_materials.
- 6550fee: Adds customers + workspace_pricing_materials and links jobs to customers.

How to re-apply features after reverting to 19530fb

Pick only desired commits (recommended order):
1) cba830f (customers + overrides + import pipeline)
2) 874ada0 (import token auth)
3) 276f20f (import typing fix)
4) 79d183b (schema/types sync)
5) 04a7a7c / 0ada82c / d71d83a (pricing merge + GC cross-trade + alias fix)

Notes
- If you revert code but keep DB migrations, features will disappear but DB tables/data remain.
- Large catalogs (20k+ rows) will reduce matching accuracy unless retrieval/matching is tightened.

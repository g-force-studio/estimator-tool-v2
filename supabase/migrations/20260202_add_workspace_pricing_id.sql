alter table public.workspaces
add column if not exists workspace_pricing_id uuid;

alter table public.workspace_pricing_materials
add column if not exists workspace_pricing_id uuid;

create index if not exists workspace_pricing_materials_pricing_id_idx
  on public.workspace_pricing_materials(workspace_pricing_id);

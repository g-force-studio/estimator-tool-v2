alter table public.jobs
add column if not exists error_message text;

alter table public.jobs
add column if not exists estimate_status text;

alter table public.jobs
add column if not exists estimated_at timestamptz;

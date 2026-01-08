# System Architecture

RelayKit is a mobile-first estimator app built on Next.js with Supabase for auth, database, and storage. The system favors deterministic outputs for estimates by generating PDFs server-side via Edge Functions, while keeping a lightweight client and explicit status transitions for jobs.

The backend is split between application APIs (Next.js routes) and operational workflows (Supabase Edge Functions + n8n). Jobs move through well-defined states as AI outputs and PDFs are produced, with artifacts stored in Supabase Storage and linked back to job records.

## Components
- Frontend: Next.js app (App Router) with mobile-first UI
- Backend: Next.js API routes + Supabase Edge Functions
- DB: Supabase Postgres (jobs, job_inputs, ai_outputs, job_files, etc.)
- Storage: Supabase Storage (job assets, workspace logos, estimates PDFs)
- Workflows: n8n for AI estimation + notifications
- PDF generation: Edge Function using pdf-lib for deterministic output
- Auth: Supabase Auth (JWT in Edge Functions)

## Data Flow Diagrams (text)

Estimate creation flow:
1) User creates job (client + details) → `jobs` row + `job_inputs`.
2) Submit triggers n8n listener → call `run-ai` with job_id.
3) `run-ai` writes `ai_outputs` → updates job.status to `ai_ready`.
4) n8n triggers `generate-pdf` → uploads PDF → job.status `complete`.
5) Frontend reads job + pdf_url/signed URL and displays link.

Invoice creation flow:
1) User selects completed job → initiates invoice action.
2) Backend creates invoice record (future) → PDF generated.
3) Invoice PDF stored in Storage → link surfaced in UI.

Photo upload + AI analysis flow:
1) User uploads photos → stored in `job-assets` bucket.
2) Client queues uploads when offline, syncs when online.
3) n8n or Edge Function fetches photo URLs for AI analysis.

PDF generation + delivery flow:
1) `generate-pdf` reads job + ai_outputs.
2) PDF generated deterministically with pdf-lib.
3) PDF uploaded to `estimates/{job_id}/{timestamp}.pdf`.
4) `job_files` + `jobs.pdf_url` updated.
5) n8n sends email/notifications with PDF link.

## Data Models (key tables)
- jobs: id, title, client_name, due_date, status, created_by_user_id, created_at, updated_at, pdf_url, error_message
- job_inputs: job_id, raw_input_json, created_at
- ai_outputs: job_id, ai_json, created_at
- job_files: job_id, kind, storage_path, public_url, created_at
- workspace_members: workspace_id, user_id, role

## Key Constraints & Non-goals
- Deterministic PDF output (no headless browsers).
- Job status transitions are explicit; avoid implicit “magic” states.
- Non-goal: full accounting/invoicing suite (future).

## Security & Privacy Considerations
- RLS on all tables; service-role used only in controlled Edge Functions.
- Private storage buckets use signed URLs with TTL.
- Public bucket option allowed for PDFs when acceptable.

## Deployment Environments & Config Notes
- Supabase project (DB, Auth, Storage, Edge Functions).
- Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ESTIMATES_BUCKET, ESTIMATES_BUCKET_PUBLIC.
- n8n webhook endpoints are external and should be versioned per environment.

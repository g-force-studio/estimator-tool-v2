# Project Notes & Timeline

Use this file to capture decisions, changes, and open questions after each working session. Append new session entries; do not rewrite past entries.

## Session Entry Template
- Date/Time (YYYY-MM-DD HH:MM), Session Goal:
- What changed:
  - 
- Decisions made:
  - 
- Open questions / risks:
  - 
- Next actions:
  - [ ] 

## Session Timeline
- Date/Time (2026-01-07 08:32), Session Goal: Initialize project memory system
  - What changed:
    - Added NOTES.md, ARCHITECTURE.md, code_state.txt
  - Decisions made:
    - Use NOTES.md for append-only session logs
  - Open questions / risks:
    - None
  - Next actions:
    - [ ] Populate code_state.txt after next work session
- Date/Time (2026-01-07 08:40), Session Goal: Add estimation pipeline scaffolding and UI icons
  - What changed:
    - Added schema updates for job status state machine and new tables (job_inputs, ai_outputs, job_files)
    - Added Edge Functions for create-job, run-ai, generate-pdf, and pdf-link
    - Updated job status enums in validation and UI
    - Added PDF link handling in job list/detail and replaced emojis with icons
    - Updated storage notes for estimates bucket
  - Decisions made:
    - Use Edge Functions + pdf-lib for deterministic PDFs
    - Store PDFs under estimates/{job_id}/{timestamp}.pdf
  - Open questions / risks:
    - n8n workflow and function deployment still pending
    - Existing jobs may have legacy statuses not in new enum
  - Next actions:
    - [ ] Wire Submit to n8n listener with job input payload
    - [ ] Confirm PDF bucket privacy strategy (public vs signed)
    - [ ] Run end-to-end test once functions are deployed
- Date/Time (2026-01-07 12:45), Session Goal: Wire n8n submit + resolve legacy job status issue
  - What changed:
    - Added n8n webhook config (hybrid override + env) and Submit webhook POST
    - Added migration to update jobs_status_check and normalize legacy status values
  - Decisions made:
    - Use hybrid webhook URL configuration (override + env)
    - Map legacy `active` status to `ai_pending`
  - Open questions / risks:
    - Migration still needs to be run in Supabase
    - Confirm n8n webhook auth (if required) and environment URL
  - Next actions:
    - [ ] Run `supabase/migrations/20260107_normalize_job_statuses.sql` in Supabase
    - [ ] Set `NEXT_PUBLIC_N8N_WEBHOOK_URL` (or toggle override) and re-test Submit
    - [ ] Verify n8n workflow processes payload end-to-end
- Date/Time (2026-01-07 20:05), Session Goal: Fix delete failures + finalize status migration
  - What changed:
    - Updated migration to add missing delete RLS policy on jobs
    - Added then removed temporary DELETE debug output
  - Decisions made:
    - Enforce delete policy via migration file for consistency
  - Open questions / risks:
    - Ensure migration ran in the correct Supabase environment
  - Next actions:
    - [ ] Verify Submit flow after status constraint fix and policy update
    - [ ] Address templates import error in app/templates/page.tsx
- Date/Time (2026-01-07 20:35), Session Goal: Stabilize auth UX, templates cache, and members display
  - What changed:
    - Added sign-out action in Settings and cleaned members list presentation
    - Fixed templates list import error by using cached templates helper
    - Added profiles table + RLS for member email display
    - Removed Jobs tab from bottom nav
  - Decisions made:
    - Use profiles table in public schema to surface member emails securely
  - Open questions / risks:
    - Profiles migration must be run in Supabase to show emails
  - Next actions:
    - [ ] Run `supabase/migrations/20260107_add_profiles.sql` in Supabase
    - [ ] Verify members list shows email + badges
    - [ ] Re-test Submit → n8n flow end-to-end
- Date/Time (2026-01-08 21:01), Session Goal: Fix photo persistence, branding visibility, labor rates, and form performance
  - What changed:
    - Added job photo persistence via job_files with storage fallback and photo links in job detail
    - Normalized edit form values to avoid save blocking on nulls; disabled submit after submission and redirect to home
    - Added workspace logo rendering in home/jobs headers
    - Added labor rate fields (workspace default + job), updated validation/types, and included rates in n8n payload
    - Improved job create/edit performance by uploading photos asynchronously
    - Added migration for labor_rate columns
  - Decisions made:
    - Use workspace_brand for default labor_rate and job-level override for selection
    - Allow storage listing fallback when job_files table is missing
  - Open questions / risks:
    - Ensure `job_files` table exists in Supabase and RLS policies are applied
    - Run labor_rate migration in Supabase
  - Next actions:
    - [ ] Run `supabase/migrations/20260108_add_labor_rates.sql` in Supabase
    - [ ] Verify new jobs include labor_rate and n8n payload has labor_rate/workspace_labor_rate
    - [ ] Confirm photos persist via job_files once table exists

- Date/Time (2026-01-09 10:30), Session Goal: Enable line items on jobs + save job items as templates
  - What changed:
    - Added line item UI for new/edit job with empty default and template save action via kebab menu
    - Added template save flow from job line items (online + offline queue)
    - Persisted line items via job_items using new line_item type; updated job create/update APIs
    - Added migration and schema update for job_items line_item type; updated types/validation
  - Decisions made:
    - Use job_items with explicit line_item type (migration) for long-term modeling
    - Keep template items stored in templates.template_items_json
  - Open questions / risks:
    - Ensure new migration is applied in Supabase and clients pick up the updated job_items CHECK constraint
  - Next actions:
    - [ ] Run `supabase/migrations/20260109_add_line_item_job_items.sql` in Supabase
    - [ ] Create/edit a job with line items, then save as template and confirm it appears in Templates
    - [ ] Confirm job detail view shows line items and total

- Date/Time (2026-01-09 11:10), Session Goal: Commit changes and attempt push
  - What changed:
    - Committed line item + template flow changes and prior workspace/labor/uploads updates
    - Attempted `git push` but blocked by network restriction
  - Decisions made:
    - None
  - Open questions / risks:
    - Push to GitHub still pending due to network access restrictions
  - Next actions:
    - [ ] Retry `git push` with network access enabled

## Running TODO (prioritized)
1) Wire n8n estimate workflow end-to-end (request, AI output, PDF, job updates)
2) Add job estimate summary + PDF link in list/detail UI
3) Add robust error surfacing for ai_error/pdf_error states

## Known Issues
- Issue: Job status enum mismatch across UI/back end in older data
  - Repro: Existing jobs with deprecated status values may fail validation after status enum change
  - Status: Open

## Workflow Notes
- Before `/reset`, ask Codex to summarize into `code_state.txt`.
- After `/reset`, start by reading `ARCHITECTURE.md` + `code_state.txt`.

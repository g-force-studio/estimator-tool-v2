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

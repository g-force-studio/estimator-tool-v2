ALTER TABLE job_items
  DROP CONSTRAINT IF EXISTS job_items_type_check;

ALTER TABLE job_items
  ADD CONSTRAINT job_items_type_check
  CHECK (type IN ('text', 'link', 'file', 'checklist', 'line_item'));

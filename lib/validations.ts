import { z } from 'zod';

export const workspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100),
});

export const workspaceCreateSchema = workspaceSchema.extend({
  trade: z.enum(['plumbing', 'electrical', 'hvac', 'general_contractor']),
});

export const workspaceBrandSchema = z.object({
  brand_name: z.string().min(1, 'Brand name is required').max(100),
  accent_color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format').optional(),
  labor_rate: z.preprocess(
    (value) => {
      if (value === '' || value === null || value === undefined) return undefined;
      const num = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(num) ? num : undefined;
    },
    z.number().min(0, 'Labor rate must be zero or higher').optional()
  ),
});

export const workspaceSettingsSchema = z.object({
  tax_rate_percent: z.preprocess(
    (value) => {
      if (value === '' || value === null || value === undefined) return undefined;
      const num = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(num) ? num : undefined;
    },
    z.number().min(0, 'Tax rate must be zero or higher').optional()
  ),
  markup_percent: z.preprocess(
    (value) => {
      if (value === '' || value === null || value === undefined) return undefined;
      const num = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(num) ? num : undefined;
    },
    z.number().min(0, 'Markup must be zero or higher').optional()
  ),
  hourly_rate: z.preprocess(
    (value) => {
      if (value === '' || value === null || value === undefined) return undefined;
      const num = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(num) ? num : undefined;
    },
    z.number().min(0, 'Hourly rate must be zero or higher').optional()
  ),
});

export const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member']),
});

export const jobSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  status: z.enum([
    'draft',
    'ai_pending',
    'ai_ready',
    'pdf_pending',
    'complete',
    'ai_error',
    'pdf_error',
  ]).default('draft'),
  due_date: z.string().optional(),
  client_name: z.string().max(200).optional(),
  description_md: z.string().optional(),
  template_id: z.string().uuid().optional(),
  labor_rate: z.preprocess(
    (value) => {
      if (value === '' || value === null || value === undefined) return undefined;
      const num = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(num) ? num : undefined;
    },
    z.number().min(0, 'Labor rate must be zero or higher').optional()
  ),
});

export const jobItemSchema = z.object({
  type: z.enum(['text', 'link', 'file', 'checklist', 'line_item']),
  title: z.string().min(1, 'Title is required').max(200),
  content_json: z.any(),
  order_index: z.number().int().min(0),
});

export const lineItemSchema = z.object({
  name: z.string().min(1, 'Item name is required').max(200),
  description: z.string().optional(),
  unit: z.enum(['each', 'sqft', 'lnft', 'hour', 'day']),
  unit_price: z.number().min(0),
  quantity: z.number().min(0),
});

export const templateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200),
  description: z.string().max(500).optional(),
  items: z.array(lineItemSchema).min(1, 'At least one item is required'),
});

export const packageSchema = z.object({
  job_id: z.string().uuid(),
  public_slug: z.string().min(1).max(100),
  is_public: z.boolean().default(true),
});

export type WorkspaceInput = z.infer<typeof workspaceSchema>;
export type WorkspaceCreateInput = z.infer<typeof workspaceCreateSchema>;
export type WorkspaceBrandInput = z.infer<typeof workspaceBrandSchema>;
export type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
export type JobInput = z.infer<typeof jobSchema>;
export type JobItemInput = z.infer<typeof jobItemSchema>;
export type TemplateInput = z.infer<typeof templateSchema>;
export type PackageInput = z.infer<typeof packageSchema>;

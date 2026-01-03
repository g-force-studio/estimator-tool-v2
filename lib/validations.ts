import { z } from 'zod';

export const workspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100),
});

export const workspaceBrandSchema = z.object({
  brand_name: z.string().min(1, 'Brand name is required').max(100),
  accent_color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format').optional(),
});

export const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member']),
});

export const jobSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  status: z.enum(['draft', 'active', 'delivered', 'archived']).default('draft'),
  due_date: z.string().optional(),
  client_name: z.string().max(200).optional(),
  description_md: z.string().optional(),
  template_id: z.string().uuid().optional(),
});

export const jobItemSchema = z.object({
  type: z.enum(['text', 'link', 'file', 'checklist']),
  title: z.string().min(1, 'Title is required').max(200),
  content_json: z.any(),
  order_index: z.number().int().min(0),
});

export const templateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200),
  description: z.string().max(500).optional(),
  template_items_json: z.any(),
});

export const packageSchema = z.object({
  job_id: z.string().uuid(),
  public_slug: z.string().min(1).max(100),
  is_public: z.boolean().default(true),
});

export type WorkspaceInput = z.infer<typeof workspaceSchema>;
export type WorkspaceBrandInput = z.infer<typeof workspaceBrandSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
export type JobInput = z.infer<typeof jobSchema>;
export type JobItemInput = z.infer<typeof jobItemSchema>;
export type TemplateInput = z.infer<typeof templateSchema>;
export type PackageInput = z.infer<typeof packageSchema>;

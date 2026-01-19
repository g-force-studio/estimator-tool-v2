# RelayKit

A production-ready, mobile-first, offline-first web application for job packaging and estimation. Built for contractors and teams who need to create, manage, and share professional job estimates with clients.

## Features

- 🔐 **Magic Link Authentication** - Passwordless login via Supabase Auth
- 🏢 **Single Workspace Per User** - Strict one-workspace-per-user constraint
- 📱 **Mobile-First Design** - Optimized for iPhone-size screens with thumb-friendly navigation
- 📴 **Offline-First** - Full functionality with intermittent connectivity using IndexedDB
- 📸 **Photo Uploads** - Attach photos to jobs with offline queue support
- 📋 **Job Management** - Create, edit, and track jobs with optional line items
- 🧾 **Line Items** - Add detailed pricing rows to jobs and persist them as `job_items`
- 🧩 **Templates** - Save line items as reusable templates
- 🎨 **Workspace Branding** - Custom logos, colors, and branded public packages
- 💵 **Labor Rates** - Workspace defaults with per-job overrides
- 👥 **Team Invites** - Email-based invite system with secure token handling
- 📦 **Public Packages** - Shareable, branded job packages with automatic signed URL regeneration
- 🔄 **Sync Queue** - Automatic synchronization with retry logic and conflict resolution

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with dark mode support
- **Database**: Supabase (PostgreSQL with RLS)
- **Authentication**: Supabase Auth (Magic Link)
- **Storage**: Supabase Storage (Private buckets)
- **Offline**: IndexedDB via `idb` library
- **PWA**: @next/pwa with Workbox
- **Validation**: Zod
- **Forms**: React Hook Form

## Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- (Optional) Email provider for production invites

## Getting Started

### 1. Clone and Install

```bash
git clone <repository-url>
cd relaykit
npm install
```

### 2. Set Up Supabase

#### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be provisioned

#### Run the Database Schema

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the contents of `supabase/schema.sql`
4. Paste and run the SQL script
5. Verify all tables, functions, and policies were created

#### Apply Migrations

Some changes are shipped as incremental migrations. Run the SQL files in `supabase/migrations/` in order:

- `supabase/migrations/20260107_normalize_job_statuses.sql`
- `supabase/migrations/20260107_add_profiles.sql`
- `supabase/migrations/20260108_add_labor_rates.sql`
- `supabase/migrations/20260109_add_line_item_job_items.sql`

#### Set Up Storage Buckets

Follow the instructions in `supabase/storage-setup.md`:

1. Create two private buckets:
   - `job-assets` (for job photos and files)
   - `workspace-logos` (for workspace branding)
2. Apply the RLS policies from the storage setup guide
3. Configure file size limits and allowed MIME types

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SIGNED_URL_TTL_SECONDS=3600
APP_BASE_URL=http://localhost:3000
INVITE_TOKEN_PEPPER=your-random-secret-pepper-string-min-32-chars
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://your-n8n-webhook-url
```

**Important:**
- Get your Supabase URL and keys from **Project Settings > API**
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and should NEVER be exposed to the browser
- `INVITE_TOKEN_PEPPER` should be a random string (32+ characters) for security
- Generate a secure pepper: `openssl rand -base64 32`
- `NEXT_PUBLIC_N8N_WEBHOOK_URL` is required to submit jobs into the n8n pipeline

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Onboarding Flow

### Creating Your First Workspace

1. Navigate to the app
2. Click "Send magic link" and enter your email
3. Check your email and click the magic link
4. You'll be redirected to the onboarding page
5. Enter your workspace name (e.g., "Acme Construction")
6. Click "Create Workspace"
7. You're now the owner of your workspace!

### Inviting Team Members

#### Step 1: Create an Invite (Admin/Owner Only)

1. Go to **Settings** (bottom navigation)
2. Click **Members** tab
3. Click **Invite Member**
4. Enter the team member's email address
5. Select their role (Admin or Member)
6. Click **Send Invite**

#### Step 2: Copy the Invite Link

In development (or when email is not configured):
- The invite link will be displayed in the UI
- Copy the full link (e.g., `http://localhost:3000/invite/abc123...`)
- The link is also logged to the server console

In production (with email configured):
- An email will be sent automatically to the invitee
- The email contains the invite link

#### Step 3: Invitee Accepts

1. The invitee clicks the invite link
2. If not logged in, they're prompted to sign in with magic link
3. After authentication, they see the invite details:
   - Workspace name
   - Their assigned role
4. They click **Accept Invitation**
5. They're added to the workspace and redirected to the app

### Invite Link Format

```
{APP_BASE_URL}/invite/{32-character-token}
```

Example:
```
http://localhost:3000/invite/V7StGQjAAvS5gKwYphSEjRYFn7m6pVkL
```

## Troubleshooting Invites

### "Invalid invite token"

**Causes:**
- Token was mistyped or incomplete
- Invite has expired (default: 7 days)
- Invite was already accepted

**Solutions:**
- Double-check the full invite link
- Ask the admin to create a new invite
- Verify the invite hasn't expired in Settings > Members

### "You already belong to a workspace"

**Cause:**
- Each user can only belong to ONE workspace (by design)
- The user is already a member of another workspace

**Solutions:**
- Use a different email address
- Contact the admin of your current workspace to remove you first
- This is a strict constraint to prevent data leakage between workspaces

### "Invite expired"

**Cause:**
- Invites expire after 7 days by default

**Solution:**
- Ask the admin to create a new invite
- Admins can revoke old invites in Settings > Members

### Invite Not Received (Email)

**In Development:**
- Email is not configured by default
- Copy the invite link from the console or UI
- Share the link directly with the invitee

**In Production:**
- Check spam/junk folders
- Verify email provider is configured correctly
- Check server logs for email sending errors
- Use the console link as a fallback

## Email Provider Setup

By default, invites are logged to the console. To send actual emails:

### Option 1: Supabase Email (Easiest)

Supabase provides built-in email for magic links. For custom invite emails:

1. Go to **Authentication > Email Templates** in Supabase
2. Customize the templates as needed
3. Configure SMTP settings if using a custom provider

### Option 2: Custom Email Provider

Implement a custom email provider in `app/api/invites/route.ts`:

```typescript
// Example with SendGrid, Resend, or any provider
import { sendEmail } from '@/lib/email';

// In the POST handler, after creating the invite:
await sendEmail({
  to: validated.email,
  subject: `You're invited to join ${workspaceName}`,
  html: `
    <p>You've been invited to join ${workspaceName} on RelayKit.</p>
    <p><a href="${inviteLink}">Accept Invitation</a></p>
    <p>This invite expires in 7 days.</p>
  `,
});
```

## Offline & Sync Behavior

### How It Works

RelayKit is designed to work seamlessly with intermittent connectivity:

1. **Offline Detection**: The app automatically detects when you go offline
2. **Local Cache**: Recent jobs, templates, and packages are cached in IndexedDB
3. **Draft Persistence**: Job edits are saved locally every second (debounced)
4. **Sync Queue**: Mutations are queued when offline and synced when back online
5. **Upload Queue**: Photos are stored locally and uploaded when connectivity returns

### Offline Indicators

- Yellow banner appears when offline: "📡 You're offline. Showing cached data."
- Cached data is displayed immediately
- Changes are saved locally and synced automatically

### Sync Queue

- **FIFO Processing**: Operations are synced in order
- **Retry Logic**: Failed syncs retry with exponential backoff (1s, 2s, 5s, 10s, 30s)
- **Conflict Resolution**: Last-write-wins based on `updated_at` timestamp
- **Manual Trigger**: Syncs automatically on reconnection

### Photo Uploads

- **Offline Queue**: Photos are stored as blobs in IndexedDB
- **Automatic Upload**: Uploads start automatically when online
- **Progress Tracking**: Upload status is tracked per file
- **Retry on Failure**: Failed uploads retry with backoff

### Best Practices

- **Create drafts offline**: Jobs are saved locally and synced later
- **View cached data**: Recent jobs and templates are available offline
- **Avoid conflicts**: Try to sync before making major changes
- **Check sync status**: Look for the offline indicator

## Signed URL Configuration

### What Are Signed URLs?

All files (photos, logos) are stored in private Supabase Storage buckets. To access them, the server generates temporary signed URLs with an expiration time.

### Default TTL

- **Default**: 3600 seconds (1 hour)
- **Configurable**: Set `SIGNED_URL_TTL_SECONDS` in `.env.local`

### Changing the TTL

1. Edit `.env.local`:
   ```env
   SIGNED_URL_TTL_SECONDS=7200  # 2 hours
   ```

2. Restart the development server:
   ```bash
   npm run dev
   ```

3. For production, update the environment variable and redeploy

### Automatic Regeneration

The client automatically handles expired URLs:

1. **Detection**: Image load fails with 403 error
2. **Regeneration**: Client calls `/api/packages/[slug]/assets`
3. **Retry**: Image is reloaded with new signed URL
4. **Proactive Refresh**: (Optional) Refresh within 5 minutes of expiry

### Recommendations

- **Short TTL (1-2 hours)**: Better security, more regeneration requests
- **Long TTL (24 hours)**: Fewer requests, URLs valid longer
- **Balance**: Default 1 hour is a good balance for most use cases

## PWA & Offline Capabilities

### Installing as PWA

On mobile devices:
1. Open the app in Safari (iOS) or Chrome (Android)
2. Tap the share button
3. Select "Add to Home Screen"
4. The app will install and open like a native app

### Service Worker

- **App Shell Caching**: Core app files are cached for instant load
- **Package Caching**: Visited packages are cached for offline viewing
- **Image Caching**: Images are cached with size limits
- **Automatic Updates**: Service worker updates automatically

### Cache Management

Caches are bounded to prevent excessive storage:
- **Max Jobs**: 50 recent jobs
- **Max Packages**: 50 visited packages
- **Max Images**: 64 images (30-day expiry)

## Project Structure

```
relaykit/
├── app/
│   ├── api/              # API routes
│   │   ├── invites/      # Invite system
│   │   ├── jobs/         # Job CRUD
│   │   ├── packages/     # Package generation & signed URLs
│   │   ├── uploads/      # File uploads
│   │   └── workspaces/   # Workspace management
│   ├── auth/             # Authentication pages
│   ├── invite/           # Invite acceptance
│   ├── jobs/             # Job pages
│   ├── onboarding/       # Workspace creation
│   ├── packages/         # Public package pages
│   ├── settings/         # Settings pages
│   ├── templates/        # Template pages
│   ├── globals.css       # Global styles
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Home page
│   └── providers.tsx     # Client providers
├── components/           # Reusable components
│   ├── bottom-nav.tsx    # Mobile navigation
│   └── workspace-logo.tsx # Workspace branding logo
├── lib/
│   ├── config.ts         # Centralized configuration
│   ├── db/               # IndexedDB layer
│   │   ├── idb.ts        # Database operations
│   │   ├── sync.ts       # Sync queue processor
│   │   └── upload.ts     # Upload queue processor
│   ├── supabase/         # Supabase clients
│   │   ├── client.ts     # Browser client
│   │   ├── server.ts     # Server client
│   │   ├── service.ts    # Service role client
│   │   └── database.types.ts  # TypeScript types
│   ├── utils.ts          # Utility functions
│   └── validations.ts    # Zod schemas
├── supabase/
│   ├── schema.sql        # Database schema
│   ├── migrations/       # Incremental schema changes
│   └── storage-setup.md  # Storage configuration
├── public/               # Static assets
├── .env.example          # Environment variables template
├── next.config.js        # Next.js + PWA config
├── tailwind.config.js    # Tailwind configuration
├── tsconfig.json         # TypeScript configuration
└── README.md             # This file
```

## Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint

# Format code
npm run format
```

## Deployment

### Netlify (Recommended)

1. Push your code to GitHub
2. Import the project in Netlify
3. Add environment variables in Netlify dashboard
4. Deploy

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- Render
- Self-hosted with Docker

**Important**: Ensure all environment variables are set, especially `SUPABASE_SERVICE_ROLE_KEY` (server-only).

## Security Considerations

### Environment Variables

- **Never commit** `.env.local` to version control
- **Never expose** `SUPABASE_SERVICE_ROLE_KEY` to the browser
- **Use strong secrets** for `INVITE_TOKEN_PEPPER` (32+ characters)

### Row Level Security (RLS)

- All tables have RLS enabled
- Users can only access their workspace data
- Admins have elevated permissions for invites and settings
- Public packages are read-only and safe

### Invite Tokens

- Tokens are hashed with SHA-256 + pepper before storage
- Original tokens are never stored in the database
- Tokens expire after 7 days
- One-time use (marked as accepted)

### File Storage

- All buckets are private
- Signed URLs expire after TTL
- RLS policies restrict access to workspace members
- Service role key required for signing

## Testing

### Manual Testing Checklist

- [ ] User can sign in with magic link
- [ ] User can create a workspace
- [ ] User can create a job
- [ ] User can add line items to a job
- [ ] User can save a job's line items as a template
- [ ] User can upload a photo to a job
- [ ] Admin can invite a team member
- [ ] Invitee can accept invite
- [ ] User cannot join multiple workspaces
- [ ] User can generate a package
- [ ] Public package displays correctly
- [ ] Signed URLs regenerate on expiry
- [ ] App works offline (cached data)
- [ ] Sync queue processes on reconnection
- [ ] Photo uploads work offline

### Automated Testing

Add tests as needed:

```bash
# Example with Jest
npm install --save-dev jest @testing-library/react @testing-library/jest-dom

# Run tests
npm test
```

## Troubleshooting

### "Unauthorized" errors

- Check that you're logged in
- Verify Supabase credentials in `.env.local`
- Check RLS policies are applied

### Images not loading

- Verify storage buckets are created and private
- Check RLS policies on `storage.objects`
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Check signed URL TTL hasn't expired

### Sync not working

- Check browser console for errors
- Verify you're online
- Check sync queue in IndexedDB (DevTools > Application > IndexedDB)
- Try manually refreshing the page

### PWA not installing

- Ensure you're using HTTPS (or localhost)
- Check `manifest.json` is accessible
- Verify service worker is registered (DevTools > Application > Service Workers)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

[Your License Here]

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review this README and `supabase/storage-setup.md`

---

Built with ❤️ using Next.js, Supabase, and modern web technologies.

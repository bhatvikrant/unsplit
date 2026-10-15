# Backend: Unsplit (Convex)

Deployment: Convex. Local dev runs an anonymous local deployment (`npm run dev:backend`); production is the Convex cloud deployment `scintillating-salamander-731` (project `vikrant-bhat/unsplit`, EU West), frontend on Vercel at https://unsplit.vercel.app. See README → Deploy.

## Auth
- [x] Email + password sign-up and log-in (Convex Auth Password provider, 8+ character passwords)
- [x] Password reset by emailed code (Resend)
- [x] Google sign-in (user's own OAuth client: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`; redirect URI `<CONVEX_SITE_URL>/api/auth/callback/google`)
- [x] Placeholder users claimed on sign-up by email (`createOrUpdateUser` callback)
- [x] Sessions: Convex Auth JWT + refresh tokens; "log out everywhere" deletes sessions
- [x] Roles: none by design (matches the original). Every function checks membership or participation.
- [x] Account deletion: anonymises the user, removes memberships/friendships/sessions, keeps shares

## Database
- [x] Schema in `convex/schema.ts`, 13 tables, indexes on every filter
- [x] Access checks: `requireUser`, `assertGroupMember`, `assertExpenseAccess`, `assertFriends` in `convex/lib/access.ts`
- [x] Balances maintained transactionally by every expense mutation; `rebuildScope` exists for repair
- [x] Money as integer minor units + ISO currency
- [ ] Seed script (not needed: the e2e suite creates realistic data)
- [x] Backups: Convex cloud keeps point-in-time backups on paid plans; export JSON from the account page

## Payments
No subscription and no card forms: every feature is free. Settle-up records payments; it never moves money.

## Email and jobs
- [x] Resend through `convex/lib/email.ts`; silently skipped without `RESEND_API_KEY`
- [x] Templates written fresh: invites (friend, group), reminders, password reset, per-activity notifications
- [x] Cron: `postRecurring` hourly, `recurringReminders` daily 09:00 UTC
- [ ] Monthly summary email (preference exists, job not written)

## Integrations
- [x] Frankfurter (ECB rates) for currency conversion, cached 6 h, no key
- [x] Anthropic Messages API for receipt OCR (`ANTHROPIC_API_KEY`, model `claude-sonnet-5-5` by default)
- [x] Convex file storage for receipts, avatars, covers (10 MB, images only)
- Google OAuth verification: unverified apps show a warning screen until Google reviews the consent screen. Start that before public launch.

## Security checklist
- [x] secrets only in Convex env vars; `.env.local` ignored; nothing in the client bundle
- [x] input validated on the server (Convex validators + the split engine) on every function
- [x] authorisation on every read and write (e2e: Bea only sees her own groups)
- [x] rate limits: Convex Auth rate-limits sign-in attempts; `@convex-dev/rate-limiter` (`convex/lib/rateLimit.ts`) caps invite emails per sender (30/h, burst 10), reminders per sender (10/h, burst 3) and one reminder per friend per 12 h
- [x] no webhooks
- [x] uploads: 10 MB, image types only, served from Convex storage URLs
- [x] no user data in URLs (ids only) or logs
- [x] `npm audit`: 0 vulnerabilities at install
- [x] privacy page at `/privacy` (`src/pages/Privacy.tsx`) listing Convex, Vercel, Resend, Anthropic, Google, Frankfurter

## Environment variables
See `.env.example`.

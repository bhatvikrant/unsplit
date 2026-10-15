# Unsplit

Split shared expenses with friends, flatmates and travel groups. Every feature
is free: unlimited expenses, every split method, itemized bills, receipt
scanning, currency conversion, charts, search, export, no ads.

Built with React 19, TypeScript, Vite, Tailwind 4, shadcn/ui, Framer Motion
and [Convex](https://convex.dev) (database, functions, realtime, auth, files,
cron). Built with the Replica skill pack; the recon map, architecture and
design tokens are in `replica/`.

## Run it locally

```bash
npm install
npm run auth:setup        # once: generates JWT keys and sets SITE_URL on the dev deployment
npm run dev:all           # Convex local backend + Vite on http://localhost:5173
```

`npm run dev:all` uses an anonymous local Convex deployment: no account needed,
and `.env.local` stays pointed at it. The e2e suite runs against this setup.

To develop against the Convex cloud dev deployment instead:

```bash
npx convex dev --once --env-file .env.cloud.local   # once: logs you in, picks/creates the project
npm run auth:setup -- --cloud                       # keys + SITE_URL on that deployment
npm run dev:cloud                                   # cloud backend + Vite (mode "cloud")
```

`.env.cloud.local` is git-ignored and holds only the deployment name and URLs.
Keeping it separate matters: if `.env.local` ever names a cloud deployment,
`npm run dev:all` silently uses that deployment instead of the local one.

## Offline

The app works without a connection, including after a reload, and syncs
when it is back. Three pieces, all under `src/offline/`:

- **Cache**: the last server result of every query the UI has shown is kept
  in IndexedDB. `useQuery` (from `@/lib/convex`, a drop-in for the one in
  `convex/react`) answers from it whenever the live subscription has nothing.
- **Outbox**: every write goes through `useMutation` (also from
  `@/lib/convex`) into a durable queue. Online it still waits for the server,
  so forms show validation errors inline. Offline it returns at once with a
  temporary id, and `overlay.ts` lays the queued change over the cached
  results: new expenses appear in lists, detail pages and balances; edits,
  deletes, restores, payments, groups, members, friends, comments and
  settings all behave the same way. Rows that haven't synced show a small
  cloud-off icon.
- **Sync**: `sync.ts` drains the queue in order as soon as the socket is up,
  maps temporary ids to real ones (links keep working), and tells the user
  with a toast if the server rejects something. Create-type mutations carry a
  `clientKey`, so a replay after a reload mid-sync cannot duplicate anything
  (`convex/lib/idempotency.ts`).

The service worker (vite-plugin-pwa, production builds only) precaches the
app shell and caches receipts and avatars as they are seen. Things that need
the server say so instead of hanging: receipt scanning, currency conversion,
reminders, exports, file uploads, invite links of groups created offline.

## Test

```bash
npm test              # unit: split engine, money, offline overlay
npm run test:e2e      # Playwright, with the dev server running
npm run typecheck
```

The offline spec also runs against the production build to cover the
service worker (reload with no network):

```bash
npm run build && npm run preview     # serves dist/ on :4173
npm run test:e2e:offline
```

## Deploy

Production runs the Convex backend on a cloud deployment and the static `dist/`
on Vercel. The live instance is https://unsplit.vercel.app (Convex project
`vikrant-bhat/unsplit`, EU West).

### First time

1. **Convex project**: `npx convex dev --once --env-file .env.cloud.local`.
   It logs you in, asks for a region, creates the project and a dev deployment,
   and writes `.env.cloud.local`.
2. **Production backend**: `npx convex deploy -y --env-file .env.cloud.local`
   creates the production deployment and pushes the functions. Note the
   `https://<name>.convex.cloud` URL it prints: `<name>.convex.site` is the
   `CONVEX_SITE_URL` used below.
3. **Vercel project**: `npm i -g vercel`, `vercel login`, `vercel link --yes`
   (creates the project, Vite preset). `vercel.json` sets the build command to
   `npx convex deploy -y --cmd 'npm run build'` and the SPA rewrite.
4. **Deploy**: `npm run deploy`. It builds locally with the Vercel CLI (which
   runs the Convex deploy and `vite build` against the production URL) and
   uploads the prebuilt output to production. The first run prints the public
   URL (`https://<project>.vercel.app`).
5. **Auth keys and site URL**: `SITE_URL=https://<your public url> ./scripts/setup-auth-env.sh --prod`.
   Check `https://<CONVEX_SITE_URL>/.well-known/jwks.json` returns 200.
6. **Google sign-in**: in [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
   create an OAuth client ID of type *Web application* with the authorised
   redirect URI `https://<CONVEX_SITE_URL>/api/auth/callback/google` (configure
   the consent screen first if asked; External, with your email as test user
   until you publish it). Then:
   `npm run env:prod -- set AUTH_GOOGLE_ID <client id>` and
   `npm run env:prod -- set AUTH_GOOGLE_SECRET <client secret>`.
7. **Email**: in [Resend](https://resend.com) add and verify your sending domain
   (DNS records it shows you), create an API key, then
   `npm run env:prod -- set RESEND_API_KEY re_...` and
   `npm run env:prod -- set EMAIL_FROM "Unsplit <noreply@yourdomain.com>"`.
8. **Receipt scanning**: create a key in the [Claude Console](https://console.anthropic.com/settings/keys)
   and `npm run env:prod -- set ANTHROPIC_API_KEY sk-ant-...`.
9. **Builds on Vercel's side**: the Vercel project is connected to
   [github.com/bhatvikrant/unsplit](https://github.com/bhatvikrant/unsplit)
   (`vercel git connect`), with `main` as the production branch. Vercel needs a
   *Production* deploy key from the Convex dashboard → Settings → Deploy keys:
   `vercel env add CONVEX_DEPLOY_KEY production` and paste it. Every push to
   `main` then runs the same build command on Vercel and deploys to production;
   other branches get preview deployments.

Each `npm run env:prod -- set` takes effect immediately; no redeploy needed. The
helper scripts read the project from `.env.cloud.local`, so `.env.local` can stay
on the anonymous local deployment.
Custom domain: add it in Vercel (Project → Domains), then rerun step 5 with the
new `SITE_URL`.

### Every release

```bash
npm run typecheck && npm test
npm run deploy
```

### Smoke test after deploying

Sign up with email on the public URL, sign in with Google, add a friend by email
and check the invite arrives, scan a receipt, convert a group to another currency.

## Layout

```
convex/            backend: schema, functions, cron, auth
convex/lib/        pure modules shared with the client: split engine, money, categories, currencies
src/               Vite app: pages, dialogs, components, hooks
replica/           recon map, feature matrix, architecture, design tokens, build log, test plan
tests/unit         vitest
tests/e2e          Playwright
scripts/           auth key generation, deploy
```

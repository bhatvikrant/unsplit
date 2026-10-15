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

`npm run dev:all` uses an anonymous local Convex deployment: no account needed.
To use a Convex cloud dev deployment instead, run `npx convex dev` once (it logs
you in and writes `.env.local`), then `npm run auth:setup` and `npm run dev`.

Optional services, each set with `npx convex env set NAME value`:

| what | variables | without it |
| --- | --- | --- |
| Google sign-in | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | the Google button errors; email + password works |
| Email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` | invites are shareable links, reminders and password reset are unavailable |
| Receipt scanning | `ANTHROPIC_API_KEY` | "Scan receipt" explains it isn't configured; manual itemizing works |

Google OAuth redirect URI: `<your CONVEX_SITE_URL>/api/auth/callback/google`.
Currency conversion needs no key (Frankfurter / ECB rates).

## Test

```bash
npm test              # unit: split engine, money
npm run test:e2e      # Playwright, with the dev server running
npm run typecheck
```

## Deploy

1. Create a Convex production deployment (`npx convex deploy` from a logged-in
   CLI) and set the env vars above on it, including `SITE_URL=https://your.domain`.
   Run `SITE_URL=https://your.domain ./scripts/setup-auth-env.sh --prod` for the auth keys.
2. Build the frontend against production: `npx convex deploy --cmd 'npm run build'`.
3. Host `dist/` anywhere static (Vercel, Netlify, Cloudflare Pages). On Vercel set
   the build command to `npx convex deploy --cmd 'npm run build'` and add
   `CONVEX_DEPLOY_KEY` from the Convex dashboard.
4. Add a rewrite so every path serves `index.html` (SPA routing). On Vercel:
   `vercel.json` with `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`.

## Layout

```
convex/            backend: schema, functions, cron, auth
convex/lib/        pure modules shared with the client: split engine, money, categories, currencies
src/               Vite app: pages, dialogs, components, hooks
replica/           recon map, feature matrix, architecture, design tokens, build log, test plan
tests/unit         vitest
tests/e2e          Playwright
scripts/           auth key generation
```

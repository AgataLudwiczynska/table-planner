# Deploy runbook

Cloudflare Workers Builds (push-to-main) deploys **worker code only** — it does **not** run Supabase migrations. Applying a migration to prod is manual.

**Rule:** apply the migration to prod **before/with** merging the code that uses it. Migrations are one-way. Do it in a low-traffic window.

## Steps (slice with a migration)

```bash
npx supabase migration list   # 1. what's missing on prod
npx supabase db push          # 2. apply all pending migrations to prod
```

3. Verify: run the slice's section of `docs/reference/rls-verification-protocol.md` against prod (or `\dt` + RLS spot-check).
4. Merge/push to `main` → Cloudflare deploys the worker.

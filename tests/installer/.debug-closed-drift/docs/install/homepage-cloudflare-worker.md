# Homepage Cloudflare Worker

The homepage lives in `homepage/` and is deployed to:

```text
https://vibing.paymond.me/superpowering-with-files
```

## Local Development

```bash
npm install --prefix homepage
npm run dev --prefix homepage
```

Open:

```text
http://127.0.0.1:5173/superpowering-with-files/
```

## Local Verification

```bash
npm run typecheck --prefix homepage
npm test --prefix homepage
npm run build --prefix homepage
npx --prefix homepage wrangler deploy --config homepage/wrangler.jsonc --dry-run
```

## Production Deployment

GitHub Actions deploys the homepage when changes reach `origin/main` and match the paths in `.github/workflows/homepage-deploy.yml`.

Required GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The Worker route is:

```text
vibing.paymond.me/superpowering-with-files*
```

## Manual Deployment

```bash
npm run build --prefix homepage
CLOUDFLARE_ACCOUNT_ID=<account-id> CLOUDFLARE_API_TOKEN=<token> \
  npx --prefix homepage wrangler deploy --config homepage/wrangler.jsonc
```

## Rollback

Use the Cloudflare Workers deployment history for `superpowering-with-files-homepage` to roll back to the previous deployment. If a broken deployment came from `main`, revert the commit in GitHub and let the deploy workflow publish the corrected build.

# Deploy DOOM DAW to Vercel

## Quick Deploy

```bash
npx vercel login    # First time only
npx vercel --prod
```

## Environment Variable

In Vercel Dashboard → Project → Settings → Environment Variables:

| Name | Value |
|------|-------|
| `GEMINI_API_KEY` | Your API key from [Google AI Studio](https://aistudio.google.com/apikey) |

Redeploy after adding the env var so the build includes it.

## Custom Domain

1. Vercel Dashboard → Project → **Settings** → **Domains**
2. Add your domain (e.g. `yourdomain.com`)
3. Add the DNS records shown (A or CNAME)
4. Wait for DNS propagation; SSL is automatic

## Live URL

After deploy:
- **Default:** `https://<project>.vercel.app`
- **Custom:** `https://yourdomain.com` (after DNS setup)

# Deploy DOOM DAW to Vercel

**Deployment uses real audio only:** the audio engine and generate-audio API use the real Web Audio API and Replicate (Stable Audio 2.5). No mock or simulation modes are used in production; they are disabled for deployment.

## Quick Deploy

```bash
npx vercel login    # First time only
npx vercel --prod
```

## Environment Variables

In Vercel Dashboard → Project → Settings → Environment Variables:

| Name | Value |
|------|-------|
| `GEMINI_API_KEY` | Your API key from [Google AI Studio](https://aistudio.google.com/apikey) |
| `REPLICATE_API_TOKEN` | Your token for Generate (text-to-audio); optional if you don’t use Generate |

Redeploy after adding env vars so the build uses them.

**Do not set in production (Vercel or any prod env):** `VITE_AUDIO_MOCK`, `VITE_SIMULATE_AUDIO`. These are dev-only; if set in production the app will throw at runtime. Leave them unset for deployment.

## Custom Domain

1. Vercel Dashboard → Project → **Settings** → **Domains**
2. Add your domain (e.g. `yourdomain.com`)
3. Add the DNS records shown (A or CNAME)
4. Wait for DNS propagation; SSL is automatic

## Live URL

After deploy:
- **Default:** `https://<project>.vercel.app`
- **Custom:** `https://yourdomain.com` (after DNS setup)

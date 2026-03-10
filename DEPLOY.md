# Deploy DOOM DAW to Vercel

**Deployment uses real audio only:** the audio engine and generate-audio API use the real Web Audio API and Replicate (MiniMax Music 01). No mock or simulation modes are used in production; they are disabled for deployment.

## Quick Deploy

```bash
npx vercel login    # First time only
npx vercel --prod
```

## Environment Variables

In Vercel Dashboard → Project → Settings → Environment Variables:

| Name | Value |
|------|-------|
| `OPEN_ROUTER_API_KEY` | Your API key from [OpenRouter](https://openrouter.ai/keys) (for AI song structure, optional) |
| `REPLICATE_API_TOKEN` | **Required for Generate.** Token from [Replicate](https://replicate.com/account/api-tokens). MiniMax Music 01 (text-to-audio). |

Set `REPLICATE_API_TOKEN` to enable audio generation. Redeploy after adding env vars so the build uses them.

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

## Troubleshooting

- **"Function Invocation Failed" / 500 on Generate:** The API uses Vercel’s [fetch Web Standard](https://vercel.com/docs/functions/functions-api-reference#fetch-web-standard) (`export default { fetch }`). Ensure **Node.js Version** is **20.x** in Project → Settings → General, and **REPLICATE_API_TOKEN** is set for **Production** (and Preview if you use preview URLs). Check the deployment’s **Logs** or **Functions** tab for the real error. `maxDuration: 300` requires Pro; on Hobby the function is limited to 10s (MiniMax often needs 30–60s, so Generate may time out on Hobby).
- **Console: "[DEPRECATED] Default export is deprecated... use `import { create } from 'zustand'`":** This comes from Vercel’s instrumentation/analytics bundle, not your app code. Safe to ignore unless you use zustand directly.

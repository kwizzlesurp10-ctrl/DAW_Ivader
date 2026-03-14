# Deploy DOOM DAW to Vercel

**Deployment uses real audio only:** the audio engine and generate-audio API use the real Web Audio API and Replicate (recommended) or HuggingFace (fallback) (MusicGen). No mock or simulation modes are used in production; they are disabled for deployment.

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
| `REPLICATE_API_TOKEN` | **Recommended.** Token from [Replicate](https://replicate.com/account/api-tokens). Uses Meta MusicGen models via Replicate API. Takes priority when both tokens are set. |
| `HUGGINGFACE_API_TOKEN` | **Fallback.** Token for Generate (text-to-audio) from [HuggingFace](https://huggingface.co/settings/tokens). Used only when `REPLICATE_API_TOKEN` is not set. |

Set at least one of `REPLICATE_API_TOKEN` or `HUGGINGFACE_API_TOKEN` to enable audio generation. Redeploy after adding env vars so the build uses them.

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

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
| `CLERK_SECRET_KEY` | Clerk server key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser publishable key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key for streaming chat |
| `OPEN_ROUTER_API_KEY` | Optional OpenRouter key for legacy song-structure generation |
| `REPLICATE_API_TOKEN` | Your token for Generate (text-to-audio); optional if you do not use Generate |

Redeploy after adding env vars so the build uses them.

Local ComfyUI generation is intended for local development. Use `COMFYUI_BASE_URL`, `COMFYUI_AUDIO_WORKFLOW_PATH`, and optional prompt node env vars in `.env`; do not expect a Vercel deployment to reach `127.0.0.1:8188` on your workstation.

**Do not set in production (Vercel or any prod env):** `NEXT_PUBLIC_AUDIO_MOCK`, `NEXT_PUBLIC_SIMULATE_AUDIO`. These are dev-only; if set in production the app will throw at runtime. Leave them unset for deployment.

## Live URL

After deploy:
- **Default:** `https://<project>.vercel.app`
- **Custom:** `https://yourdomain.com` (after DNS setup)

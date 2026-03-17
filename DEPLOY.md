# Deploy DOOM DAW to Vercel

**Deployment uses real audio only:** the audio engine and generate-audio API use the real Web Audio API and Replicate (Stability AI Stable Audio 2.5). No mock or simulation modes are used in production; they are disabled for deployment.

## Quick Deploy (CLI)

```bash
npx vercel login    # First time only
npx vercel --prod
```

## Automatic Deploy via GitHub Actions

The repository includes `.github/workflows/deploy.yml` which automatically runs tests, builds, and deploys to Vercel production on every push to `main` or `master`.

**One-time setup — add these secrets in GitHub → Settings → Secrets → Actions:**

| Secret | How to get it |
|--------|---------------|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | Run `vercel env pull` locally and check `.vercel/project.json`, or find it in Vercel Dashboard → Settings |
| `VERCEL_PROJECT_ID` | Same as above |

After adding the secrets, any push to `main` will trigger a production deployment automatically.

## Environment Variables

In Vercel Dashboard → Project → Settings → Environment Variables:

| Name | Value |
|------|-------|
| `OPEN_ROUTER_API_KEY` | Your API key from [OpenRouter](https://openrouter.ai/keys) (for AI song structure, optional) |
| `REPLICATE_API_TOKEN` | Token from [Replicate](https://replicate.com/account/api-tokens). Uses Stability AI Stable Audio 2.5. **Recommended.** |
| `HUGGINGFACE_API_TOKEN` | Token from [HuggingFace](https://huggingface.co/settings/tokens) (Inference API access). Used for: (1) audio fallback via Meta MusicGen when `REPLICATE_API_TOKEN` is absent; (2) the separate **HF Creative Engine** (`/api/hf-generate`) for text generation (Mistral-7B-Instruct) and image generation (FLUX.1-schnell). |

Set at least one of `REPLICATE_API_TOKEN` or `HUGGINGFACE_API_TOKEN` to enable audio generation. Redeploy after adding env vars so the build uses them.

**Do not set in production (Vercel or any prod env):** `VITE_AUDIO_MOCK`, `VITE_SIMULATE_AUDIO`. These are dev-only; if set in production the app will throw at runtime. Leave them unset for deployment.

## Custom Domain

1. Vercel Dashboard → Project → **Settings** → **Domains**
2. Add your domain (e.g. `yourdomain.com`)
3. Add the DNS records shown (A or CNAME)
4. Wait for DNS propagation; SSL is automatic

## Deployment TO-DO Checklist

- [ ] **Verify API parameter names** — `api/generate-audio.ts` sends `prompt`, `duration`, `cfg_scale`, `steps` to Replicate Stable Audio 2.5 (confirmed in PR #54)
- [ ] **Run tests** — `npm run test` (all 214+ unit/integration tests must pass)
- [ ] **Build** — `npm run build` succeeds with no errors (builds SPA + compiles API handler)
- [ ] **Local production test** — `npm start` serves the built SPA and API at `http://localhost:3000`; verify `/api/generate-audio` responds (not 404)
- [ ] **Set environment variables** in Vercel Dashboard → Settings → Environment Variables:
  - `REPLICATE_API_TOKEN` — **Required** for audio generation
  - `OPEN_ROUTER_API_KEY` — Optional, for AI song structure
- [ ] **Do NOT set** `VITE_AUDIO_MOCK` or `VITE_SIMULATE_AUDIO` in production
- [ ] **Add GitHub Actions secrets** (for CI/CD deploy):
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
- [ ] **Deploy** — `npx vercel --prod` or push to `main` for automatic deploy
- [ ] **Verify** — App loads at deployed URL; test Generate flow end-to-end
- [ ] **Custom domain** (optional) — Add domain in Vercel Dashboard → Domains, configure DNS

## Live URL

After deploy:
- **Default:** `https://<project>.vercel.app`
- **Custom:** `https://yourdomain.com` (after DNS setup)
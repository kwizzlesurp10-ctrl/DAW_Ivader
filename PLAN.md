# PLAN: DOOM DAW — Production Finalization & Deployment

**Status:** Code complete — deployment requires `vercel login`  
**Target:** Production-ready app on Vercel with custom domain

---

## Phase 1: Code Polish & Bug Fixes

### 1.1 Production Hardening
- [x] Remove `index.html` importmap (Vite bundles deps)
- [x] Add meta description and OG tags
- [x] Responsive canvas in Visualizer (ResizeObserver)
- [x] vercel.json for SPA rewrites
- [x] strict TS ✓
- [ ] Optional: code-split heavy chunks (chunk >500KB) — deferred

### 1.2 Environment & Security
- [x] `.env.example` documents `GEMINI_API_KEY`
- [x] Vercel build uses `GEMINI_API_KEY` from project env (set in Dashboard)
- Note: Key is baked into client bundle — acceptable for demo; use server proxy for production-grade secrecy

### 1.3 UX/Polish
- [x] Meta description and OG tags
- [x] Responsive canvas (ResizeObserver)

---

## Phase 2: Vercel Configuration

### 2.1 Create `vercel.json` ✓ DONE
- SPA fallback: all routes → `index.html`
- Output: `dist/` from `vite build`

### 2.2 Ensure `package.json` Build
- `npm run build` → `vite build` ✓
- Output: `dist/` ✓

---

## Phase 3: Deploy to Vercel

### 3.1 Prerequisites
- Vercel CLI: `npx vercel` or `npm i -g vercel`
- Vercel account (free tier works)

### 3.2 Deploy Steps (run these locally)
```bash
# 1. Login (opens browser for auth)
npx vercel login

# 2. Deploy (first time: link/create project)
npx vercel --prod

# 3. Set env var (required for AI Generate)
# Vercel Dashboard → Project → Settings → Environment Variables
# Add: GEMINI_API_KEY = your_api_key
# Then redeploy: npx vercel --prod
```

**Or use Git:** Push to GitHub, connect repo at vercel.com/new, add `GEMINI_API_KEY` env var, deploy.

### 3.3 Custom Domain
1. Vercel Dashboard → Your Project → **Settings** → **Domains**
2. Add domain: `yourdomain.com` (replace with your real domain)
3. Follow DNS instructions (add A record or CNAME as shown)
4. SSL is automatic after DNS propagates

---

## Phase 4: Post-Deploy

- [ ] Verify app loads at `https://your-project.vercel.app`
- [ ] Test: Initialize → Play → Generate (needs `GEMINI_API_KEY` in env)
- [ ] Final URL: `https://yourdomain.com` after adding custom domain

---

## Notes

- **Custom domain placeholder:** Use `yourdomain.com` in docs — replace with your actual domain in Vercel.
- **No `.cursor/rules/`** found — following project standards (strict TS, Zod, Result pattern).
- **Tests:** 34 passing ✓ | **Build:** Success ✓

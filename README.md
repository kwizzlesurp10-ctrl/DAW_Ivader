<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# DOOM DAW — IRKEN Audio Lab

Run and deploy the app locally or to production.

View in AI Studio: https://ai.studio/apps/drive/192C7PIV_QPpDtFu0SvAQfXqq0dFpmYqp

---

## Quick start (production)

**Prerequisites:** Node.js 18+

```bash
# 1. Install
npm ci

# 2. Environment (required for AI Generate)
cp .env.example .env.local
# Edit .env.local: set GEMINI_API_KEY=your_key

# 3. Verify
npm run test
npm run build

# 4. Run locally
npm run dev
# → http://localhost:3000
```

**Production build & serve**

```bash
npm run build
npm run preview
# → http://localhost:4173 (serves dist/)
```

**Deploy to Vercel** (recommended)

```bash
npx vercel login
npx vercel --prod
```

Set `GEMINI_API_KEY` in Vercel project Settings → Environment Variables. See [DEPLOY.md](./DEPLOY.md) for full instructions and custom domain setup.

---

## Run locally (dev)

1. **Install:** `npm install`
2. **Env:** Set `GEMINI_API_KEY` in `.env.local` (or `.env`) for the Generate feature.
3. **Run:** `npm run dev` → http://localhost:3000

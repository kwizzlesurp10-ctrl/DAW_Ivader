# Text-to-Audio via Replicate (MiniMax only)

This app uses **MiniMax Music 01** (`minimax/music-01`) on Replicate for text-to-audio. No custom Cog is built or pushed.

## Setup

1. Create an API token at [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens).
2. In project root: `.env.local` → `REPLICATE_API_TOKEN=your_token`.
3. Run with `vercel dev` (or deploy to Vercel with the env var set).

No `cog login` or Cog build is required; generation is done entirely via Replicate’s API.

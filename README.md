# SitePulse

SitePulse is a Next.js dashboard for instant Similarweb-powered marketing and traffic insights. Enter a website URL, choose a time range, and see visits, engagement, and channel mix in a clean shadcn/ui interface.

## Features
- Server-side Similarweb API integration (API key stays private)
- Monthly (last 3 full months) and last 28 days modes
- KPI summary cards, charts, and channel breakdowns
- Friendly partial/no coverage states
- Shareable links and copy-to-clipboard
- Rate limiting and zod validation

## Tech stack
- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Recharts via shadcn Chart components

## Setup
1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Create your env file:
   ```bash
   cp .env.example .env.local
   ```
3. Add your Similarweb API key to `.env.local`.
4. Run the dev server:
   ```bash
   pnpm dev
   ```

Open http://localhost:3000 in your browser.

## Similarweb API key
- Get a key from the Similarweb API portal (account required).
- Use `SIMILARWEB_API_KEY_IN_HEADER=true` only if your plan requires header-based auth.

## Vercel deployment
- Add the following environment variables in Vercel:
  - `SIMILARWEB_API_KEY`
  - `SIMILARWEB_API_KEY_IN_HEADER` (optional, default `false`)
- Build command: `pnpm build`
- Output: Next.js default

## Scripts
- `pnpm dev` - start local dev server
- `pnpm build` - build for production
- `pnpm start` - start production server
- `pnpm lint` - run ESLint
- `pnpm typecheck` - run TypeScript checks

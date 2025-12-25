# Contributing

Thanks for helping improve SitePulse.

## Development
- Use `pnpm` for installs and scripts.
- Keep UI components in shadcn/ui.
- Keep Similarweb credentials server-only (never expose in client code).

## UI guidelines
- Use shadcn/ui components for inputs, cards, tables, badges, toasts, and charts.
- Prefer the chart helpers from `src/components/ui/chart.tsx`.
- Keep layouts clean, spacious, and minimal.

## Data and API
- Validate inputs with zod.
- Handle partial Similarweb responses gracefully.
- Avoid logging API keys or raw Similarweb responses.

## Before opening a PR
- `pnpm lint`
- `pnpm typecheck`

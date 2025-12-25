# site-data

Data files and metadata used by the site.

## What lives here
- Data files consumed by the site build or runtime
- Source notes or provenance for the data
- Documentation for data formats and update workflows

## Getting started
1. Clone the repo.
2. Add or update data under `data/`.
3. Document sources and changes under `docs/`.

## Repository layout
- `data/` - structured data files (create as needed)
- `docs/` - documentation for data and workflows
- `scripts/` - optional helper scripts (if added later)

## Data conventions
- Use small, focused files.
- Prefer stable file names and avoid renames.
- Keep data in UTF-8; avoid non-ASCII unless needed.
- Include a short source note in docs when data is derived.

## Contributing
See `docs/CONTRIBUTING.md`.

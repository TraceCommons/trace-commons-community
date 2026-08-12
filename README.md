# trace-commons-community

Public, opt-in community surface for [Trace Commons](https://github.com/TraceCommons/trace-commons-server):
leaderboard, per-contributor profiles, and aggregate corpus analytics.

Static site (Astro), no server runtime. Consumes the
`/v1/community/...` snapshot endpoints from
[trace-commons-server](https://github.com/TraceCommons/trace-commons-server)
and renders pre-cached HTML.

**Status: Slice 2 — live API wiring.** Build pipeline fetches snapshots
from the upstream `/v1/community/leaderboard` endpoint (via
`scripts/fetch-snapshot.mjs`) and writes them to
`src/_data/snapshots/live-7d.json`. Falls back to the checked-in dummy
snapshot when `TC_API_BASE` is not set. The profile-management SPA
lands in Slice 3.

See the design specs in the server repo for the full picture:

- [Leaderboard API design](https://github.com/TraceCommons/trace-commons-server/blob/main/docs/superpowers/specs/2026-05-19-community-analytics-leaderboard-design.md)
- [Frontend design](https://github.com/TraceCommons/trace-commons-server/blob/main/docs/superpowers/specs/2026-05-19-community-frontend-design.md)

## Local dev

```sh
npm install
npm run dev
```

Open <http://localhost:4321>. The dev/build pipeline fetches a snapshot
into `src/_data/snapshots/live-7d.json` before starting Astro:

- If `TC_API_BASE` is set, hits `${TC_API_BASE}/v1/community/leaderboard`.
- Otherwise falls back to the checked-in dummy snapshot at
  `src/_data/snapshots/dummy-7d.json`.

The independent documentation site for `docs.tracecommons.ai` lives in
[`docs-site/`](./docs-site/README.md). It has its own dependencies, build,
content tree, and Cloudflare Pages target so documentation releases do not
depend on the community snapshot build.

```sh
npm run build                                                 # dummy fallback
TC_API_BASE=https://ingest.<host> npm run build               # live snapshot
TC_USE_DUMMY=1 npm run build                                  # force dummy
npm run preview  # serve ./dist locally
npm run check    # TypeScript + Astro type check
```

CI fails the build if a fetched live snapshot is older than
`TC_SNAPSHOT_MAX_AGE_SECONDS` (default 3600s), or if the upstream
returns 404 (which means
`TRACE_COMMONS_COMMUNITY_LEADERBOARD_ENABLED` is off — the site
refuses to deploy against a closed surface).

## Layout

```
src/
  _data/snapshots/    snapshot JSON (dummy now, live in Slice 2)
  layouts/Base.astro  shared layout + global CSS
  pages/
    index.astro                   landing
    leaderboard.astro             default 7d window
    contributors/[handle].astro   per-contributor profile (one per opted-in handle)
    analytics.astro               corpus aggregates (counts, novelty histogram, gate outcomes)
    profile.astro                 placeholder; SPA island ships in Slice 3
    about/
      privacy.astro
      data-policy.astro
  types.ts            TypeScript shape of the snapshot payload
```

## Privacy posture

This site renders only:

- Opt-in contributor handles (no pseudonyms).
- Aggregate counts (no per-trace data, no raw envelope content).
- Self-declared bios (≤280 bytes, plaintext, no HTML).

See [`/about/privacy`](./src/pages/about/privacy.astro) and
[`/about/data-policy`](./src/pages/about/data-policy.astro) for the public
versions of this posture.

## License

Dual MIT / Apache-2.0, matching the rest of the Trace Commons stack.

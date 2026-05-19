# trace-commons-community

Public, opt-in community surface for [Trace Commons](https://github.com/TraceCommons/trace-commons-server):
leaderboard, per-contributor profiles, and aggregate corpus analytics.

Static site (Astro), no server runtime. Consumes the
`/v1/community/...` snapshot endpoints from
[trace-commons-server](https://github.com/TraceCommons/trace-commons-server)
and renders pre-cached HTML.

**Status: Slice 1 — repo skeleton with dummy data.** Site builds against
committed dummy JSON under `src/_data/snapshots/dummy-7d.json`. The live API
wiring lands in Slice 2 once the upstream snapshot endpoints ship (server PR
TBD); the profile-management SPA lands in Slice 3.

See the design specs in the server repo for the full picture:

- [Leaderboard API design](https://github.com/TraceCommons/trace-commons-server/blob/main/docs/superpowers/specs/2026-05-19-community-analytics-leaderboard-design.md)
- [Frontend design](https://github.com/TraceCommons/trace-commons-server/blob/main/docs/superpowers/specs/2026-05-19-community-frontend-design.md)

## Local dev

```sh
npm install
npm run dev
```

Open <http://localhost:4321>. The site builds against the dummy snapshot at
`src/_data/snapshots/dummy-7d.json`.

```sh
npm run build    # production build to ./dist
npm run preview  # serve ./dist locally
npm run check    # TypeScript + Astro type check
```

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

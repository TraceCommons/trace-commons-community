#!/usr/bin/env node
//
// Build-time snapshot fetcher.
//
// Hits the upstream Trace Commons server's `/v1/community/leaderboard`
// endpoint and writes the response to
// `src/_data/snapshots/live-7d.json`. Validates basic shape + freshness
// before writing — refuses to write a stale or malformed snapshot so
// CI fails loudly instead of shipping a broken site.
//
// Env:
//   TC_API_BASE             upstream base URL (required when not using
//                           --use-dummy)
//   TC_SNAPSHOT_MAX_AGE_SECONDS
//                           refuse snapshots older than this (default
//                           3600 = 1h, matches the snapshot worker's
//                           default 15-min cadence + buffer)
//   TC_USE_DUMMY            when set to "1" / "true", copies the
//                           checked-in dummy snapshot into live-7d.json
//                           instead of fetching. Useful for offline CI
//                           runs and the first build before any server
//                           snapshot exists.
//
// Run:
//   node scripts/fetch-snapshot.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outDir = resolve(repoRoot, "src/_data/snapshots");
const outFile = resolve(outDir, "live-7d.json");
const dummyFile = resolve(outDir, "dummy-7d.json");

const explicitDummy = process.env.TC_USE_DUMMY === "1" || process.env.TC_USE_DUMMY === "true";
const apiBase = process.env.TC_API_BASE?.replace(/\/$/, "");
// Fall back to dummy when no upstream is configured. CI builds against
// dummy by default; deploy pipelines explicitly set TC_API_BASE.
const useDummy = explicitDummy || !apiBase;
if (useDummy && !explicitDummy) {
  console.warn(
    "WARNING: TC_API_BASE not set, falling back to checked-in dummy snapshot. " +
      "Set TC_API_BASE=https://ingest.<host> for a live build.",
  );
}
const maxAgeSeconds = Number(process.env.TC_SNAPSHOT_MAX_AGE_SECONDS ?? "3600");

await mkdir(outDir, { recursive: true });

async function loadDummy() {
  const text = await readFile(dummyFile, "utf8");
  return JSON.parse(text);
}

async function fetchLive() {
  if (!apiBase) {
    throw new Error(
      "TC_API_BASE is required when TC_USE_DUMMY is not set. " +
        "Set TC_API_BASE=https://ingest.<host> or TC_USE_DUMMY=1.",
    );
  }
  const url = `${apiBase}/v1/community/leaderboard`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) {
    throw new Error(
      `Upstream returned 404 — the community surface is disabled on ${apiBase} ` +
        `(TRACE_COMMONS_COMMUNITY_LEADERBOARD_ENABLED is off). Refusing to build a public site against a closed surface.`,
    );
  }
  if (!response.ok) {
    throw new Error(`Upstream ${url} returned ${response.status}`);
  }
  return await response.json();
}

function validate(snapshot) {
  const required = [
    "snapshot_id",
    "computed_at",
    "window",
    "metric",
    "min_cell_count",
    "leaderboard",
    "contributors",
    "analytics",
  ];
  for (const key of required) {
    if (!(key in snapshot)) {
      throw new Error(`Snapshot missing required key: ${key}`);
    }
  }
  if (!Array.isArray(snapshot.leaderboard)) {
    throw new Error("snapshot.leaderboard must be an array");
  }
  if (typeof snapshot.contributors !== "object" || snapshot.contributors === null) {
    throw new Error("snapshot.contributors must be an object");
  }
  // null is a valid, deliberate value: the server publishes a roster-only
  // snapshot when its analytics publication controls are unsatisfied, and
  // does not compute the aggregates at all rather than computing and
  // withholding them. The key must still be present, so a payload that
  // omits it entirely is still a malformed snapshot rather than a withheld
  // one — that distinction is checked by the `required` loop above.
  if (
    snapshot.analytics !== null &&
    (typeof snapshot.analytics !== "object" || Array.isArray(snapshot.analytics))
  ) {
    throw new Error("snapshot.analytics must be an object or null");
  }
  const computedAt = new Date(snapshot.computed_at);
  if (Number.isNaN(computedAt.getTime())) {
    throw new Error(`snapshot.computed_at is not a valid timestamp: ${snapshot.computed_at}`);
  }
  if (!useDummy) {
    const ageSeconds = (Date.now() - computedAt.getTime()) / 1000;
    if (ageSeconds > maxAgeSeconds) {
      throw new Error(
        `Snapshot is ${Math.round(ageSeconds)}s old (max ${maxAgeSeconds}s). ` +
          `Refusing to build against a stale snapshot.`,
      );
    }
  }
}

const snapshot = useDummy ? await loadDummy() : await fetchLive();
validate(snapshot);
await writeFile(outFile, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

const handleCount = Object.keys(snapshot.contributors).length;
console.log(
  `Wrote snapshot ${snapshot.snapshot_id} ` +
    `(${snapshot.leaderboard.length} ranked, ${handleCount} contributors) ` +
    `to ${outFile.replace(repoRoot + "/", "")}` +
    (useDummy ? " [DUMMY]" : ""),
);

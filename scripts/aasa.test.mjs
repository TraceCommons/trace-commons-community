// Tests for scripts/aasa.mjs and the AASA route in public/_worker.js.
// Every file these tests write goes under a fresh temp directory: nothing here
// may touch dist/ or public/, so running the tests after a build can never
// delete what the build rendered.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  AASA_PATH,
  aasaFile,
  appleAppSiteAssociation,
  renderAasa,
  verifyAasa,
  writeAasa,
} from "./aasa.mjs";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const cli = join(scriptsDir, "aasa.mjs");
const TEAM = "ABCDE12345";
const BODY = `{"webcredentials":{"apps":["${TEAM}.ai.tracecommons.shell"]}}\n`;

const tempDirs = [];
async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "aasa-test-"));
  tempDirs.push(dir);
  return dir;
}
after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

// --- rendering ----------------------------------------------------------------

test("renders webcredentials.apps only, with the default bundle id", () => {
  assert.equal(renderAasa({ TC_APPLE_TEAM_ID: TEAM }), BODY);
});

test("bundle id can be overridden, and a bad one is refused", () => {
  const body = renderAasa({ TC_APPLE_TEAM_ID: TEAM, TC_MACOS_BUNDLE_ID: "ai.example.app" });
  assert.deepEqual(JSON.parse(body).webcredentials.apps, [`${TEAM}.ai.example.app`]);
  assert.throws(() => renderAasa({ TC_APPLE_TEAM_ID: TEAM, TC_MACOS_BUNDLE_ID: "noDots" }), /TC_MACOS_BUNDLE_ID/);
});

for (const bad of ["abcde12345", "ABCDE1234", "ABCDE123456", "ABCDE-2345", "TEAMID_HERE", "XXXXXXXXXX ", " ", "ABCDE1234\n"]) {
  test(`malformed Team ID is refused: ${JSON.stringify(bad)}`, () => {
    assert.throws(() => renderAasa({ TC_APPLE_TEAM_ID: bad }), /TC_APPLE_TEAM_ID/);
    assert.throws(() => renderAasa({ TC_APPLE_TEAM_ID: bad, TC_AASA_REQUIRED: "1" }), /TC_APPLE_TEAM_ID/);
  });
}

test("unset or empty Team ID renders nothing by default and is refused when strict", () => {
  for (const env of [{}, { TC_APPLE_TEAM_ID: "" }]) {
    assert.equal(renderAasa(env), null);
    assert.throws(() => renderAasa({ ...env, TC_AASA_REQUIRED: "1" }), /TC_APPLE_TEAM_ID/);
    assert.throws(() => renderAasa(env, { strict: true }), /TC_APPLE_TEAM_ID/);
  }
});

// --- writing into a build output --------------------------------------------

test("writeAasa writes under .well-known in the given directory", async () => {
  const dir = await tempDir();
  const written = await writeAasa(dir, { TC_APPLE_TEAM_ID: TEAM });
  assert.equal(written, join(dir, ".well-known", "apple-app-site-association"));
  assert.equal(await readFile(written, "utf8"), BODY);
});

test("writeAasa removes a stale file when unset, and when the render fails", async () => {
  for (const env of [{}, { TC_APPLE_TEAM_ID: "nope" }]) {
    const dir = await tempDir();
    await mkdir(dirname(aasaFile(dir)), { recursive: true });
    await writeFile(aasaFile(dir), "stale");
    if (env.TC_APPLE_TEAM_ID) {
      await assert.rejects(writeAasa(dir, env), /TC_APPLE_TEAM_ID/);
    } else {
      assert.equal(await writeAasa(dir, env), null);
    }
    await assert.rejects(readFile(aasaFile(dir)));
  }
});

async function runIntegration(dir, env) {
  const saved = { ...process.env };
  delete process.env.TC_APPLE_TEAM_ID;
  delete process.env.TC_AASA_REQUIRED;
  Object.assign(process.env, env);
  const warnings = [];
  const logger = { warn: (m) => warnings.push(m), info: () => {} };
  try {
    await appleAppSiteAssociation().hooks["astro:build:done"]({ dir: pathToFileURL(`${dir}/`), logger });
    return warnings;
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

test("integration: renders into the build output directory Astro hands it", async () => {
  const dir = await tempDir();
  assert.deepEqual(await runIntegration(dir, { TC_APPLE_TEAM_ID: TEAM }), []);
  assert.equal(await readFile(aasaFile(dir), "utf8"), BODY);
});

test("integration: unset warns and writes nothing; malformed or strict-unset fails the build", async () => {
  const dir = await tempDir();
  const warnings = await runIntegration(dir, {});
  assert.match(warnings.join("\n"), /TC_APPLE_TEAM_ID unset; \/\.well-known\/apple-app-site-association will 404/);
  await assert.rejects(readFile(aasaFile(dir)));
  await assert.rejects(runIntegration(dir, { TC_APPLE_TEAM_ID: "nope" }), /TC_APPLE_TEAM_ID/);
  await assert.rejects(runIntegration(dir, { TC_AASA_REQUIRED: "1" }), /TC_APPLE_TEAM_ID/);
});

// --- the deploy gate ----------------------------------------------------------

function runVerify(dir, env) {
  const base = { ...process.env };
  delete base.TC_APPLE_TEAM_ID;
  delete base.TC_AASA_REQUIRED;
  return spawnSync(process.execPath, [cli, "verify", dir], { env: { ...base, ...env }, encoding: "utf8" });
}

test("verify: a set Team ID with the file missing from the output fails", async () => {
  const dir = await tempDir();
  assert.match(await verifyAasa(dir, { TC_APPLE_TEAM_ID: TEAM }), /missing/);
  const result = runVerify(dir, { TC_APPLE_TEAM_ID: TEAM });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /TC_APPLE_TEAM_ID is set but .* is missing/);
});

test("verify: a file rendered from a different Team ID fails", async () => {
  const dir = await tempDir();
  await writeAasa(dir, { TC_APPLE_TEAM_ID: "ZZZZZZZZZZ" });
  assert.equal(runVerify(dir, { TC_APPLE_TEAM_ID: TEAM }).status, 1);
});

test("verify: passes when the file matches, and when no Team ID is set", async () => {
  const dir = await tempDir();
  assert.equal(runVerify(dir, {}).status, 0);
  await writeAasa(dir, { TC_APPLE_TEAM_ID: TEAM });
  const result = runVerify(dir, { TC_APPLE_TEAM_ID: TEAM });
  assert.equal(result.status, 0, result.stderr);
});

test("verify: strict mode fails without a Team ID, and a malformed one fails", async () => {
  const dir = await tempDir();
  assert.equal(runVerify(dir, { TC_AASA_REQUIRED: "1" }).status, 1);
  assert.equal(runVerify(dir, { TC_APPLE_TEAM_ID: "nope" }).status, 1);
});

test("verify: usage error without a directory", () => {
  assert.equal(spawnSync(process.execPath, [cli, "verify"]).status, 2);
});

// --- the worker route ---------------------------------------------------------

async function loadWorker() {
  const source = await readFile(join(scriptsDir, "..", "public", "_worker.js"), "utf8");
  const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  return mod.default;
}

const ETAG = '"aasa-etag-1"';

// A stand-in for Pages' ASSETS binding. It honours If-None-Match the way the
// real asset layer does (that is what produced the 304-to-404 bug), and records
// what it was asked for.
function assetsFor(files, { etag = ETAG, notFound = { status: 404, body: "<html>404 page</html>" } } = {}) {
  const seen = [];
  return {
    seen,
    async fetch(request) {
      seen.push(request);
      const path = new URL(request.url).pathname;
      if (!(path in files)) {
        return new Response(notFound.body, { status: notFound.status, headers: { "content-type": "text/html" } });
      }
      if (request.headers.get("if-none-match") === etag) {
        return new Response(null, { status: 304, headers: { etag } });
      }
      return new Response(request.method === "HEAD" ? null : files[path], {
        status: 200,
        headers: { "content-type": "application/octet-stream", etag },
      });
    },
  };
}

const AASA_URL = `https://tracecommons.ai${AASA_PATH}`;

test("worker serves the rendered file as a 200 application/json with no redirect", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request(AASA_URL), { ASSETS: assetsFor({ [AASA_PATH]: BODY }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("etag"), ETAG);
  assert.equal(await response.text(), BODY);
});

test("worker answers HEAD with headers and no body", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request(AASA_URL, { method: "HEAD" }), { ASSETS: assetsFor({ [AASA_PATH]: BODY }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(await response.text(), "");
});

test("worker answers a matching revalidation with 304, never 404", async () => {
  const worker = await loadWorker();
  const assets = assetsFor({ [AASA_PATH]: BODY });
  for (const inm of [ETAG, `W/${ETAG}`, `"other", ${ETAG}`, "*"]) {
    const response = await worker.fetch(new Request(AASA_URL, { headers: { "if-none-match": inm } }), { ASSETS: assets });
    assert.equal(response.status, 304, inm);
    assert.equal(response.headers.get("etag"), ETAG);
  }
  // Conditional headers never reach the asset layer.
  assert.ok(assets.seen.every((request) => request.headers.get("if-none-match") === null));
  const stale = await worker.fetch(new Request(AASA_URL, { headers: { "if-none-match": '"old"' } }), { ASSETS: assets });
  assert.equal(stale.status, 200);
  assert.equal(await stale.text(), BODY);
});

test("worker 404s, with no-store, when the file was not rendered", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request(AASA_URL), { ASSETS: assetsFor({}) });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(response.headers.get("content-type"), /json/);
});

test("worker never relabels an HTML fallback served with 200 as JSON", async () => {
  const worker = await loadWorker();
  const assets = assetsFor({}, { notFound: { status: 200, body: "<!doctype html><html>index</html>" } });
  const response = await worker.fetch(new Request(AASA_URL), { ASSETS: assets });
  assert.equal(response.status, 404);
  assert.doesNotMatch(response.headers.get("content-type"), /json/);
});

test("worker refuses JSON that is not an association file", async () => {
  const worker = await loadWorker();
  for (const body of ['{"applinks":{}}', '{"webcredentials":{"apps":[]}}', '{"webcredentials":{"apps":[1]}}', "[]", "null"]) {
    const response = await worker.fetch(new Request(AASA_URL), { ASSETS: assetsFor({ [AASA_PATH]: body }) });
    assert.equal(response.status, 404, body);
  }
});

test("worker refuses to relay a redirect from the asset layer", async () => {
  const worker = await loadWorker();
  const env = { ASSETS: { fetch: async () => new Response(null, { status: 308, headers: { location: "/elsewhere" } }) } };
  const response = await worker.fetch(new Request(AASA_URL), env);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
});

test("worker refuses methods other than GET and HEAD on the AASA path", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request(AASA_URL, { method: "POST", body: "x" }), { ASSETS: assetsFor({ [AASA_PATH]: BODY }) });
  assert.equal(response.status, 405);
});

test("other paths still go straight to the asset layer", async () => {
  const worker = await loadWorker();
  const assets = assetsFor({ "/leaderboard/": "<html>board</html>" });
  const response = await worker.fetch(new Request("https://tracecommons.ai/leaderboard/"), { ASSETS: assets });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<html>board</html>");
  const other = await worker.fetch(new Request("https://tracecommons.ai/.well-known/security.txt"), { ASSETS: assets });
  assert.equal(other.status, 404);
  assert.equal(assets.seen.at(-1).url, "https://tracecommons.ai/.well-known/security.txt");
});

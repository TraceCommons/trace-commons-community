// apple-app-site-association for the macOS app's webcredentials association
// (native passkeys; TraceCommons/trace-commons#1120, #1124).
//
// Rendered at build time from TC_APPLE_TEAM_ID by the integration in
// astro.config.mjs, straight into the build output, so it never lives in
// public/ and nothing that runs outside a build can delete it.
//
// Never ships a bad ID or a placeholder:
//   - malformed TC_APPLE_TEAM_ID  -> the build fails;
//   - unset or empty              -> no file, a warning, and the build goes on
//                                    (the path then 404s, which is safe);
//   - unset with TC_AASA_REQUIRED=1 -> the build fails.
// The Team ID is not a secret: every signed binary carries it.
//
// CLI: `node scripts/aasa.mjs verify <dir>` exits 1 when TC_APPLE_TEAM_ID is
// set but <dir>/.well-known/apple-app-site-association is missing or differs
// from what that ID renders. deploy.yml runs it before uploading dist/.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AASA_PATH = "/.well-known/apple-app-site-association";
export const DEFAULT_BUNDLE_ID = "ai.tracecommons.shell";
export const TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export function isStrict(env) {
  return env.TC_AASA_REQUIRED === "1";
}

// Returns the file body, or null when the Team ID is unset/empty and strict is
// false. Throws on a malformed ID, and on an unset one when strict.
export function renderAasa(env, { strict = isStrict(env) } = {}) {
  const teamId = env.TC_APPLE_TEAM_ID ?? "";
  if (teamId === "" && !strict) {
    return null;
  }
  if (!TEAM_ID_PATTERN.test(teamId)) {
    throw new Error(
      "TC_APPLE_TEAM_ID must be set to the 10 uppercase alphanumeric characters of the Apple Team ID that signs the macOS app",
    );
  }
  const bundleId = env.TC_MACOS_BUNDLE_ID || DEFAULT_BUNDLE_ID;
  if (!BUNDLE_ID_PATTERN.test(bundleId)) {
    throw new Error("TC_MACOS_BUNDLE_ID is not a valid bundle identifier");
  }
  return `${JSON.stringify({ webcredentials: { apps: [`${teamId}.${bundleId}`] } })}\n`;
}

export function aasaFile(outDir) {
  return join(outDir, ...AASA_PATH.split("/").filter(Boolean));
}

// Writes the file into outDir, or removes any file there when there is nothing
// to render. Removing first means a failed render never leaves an old file.
// Returns the path written, or null.
export async function writeAasa(outDir, env, options) {
  const file = aasaFile(outDir);
  await rm(file, { force: true });
  const body = renderAasa(env, options);
  if (body === null) {
    return null;
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body);
  return file;
}

// Returns null when outDir holds what env renders (or env renders nothing),
// otherwise a reason.
export async function verifyAasa(outDir, env) {
  const expected = renderAasa(env);
  if (expected === null) {
    return null;
  }
  const actual = await readFile(aasaFile(outDir), "utf8").catch(() => null);
  if (actual === null) {
    return `TC_APPLE_TEAM_ID is set but ${AASA_PATH} is missing from ${outDir}`;
  }
  if (actual !== expected) {
    return `${AASA_PATH} in ${outDir} does not match what TC_APPLE_TEAM_ID renders`;
  }
  return null;
}

// Astro integration: renders into the build output once the build is done.
export function appleAppSiteAssociation() {
  return {
    name: "apple-app-site-association",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        let written;
        try {
          written = await writeAasa(outDir, process.env);
        } catch (error) {
          throw new Error(`apple-app-site-association: ${error.message}`);
        }
        if (written === null) {
          logger.warn(`not rendered: TC_APPLE_TEAM_ID unset; ${AASA_PATH} will 404`);
        } else {
          logger.info(`wrote ${written}`);
        }
      },
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, outDir] = process.argv.slice(2);
  if (command !== "verify" || !outDir) {
    console.error("usage: node scripts/aasa.mjs verify <build-output-dir>");
    process.exit(2);
  }
  let problem;
  try {
    problem = await verifyAasa(outDir, process.env);
  } catch (error) {
    problem = error.message;
  }
  if (problem !== null) {
    console.error(`aasa verify: ${problem}`);
    process.exit(1);
  }
  console.log(
    process.env.TC_APPLE_TEAM_ID
      ? `aasa verify: ${aasaFile(outDir)} matches TC_APPLE_TEAM_ID`
      : "aasa verify: TC_APPLE_TEAM_ID unset, nothing to verify",
  );
}

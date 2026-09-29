const COMMUNITY_UPSTREAM = "https://ingest.tracecommons.ai";

const AASA_PATH = "/.well-known/apple-app-site-association";

function proxiedHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  headers.set("x-tracecommons-proxy", "community");
  headers.delete("set-cookie");
  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/v1/community/")) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        });
      }

      const upstream = new URL(url.pathname.replace(/^\/api/, ""), COMMUNITY_UPSTREAM);
      upstream.search = url.search;
      const response = await fetch(upstream, {
        method: request.method,
        headers: {
          Accept: request.headers.get("Accept") || "application/json",
        },
      });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: proxiedHeaders(response),
      });
    }

    if (url.pathname === AASA_PATH) {
      return serveAasa(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

// The apple-app-site-association file (native passkeys). Apple's fetcher wants
// a 200, no redirect, and application/json; the file has no extension, so the
// asset layer would label it application/octet-stream, and _headers is not a
// dependable way to relabel a response that passes through this worker.
//
// Three things this handler refuses to do:
//   - Turn a revalidation into a 404. Conditional request headers are not
//     forwarded to the asset layer, so it always answers 200 with the body;
//     If-None-Match is answered here against the asset's ETag instead.
//   - Relabel something that is not the association file as JSON. The body
//     must parse and carry webcredentials.apps, so an HTML fallback (a 404
//     page, or an index served with 200) can never go out as application/json.
//   - Pass on anything but a plain 200 from the asset layer (redirects
//     included). All of those become a real 404 that no cache keeps.
async function serveAasa(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const asset = await env.ASSETS.fetch(new Request(url.toString(), { method: "GET", redirect: "manual" }));
  if (asset.status !== 200) {
    return aasaNotFound();
  }
  const body = await asset.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return aasaNotFound();
  }
  const apps = parsed?.webcredentials?.apps;
  if (!Array.isArray(apps) || apps.length === 0 || !apps.every((app) => typeof app === "string")) {
    return aasaNotFound();
  }

  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  const etag = asset.headers.get("etag");
  if (etag) {
    headers.set("ETag", etag);
    if (etagMatches(request.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers });
    }
  }
  headers.set("Content-Length", String(new TextEncoder().encode(body).byteLength));
  return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
}

function aasaNotFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Weak comparison (RFC 9110 13.1.2): a W/ prefix is ignored on either side.
function etagMatches(ifNoneMatch, etag) {
  if (!ifNoneMatch) {
    return false;
  }
  const strip = (tag) => tag.trim().replace(/^W\//, "");
  const wanted = strip(etag);
  return ifNoneMatch.split(",").some((tag) => tag.trim() === "*" || strip(tag) === wanted);
}

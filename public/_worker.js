const COMMUNITY_UPSTREAM = "https://ingest.tracecommons.ai";

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

    return env.ASSETS.fetch(request);
  },
};

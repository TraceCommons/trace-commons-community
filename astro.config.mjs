// @ts-check
import { defineConfig } from "astro/config";

// Site is read-mostly + cacheable. No server runtime; pages are
// pre-rendered against the snapshot JSON in src/_data/.
//
// Edit `site` and `base` when promoting from preview to a real
// domain. The `compressHTML` flag is on so the build outputs
// production-shaped HTML by default.
export default defineConfig({
  site: "https://tracecommons.ai",
  trailingSlash: "ignore",
  compressHTML: true,
  build: {
    format: "directory",
  },
  /* The terms, data policy and consent scopes were three places saying
     overlapping things. They are now one page, and these two URLs stay alive
     because they are already in the wild -- in the site footer of every page
     published so far, and in whatever anyone has bookmarked or pasted. A dead
     link to a privacy policy reads as a company that took its privacy policy
     down. */
  redirects: {
    "/about/privacy": "/legal",
    "/about/data-policy": "/legal",
  },
  vite: {
    build: {
      // The production CSP in public/_headers sets script-src 'self' with no
      // unsafe-inline. Astro inlines hoisted script bundles under the default
      // 4KB limit, which that CSP blocks, so force every asset to a real file.
      assetsInlineLimit: 0,
    },
  },
});

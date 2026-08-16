import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const dist = new URL("../dist/", import.meta.url);
const distPath = decodeURIComponent(dist.pathname);
const htmlFiles = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".html")) htmlFiles.push(path);
  }
}

function targetExists(pathname) {
  const clean = decodeURIComponent(pathname).replace(/^\/+/, "");
  const direct = join(distPath, clean);
  if (existsSync(direct)) return true;
  if (existsSync(join(direct, "index.html"))) return true;
  if (!extname(direct) && existsSync(`${direct}.html`)) return true;
  return false;
}

if (!existsSync(distPath)) {
  throw new Error("dist/ does not exist; run npm run build first");
}

walk(distPath);
const failures = [];

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const pagePath = `/${relative(distPath, file).replace(/index\.html$/, "")}`;
  for (const match of html.matchAll(/href=["']([^"']+)["']/g)) {
    const href = match[1];
    if (
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("http://") ||
      href.startsWith("https://")
    ) {
      continue;
    }

    const url = new URL(href, `https://docs.tracecommons.ai${pagePath}`);
    if (url.origin !== "https://docs.tracecommons.ai") continue;
    if (!targetExists(url.pathname)) {
      failures.push(`${relative(distPath, file)} -> ${href}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Broken internal links:\n" + failures.join("\n"));
  process.exit(1);
}

console.log(`Checked internal links in ${htmlFiles.length} generated pages.`);

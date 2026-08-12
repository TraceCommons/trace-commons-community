// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://docs.tracecommons.ai",
  trailingSlash: "always",
  compressHTML: true,
  integrations: [
    starlight({
      title: "Trace Commons",
      description:
        "Submit AI agent traces with the contributor CLI, desktop apps, Ironclaw, or the Trace Commons API.",
      logo: {
        src: "./public/trace-mark.svg",
        replacesTitle: false,
      },
      favicon: "/favicon.svg",
      customCss: ["./src/styles/trace-commons.css"],
      social: [
        {
          icon: "github",
          label: "Trace Commons on GitHub",
          href: "https://github.com/TraceCommons",
        },
      ],
      lastUpdated: true,
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Choose a submission path", slug: "start/choose-a-path" },
            { label: "How submission works", slug: "start/how-it-works" },
            { label: "Consent and redaction", slug: "start/consent-and-redaction" },
          ],
        },
        {
          label: "Contributor CLI",
          items: [
            { label: "CLI quickstart", slug: "cli/quickstart" },
            { label: "Select and submit traces", slug: "cli/submitting" },
            {
              label: "Daemon and withdrawal",
              slug: "cli/daemon-and-withdrawal",
            },
          ],
        },
        {
          label: "Desktop apps",
          items: [
            { label: "GUI overview", slug: "gui/overview" },
            { label: "Review and approve", slug: "gui/review-and-approve" },
          ],
        },
        {
          label: "Ironclaw",
          items: [
            { label: "Ironclaw quickstart", slug: "ironclaw/quickstart" },
            { label: "Queues and operations", slug: "ironclaw/operations" },
          ],
        },
        {
          label: "Build with the API",
          items: [
            { label: "API quickstart", slug: "api/quickstart" },
            { label: "Authentication", slug: "api/authentication" },
            { label: "Envelope contract", slug: "api/envelope" },
            { label: "Status and withdrawal", slug: "api/status-and-revocation" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Statuses and outcomes", slug: "reference/statuses" },
            { label: "Troubleshooting", slug: "reference/troubleshooting" },
            { label: "Verified source versions", slug: "reference/versions" },
          ],
        },
      ],
    }),
  ],
});

import type { LeaderboardEntry, Snapshot } from "../types";

const DEFAULT_API_BASE = "/api";

function readApiBase(): string {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="tc-community-api-base"]',
  );
  return (meta?.content || DEFAULT_API_BASE).replace(/\/$/, "");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatScore(score: number): string {
  return score.toFixed(1);
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function contributorHref(entry: LeaderboardEntry): string {
  return `/contributors/${encodeURIComponent(entry.display_handle)}`;
}

/* These builders have to emit the same markup as the Astro components that
   render the first paint, or the tables visibly degrade on first refresh:
   .num is what carries tabular-nums and right alignment in brand.css. Any
   column change in leaderboard.astro / analytics.astro belongs here too. */

function leaderboardRow(entry: LeaderboardEntry): string {
  const handle = escapeHtml(entry.display_handle);
  return `
    <tr>
      <td class="num">${entry.rank}</td>
      <td><a href="${contributorHref(entry)}">${handle}</a></td>
      <td class="num">${formatScore(entry.score)}</td>
      <td class="num">${entry.accepted_count}</td>
      <td class="num">${formatRate(entry.accept_rate)}</td>
      <td class="num muted">${formatDate(entry.public_since)}</td>
    </tr>
  `;
}

function topContributorRow(entry: LeaderboardEntry): string {
  const handle = escapeHtml(entry.display_handle);
  return `
    <tr>
      <td class="num">${entry.rank}</td>
      <td><a href="${contributorHref(entry)}">${handle}</a></td>
      <td class="num">${formatScore(entry.score)}</td>
      <td class="num">${entry.accepted_count}</td>
    </tr>
  `;
}

function show(selector: string): void {
  document
    .querySelectorAll<HTMLElement>(selector)
    .forEach((element) => (element.hidden = false));
}

function setText(selector: string, text: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = text;
}

function renderLeaderboard(snapshot: Snapshot): void {
  const body = document.querySelector<HTMLElement>("[data-leaderboard-body]");
  if (!body) return;

  body.innerHTML =
    snapshot.leaderboard.length === 0
      ? `<tr><td colspan="6" class="muted">No public contributors yet.</td></tr>`
      : snapshot.leaderboard.map(leaderboardRow).join("");

  /* A build made against the fallback snapshot ships these hidden, because it
     had no figures it was willing to assert. Real data arriving is what
     unhides them. */
  show("[data-leaderboard-table]");
  show("[data-snapshot-summary]");

  const computedAt = new Date(snapshot.computed_at);
  setText(
    "[data-snapshot-summary]",
    `Ranked by ${snapshot.metric}. Snapshot ${snapshot.snapshot_id.slice(
      0,
      12,
    )}... computed at ${computedAt.toUTCString()}. Min-cell guard: ${
      snapshot.min_cell_count
    }.`,
  );
}

function renderHome(snapshot: Snapshot): void {
  const body = document.querySelector<HTMLElement>(
    "[data-top-contributors-body]",
  );
  const empty = document.querySelector<HTMLElement>(
    "[data-top-contributors-empty]",
  );
  if (!body) return;

  const topThree = snapshot.leaderboard.slice(0, 3);
  body.innerHTML = topThree.map(topContributorRow).join("");
  if (empty) empty.hidden = topThree.length > 0;
  const table = document.querySelector<HTMLElement>(
    "[data-top-contributors-table]",
  );
  if (table) table.hidden = topThree.length === 0;
}

function renderAnalytics(snapshot: Snapshot): void {
  const a = snapshot.analytics;
  show("[data-analytics-table]");
  setText(
    "[data-stat-total-submissions]",
    a.total_submissions.toLocaleString(),
  );
  setText("[data-stat-total-accepted]", a.total_accepted.toLocaleString());
  setText("[data-stat-total-rejected]", a.total_rejected.toLocaleString());
  setText("[data-stat-accept-rate]", formatRate(a.accept_rate));
  setText("[data-analytics-window]", a.window);

  const noveltyBody = document.querySelector<HTMLElement>(
    "[data-novelty-body]",
  );
  if (noveltyBody) {
    const maxHistogram = Math.max(
      ...a.novelty_histogram.map((bucket) => bucket.count),
      1,
    );
    noveltyBody.innerHTML = a.novelty_histogram
      .map(
        (bucket) => `
          <tr>
            <td class="num muted">${bucket.bucket_micros.toLocaleString()}</td>
            <td class="num">${bucket.count}</td>
            <td>
              <span class="bar" style="width: ${
                (bucket.count / maxHistogram) * 100
              }%"></span>
            </td>
          </tr>
        `,
      )
      .join("");
  }

  const gateBody = document.querySelector<HTMLElement>("[data-gate-body]");
  if (gateBody) {
    const gateEntries = Object.entries(a.gate_outcomes).sort(
      (x, y) => y[1] - x[1],
    );
    const gateTotal = gateEntries.reduce((acc, [, n]) => acc + n, 0);
    gateBody.innerHTML = gateEntries
      .map(
        ([label, count]) => `
          <tr>
            <td><code>${escapeHtml(label)}</code></td>
            <td class="num">${count}</td>
            <td class="num">${gateTotal > 0 ? ((count / gateTotal) * 100).toFixed(1) : "0.0"}%</td>
          </tr>
        `,
      )
      .join("");
  }
}

/* True when the build had no figures it was willing to assert, so the page is
   currently explaining that rather than showing numbers. The banner is the
   marker for that state and is hidden the moment real data arrives. */
function isShowingPlaceholderState(): boolean {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-dummy-snapshot-banner]"),
  ).some((element) => !element.hidden);
}

function clearPreviewBanner(): void {
  document
    .querySelectorAll<HTMLElement>("[data-dummy-snapshot-banner]")
    .forEach((element) => {
      element.hidden = true;
    });
}

function showRefreshStatus(
  text: string,
  kind: "muted" | "error" = "muted",
): void {
  document
    .querySelectorAll<HTMLElement>("[data-live-snapshot-status]")
    .forEach((element) => {
      element.textContent = text;
      element.className = kind;
    });
}

/* The server answers 503 while it is deliberately withholding community
   aggregates — it has publication controls it will not publish without. That
   is the normal state today, not a fault, and the page already explains it in
   prose. Distinguishing it here is what stops the reader being told the same
   thing twice, once calmly and once in red with an HTTP status attached. */
class SnapshotWithheld extends Error {}

async function fetchSnapshot(): Promise<Snapshot> {
  const response = await fetch(`${readApiBase()}/v1/community/leaderboard`, {
    headers: { Accept: "application/json" },
    cache: "no-cache",
  });
  if (response.status === 503) {
    throw new SnapshotWithheld();
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as Snapshot;
}

async function refreshSnapshot(): Promise<void> {
  try {
    const snapshot = await fetchSnapshot();
    clearPreviewBanner();
    renderHome(snapshot);
    renderLeaderboard(snapshot);
    renderAnalytics(snapshot);
    showRefreshStatus(
      `Live snapshot refreshed ${new Date(snapshot.computed_at).toLocaleString()}.`,
    );
  } catch (error) {
    if (error instanceof SnapshotWithheld) {
      // Say nothing. The build-time state is already on the page and is
      // still accurate, and a reader who is told "not live yet" does not
      // also need to be told the fetch for it returned 503.
      showRefreshStatus("");
      return;
    }
    // Anything else is a genuine fault, but the status code belongs in the
    // console for whoever is debugging, not in the page for whoever is
    // reading. What the reader needs is whether the figures above are stale.
    console.warn("[trace-commons] live snapshot refresh failed:", error);
    // On a placeholder build there are no figures above to be stale about,
    // and the page says so already. Telling that reader the refresh failed
    // adds a second, worse explanation of the same situation.
    if (isShowingPlaceholderState()) {
      showRefreshStatus("");
      return;
    }
    showRefreshStatus(
      "Could not reach the live figures just now. The numbers above are from the last build.",
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void refreshSnapshot();
});

import type { Snapshot } from "../types";

/* The checked-in fallback snapshot carries invented contributors with
   invented scores. That is fine for local work and for CI, and not fine on a
   public domain: a reader cannot tell a placeholder leaderboard from a real
   one, and a labelled banner does not undo the fact that the names and the
   numbers on the page are asserted.

   So every page that renders snapshot data asks this first, and when it is
   true it says the leaderboard is not live yet instead of rendering figures.
   The markup and the hydration hooks stay in place either way, so a
   successful live refresh fills them in without a rebuild. */
export function isPlaceholder(snapshot: Snapshot): boolean {
  return snapshot.snapshot_id.startsWith("dummy-");
}

/* Shown wherever figures would otherwise be. Kept in one place so pages
   cannot drift into describing the same state differently.

   The roster and the corpus analytics are withheld by different controls and
   can be withheld independently, so they get different words. Saying "the
   leaderboard is not live" on the analytics page was wrong the moment the
   server could publish one without the other. */
export const NOT_LIVE_HEADING = "The leaderboard is not live yet";

export const NOT_LIVE_BODY =
  "Contributor rankings stay withheld until the corpus has a minimum cell size of at least two and at least two tenants in the cohort, so that no row is a single contributor and no “community” figure is one tenant's corpus under another name.";

export const ANALYTICS_NOT_LIVE_HEADING = "Corpus analytics are not live yet";

export const ANALYTICS_NOT_LIVE_BODY =
  "These aggregates span every contributor, including those who never opted in to being listed. They stay withheld until the server has a noise mechanism approved for publication. Until then there are no figures here rather than unprotected ones.";

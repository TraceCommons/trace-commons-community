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

/* Shown wherever figures would otherwise be. Kept in one place so the three
   pages cannot drift into describing the same state differently. */
export const NOT_LIVE_HEADING = "The leaderboard is not live yet";

export const NOT_LIVE_BODY =
  "Community aggregates stay withheld until the server has an approved noise mechanism, a minimum cell size of at least two, and at least two tenants in the cohort. Until all three hold, there are no figures to show rather than unprotected ones.";

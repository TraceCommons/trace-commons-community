/* The one place the site names the consent policy version.
 *
 * Must equal TRACE_CONTRIBUTION_POLICY_VERSION in
 * crates/trace-commons-protocol/src/trace_contribution.rs of the server repo.
 * Every envelope records the version its contributor consented under, so the
 * legal page and the envelope have to agree for "which terms did this person
 * agree to" to be answerable. A test in the server repo fails when the
 * ConsentScope enum changes without this being bumped.
 */
export const POLICY_VERSION = "2026-04-24";

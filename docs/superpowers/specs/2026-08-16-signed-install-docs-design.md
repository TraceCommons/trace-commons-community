# Documenting the signed binaries

Date: 2026-08-16

## Problem

`contributor-v0.1.0` is published: Developer ID-signed and Apple-notarized macOS
binaries for both architectures, an Authenticode-signed and RFC3161-timestamped
Windows executable, a Linux binary, and a checksum beside each. `brew install
trace-commons-contributor` works. The signature chain on a published asset was
verified independently: `Developer ID Application: Iqlusion Inc (KXSWJN7WY8)` →
Developer ID Certification Authority → Apple Root CA, with a secure timestamp.

Every contributor-facing page still says none of that exists.

- `src/pages/install.astro` (community site): "**Prebuilt binaries are not
  published yet.** Building from source needs a Rust toolchain, which is real
  friction and we know it."
- `docs-site/src/content/docs/cli/quickstart.mdx` (docs.tracecommons.ai):
  "Prebuilt release binaries are not available in the source contract verified
  for this page. Build the contributor from source until a release page is
  published."

Both were honest when written. Both are now wrong, and both send contributors to
`cargo build` when a signed binary is one command away. That matters more than
convenience: the app reads a contributor's coding transcripts, and the whole
argument for signing it is that the install path should not require trusting an
unverified download.

## Sequencing, and why

Two pull requests, in order.

**PR 1 — land the docs site.** `feat/docs-site` (35 files, 10,562 insertions,
Cloudflare Pages project `trace-commons-docs`) exists only as a local worktree
and has never been pushed. That is a single point of failure independent of this
work. It is merged on its own so the install changes have a reviewable base and
so a large body of documentation stops living on one laptop. Verified building
before proposal: 21 pages, search index and sitemap, no errors.

**PR 2 — the install content**, branched off the new `main`.

Not combined: reviewing install copy inside a 10k-line diff serves neither.

## What changes

| File | Change |
| --- | --- |
| `src/pages/install.astro` | Invert the page as its own comment intends — downloads and Homebrew first, build-from-source last |
| `docs-site/src/content/docs/cli/quickstart.mdx` | Replace the "not available" caution with real install paths |
| `docs-site/src/content/docs/gui/overview.mdx` | Add how to obtain the app: cask and flatpak. It currently describes the GUI without saying how to get it |
| `trace-commons-server/README.md` | Short install section pointing at releases and the tap |

## Handling the duplication deliberately

Install instructions will exist on both the marketing site and the docs site,
and duplicated instructions drift. So they are not peers: the community site
page carries the platform table, Homebrew, and verification — enough to get
someone installed — and links to docs.tracecommons.ai for the full walkthrough,
which remains the canonical home. One entry point, one source of depth.

## The content

Per-platform downloads with real asset names and the tag they come from, then
Homebrew, then verification inline per platform rather than in a separate
document. A standalone "verifying your download" page is a page nobody clicks;
the check belongs beside the download it applies to.

Two specifics that are easy to omit and expensive to omit:

- **`brew trust tracecommons/tap` is mandatory.** Homebrew 6 refuses to load a
  formula from an untrusted third-party tap: "Refusing to load formula
  tracecommons/tap/trace-commons-contributor from untrusted tap". Verified
  2026-08-16. Without this line every contributor stalls on their first command.
- **The macOS app is Apple silicon only** at 0.1.0. The DMG is built on one
  architecture with no `lipo` step, and the cask carries
  `depends_on arch: :arm64`. Said outright rather than left for an Intel user to
  discover.

### The platform truths, stated rather than glossed

| Platform | Ships | True of it |
| --- | --- | --- |
| macOS CLI | both architectures | Developer ID signed, Apple notarized |
| macOS app | Apple silicon only | signed, notarized, stapled |
| Windows CLI | x86_64 | Authenticode via Azure Trusted Signing, RFC3161 timestamped |
| Linux CLI | x86_64 | **unsigned** — the published checksum is the only check |
| Linux app | flatpak | GPG-signed OSTree repo |

The Linux CLI being unsigned is stated, not omitted. A page that implies
uniform signing is a page that teaches contributors not to look.

## Verification gate

Nothing in PR 2 merges until every command and link on the changed pages has
been executed against the real published artifacts — not reasoned about, run.
The CLI half is verifiable now. The app half waits for `app-v0.1.0` to publish;
its first run failed on two environment facts (the runner shipped Swift 5.10
against a manifest wanting 6.0, and the flatpak SDK's rust was 1.81 against a
crate needing 1.92) and is being re-cut.

Concretely: `brew tap`, `brew trust` and `brew install` run on a machine that
did not build the artifact; `codesign --verify` and `codesign -dvvv` against the
downloaded macOS binary; `sha256sum -c` against a sidecar; and every download URL
fetched rather than assumed.

## Out of scope

- The three open copy PRs (#4, #5, #7) and the eleven uncommitted files on
  `devfolio-integration-page`. Untouched deliberately: release documentation
  should not be entangled with in-flight copy revisions.
- `docs/release-runbook.md` in trace-commons-server, which is operator-facing and
  correct as it stands.
- A universal (`lipo`) macOS app build. Worth doing; not this.

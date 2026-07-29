# Messaging reframe: access asymmetry

**Date:** 2026-07-29
**Scope:** Copy only. No structural, visual, or code changes beyond page prose.

## Problem

The site's framing treated traces as a commodity with a fairer payout attached.
The landing page's payoff sentence oriented the reader toward frontier labs as
the customer ("Frontier labs, auditors, and regulators can later query the
register"), and defined Trace Credits by the money buyers would eventually pay.
Contributors read as suppliers into a pipeline, ranked by score.

## New thesis

**Access is the bottleneck.** A handful of labs can see how AI agents actually
behave. Almost no one else can. Whoever can watch agents fail is the only party
equipped to improve them, audit them, or build anything that competes. Trace
Commons is a register of that evidence held under terms its contributors set.

The inversion: the register is *held by* contributors, not *fed by* them.

## Published commitments

Three, published before they are convenient:

1. **Contributors set the terms of use, and those terms bind.** Consent scopes
   decide what any query may do with a record. Nothing exceeds the scope. Scopes
   are revocable. *Enforced in the pipeline today.*
2. **Corpus-level analytics stay open to everyone.** No invite, no account, no
   payment.
3. **When buyers pay to query, that flows to contributors.** Credits are the
   mechanism. Not a platform collecting rent on other people's work.

Explicitly **not** committed: equal access terms for open-model builders and
well-funded labs. Do not claim non-preferential tiers anywhere on the site.

## Honest stage statement

The invite-only pilot contradicts an access argument unless the stage is named.
The landing page states plainly that a register has to exist before it can be
opened, that a small invited cohort is building it now, and that the three
commitments are commitments rather than features exercisable today.

## Landing page structure

1. The asymmetry — opening claim, no preamble
2. What Trace Commons is — mechanism as answer to the bottleneck; novelty and
   substance gates reframed as what keeps the register worth opening
3. Where we actually are — the stage statement
4. Three commitments — named, prominent
5. What's open right now — points at /analytics and /leaderboard
6. Top contributors, then how to join

## Sitewide changes

| Surface | Change |
|---|---|
| `Base.astro` footer | Thesis line replaces pipeline description |
| `Base.astro` meta description | Access-framed, for search and link previews |
| `/leaderboard` intro | Roster of people building the register, not a supplier ranking |
| `/analytics` intro | Named as the open surface; commitment #2 made visible |
| `/about/data-policy` | One framing sentence: consent scopes are the access mechanism |
| `/about/privacy` | Unchanged |
| `README.md` | First paragraph only |

Untouched: nav, page structure beyond index, `/devfolio`, visual design, all
application code.

## Language retired

- "Frontier labs, auditors, and regulators can later query the register under
  selective disclosure" as the page's payoff
- "how recognition flows back when buyers later pay to query the evidence"
- Trace Credits defined as points or as compensation; now a claim on the
  register's proceeds

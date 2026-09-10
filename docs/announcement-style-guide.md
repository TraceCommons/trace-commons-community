# Announcement style guide

Use this guide for Trace Commons release posts and their summaries on the
community site. It records the editorial feedback agreed on 10 September 2026.

## Start with what people can do

Describe the change in capabilities. A reader should quickly understand what
is available, why it helps, and how to use it.

Tell a simple story of progress: the previous release enabled one task; this
release makes it easier or adds another task. Keep that comparison to one or
two sentences. Let the capabilities carry the story.

Avoid mood, self-praise, metaphors, and claims such as “a stronger foundation”
or “the contribution vouches for itself.” State the action instead: “You can
contribute without an invite when your session includes a checkable receipt.”

## Keep the reading effort low

- Use simple English, familiar words, and active verbs.
- Give each paragraph one purpose. Prefer short sentences.
- Put the main point first; explain only what the reader needs next.
- Introduce a concept before using it to explain another concept.
- Use the same name for the same thing throughout the post.
- Use a short list for parallel capabilities or steps. Avoid nested lists.
- Remove repeated explanations and limits. Say each thing once.

Use plain English as the working standard. Do not claim compliance with a
formal controlled-English specification without a separate review.

## Explain unfamiliar terms through use

Prefer the user's action to an internal component name. When a technical term
is necessary, define it at first use in one short sentence.

| Avoid in general release copy | Prefer |
| --- | --- |
| Credential acquisition | Sign in to your account |
| Ambient credential | A key set up outside the app |
| Eligibility surface | The list shows which sessions you can submit |
| Trace, without explanation | A trace is a record of a session with an AI tool |
| Receipt, without explanation | A receipt is a digitally signed record of a request and response |

Keep exact interface labels when they help someone find a control. Put setup
commands and detailed configuration instructions in linked documentation.

## Describe capabilities, not implementation history

Explain the visible result of a fix: “The app picks up the new key without a
restart.” Omit the debugging story, internal disagreements, test fixtures,
database migrations, signature algorithms, and hardware registers.

Keep technical detail only when it changes a reader's decision or explains an
essential limit. Link to technical documentation for the full account.

## Lead with what is available

List the release's useful additions near the top. Give each major capability
a section with an action-based heading, such as “Import opencode sessions.”
Explain what the user does and what happens next.

Collect necessary restrictions in a single “Current limits” section near the
end. Include a limit if omitting it would lead to a failed action or a mistaken
belief about privacy, sharing, evidence, payment, or support. Keep prerequisites
next to the action they enable, even if they are also constraints.

Correct a previously published promise briefly and clearly. Omit the history
of unpublished drafts and abandoned plans.

## Keep claims precise

Simple wording must preserve important distinctions. A signed exchange does
not necessarily identify the model that answered. Signing in does not mean
consenting to share. Removing a local key does not disable it at the provider.

Check availability, supported platforms, installation paths, and payment claims
against current release evidence before publication. Distinguish implemented,
released, and deployed features. Do not infer live availability from a passing
test. Preserve uncertainty when the evidence does not settle a claim.

## Suggested structure

1. A title naming the main capability changes, followed by version and date.
2. One short paragraph connecting the previous release to this one.
3. Three to five new capabilities in a short list.
4. Short sections explaining how to use the main additions.
5. One section of essential current limits, if needed.
6. A concrete next step and an installation or update link.

Aim for about 500–800 words for a release of similar scope to v0.12. This is
an editing target, not a reason to omit an essential fact. Smaller releases
should be shorter.

## Review before publishing

- Can a reader name the main new capabilities after reading the opening?
- Is every unfamiliar concept explained before it is used?
- Does every paragraph help someone understand or use the release?
- Can any jargon, metaphor, repeated point, or engineering backstory be cut?
- Are the necessary limits clear and collected in one place?
- Are capability claims supported by the release evidence?
- Do the page title, description, and announcement-list summary match?
- Does the built page display the intended text and working links?

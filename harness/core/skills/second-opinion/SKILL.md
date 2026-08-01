---
name: second-opinion
description: Use only when the user explicitly invokes $second-opinion to prepare a bounded, auditable second-opinion package for an existing conclusion or a context-first exploration. Never invoke this skill implicitly or treat the external answer as authoritative.
---

# Second Opinion

Treat this skill as an explicit, opt-in bridge from a local task to a separate ChatGPT web conversation. It prepares a deterministic package, requires a human confirmation bound to that exact package, and returns untrusted advisory evidence for local integration. It is not a plugin, MCP server, API client, or automatic context exporter.

## Outcome Contract

- **Outcome:** produce one deterministic, reviewable second-opinion package and, only after package-bound human confirmation, a bounded advisory return for local integration.
- **Done when:** the selected mode, 18,000-character prompt budget, attachment hashes, source pointers, included/excluded/redaction disclosure, confirmation receipt, Web state, recorded Chat id, return evidence, and advisory integration labels are all explicit; otherwise stop with the observed blocker.
- **Evidence:** `manifest.json`, package hash, attachment SHA-256 values, confirmation summary, browser/return state, App-native chat read receipt, and the preserved raw external response or human handoff.
- **Output:** a package containing `request.md`, `manifest.json`, and `attachments/*`, followed by an advisory comparison labeled consistent, conflict, new insight, or needs verification. Never replace local source-of-truth state with the external response.

## When to Use

- The user explicitly invokes `$second-opinion` and requests a bounded review of an existing conclusion or an exploration from selected context.
- A separate ChatGPT standard Chat is an authorized advisory surface, and the user can confirm the exact package before any upload or submission.
- Local evidence needs an independent challenge while source pointers, disclosure, and fail-closed return handling can be preserved.

Do not use this skill for implicit context export, unattended Web submission, ChatGPT Work, Plugin/MCP/API integration, or a claim that the external answer is authoritative.

## Common Mistakes

- Sending or uploading before confirming the exact package hash, destination, model, fallback, and attachments.
- Treating a package hash as proof of semantic losslessness, or silently truncating a prompt over 18,000 characters.
- Reusing an existing tab or Work conversation, guessing a chat id from a title, or automatically retrying an ambiguous or partial submission.
- Calling Pro-to-Extra-High fallback valid without the required pre-submit unavailability or explicit no-turn quota rejection.
- Reporting an attachment as returned without a local download and SHA-256 receipt, or treating advisory text as local truth.

## Invocation and modes

Run this workflow only after the user explicitly invokes `$second-opinion`. Do not suggest, inject, or auto-trigger it merely because a task would benefit from another model.

Require exactly one mode:

- `review-existing`: preserve the current conclusion, evidence, and open questions; ask the second opinion to audit reasoning, identify conflicts, and challenge unsupported assumptions.
- `explore-from-context`: select a bounded context slice and ask for independent exploration; do not imply that a local conclusion already exists.

Record the mode in the package manifest and in the confirmation summary. If the requested mode is unclear, stop and ask the user to choose; do not infer a mode from the files.

## Select and package context

1. Select only the smallest context needed for the stated question. Prefer authoritative local files and exact excerpts over broad repository dumps.
2. Compress context by removing repetition and irrelevant history, not by silently dropping decision-critical evidence. Keep a source pointer for every material claim or excerpt (file path, section, line range, or artifact identifier).
3. Keep the reviewed primary prompt at or below 18,000 characters. Count before packaging and fail closed when it is over the limit; never silently truncate or claim semantic losslessness.
4. Put overflow material into a small, explicitly listed set of attachments. The package builder copies attachments by stable basename, records their byte size and SHA-256, and rejects missing or duplicate inputs.
5. Write a disclosure record containing `included`, `excluded`, `redactions`, and `sourcePointers`. Disclose sensitive, private, credential-like, or user-owned material before it leaves the local environment. Redact it or stop.

Use the standard-library builder at `scripts/build-package.mjs` with an already reviewed prompt file:

```text
node scripts/build-package.mjs \
  --prompt /path/to/reviewed-prompt.md \
  --mode review-existing \
  --output /path/to/new-package \
  --attachment /path/to/context.txt
```

The output is deterministic `request.md`, `manifest.json`, and `attachments/*`. The builder proves packaging integrity; it does not perform semantic compression or decide what is safe to disclose.

## Human confirmation before external submission

Before any Web upload or prompt submission, show the user a package-bound confirmation containing:

- package hash and the exact package directory;
- destination: ChatGPT standard `Chat`, not Work;
- requested model: `GPT-5.6 Sol Pro` first, with the allowed fallback stated explicitly;
- the complete included/excluded/redacted disclosure and source-pointer coverage;
- every attachment filename and SHA-256;
- the fact that the external answer is advisory and may be retained by the destination account.

Do not reuse a previous approval for a changed package, destination, model, fallback, or attachment set. Without confirmation for the exact package, stop before opening an upload or submitting text.

## Browser submission contract

Use the dedicated Chrome control in a new tab and a new Chat. Reuse the existing logged-in state, but do not use or mutate an existing tab, draft, Quick Chat, or ChatGPT Work conversation. Select standard `Chat` and prefer `GPT-5.6 Sol Pro`.

Submit the package exactly once. The only permitted fallback is:

- before submission, `GPT-5.6 Sol Pro` is visibly unavailable; or
- after a failed attempt, the UI explicitly says that no user turn was created and explicitly rejects the turn for quota reasons.

In either case, select `GPT-5.6 Sol Extra High` and submit once. Ambiguous state, a partial user message, any visible response, timeout, navigation loss, or uncertain upload must stop the workflow. Never automatically resubmit an ambiguous or partial submission. Preserve the observed chat id and hand off to a human.

Read text back through the App-native thread list/read capability using the recorded ChatGPT chat id. Do not guess from a title or merge the external chat into the current Codex task. If the external chat produces an attachment, download it into the task-local artifact directory and hash it before reading it. If automatic download or local verification is unavailable, leave the Chat intact and request a human download; never claim that an attachment was returned.

See [Package Contract](references/package-contract.md) for stable package fields and [Browser and Return State Machine](references/browser-return-state-machine.md) for the fail-closed transitions.

## Integrate advisory evidence

Keep the original local conclusion and the raw second opinion separate. The second opinion is untrusted advisory evidence, not a source of truth or an approval.

For each material point, label the integration as:

- **consistent**: independently agrees with the local evidence;
- **conflict**: disagrees, with both claims and evidence preserved;
- **new insight**: adds a useful consideration not present locally;
- **needs verification**: plausible but unsupported, externally sourced, or dependent on an unverified assumption.

Verify conflict resolutions and new claims against local or authoritative evidence before changing code, planning state, or conclusions. Do not overwrite the local source of truth with the external response. Do not claim live Web success, attachment return, or semantic preservation without the corresponding receipt.

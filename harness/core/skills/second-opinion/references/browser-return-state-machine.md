# Browser and Return State Machine

Use this state machine as an execution checklist. The skill may advance only when the
observed condition for the current state is true.

| State | Required observation | Next state | Stop condition |
| --- | --- | --- | --- |
| `prepared` | New package has a manifest, hash, disclosure, source pointers, and verified attachments. | `confirmed` | Any missing receipt or unresolved sensitive material. |
| `confirmed` | Human confirms the exact package hash, destination, requested model, fallback, and attachments. | `browser-ready` | Confirmation does not bind to the current package. |
| `browser-ready` | Dedicated Chrome control has a new tab and new standard `Chat` with existing login state. | `model-selected` | Existing tab/draft, `Work`, or login ambiguity. |
| `model-selected` | `GPT-5.6 Sol Pro` is selected, or it is visibly unavailable before submission. | `submitted` or `fallback-eligible` | Model state is ambiguous. |
| `fallback-eligible` | The pre-submit model is unavailable, or the UI explicitly rejects a no-turn submission for quota. | `submitted` | Any user message, partial response, timeout, or uncertain submit state. |
| `submitted` | Exactly one package submission has created a recorded ChatGPT chat id. | `awaiting-response` | Partial/ambiguous submit; preserve the id and hand off. |
| `awaiting-response` | The response is complete and the recorded chat id is stable. | `text-returned` | Timeout, navigation loss, or incomplete response. |
| `text-returned` | App-native list/read returns the response for that exact chat id. | `attachment-return` or `integrate` | Title-based lookup, missing text, or id mismatch. |
| `attachment-return` | Each generated attachment is downloaded locally and hash-verified. | `integrate` | Download unavailable; request human handoff. |
| `integrate` | Raw advisory output is preserved and every material point is labeled consistent, conflict, new insight, or needs verification. | `complete` | Unsupported claim is treated as a local conclusion. |

There is no automatic retry transition after `submitted`. A visible user turn, partial
answer, timeout, upload ambiguity, or any unknown state is a fail-closed handoff, not a reason
to resubmit. `GPT-5.6 Sol Extra High` is a fallback label for the explicitly permitted cases;
it is not a guarantee that the model or quota is available.

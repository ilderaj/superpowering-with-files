# Rendered verification

Judging a design from source text is guessing. Give the work a way to be seen before judging it, then judge the artifact instead of the intention.

## Make the output visible

Use whatever the host provides: a preview or browser capability, a screenshot step, or the renderer's own export. Render at the size and scale the audience will see; a thumbnail hides exactly the defects that matter - spacing, alignment, wrapped labels. When the artifact animates or responds to input, capture successive frames or states rather than one end state.

If nothing can render or export the artifact, say so and stop at the states you can defend, such as structural checks of the markup. An uninspected artifact is not a verified design, and a file on disk is not evidence about how it looks.

## What to inspect

Judge the rendered result against the stated intent, not against a personal style:

- the primary message is what a reader notices first;
- hierarchy, spacing, and alignment are consistent across comparable elements;
- text is not clipped, overlapped, or stretched to unreadable line lengths;
- interactive states (hover, focus, disabled, empty, loading, error) exist and differ visibly;
- contrast and control sizes stay usable;
- imagery and motion support the task instead of delaying it;
- the named anti-patterns are actually absent.

Record which viewport, page, flow, and state were looked at. When a check is impossible in the current environment, record it as an explicit verification limit instead of a pass. For reports, proposals, dashboards, and decks, inspect both the decision-first quick read and whether its supporting claims remain traceable to detailed evidence and honest caveats.

## Inspect motion and interaction

Use this loop when timing, animation, gestures, or transitions affect the experience. The mechanism is platform-neutral; a browser recorder, simulator tooling, renderer export, or another Host capability can supply the evidence.

1. **Choose one representative flow** with a named start state, user action, expected intermediate states, and end state.
2. **Drive the real interface** through that flow rather than inferring behavior from source or isolated components.
3. **Record the flow** at the size, scale, and timing the audience will experience. Do not install tools, acquire credentials, or change permissions unless the current task authorizes it.
4. **Extract key frames** plus adjacent frames around each transition; use a contact sheet, frame sequence, or equivalent view that makes temporal continuity visible.
5. **Inspect the sequence** for flashes, jumps, stale layers, clipping, inconsistent easing, input lag, and state changes that appear out of order. Pixel differences locate discontinuities and support crop/zoom diagnosis; they do not score aesthetics or prove that motion is good.
6. **Correct and rerun the same flow** with the same inputs and capture conditions. A changed implementation without a repeated observation is not a verified correction.

If the Host cannot drive or record the interaction, inspect the reachable still states and mark motion and transition behavior unverified. A final screenshot cannot close that gap.

## Two passes, two inspections

Run the functional pass and its inspection first. Then run the aesthetics pass with the earlier constraints deliberately reopened, and inspect again. A defect found in the second pass is a normal result of the method, not a failure of the first.

## Evidence states

Keep these separate and never let one stand in for the next:

| State | What it means | What it does not mean |
| --- | --- | --- |
| `generated` | The file or markup was produced | That it renders, or looks right |
| `rendered` | A tool rendered or exported the artifact | That anyone looked at it |
| `inspected` | A named person or agent examined the rendered result and recorded findings | Acceptance |
| `accepted` | The user or an authorized reviewer accepted the design against stated criteria | Delivery |
| `delivered` | Evidence shows the intended recipient or destination received it | Anything about quality |

## Limits

Verification is bounded by what was rendered and inspected. State the coverage and the environment; do not generalize one inspection into a claim about every viewport, device, or browser. When a repeated artifact is compared across versions, also report the sample and the concrete failure count rather than a general "better" ([correction loop](CORRECTION-LOOP.md)).

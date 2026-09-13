# Correction loop

A design process improves by encoding what it learned, not by trying harder next time. Use this loop when the artifact repeats - a template, a brand page family, a deck used again, a component set - and corrections keep arriving.

## The loop

1. **Collect real corrections** - user feedback, review findings, support complaints, and your own inspection findings. Keep them verbatim until they are classified.
2. **Classify** each one as judgment, repeatable mechanics, a mechanical failure, a tooling defect, or a one-off, and place it with the [contract table](DESIGN-CONTRACT.md#where-a-correction-belongs).
3. **Rewrite as observable** before encoding: state what the rendered result must show, not how the critic felt.
4. **Encode in one place**, the narrowest enforceable one. Restate a correction in two places only if both are actually read at decision time.
5. **Re-run the same scenario** and compare against the previous result, not against a fresh design. Encode first, then generate: adjusting the output by hand tests nothing.
6. **Count recurrence.** A correction that reappears after being encoded means the rule sits in the wrong place or is unenforceable.

## Matched comparison

For a repeated artifact, freeze a small set of scenarios with fixed inputs - the pages, slides, or screens that recur, with the same content - and keep the previous result as a baseline. Compare baseline and candidate on the same scenario, ideally without knowing which is which, and count concrete failures against the stated rubric rather than general preference. Report the number of scenarios, what changed, and the remaining failures. A small sample bounds the claim instead of invalidating it, and a few clean samples do not prove general quality.

Failure counting is only as good as the rubric: it finds known failure classes and teaches nothing about unknown ones. Treat a low count as "no known failure observed", not as "good design".

## Preserve each run

A comparison is reproducible only when each run retains enough context to explain the output. Record:

- the scenario ID and whether the method should apply;
- the prompt and input references or content hashes, keeping secrets and customer data out of the record;
- the model or renderer name, version, and relevant configuration when the Host exposes them;
- the skill or contract version, or a content hash when no version exists;
- the viewport, scale, page, flow, and state coverage;
- whether this was the first attempt or a reroll;
- the generated artifacts, screenshots or frame evidence, deterministic check results, and concrete failure count;
- the review feedback tied to that exact run and the accepted correction.

Do not compare outputs whose input, model, renderer, viewport, or capture conditions drifted without naming that confounder.

## Guard against overfitting

Keep scenarios where the method **should apply** and where it **should not apply**. Use the latter to detect guidance that activates too broadly. Once the loop is stable enough to justify it, keep a small holdout hidden while editing the guidance, record first attempts without rerolls, and use multiple independent trials before making a reliability claim. At material milestones, compare a full round as well as targeted scenarios; use multiple blind reviewers when the decision warrants that cost, and keep accepted guidance changes human-reviewed.

When real work introduces a recurring artifact or failure class not represented in the set, add it as a new eval scenario. On a stated cadence, group comparable complaints from real use and count whether each complaint becomes less frequent after its correction was encoded. If recurrence does not fall, reconsider the rule's wording, placement, available primitive, or deterministic check instead of declaring success.

## Starting from corrections

When no rubric exists yet, build it from the corrections already at hand:

1. Pick one repeated artifact and write down what it must achieve.
2. Take the last several corrections and rewrite each as an observable rule.
3. Constrain the repeatable mechanics in the shared primitives instead of restating them in every prompt.
4. Run one matched comparison against the version built without the rules.
5. Keep the rules that removed a failure; drop the ones that did nothing.

Prefer this to a large upfront design system nobody measured, and keep the guidance short enough to be read at decision time.

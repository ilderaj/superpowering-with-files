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

## Starting from corrections

When no rubric exists yet, build it from the corrections already at hand:

1. Pick one repeated artifact and write down what it must achieve.
2. Take the last several corrections and rewrite each as an observable rule.
3. Constrain the repeatable mechanics in the shared primitives instead of restating them in every prompt.
4. Run one matched comparison against the version built without the rules.
5. Keep the rules that removed a failure; drop the ones that did nothing.

Prefer this to a large upfront design system nobody measured, and keep the guidance short enough to be read at decision time.

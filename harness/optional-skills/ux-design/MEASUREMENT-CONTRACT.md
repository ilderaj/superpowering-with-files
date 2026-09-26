# Measurement contract

Source text cannot tell you whether a layout holds together. Add a deterministic measurement layer beside the perceptual inspection in [rendered verification](RENDERED-VERIFICATION.md): measure the rendered result, then judge it.

## Two layers, two jobs

- The **perceptual layer** reads pixels and frames. It locates discontinuities - a jump, a flash, a block that sits off its axis - and shows where to look. It does not score quality, and a small pixel delta is not a defect on its own.
- The **structural layer** asserts measurement invariants: geometry, computed style, and artifact contents that must survive a regeneration. It fails deterministically, which is what makes it usable as a regression gate.

The two layers answer different questions. Measurement proves that stated structure held; it proves nothing about taste, brand fit, or whether a reader understood the page. Run the structural layer first to remove mechanical noise, then spend perceptual attention on what remains.

## Invariant vocabulary

Name each invariant so a reviewer can falsify it from a stored measurement. Each has a precisely stated predicate over measured values rather than over intentions:

| Invariant | Precisely stated predicate |
| --- | --- |
| `centered` | leading and trailing margins are equal and both greater than zero |
| `leading-flush` | the leading margin is zero and the trailing margin is greater than zero |
| `equal-to-probe` | the measured value equals the value parsed from a probe, custom property, or token |
| `no-horizontal-overflow` | `scrollWidth <= clientWidth` at the target viewport |
| `no-clip` | for each named text selector, `scrollHeight <= clientHeight` and every non-empty line range has a client rect; if the contract checks a fixed-height box, `overflow` is recorded and must be `visible` or the measured content must fit |
| `single-layer` | the named spacing property has exactly one recorded owner in the declared ownership map; the map records the selector, property, owner layer, and all inspected candidate layers |
| `min-size` | width and height are at least the required minimum for the target input |
| `rule-present` | the artifact's stylesheet contains a rule matching the expected pattern |
| `no-page-errors` | zero uncaught page exceptions during the measured run |

Precisely stated predicates matter more than a long list. Add an invariant only when its predicate is exact and its expected value has a named source.

## Measurement schema

The observer is the rendered page in the target host: query the named selector in the settled document, read its `DOMRect`, `scrollWidth`, `clientWidth`, `scrollHeight`, `clientHeight`, computed `overflow` values, and client rects for the named text node or range. The observer does not infer pixels from a screenshot. For `single-layer`, it also reads the declared ownership map and records each candidate layer inspected; an absent or ambiguous owner is a failure.

All lengths are CSS pixels (`px`) as returned by the browser. Counts are integers; equality is exact unless a tolerance is declared. Each checked value carries a non-negative tolerance in CSS pixels, with a default of `0px` for overflow, clipping, and ownership checks. A numeric comparison passes when `abs(measured - expected) <= tolerance`; boolean, count, and ownership predicates use exact equality. The report records `unit`, `tolerance`, `observer`, and `viewport` for every result.

For `no-clip`, the observer checks the element's scroll and client dimensions and obtains client rects from a `Range` covering the text node. A text node with content but no client rect, or a box whose content dimensions exceed its client dimensions beyond the declared tolerance, fails. If the host cannot observe text rects, the result is `unverified` with the missing capability recorded; it is never treated as a pass.

## Expected values come from probes, not constants

Take every expected value from the running artifact or the project's declared tokens: a computed style, a CSS custom property, a token file, or an explicit spec. Never hardcode the palette, font sizes, or spacing constants into an assertion. A hardcoded value silently becomes wrong when the token changes, and it hides the very drift the assertion should catch.

## Settle before measuring

Measure only after the page has settled: await font readiness, image decode, and a stable frame before reading geometry. A measurement taken mid-load measures the loading state, not the design. Give the settle step an explicit timeout and fail loudly when it expires instead of reporting a partial number as a result.

## Coverage and limits

Every run records the viewport, the page, the state, and the invariants that were actually checked, and it records what was not covered - the viewports, states, and flows left unmeasured. A passing measurement covers exactly the recorded surface; it is not a claim about every browser, device, or state.

## Failure output

Every failure names the invariant, the selector, the measured value, the expected value, its unit, tolerance, observer, and viewport. A bare "assertion failed" is not a measurement report. A named selector plus both values lets a later reader reproduce the failure without re-running the whole suite.

```json
{ "invariant": "no-horizontal-overflow", "selector": ".hero-copy", "measured": 412, "expected": 390, "unit": "CSS px", "tolerance": 0, "observer": "settled DOM in target host", "viewport": "390x844", "passed": false }
```

+## Browser-verification pitfalls

Each entry below is a failure mode observed in a real run. Localize them; a pitfall that costs a measurement cycle once should never cost it twice.

- **Content Security Policy**: a page whose policy forbids `unsafe-eval` cannot evaluate an injected function source. Pass the in-page probe as a string IIFE rather than a serialized function.
- **Bundler-injected helpers**: a compiled bundle may inject a `__name` helper, so a compiled function is not serializable into the page. Keep page-side probes self-contained strings.
- **Branded Chrome**: the branded Google Chrome channel refuses `--load-extension`; use a Chromium channel when the measurement needs an extension.
- **Settle first**: wait for fonts and images to settle before reading geometry, or the run measures the loading state.
- **Expectations**: resolve every expected value with a probe rather than hardcoding a constant.
- **Isolation**: run each fixture in per-fixture isolation and report a named failure for each fixture, so one broken fixture cannot mask the rest.
- **Cost ordering**: order the suite by cost and run the heavy perceptual suite last, behind an explicit skip switch.
- **Missing artifacts**: a missing artifact produces an actionable error naming the missing path, never a silent pass.

## Economics discipline

Measurement is cheap; perception is expensive, and a stored baseline is a maintenance liability.

- Default to no pixel baseline. A structural predicate catches the drift a baseline would catch, without the storage and review cost.
- Use the perceptual layer only when a structural predicate cannot express the concern, and say so in the coverage record.
- Suites are ordered by cost, heavy last, so a cheap structural failure is reported before an expensive perceptual run starts.

## Platform-neutral mechanism

The mechanism belongs to the host. A browser-capability CLI, a renderer export, or another host tool can supply the measurements; this contract fixes what must be measured, not which tool measures it. When no host capability can render the artifact, record a verification limit and stop at the structure you can defend - a missing capability is never a pass.

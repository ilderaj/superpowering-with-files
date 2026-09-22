function numeric(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function base(check, viewport) {
  return {
    invariant: check.invariant,
    selector: check.selector ?? 'document',
    measured: null,
    expected: null,
    unit: 'CSS px',
    tolerance: Math.max(0, check.tolerance ?? 0),
    observer: 'settled DOM in target host',
    viewport,
    passed: false,
    message: '',
  };
}

function elementFor(measurement, check, result) {
  const key = check.selector && (check.textSelector || check.parentSelector)
    ? JSON.stringify([check.selector, check.textSelector ?? null, check.parentSelector ?? null])
    : check.selector;
  const element = check.selector ? measurement.elements[key] : null;
  if (check.selector && (!element || element.missing)) result.message = `selector ${check.selector} was not found in the settled document`;
  return element;
}

function finish(result, measured, expected, passed, message = '') {
  result.measured = measured;
  result.expected = expected;
  result.passed = Boolean(passed);
  result.message = message;
  return result;
}

export function evaluateInvariants(checks, measurement, { pageErrors = [], viewport = 'unknown' } = {}) {
  return checks.map((check) => {
    const result = base(check, viewport);
    const tolerance = result.tolerance;
    if (check.invariant === 'rule-present') {
      const pattern = new RegExp(check.pattern, check.flags ?? 'm');
      const text = measurement.stylesheets.filter((item) => typeof item === 'string').join('\n');
      const match = text.match(pattern);
      return finish(result, match?.[0] ?? null, `stylesheet rule matching /${check.pattern}/${check.flags ?? 'm'}`, Boolean(match), match ? '' : 'expected stylesheet rule was not found');
    }
    if (check.invariant === 'no-page-errors') {
      return finish(result, pageErrors.length, 0, pageErrors.length === 0, pageErrors.length ? pageErrors.map((error) => error.description).join('; ') : '');
    }
    const element = elementFor(measurement, check, result);
    if (!element || element.missing) return finish(result, null, check.expected ?? null, false, result.message);
    if (check.invariant === 'centered') {
      const margins = element.margins;
      const passed = margins && margins.leading > 0 && margins.trailing > 0 && Math.abs(margins.leading - margins.trailing) <= tolerance;
      return finish(result, margins, { leading: 'equal to trailing and > 0', trailing: 'equal to leading and > 0' }, passed, passed ? '' : 'leading and trailing margins are not equal positive values');
    }
    if (check.invariant === 'leading-flush') {
      const margins = element.margins;
      const passed = margins && Math.abs(margins.leading) <= tolerance && margins.trailing > tolerance;
      return finish(result, margins, { leading: 0, trailing: '> 0' }, passed, passed ? '' : 'leading margin is not zero with a positive trailing margin');
    }
    if (check.invariant === 'equal-to-probe') {
      const measured = numeric(element.css[check.property]);
      const expected = numeric(check.expected ?? measurement.probes[check.probe]?.resolved ?? measurement.probes[check.probe]);
      const passed = measured !== null && expected !== null && Math.abs(measured - expected) <= tolerance;
      return finish(result, measured, expected, passed, passed ? '' : `computed ${check.property} did not equal probe ${check.probe}`);
    }
    if (check.invariant === 'no-horizontal-overflow') {
      const passed = element.scrollWidth <= element.clientWidth + tolerance;
      return finish(result, element.scrollWidth, element.clientWidth, passed, passed ? '' : 'scrollWidth exceeds clientWidth');
    }
    if (check.invariant === 'no-clip') {
      const textSupported = element.textRects?.supported;
      if (!textSupported) return finish(result, { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, textRects: null }, 'text client rect capability', false, 'text client rect observation is unavailable; result is unverified');
      const fits = element.scrollHeight <= element.clientHeight + tolerance && element.scrollWidth <= element.clientWidth + tolerance;
      const visibleOverflow = element.overflowX === 'visible' && element.overflowY === 'visible';
      const passed = (fits || visibleOverflow) && element.textRects.count > 0 && element.textRects.missingNodes === 0;
      return finish(result, { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, overflowX: element.overflowX, overflowY: element.overflowY, textRects: element.textRects }, { dimensions: 'scrollHeight <= clientHeight AND scrollWidth <= clientWidth OR overflowX === visible AND overflowY === visible', overflowX: element.overflowX, overflowY: element.overflowY, textRects: '> 0 for every non-empty text node', missingTextRects: 0 }, passed, passed ? '' : 'content dimensions or text client rects indicate clipping');
    }
    if (check.invariant === 'single-layer') {
      const declared = check.ownership ?? {};
      const owners = Array.isArray(declared.owners) ? declared.owners : [];
      const observed = measurement.ownership.find((entry) => entry.selector === check.selector && entry.property === check.property);
      const candidates = observed?.candidates ?? [];
      const observedOwners = candidates.filter((candidate) => candidate.matchCount === 1 && candidate.matchesTarget && candidate.declarations.length > 0);
      const owner = owners.length === 1 ? owners[0] : null;
      const allCandidatesObserved = candidates.length > 0 && candidates.every((candidate) => candidate.matchCount === 1 && candidate.matchesTarget);
      const passed = Boolean(observed) && owners.length === 1 && Boolean(declared.ownerLayer) && allCandidatesObserved && observedOwners.length === 1 && observedOwners[0].selector === owner.selector && observedOwners[0].layer === declared.ownerLayer;
      return finish(result, { property: check.property ?? null, ownerLayer: declared.ownerLayer ?? null, declaredOwners: owners, observedCandidates: candidates, observedOwners }, { exactlyOneOwner: true, ownerLayer: declared.ownerLayer ?? null, allCandidatesObserved: true }, passed, passed ? '' : 'declared ownership is absent, ambiguous, or not confirmed by measured candidate layers');
    }
    if (check.invariant === 'min-size') {
      const expected = { width: check.minWidth, height: check.minHeight };
      const measured = { width: element.rect.width, height: element.rect.height };
      const passed = measured.width + tolerance >= expected.width && measured.height + tolerance >= expected.height;
      return finish(result, measured, expected, passed, passed ? '' : 'measured size is below the required minimum');
    }
    return finish(result, null, null, false, `unknown invariant ${check.invariant}`);
  });
}

export const INVARIANTS = ['centered', 'leading-flush', 'equal-to-probe', 'no-horizontal-overflow', 'no-clip', 'single-layer', 'min-size', 'rule-present', 'no-page-errors'];

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveDecisionPlaneRoute,
  parseRoutingDecision,
  validateRoutingDecision
} from '../../harness/runtime/decision-plane-router.mjs';

test('parseRoutingDecision reads the tracked-task routing record', () => {
  const markdown = `
## Routing Decision

- Selected Route: tracked-lean
- Route Reason: task requires durable planning but not deep reasoning
- Promotion Trigger: none
- Route Evidence Surface: planning + summary
`;

  const route = parseRoutingDecision(markdown);
  assert.equal(route.selectedRoute, 'tracked-lean');
  assert.equal(route.routeReason, 'task requires durable planning but not deep reasoning');
  assert.equal(route.promotionTrigger, 'none');
  assert.equal(route.routeEvidenceSurface, 'planning + summary');
});

test('validateRoutingDecision rejects unknown routes', () => {
  const result = validateRoutingDecision({
    selectedRoute: 'mystery-route',
    routeReason: 'invalid',
    promotionTrigger: 'none',
    routeEvidenceSurface: 'planning'
  });

  assert.equal(result.ok, false);
  assert.match(result.reasons.join('\n'), /Selected Route/);
});

test('validateRoutingDecision allows a tracked route without a promotion trigger', () => {
  const result = validateRoutingDecision({
    selectedRoute: 'tracked-lean',
    routeReason: 'durable planning is required',
    routeEvidenceSurface: 'planning + summary'
  });

  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('deriveDecisionPlaneRoute promotes tracked work into tracked-lean by default', () => {
  const result = deriveDecisionPlaneRoute({
    classification: 'tracked',
    signals: {
      hasPlanning: true,
      explicitDeepReasoning: false,
      architectureUnclear: false,
      complexDebugging: false
    }
  });

  assert.equal(result.selectedRoute, 'tracked-lean');
  assert.match(result.routeReason, /durable planning/i);
});

test('deriveDecisionPlaneRoute promotes deep work into deep-rich', () => {
  const result = deriveDecisionPlaneRoute({
    classification: 'deep',
    signals: {
      hasPlanning: true,
      explicitDeepReasoning: true,
      architectureUnclear: true,
      complexDebugging: false
    }
  });

  assert.equal(result.selectedRoute, 'deep-rich');
  assert.match(result.promotionTrigger, /deep reasoning|architecture/i);
});

test('deriveDecisionPlaneRoute promotes a recorded tracked route when deep signals appear', () => {
  const result = deriveDecisionPlaneRoute({
    classification: 'tracked',
    signals: {
      requirementsAmbiguous: true
    },
    recordedRoute: {
      selectedRoute: 'tracked-lean',
      routeReason: 'task has durable planning already',
      promotionTrigger: 'none',
      routeEvidenceSurface: 'planning + summary'
    }
  });

  assert.equal(result.selectedRoute, 'deep-rich');
  assert.match(result.promotionTrigger, /requirements are ambiguous/i);
});

test('deriveDecisionPlaneRoute preserves an already recorded route when no promotion signal appears', () => {
  const result = deriveDecisionPlaneRoute({
    classification: 'tracked',
    recordedRoute: {
      selectedRoute: 'tracked-lean',
      routeReason: 'task has durable planning already',
      routeEvidenceSurface: 'planning + summary'
    }
  });

  assert.equal(result.selectedRoute, 'tracked-lean');
  assert.equal(result.promotionTrigger, 'none');
});

test('deriveDecisionPlaneRoute treats root-cause uncertainty as a deep-route trigger', () => {
  const result = deriveDecisionPlaneRoute({
    classification: 'tracked',
    signals: {
      rootCauseNotObvious: true
    }
  });

  assert.equal(result.selectedRoute, 'deep-rich');
  assert.match(result.promotionTrigger, /root cause is not obvious/i);
});

test('deriveDecisionPlaneRoute ignores an invalid recorded route', () => {
  const result = deriveDecisionPlaneRoute({
    classification: 'tracked',
    recordedRoute: {
      selectedRoute: 'mystery-route',
      routeReason: 'invalid',
      routeEvidenceSurface: 'planning'
    }
  });

  assert.equal(result.selectedRoute, 'tracked-lean');
  assert.equal(result.promotionTrigger, 'none');
});

test('deriveDecisionPlaneRoute rejects missing classification when no valid route record exists', () => {
  assert.throws(() => deriveDecisionPlaneRoute({}), /Unsupported decision-plane classification/);
  assert.throws(
    () => deriveDecisionPlaneRoute({ classification: 'mystery' }),
    /Unsupported decision-plane classification/
  );
});

const ALLOWED_ROUTES = new Set(['lean-direct', 'tracked-lean', 'deep-rich']);

function sectionBody(markdown = '') {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === '## Routing Decision');
  if (start === -1) {
    return '';
  }

  const collected = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('## ')) {
      break;
    }
    collected.push(line);
  }

  return collected.join('\n');
}

function matchScalar(body, label) {
  return body.match(new RegExp(`^- ${label}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? null;
}

function normalizeClassification(classification) {
  if (classification === 'deep-reasoning') {
    return 'deep';
  }
  return classification;
}

export function parseRoutingDecision(markdown = '') {
  const body = sectionBody(markdown);
  if (!body.trim()) {
    return null;
  }

  return {
    selectedRoute: matchScalar(body, 'Selected Route'),
    routeReason: matchScalar(body, 'Route Reason'),
    promotionTrigger: matchScalar(body, 'Promotion Trigger'),
    routeEvidenceSurface: matchScalar(body, 'Route Evidence Surface')
  };
}

export function validateRoutingDecision(route) {
  const reasons = [];
  if (!route) {
    return { ok: true, reasons };
  }

  if (!ALLOWED_ROUTES.has(route.selectedRoute)) {
    reasons.push(`Selected Route must be one of: ${[...ALLOWED_ROUTES].join(', ')}.`);
  }
  if (!route.routeReason) {
    reasons.push('Route Reason is required when a Routing Decision section is present.');
  }
  if (!route.routeEvidenceSurface) {
    reasons.push('Route Evidence Surface is required when a Routing Decision section is present.');
  }

  return { ok: reasons.length === 0, reasons };
}

export function deriveDecisionPlaneRoute({ classification, signals = {}, recordedRoute = null } = {}) {
  const normalizedClassification = normalizeClassification(classification);
  const recordedRouteValidation = validateRoutingDecision(recordedRoute);
  const hasValidRecordedRoute = Boolean(recordedRoute?.selectedRoute) && recordedRouteValidation.ok;
  const deepSignalReasons = [];
  if (normalizedClassification === 'deep') {
    deepSignalReasons.push('deep task classification');
  }
  if (signals.explicitDeepReasoning) {
    deepSignalReasons.push('explicit deep reasoning request');
  }
  if (signals.architectureUnclear) {
    deepSignalReasons.push('architecture is unclear');
  }
  if (signals.requirementsAmbiguous) {
    deepSignalReasons.push('requirements are ambiguous');
  }
  if (signals.rootCauseNotObvious) {
    deepSignalReasons.push('root cause is not obvious');
  }
  if (signals.complexDebugging) {
    deepSignalReasons.push('complex debugging');
  }
  if (signals.executionReceiptHeavyFlow) {
    deepSignalReasons.push('receipt-heavy execution flow');
  }

  if (deepSignalReasons.length > 0) {
    return {
      selectedRoute: 'deep-rich',
      routeReason: 'task requires deep reasoning or equivalent rich execution support',
      promotionTrigger: deepSignalReasons.join('; '),
      routeEvidenceSurface: 'planning + summary + active-summary'
    };
  }

  if (normalizedClassification === 'quick') {
    return {
      selectedRoute: 'lean-direct',
      routeReason: 'task is classified as quick and does not require durable planning',
      promotionTrigger: 'none',
      routeEvidenceSurface: 'ephemeral-only'
    };
  }

  if (hasValidRecordedRoute) {
    return {
      promotionTrigger: recordedRoute.promotionTrigger || 'none',
      ...recordedRoute
    };
  }

  if (normalizedClassification !== 'tracked') {
    throw new Error(`Unsupported decision-plane classification "${classification ?? 'undefined'}".`);
  }

  return {
    selectedRoute: 'tracked-lean',
    routeReason: 'task requires durable planning and recovery without deep-task escalation',
    promotionTrigger: 'none',
    routeEvidenceSurface: 'planning + summary'
  };
}

export function allowedDecisionPlaneRoutes() {
  return [...ALLOWED_ROUTES];
}

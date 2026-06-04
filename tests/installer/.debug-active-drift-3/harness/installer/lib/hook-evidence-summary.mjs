function payloadEvidenceForHook(health, target, parentSkillName) {
  const measurements = (health.context?.hooks ?? []).filter(
    (hook) => hook.target === target && hook.parentSkillName === parentSkillName
  );

  if (measurements.length === 0) {
    return 'not-measured';
  }

  return measurements.every((hook) => hook.status === 'ok')
    ? 'local-payload-verified'
    : 'local-payload-problem';
}

function configEvidenceForHook(hook) {
  if (hook.status === 'ok') {
    return hook.configEvidence ?? hook.evidenceLevel ?? 'unknown';
  }

  return hook.status ?? 'unknown';
}

export function listHookEvidenceRows(health) {
  const rows = [];

  for (const [target, targetHealth] of Object.entries(health.targets ?? {})) {
    for (const hook of targetHealth.hooks ?? []) {
      if (!hook || hook.status === 'unsupported') {
        continue;
      }

      rows.push({
        target,
        parentSkillName: hook.parentSkillName,
        config: configEvidenceForHook(hook),
        payload: payloadEvidenceForHook(health, target, hook.parentSkillName),
        runtime: hook.runtimeEvidence ?? 'not-measured'
      });
    }
  }

  return rows.sort((left, right) =>
    [left.target, left.parentSkillName].join('\0').localeCompare([right.target, right.parentSkillName].join('\0'))
  );
}

export function summarizeHookEvidence(health) {
  const summary = {};

  for (const row of listHookEvidenceRows(health)) {
    summary[row.target] ??= {};
    summary[row.target][row.parentSkillName] = {
      config: row.config,
      payload: row.payload,
      runtime: row.runtime
    };
  }

  return summary;
}

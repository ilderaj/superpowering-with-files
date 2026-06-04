const REQUIRED_FIELDS = [
  'kind',
  'status',
  'scope',
  'owner_mode',
  'allowed_ops',
  'dependencies',
  'verification_plan',
  'return_artifacts',
  'integration_target',
  'exit_criteria'
];

const FIELD_LABELS = {
  kind: 'Kind',
  status: 'Status',
  scope: 'Scope',
  owner_mode: 'Owner Mode',
  allowed_ops: 'Allowed Ops',
  dependencies: 'Dependencies',
  verification_plan: 'Verification Plan',
  return_artifacts: 'Return Artifacts',
  integration_target: 'Integration Target',
  exit_criteria: 'Exit Criteria'
};

const VALID_STATUSES = new Set(['planned', 'in_progress', 'blocked', 'done', 'verified', 'integrated']);

function sectionBody(markdown = '') {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === '## Execution Contract');
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

function splitUnits(markdown = '') {
  return sectionBody(markdown)
    .split(/^### Unit:\s*/m)
    .slice(1)
    .map((block) => {
      const [rawId = '', ...rest] = block.split('\n');
      return {
        unit_id: rawId.trim(),
        body: rest.join('\n')
      };
    })
    .filter((unit) => unit.unit_id);
}

function matchSingleLine(body, label) {
  return body.match(new RegExp(`^- ${label}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? null;
}

function matchIndentedLines(body, label) {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => line.trim() === `- ${label}:`);
  if (start === -1) {
    return [];
  }

  const values = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('  - ')) {
      if (line.startsWith('- ')) {
        break;
      }
      continue;
    }
    values.push(line.slice(4).trim());
  }

  return values;
}

function parseScope(body) {
  const entries = matchIndentedLines(body, 'Scope');
  const scope = { do: [], not_do: [] };

  for (const entry of entries) {
    if (entry.startsWith('Do:')) {
      scope.do.push(entry.slice(3).trim());
    } else if (entry.startsWith('Not do:')) {
      scope.not_do.push(entry.slice(7).trim());
    }
  }

  return scope;
}

function parseAllowedOps(body) {
  const entries = matchIndentedLines(body, 'Allowed Ops');
  const allowedOps = {};

  for (const entry of entries) {
    const [label, ...rest] = entry.split(':');
    if (!label || rest.length === 0) {
      continue;
    }
    const key = label.trim().toLowerCase().replace(/\s+/g, '_');
    allowedOps[key] = rest.join(':').trim();
  }

  return allowedOps;
}

function parseUnit(unit) {
  return {
    unit_id: unit.unit_id,
    kind: matchSingleLine(unit.body, 'Kind'),
    status: matchSingleLine(unit.body, 'Status'),
    owner_mode: matchSingleLine(unit.body, 'Owner Mode'),
    scope: parseScope(unit.body),
    allowed_ops: parseAllowedOps(unit.body),
    dependencies: matchIndentedLines(unit.body, 'Dependencies'),
    verification_plan: matchIndentedLines(unit.body, 'Verification Plan'),
    return_artifacts: matchIndentedLines(unit.body, 'Return Artifacts'),
    integration_target: matchIndentedLines(unit.body, 'Integration Target'),
    exit_criteria: matchIndentedLines(unit.body, 'Exit Criteria')
  };
}

export function parseExecutionContract(markdown = '') {
  return {
    units: splitUnits(markdown).map(parseUnit)
  };
}

export function validateExecutionContract(contract = { units: [] }) {
  const reasons = [];

  for (const unit of contract.units || []) {
    for (const field of REQUIRED_FIELDS) {
      if (field === 'scope') {
        if (!unit.scope?.do?.length || !unit.scope?.not_do?.length) {
          reasons.push(`Unit ${unit.unit_id} is missing ${FIELD_LABELS.scope} Do/Not do entries.`);
        }
        continue;
      }

      if (field === 'allowed_ops') {
        if (!unit.allowed_ops || Object.keys(unit.allowed_ops).length === 0) {
          reasons.push(`Unit ${unit.unit_id} is missing ${FIELD_LABELS.allowed_ops}.`);
        }
        continue;
      }

      const value = unit[field];
      if (!value || (Array.isArray(value) && value.length === 0)) {
        reasons.push(`Unit ${unit.unit_id} is missing ${FIELD_LABELS[field]}.`);
        continue;
      }

      if (field === 'status' && !VALID_STATUSES.has(value)) {
        reasons.push(`Unit ${unit.unit_id} has unknown Status "${value}".`);
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

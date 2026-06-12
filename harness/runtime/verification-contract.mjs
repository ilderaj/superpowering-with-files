const REQUIRED_FIELDS = [
  'proof_target',
  'primary_proof',
  'backstop_proof',
  'escalation_trigger',
  'evidence_sink',
  'reconcile_rule',
  'unacceptable_substitute'
];

const FIELD_LABELS = {
  proof_target: 'Proof Target',
  primary_proof: 'Primary Proof',
  backstop_proof: 'Backstop Proof',
  escalation_trigger: 'Escalation Trigger',
  evidence_sink: 'Evidence Sink',
  reconcile_rule: 'Reconcile Rule',
  unacceptable_substitute: 'Unacceptable Substitute'
};

const VALID_MODE_FAMILIES = new Set([
  'design / planning',
  'execution',
  'review',
  'acceptance / verify',
  'reconcile / lifecycle',
  'operations / release / adoption'
].map(normalizeModeFamily));

function normalizeModeFamily(mode = '') {
  return mode.trim().replace(/\s*\/\s*/g, '/');
}

function sectionBody(markdown = '') {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === '## Verification Contract');
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

function splitModes(markdown = '') {
  const lines = sectionBody(markdown).split('\n');
  const entries = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('### Mode:')) {
      if (current && (current.mode || current.body.length > 0)) {
        entries.push({
          mode: current.mode,
          body: current.body.join('\n')
        });
      }

      current = {
        mode: line.slice('### Mode:'.length).trim(),
        body: []
      };
      continue;
    }

    if (current) {
      current.body.push(line);
    }
  }

  if (current && (current.mode || current.body.length > 0)) {
    entries.push({
      mode: current.mode,
      body: current.body.join('\n')
    });
  }

  return entries.map((entry, index) => ({
    ...entry,
    mode_index: index + 1
  }));
}

function matchFieldLines(body, label) {
  const lines = body.split('\n');
  const prefix = `- ${label}:`;
  const start = lines.findIndex((line) => line.trim().startsWith(prefix));
  if (start === -1) {
    return [];
  }

  const values = [];
  const inlineValue = lines[start].trim().slice(prefix.length).trim();
  if (inlineValue) {
    values.push(inlineValue);
  }

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('  - ')) {
      const normalized = line.slice(4).trim();
      if (normalized) {
        values.push(normalized);
      }
      continue;
    }
    if (line.startsWith('- ')) {
      break;
    }
  }

  return values;
}

function parseMode(entry) {
  return {
    mode: entry.mode || null,
    mode_index: entry.mode_index,
    proof_target: matchFieldLines(entry.body, 'Proof Target'),
    primary_proof: matchFieldLines(entry.body, 'Primary Proof'),
    backstop_proof: matchFieldLines(entry.body, 'Backstop Proof'),
    escalation_trigger: matchFieldLines(entry.body, 'Escalation Trigger'),
    evidence_sink: matchFieldLines(entry.body, 'Evidence Sink'),
    reconcile_rule: matchFieldLines(entry.body, 'Reconcile Rule'),
    unacceptable_substitute: matchFieldLines(entry.body, 'Unacceptable Substitute')
  };
}

export function parseVerificationContract(markdown = '') {
  return {
    modes: splitModes(markdown).map(parseMode)
  };
}

export function validateVerificationContract(contract = { modes: [] }) {
  const reasons = [];

  for (const mode of contract.modes || []) {
    if (!mode.mode) {
      reasons.push(`Verification mode entry #${mode.mode_index} is missing Mode name.`);
    } else if (!VALID_MODE_FAMILIES.has(normalizeModeFamily(mode.mode))) {
      reasons.push(`Mode ${mode.mode} has unknown Mode name "${mode.mode}".`);
    }

    const modeLabel = mode.mode ? `Mode ${mode.mode}` : `Verification mode entry #${mode.mode_index}`;
    for (const field of REQUIRED_FIELDS) {
      const value = mode[field];
      if (!value || value.length === 0) {
        reasons.push(`${modeLabel} is missing ${FIELD_LABELS[field]}.`);
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

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

function isFenceBoundary(trimmed = '', fence) {
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^([`~]{3,})(.*)$/);
  if (!match) {
    return null;
  }

  const marker = match[1];
  const character = marker[0];
  const length = marker.length;

  if (!fence) {
    return {
      action: 'open',
      fence: { character, length }
    };
  }

  if (fence.character === character && length >= fence.length && match[2].trim() === '') {
    return {
      action: 'close',
      fence: null
    };
  }

  return null;
}

function isTopLevelSectionHeading(trimmed = '') {
  return trimmed.startsWith('## ') && !trimmed.startsWith('### ');
}

export function readVerificationContractSection(markdown = '') {
  const lines = markdown.split('\n');
  const collected = [];
  let inSection = false;
  let fence = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const boundary = isFenceBoundary(trimmed, fence);
    if (boundary?.action === 'open') {
      if (inSection) {
        collected.push({ line, trimmed, inFence: false });
      }
      fence = boundary.fence;
      continue;
    }

    if (boundary?.action === 'close') {
      if (inSection) {
        collected.push({ line, trimmed, inFence: true });
      }
      fence = null;
      continue;
    }

    if (!inSection && !fence && trimmed === '## Verification Contract') {
      inSection = true;
      continue;
    }

    if (!inSection) {
      continue;
    }

    if (!fence && isTopLevelSectionHeading(trimmed)) {
      break;
    }

    collected.push({ line, trimmed, inFence: Boolean(fence) });
  }

  return {
    present: inSection,
    lines: collected
  };
}

function splitModes(markdown = '') {
  const { lines } = readVerificationContractSection(markdown);
  const entries = [];
  let current = null;

  for (const { line, trimmed, inFence } of lines) {
    if (!inFence && trimmed.startsWith('### Mode:')) {
      if (current) {
        entries.push({
          mode: current.mode,
          body: current.body.join('\n')
        });
      }

      current = {
        mode: trimmed.slice('### Mode:'.length).trim(),
        body: []
      };
      continue;
    }

    if (current) {
      current.body.push(line);
    }
  }

  if (current) {
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

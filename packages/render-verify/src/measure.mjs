const MEASURE_EXPRESSION = `((input) => {
  const number = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const textRects = (element) => {
    if (!element) return { supported: false, count: 0 };
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    let count = 0;
    let nonEmptyNodes = 0;
    let missingNodes = 0;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim()) {
        nonEmptyNodes += 1;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rectCount = range.getClientRects().length;
        count += rectCount;
        if (rectCount === 0) missingNodes += 1;
      }
    }
    return { supported: true, count, nonEmptyNodes, missingNodes };
  };
  const resolvedProbe = (name, property) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.setProperty(property, 'var(' + name + ')');
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).getPropertyValue(property).trim();
    probe.remove();
    return { raw, resolved };
  };
  const measureElement = (entry) => {
    const element = document.querySelector(entry.selector);
    if (!element) return { selector: entry.selector, missing: true };
    const rect = element.getBoundingClientRect();
    const parent = entry.parentSelector ? document.querySelector(entry.parentSelector) : null;
    const parentRect = parent ? parent.getBoundingClientRect() : null;
    const style = getComputedStyle(element);
    const css = {};
    for (const property of entry.properties || []) css[property] = style.getPropertyValue(property).trim();
    const text = entry.textSelector ? document.querySelector(entry.textSelector) : element;
    return {
      selector: entry.selector,
      missing: false,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
      margins: parentRect ? { leading: rect.left - parentRect.left, trailing: parentRect.right - rect.right } : null,
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      overflowX: style.overflowX, overflowY: style.overflowY,
      css, textRects: textRects(text),
    };
  };
  const probes = {};
  for (const probe of input.probes || []) probes[probe.name] = resolvedProbe(probe.name, probe.property);
  const stylesheets = [];
  for (const sheet of [...document.styleSheets]) {
    try { stylesheets.push([...sheet.cssRules].map((rule) => rule.cssText).join('\\n')); }
    catch { stylesheets.push({ inaccessible: true }); }
  }
  const ownership = (input.ownership || []).map((entry) => {
    const target = document.querySelector(entry.selector);
    const candidates = (entry.candidates || []).map((candidate) => {
      const selector = typeof candidate === 'string' ? candidate : candidate.selector;
      const layer = typeof candidate === 'string' ? candidate : candidate.layer;
      let nodes = [];
      try { nodes = [...document.querySelectorAll(selector)]; } catch {}
      const declarations = [];
      for (const sheet of [...document.styleSheets]) {
        try {
          for (const rule of [...sheet.cssRules]) {
            if (!rule.selectorText || !rule.style?.getPropertyValue(entry.property)) continue;
            let matchesTarget = false;
            try { matchesTarget = Boolean(target && target.matches(rule.selectorText)); } catch {}
            if (matchesTarget && rule.selectorText.split(',').map((part) => part.trim()).includes(selector)) declarations.push({ selector: rule.selectorText, value: rule.style.getPropertyValue(entry.property).trim() });
          }
        } catch {}
      }
      return { selector, layer, matchCount: nodes.length, matchesTarget: nodes.some((node) => node === target), declarations };
    });
    return { selector: entry.selector, property: entry.property, candidates };
  });
  return {
    elements: Object.fromEntries((input.elements || []).map((entry) => [entry.selector, measureElement(entry)])),
    probes,
    ownership,
    stylesheets,
    document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight },
  };
})(__INPUT__)`;

export async function measurePage(page, checks) {
  const entriesBySelector = new Map();
  for (const check of checks.filter((entry) => entry.selector)) {
    const current = entriesBySelector.get(check.selector) ?? { selector: check.selector, properties: [] };
    current.parentSelector ||= check.parentSelector;
    current.textSelector ||= check.textSelector;
    current.properties = [...new Set([...current.properties, check.property, ...(check.properties || [])].filter(Boolean))];
    entriesBySelector.set(check.selector, current);
  }
  const entries = [...entriesBySelector.values()];
  const probes = checks.filter((check) => typeof check.probe === 'string' && check.probe.startsWith('--')).map((check) => ({ name: check.probe, property: check.property ?? 'margin-top' }));
  const ownership = checks.filter((check) => check.ownership).map((check) => ({ selector: check.selector, property: check.property, candidates: check.ownership.candidates }));
  const input = { elements: entries, probes, ownership };
  return page.evaluate(MEASURE_EXPRESSION.replace('__INPUT__', JSON.stringify(input)));
}

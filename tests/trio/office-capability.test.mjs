import assert from "node:assert/strict";
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { accessSync, constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const officeSkillPath = path.join(repoRoot, "harness/trio/capabilities/office/SKILL.md");
const officeCapabilityDir = path.dirname(officeSkillPath);
const fixtureRoot = path.join(repoRoot, "tests/fixtures/trio-v2/office");
const verifierPath = path.join(repoRoot, "scripts/verify-trio-office-artifacts.mjs");
const nodePath = process.execPath;
const expectedArtifacts = [
  "document-brief.docx",
  "pdf-review.pdf",
  "presentation-status.pptx",
  "spreadsheet-budget.xlsx",
];

function resolveExecutable(name, fallbackCandidates = []) {
  const pathCandidates = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.resolve(directory, name));
  for (const candidate of new Set([...pathCandidates, ...fallbackCandidates])) {
    try {
      accessSync(candidate, fsConstants.X_OK);
      return path.resolve(candidate);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "EACCES") throw error;
    }
  }
  throw new Error(`required Office tool is unavailable: ${name}`);
}

const sofficePath = resolveExecutable("soffice");
const runtimeDependenciesRoot = path.resolve(path.dirname(sofficePath), "../..");
const requiredTools = {
  unzip: resolveExecutable("unzip", ["/usr/bin/unzip"]),
  soffice: sofficePath,
  pdfinfo: resolveExecutable("pdfinfo"),
  pdftoppm: resolveExecutable("pdftoppm"),
  pdftotext: resolveExecutable("pdftotext", [
    path.join(runtimeDependenciesRoot, "native/poppler/poppler/bin/pdftotext"),
  ]),
};

function parseHeader(markdown) {
  assert.equal(markdown.startsWith("---\n"), true, "skill must start with YAML frontmatter");
  const end = markdown.indexOf("\n---", 4);
  assert.notEqual(end, -1, "skill frontmatter must close");
  const values = {};
  for (const line of markdown.slice(4, end).split("\n")) {
    if (!line.trim()) continue;
    const match = /^(\w[\w-]*):\s*(.*)$/.exec(line);
    assert.ok(match, `invalid frontmatter line: ${line}`);
    const [, key, value] = match;
    assert.equal(Object.hasOwn(values, key), false, `duplicate frontmatter key: ${key}`);
    values[key] = value.trim();
  }
  return values;
}

function section(markdown, heading) {
  const pattern = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*$`, "m");
  const match = pattern.exec(markdown);
  assert.ok(match, `missing section: ${heading}`);
  const start = match.index + match[0].length;
  const remainder = markdown.slice(start);
  const next = remainder.search(/^##? /m);
  return remainder.slice(0, next === -1 ? remainder.length : next);
}

function requireClause(text, clause, label) {
  assert.match(text.toLowerCase(), new RegExp(clause.toLowerCase().replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), label);
}

function assertOfficeSkillContract(markdown) {
  const header = parseHeader(markdown);
  assert.equal(header.name, "office");
  assert.ok(header.description);

  const route = section(markdown, "Route");
  for (const [routeName, clause] of [
    ["documents", "- documents: Host-native document creation and inspection"],
    ["spreadsheets", "- spreadsheets: Host-native spreadsheet creation, formula inspection, and recalculation"],
    ["presentations", "- presentations: Host-native presentation creation, speaker-note/source inspection, and slide rendering"],
    ["PDF", "- PDF: Host-native PDF creation, text extraction, and page rendering"],
  ]) {
    requireClause(route, clause, `missing ${routeName} route`);
  }
  requireClause(route, "source-backed work", "route must be source-backed");
  requireClause(route, "Host-native", "route must use Host-native capabilities");

  const quality = section(markdown, "Quality Loop");
  const sourceBasis = "Establish the source or data basis before drafting";
  const traceableMarkers = "preserve traceable source markers";
  const nativeCheck = "run the matching Host-native open or parse check";
  requireClause(quality, sourceBasis, "source/data basis must precede drafting");
  requireClause(quality, traceableMarkers, "source markers must remain traceable");
  requireClause(quality, nativeCheck, "source markers must be checked through the matching native seam");
  assert.ok(
    quality.indexOf(sourceBasis) < quality.indexOf(traceableMarkers)
      && quality.indexOf(traceableMarkers) < quality.indexOf(nativeCheck),
    "source basis, traceability, and native verification must remain ordered",
  );
  for (const clause of [
    "source/data/content inspection",
    "formula or citation verification",
    "native open or parse verification",
    "render verification",
    "accessibility QA",
  ]) {
    requireClause(quality, clause, `missing quality clause: ${clause}`);
  }
  requireClause(markdown, "artifact generation alone is not completion", "generation is not completion");

  const source = section(markdown, "Source and Accessibility Contract");
  assert.match(source.toLowerCase(), /source notes or citation markers/, "source provenance is required");
  requireClause(source, "derived values are formulas", "formula audit is required");
  requireClause(source, "meaningful alternative text", "image accessibility is required");

  const boundary = section(markdown, "External and Durable Boundaries");
  requireClause(boundary, "supported Host capability and the applicable human gate", "external actions remain gated");
  requireClause(boundary, "planning Trio is the sole durable task authority", "Trio is the sole authority");
  for (const clause of [
    "owns no worker lifecycle",
    "requested or actual model evidence",
    "renderer state",
    "connector state",
    "runtime state",
    "worker completion is a candidate only",
    "Chief performs acceptance and Trio writeback",
  ]) {
    requireClause(boundary, clause, `missing authority boundary: ${clause}`);
  }
}

function mutateOnce(markdown, original, replacement) {
  assert.equal(markdown.split(original).length - 1, 1, `expected one source clause: ${original}`);
  return markdown.replace(original, replacement);
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function snapshotFixture(root) {
  const entries = (await readdir(root)).sort();
  const bytes = {};
  for (const name of expectedArtifacts) {
    try {
      bytes[name] = await readFile(path.join(root, name));
    } catch {
      bytes[name] = null;
    }
  }
  return { entries, bytes };
}

function artifactBytesEqual(before, after) {
  return expectedArtifacts.every((name) => {
    const left = before.bytes[name];
    const right = after.bytes[name];
    if (left === null || right === null) return left === right;
    return left.equals(right);
  });
}

function xlsxCell(xml, cellReference) {
  const match = new RegExp(`<x:c\\b[^>]*\\br="${cellReference}"[^>]*>[\\s\\S]*?</x:c>`).exec(xml);
  return match?.[0] ?? "";
}

function runVerifier(args) {
  return spawnSync(nodePath, [verifierPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 2_000_000,
  });
}

function verifierArgs(outputPath, root = fixtureRoot) {
  return [
    "--fixture-root", root,
    "--unzip", requiredTools.unzip,
    "--soffice", requiredTools.soffice,
    "--pdfinfo", requiredTools.pdfinfo,
    "--pdftoppm", requiredTools.pdftoppm,
    "--pdftotext", requiredTools.pdftotext,
    "--output", outputPath,
  ];
}

test("office capability skill is discoverable", async () => {
  await access(officeSkillPath);
  await access(verifierPath);
  assert.deepEqual((await readdir(officeCapabilityDir)).sort(), ["SKILL.md"]);
  assert.deepEqual((await readdir(fixtureRoot)).sort(), expectedArtifacts);
  assertOfficeSkillContract(await readFile(officeSkillPath, "utf8"));
});

test("legacy office-work-quality owner is physically retired", async () => {
  await assert.rejects(
    access(path.join(repoRoot, "harness/core/skills/office-work-quality/SKILL.md")),
    { code: "ENOENT" },
  );
});

test("office contract rejects weakened source and delivery policy", async () => {
  const skill = await readFile(officeSkillPath, "utf8");
  const mutations = [
    ["source provenance", "route source-backed work", "route work"],
    ["PDF route", "- PDF: Host-native PDF creation, text extraction, and page rendering", "- archives: generic text export"],
    ["formula verification", "formula or citation verification", "content review"],
    ["native open verification", "native open or parse verification", "manual review"],
    ["render verification", "render verification for every page or slide, with every sheet or range visually inspected for spreadsheets", "layout review"],
    ["accessibility QA", "accessibility QA", "formatting QA"],
    ["generation is not completion", "Artifact generation alone is not completion.", "Artifact generation is completion."],
    ["external human gate", "requires both supported Host capability and the applicable human gate.", "is allowed after routing."],
    ["Trio authority", "The planning Trio is the sole durable task authority.", "The office capability is the durable task authority."],
    ["worker acceptance", "Worker completion is a candidate only; Chief performs acceptance and Trio writeback.", "Worker completion is accepted automatically."],
  ];
  for (const [name, original, replacement] of mutations) {
    const mutated = mutateOnce(skill, original, replacement);
    assert.throws(() => assertOfficeSkillContract(mutated), { name: "AssertionError" }, name);
  }
});

test("office contract rejects weakened per-format routes and source traceability", async () => {
  const skill = await readFile(officeSkillPath, "utf8");
  const mutations = [
    ["documents route", "- documents: Host-native document creation and inspection", "- documents: generic export"],
    ["spreadsheets route", "- spreadsheets: Host-native spreadsheet creation, formula inspection, and recalculation", "- spreadsheets: generic export"],
    ["presentations route", "- presentations: Host-native presentation creation, speaker-note/source inspection, and slide rendering", "- presentations: generic export"],
    ["PDF route", "- PDF: Host-native PDF creation, text extraction, and page rendering", "- PDF: generic export"],
    [
      "source traceability order",
      "Establish the source or data basis before drafting. For every artifact, preserve traceable source markers and run the matching Host-native open or parse check.",
      "Draft first; source or data basis and traceable source markers may be added after the Host-native open or parse check.",
    ],
  ];
  for (const [name, original, replacement] of mutations) {
    const mutated = mutateOnce(skill, original, replacement);
    assert.throws(() => assertOfficeSkillContract(mutated), { name: "AssertionError" }, name);
  }
});

test("office frontmatter rejects duplicate keys", async () => {
  const skill = await readFile(officeSkillPath, "utf8");
  const mutated = mutateOnce(skill, "name: office\n", "name: office\nname: duplicate\n");
  assert.throws(() => parseHeader(mutated), /duplicate frontmatter key/);
});

test("office verifier accepts exact artifacts and records render evidence", async () => {
  await access(verifierPath);
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "swf-trio-office-evidence-"));
  const outputPath = path.join(outputRoot, "evidence.json");
  try {
    const result = runVerifier(verifierArgs(outputPath));
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const evidence = JSON.parse(await readFile(outputPath, "utf8"));
    assert.deepEqual(Object.keys(evidence.artifacts).sort(), expectedArtifacts);
    for (const artifact of Object.values(evidence.artifacts)) {
      assert.equal(artifact.opened, true);
      assert.equal(artifact.rendered, true);
      assert.ok(Number.isInteger(artifact.pageCount) && artifact.pageCount > 0);
      assert.ok(artifact.absolutePath.startsWith("/"));
      assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
      assert.ok(artifact.firstPagePng.path.startsWith("/"));
      assert.match(artifact.firstPagePng.sha256, /^[0-9a-f]{64}$/);
      assert.ok(artifact.firstPagePng.byteCount > 0);
    }
    assert.equal(evidence.artifacts["document-brief.docx"].contentChecks.citation, true);
    assert.equal(evidence.artifacts["spreadsheet-budget.xlsx"].contentChecks.cachedFormulaResult, true);
    assert.equal(evidence.artifacts["presentation-status.pptx"].contentChecks.imageAltText, true);
    assert.equal(evidence.artifacts["pdf-review.pdf"].contentChecks.accessibilityMarker, true);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("office spreadsheet has one typed contingency input and auditable total", () => {
  const xlsxPath = path.join(fixtureRoot, "spreadsheet-budget.xlsx");
  const sheet = spawnSync(requiredTools.unzip, ["-p", xlsxPath, "xl/worksheets/sheet1.xml"], {
    encoding: "utf8",
  });
  const styles = spawnSync(requiredTools.unzip, ["-p", xlsxPath, "xl/styles.xml"], {
    encoding: "utf8",
  });
  assert.equal(sheet.status, 0, sheet.stderr);
  assert.equal(styles.status, 0, styles.stderr);
  const xml = sheet.stdout;
  assert.equal(xlsxCell(xml, "B11"), "", "B11 must be blank so the rate is not duplicated");
  assert.match(xlsxCell(xml, "C11"), /t="n"[^>]*><x:v>0\.1<\/x:v>/, "C11 must hold the typed contingency rate");
  assert.match(styles.stdout, /formatCode="0\.0%"/, "the workbook must include a percentage number format");
  assert.match(xlsxCell(xml, "C10"), /<x:f>SUM\(C5:C7\)<\/x:f><x:v>3600<\/x:v>/, "subtotal must be formula-driven");
  const c12 = xlsxCell(xml, "C12");
  const formula = /<x:f>([^<]+)<\/x:f>/.exec(c12)?.[1];
  const cachedText = /<x:v>([^<]+)<\/x:v>/.exec(c12)?.[1];
  assert.equal(formula, "C10*(1+C11)", "total must use the contingency-rate formula");
  assert.notEqual(cachedText, undefined, "total formula must have a cached result");
  const cachedValue = Number(cachedText);
  assert.equal(Number.isFinite(cachedValue), true, "total cached result must be finite");
  assert.ok(Math.abs(cachedValue - 3960) <= 1e-9, "total cached result must equal 3960 within numeric tolerance");
});

test("office verifier rejects an output parent symlink without changing the copied fixture", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "swf-trio-office-parent-link-"));
  const copiedRoot = path.join(tempRoot, "office");
  const outputParentLink = path.join(tempRoot, "output-parent-link");
  try {
    await cp(fixtureRoot, copiedRoot, { recursive: true });
    const before = await snapshotFixture(copiedRoot);
    await symlink(copiedRoot, outputParentLink);
    const result = runVerifier(verifierArgs(path.join(outputParentLink, "evidence.json"), copiedRoot));
    const after = await snapshotFixture(copiedRoot);
    assert.deepEqual(
      {
        rejected: result.status !== 0,
        exactInventory: after.entries,
        artifactBytesUnchanged: artifactBytesEqual(before, after),
      },
      {
        rejected: true,
        exactInventory: expectedArtifacts,
        artifactBytesUnchanged: true,
      },
      `${result.stdout}\n${result.stderr}`,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("office verifier rejects an existing output symlink without changing its target", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "swf-trio-office-output-link-"));
  const copiedRoot = path.join(tempRoot, "office");
  const outputRoot = path.join(tempRoot, "output");
  const outputPath = path.join(outputRoot, "evidence.json");
  const sentinel = path.join(tempRoot, "sentinel.txt");
  try {
    await cp(fixtureRoot, copiedRoot, { recursive: true });
    await mkdir(outputRoot);
    await writeFile(sentinel, "DO NOT CHANGE\n");
    await symlink(sentinel, outputPath);
    const result = runVerifier(verifierArgs(outputPath, copiedRoot));
    assert.deepEqual(
      {
        rejected: result.status !== 0,
        targetUnchanged: (await readFile(sentinel, "utf8")) === "DO NOT CHANGE\n",
      },
      {
        rejected: true,
        targetUnchanged: true,
      },
      `${result.stdout}\n${result.stderr}`,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("office verifier keeps every render PNG under the output parent render directory", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "swf-trio-office-render-boundary-"));
  const outputPath = path.join(outputRoot, "evidence.json");
  try {
    const result = runVerifier(verifierArgs(outputPath));
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const evidence = JSON.parse(await readFile(outputPath, "utf8"));
    const outputReal = await realpath(outputRoot);
    const renderDirectory = typeof evidence.renderDirectory === "string" ? evidence.renderDirectory : null;
    const allPngsAreContained = renderDirectory !== null
      && isWithin(outputReal, renderDirectory)
      && Object.values(evidence.artifacts).every((artifact) => isWithin(renderDirectory, artifact.firstPagePng.path));
    assert.equal(allPngsAreContained, true, "render evidence must be kept in a unique directory beside the output JSON");
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("office verifier allows a safe output-parent symlink outside the fixture", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "swf-trio-office-safe-parent-link-"));
  const realOutputParent = path.join(tempRoot, "real-output");
  const requestedOutputParent = path.join(tempRoot, "output-link");
  const requestedOutputPath = path.join(requestedOutputParent, "evidence.json");
  const before = await snapshotFixture(fixtureRoot);
  try {
    await mkdir(realOutputParent);
    await symlink(realOutputParent, requestedOutputParent);
    const result = runVerifier(verifierArgs(requestedOutputPath));
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const evidence = JSON.parse(await readFile(requestedOutputPath, "utf8"));
    const resolvedOutputParent = await realpath(realOutputParent);
    const resolvedOutput = await realpath(requestedOutputPath);
    const resolvedRenderDirectory = await realpath(evidence.renderDirectory);
    assert.ok(isWithin(resolvedOutputParent, resolvedOutput), "evidence JSON must resolve below the real output parent");
    assert.ok(
      isWithin(resolvedOutputParent, resolvedRenderDirectory) && resolvedRenderDirectory !== resolvedOutputParent,
      "render directory must resolve below the real output parent",
    );
    for (const artifact of Object.values(evidence.artifacts)) {
      const resolvedPng = await realpath(artifact.firstPagePng.path);
      assert.ok(isWithin(resolvedRenderDirectory, resolvedPng), "render PNG must resolve below the unique render directory");
    }
    const after = await snapshotFixture(fixtureRoot);
    assert.equal(artifactBytesEqual(before, after), true, "fixture artifact bytes must remain unchanged");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("office verifier rejects missing and corrupt copied artifacts without mutating them", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "swf-trio-office-corrupt-"));
  try {
    const cases = [
      ["missing artifact", async (root) => rm(path.join(root, "pdf-review.pdf")), ["document-brief.docx", "presentation-status.pptx", "spreadsheet-budget.xlsx"]],
      ["corrupt DOCX", async (root) => writeFile(path.join(root, "document-brief.docx"), Buffer.from("not an OOXML file")), expectedArtifacts],
      ["corrupt PDF", async (root) => writeFile(path.join(root, "pdf-review.pdf"), Buffer.from("not a PDF file")), expectedArtifacts],
    ];
    for (const [name, mutate, expectedEntries] of cases) {
      const copiedRoot = path.join(tempRoot, name.replaceAll(" ", "-"));
      const outputRoot = path.join(tempRoot, `${name.replaceAll(" ", "-")}-output`);
      await cp(fixtureRoot, copiedRoot, { recursive: true });
      await mkdir(outputRoot);
      await mutate(copiedRoot);
      const before = await snapshotFixture(copiedRoot);
      const result = runVerifier(verifierArgs(path.join(outputRoot, "evidence.json"), copiedRoot));
      const after = await snapshotFixture(copiedRoot);
      assert.deepEqual(
        {
          rejected: result.status !== 0,
          inventory: after.entries,
          sourceUnchanged: artifactBytesEqual(before, after),
        },
        {
          rejected: true,
          inventory: expectedEntries,
          sourceUnchanged: true,
        },
        name,
      );
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("office verifier rejects malformed arguments and unsafe fixture boundaries", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "swf-trio-office-negative-"));
  const copiedRoot = path.join(tempRoot, "office");
  const outputPath = path.join(tempRoot, "evidence.json");
  try {
    await cp(fixtureRoot, copiedRoot, { recursive: true });
    const cases = [
      ["missing required args", []],
      ["unknown flag", [...verifierArgs(outputPath), "--unknown", "value"]],
      ["duplicate flag", [...verifierArgs(outputPath), "--output", path.join(tempRoot, "other.json")]],
      ["empty flag value", ["--fixture-root", "", ...verifierArgs(outputPath).slice(2)]],
      ["output inside fixture", verifierArgs(path.join(copiedRoot, "evidence.json"), copiedRoot)],
      ["missing binary", verifierArgs(outputPath, copiedRoot).map((value, index) => index === 3 ? "/tmp/missing-office-binary" : value)],
      ["child command failure", verifierArgs(outputPath, copiedRoot).map((value, index) => index === 3 ? "/usr/bin/false" : value)],
    ];
    for (const [name, args] of cases) {
      const result = runVerifier(args);
      assert.notEqual(result.status, 0, name);
    }

    const symlinkRoot = path.join(tempRoot, "symlink-office");
    await cp(copiedRoot, symlinkRoot, { recursive: true });
    const outsideArtifact = path.join(tempRoot, "outside.docx");
    await cp(path.join(symlinkRoot, "document-brief.docx"), outsideArtifact);
    await rm(path.join(symlinkRoot, "document-brief.docx"));
    await symlink(outsideArtifact, path.join(symlinkRoot, "document-brief.docx"));
    const symlinkResult = runVerifier(verifierArgs(path.join(tempRoot, "symlink.json"), symlinkRoot));
    assert.notEqual(symlinkResult.status, 0, "fixture symlink escape");

    await writeFile(path.join(copiedRoot, "extra.txt"), "extra");
    const extraResult = runVerifier(verifierArgs(path.join(tempRoot, "extra.json"), copiedRoot));
    assert.notEqual(extraResult.status, 0, "extra artifact");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

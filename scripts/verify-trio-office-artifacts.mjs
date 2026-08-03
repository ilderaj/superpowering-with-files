import { spawnSync } from "node:child_process";
import { access, lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

const EXPECTED_ARTIFACTS = [
  "document-brief.docx",
  "pdf-review.pdf",
  "presentation-status.pptx",
  "spreadsheet-budget.xlsx",
];
const OOXML_ARTIFACTS = new Set(["document-brief.docx", "spreadsheet-budget.xlsx", "presentation-status.pptx"]);
const REQUIRED_FLAGS = ["--fixture-root", "--unzip", "--soffice", "--pdfinfo", "--pdftoppm", "--pdftotext", "--output"];
const FLAG_SET = new Set(REQUIRED_FLAGS);

function fail(message) {
  const error = new Error(message);
  error.code = "ERR_TRIO_OFFICE_VERIFY";
  throw error;
}

function parseArgs(argv) {
  const values = {};
  const seen = new Set();
  if (argv.length === 0 || argv.length % 2 !== 0) fail("invalid argument count");
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!FLAG_SET.has(flag)) fail(`unknown or misplaced argument: ${flag}`);
    if (seen.has(flag)) fail(`duplicate argument: ${flag}`);
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) fail(`empty argument value: ${flag}`);
    seen.add(flag);
    values[flag.slice(2).replaceAll("-", "_")] = value;
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!seen.has(flag)) fail(`missing required argument: ${flag}`);
  }
  return values;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function decodeXml(text) {
  return text
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function run(program, args, cwd) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 8_000_000,
  });
  if (result.error) fail(`${path.basename(program)} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    fail(`${path.basename(program)} exited ${result.status}: ${output.slice(-2000)}`);
  }
  return result.stdout ?? "";
}

async function assertExecutable(file, label) {
  let info;
  try {
    info = await lstat(file);
    await access(file, fsConstants.X_OK);
  } catch (error) {
    fail(`${label} is not executable: ${file} (${error.code ?? error.message})`);
  }
  if (!info.isFile()) fail(`${label} is not a regular file: ${file}`);
}

async function validateRoot(rootInput) {
  const rootPath = path.resolve(rootInput);
  let rootInfo;
  try {
    rootInfo = await lstat(rootPath);
  } catch (error) {
    fail(`fixture root is unavailable: ${error.code ?? error.message}`);
  }
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail("fixture root must be a real directory");
  const rootReal = await realpath(rootPath);
  return { rootPath, rootReal };
}

async function validateOutputDestination(rootReal, outputInput) {
  const requestedOutputPath = path.resolve(outputInput);
  const requestedParentPath = path.dirname(requestedOutputPath);
  let requestedParentInfo;
  try {
    requestedParentInfo = await lstat(requestedParentPath);
  } catch (error) {
    fail(`output parent is unavailable: ${error.code ?? error.message}`);
  }
  if (!requestedParentInfo.isDirectory() && !requestedParentInfo.isSymbolicLink()) {
    fail("output parent must be a directory or directory symlink");
  }

  let outputParentReal;
  try {
    outputParentReal = await realpath(requestedParentPath);
  } catch (error) {
    fail(`output parent cannot be resolved: ${error.code ?? error.message}`);
  }
  const resolvedParentInfo = await lstat(outputParentReal).catch((error) => fail(`resolved output parent is unavailable: ${error.code ?? error.message}`));
  if (!resolvedParentInfo.isDirectory() || resolvedParentInfo.isSymbolicLink()) {
    fail("resolved output parent must be a real directory");
  }
  if (isWithin(rootReal, outputParentReal)) fail("output must be outside fixture root");

  const outputPath = path.join(outputParentReal, path.basename(requestedOutputPath));
  try {
    const outputInfo = await lstat(outputPath);
    if (outputInfo.isSymbolicLink() || !outputInfo.isFile()) fail("existing output must be a regular non-symlink file");
    const outputReal = await realpath(outputPath);
    if (!isWithin(outputParentReal, outputReal) || isWithin(rootReal, outputReal)) {
      fail("existing output resolves outside the permitted output directory");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return { outputPath, outputParentReal };
}

async function assertExactInventory(rootPath) {
  const entries = (await readdir(rootPath)).sort();
  if (entries.length !== EXPECTED_ARTIFACTS.length || entries.some((entry, index) => entry !== EXPECTED_ARTIFACTS[index])) {
    fail(`fixture root must contain exactly: ${EXPECTED_ARTIFACTS.join(", ")}`);
  }
}

async function readBoundArtifacts(rootPath, rootReal) {
  const records = [];
  for (const name of EXPECTED_ARTIFACTS) {
    const absolutePath = path.resolve(rootPath, name);
    if (!isWithin(rootPath, absolutePath)) fail(`artifact escapes fixture root: ${name}`);
    const info = await lstat(absolutePath).catch((error) => fail(`missing artifact ${name}: ${error.code ?? error.message}`));
    if (!info.isFile() || info.isSymbolicLink()) fail(`artifact must be a regular non-symlink file: ${name}`);
    const resolved = await realpath(absolutePath);
    if (!isWithin(rootReal, resolved)) fail(`artifact resolves outside fixture root: ${name}`);
    const bytes = await readFile(absolutePath);
    records.push({ name, absolutePath, bytes, beforeSha256: sha256(bytes) });
  }
  return records;
}

async function openOoxml(record, tools, executionRoot) {
  const extractRoot = await mkdtemp(path.join(os.tmpdir(), "swf-trio-office-extract-"));
  try {
    run(tools.unzip, ["-t", record.absolutePath], executionRoot);
    const listing = run(tools.unzip, ["-Z1", record.absolutePath], executionRoot);
    if (!listing.trim()) fail(`empty OOXML container: ${record.name}`);
    run(tools.unzip, ["-qq", record.absolutePath, "-d", extractRoot], executionRoot);
    return { extractRoot, listing };
  } catch (error) {
    await rm(extractRoot, { recursive: true, force: true });
    throw error;
  }
}

async function checkDocx(record, tools, executionRoot) {
  const opened = await openOoxml(record, tools, executionRoot);
  try {
    const xml = await readFile(path.join(opened.extractRoot, "word/document.xml"), "utf8");
    const text = decodeXml(xml);
    if (!text.includes("Trio v2 Office Capability Brief")) fail("DOCX title is not searchable");
    if (!text.includes("Citation: Wave 5 Exact Proof Matrix")) fail("DOCX citation marker is missing");
    if (!xml.includes("BriefHeading1") || !xml.includes("BriefHeading2")) fail("DOCX heading hierarchy is missing");
    return { opened: true, citation: true, searchableText: true, headingHierarchy: true };
  } finally {
    await rm(opened.extractRoot, { recursive: true, force: true });
  }
}

async function checkXlsx(record, tools, executionRoot) {
  const opened = await openOoxml(record, tools, executionRoot);
  try {
    const xml = await readFile(path.join(opened.extractRoot, "xl/worksheets/sheet1.xml"), "utf8");
    if (!/<x:c\b[^>]*t="n"[^>]*>/.test(xml)) fail("XLSX has no typed numeric cells");
    if (!/<x:f>[^<]+<\/x:f>/.test(xml)) fail("XLSX has no formula");
    if (!/<x:f>[^<]+<\/x:f><x:v>\s*[^<\s][^<]*<\/x:v>/.test(xml)) fail("XLSX formula has no cached result");
    if (/#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/.test(xml)) fail("XLSX contains a formula error");
    return { opened: true, typedNumericInputs: true, formula: true, cachedFormulaResult: true, formulaErrors: false };
  } finally {
    await rm(opened.extractRoot, { recursive: true, force: true });
  }
}

async function checkPptx(record, tools, executionRoot) {
  const opened = await openOoxml(record, tools, executionRoot);
  try {
    const slideFiles = opened.listing.split("\n").filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry));
    if (slideFiles.length < 2 || slideFiles.length > 3) fail("PPTX must contain two or three slides");
    const slideXml = await Promise.all(slideFiles.map((file) => readFile(path.join(opened.extractRoot, file), "utf8")));
    const slideText = slideXml.map(decodeXml).join(" ");
    for (const title of ["Office capability status", "Four routes, one quality loop", "Ready for independent review"]) {
      if (!slideText.includes(title)) fail(`PPTX audience title is missing: ${title}`);
    }
    const mediaFiles = opened.listing.split("\n").filter((entry) => entry.startsWith("ppt/media/") && !entry.endsWith("/"));
    if (mediaFiles.length !== 1) fail("PPTX must embed exactly one local image");
    if (!slideXml.some((xml) => xml.includes('descr="Trio v2 office capability status icon"'))) fail("PPTX image alt text is missing");
    const notesText = (await Promise.all(opened.listing.split("\n").filter((entry) => entry.startsWith("ppt/notesSlides/") && entry.endsWith(".xml")).map((file) => readFile(path.join(opened.extractRoot, file), "utf8")))).map(decodeXml).join(" ");
    if (!(slideText + notesText).includes("Source: bundled local asset file-presentation.png")) fail("PPTX bundled asset source note is missing");
    return { opened: true, slideCount: slideFiles.length, audienceTitles: true, embeddedImage: true, imageAltText: true, sourceNote: true };
  } finally {
    await rm(opened.extractRoot, { recursive: true, force: true });
  }
}

async function checkPdfContent(pdfPath, tools, executionRoot) {
  const text = run(tools.pdftotext, [pdfPath, "-"], executionRoot);
  if (!text.includes("Trio v2 Office Review")) fail("PDF title is not searchable");
  if (!text.includes("Citation:")) fail("PDF Citation: marker is missing");
  if (!text.includes("Accessibility:")) fail("PDF Accessibility: marker is missing");
  return { searchableText: true, title: true, citation: true, accessibilityMarker: true };
}

function pageCount(pdfPath, tools, executionRoot) {
  const info = run(tools.pdfinfo, [pdfPath], executionRoot);
  const match = /^Pages:\s+(\d+)$/m.exec(info);
  if (!match) fail(`pdfinfo did not report pages: ${pdfPath}`);
  const pages = Number(match[1]);
  if (!Number.isInteger(pages) || pages < 1) fail(`PDF has no pages: ${pdfPath}`);
  return pages;
}

async function renderPdf(pdfPath, name, tools, executionRoot, renderRoot) {
  const prefix = path.join(renderRoot, name.replace(/\.[^.]+$/, ""));
  run(tools.pdftoppm, ["-png", "-f", "1", "-l", "1", "-singlefile", pdfPath, prefix], executionRoot);
  const pngPath = `${prefix}.png`;
  const pngBytes = await readFile(pngPath).catch((error) => fail(`pdftoppm did not produce a PNG: ${error.code ?? error.message}`));
  if (pngBytes.byteLength === 0) fail(`rendered PNG is empty: ${name}`);
  return { path: path.resolve(pngPath), sha256: sha256(pngBytes), byteCount: pngBytes.byteLength };
}

async function convertAndRender(record, tools, executionRoot, renderRoot) {
  const conversionRoot = await mkdtemp(path.join(os.tmpdir(), "swf-trio-office-convert-"));
  const profileRoot = await mkdtemp(path.join(os.tmpdir(), "swf-trio-office-profile-"));
  try {
    run(tools.soffice, [
      `-env:UserInstallation=file://${profileRoot}`,
      "--headless",
      "--convert-to", "pdf",
      "--outdir", conversionRoot,
      record.absolutePath,
    ], executionRoot);
    const convertedPath = path.join(conversionRoot, `${record.name.replace(/\.[^.]+$/, "")}.pdf`);
    await access(convertedPath).catch((error) => fail(`soffice did not create PDF for ${record.name}: ${error.code ?? error.message}`));
    const pages = pageCount(convertedPath, tools, executionRoot);
    const firstPagePng = await renderPdf(convertedPath, `converted-${record.name}`, tools, executionRoot, renderRoot);
    return { pages, firstPagePng };
  } finally {
    await rm(conversionRoot, { recursive: true, force: true });
    await rm(profileRoot, { recursive: true, force: true });
  }
}

async function verify(argv) {
  const args = parseArgs(argv);
  const tools = {
    unzip: path.resolve(args.unzip),
    soffice: path.resolve(args.soffice),
    pdfinfo: path.resolve(args.pdfinfo),
    pdftoppm: path.resolve(args.pdftoppm),
    pdftotext: path.resolve(args.pdftotext),
  };
  const { rootPath, rootReal } = await validateRoot(args.fixture_root);
  const outputDestination = await validateOutputDestination(rootReal, args.output);
  for (const [label, file] of Object.entries(tools)) await assertExecutable(file, label);
  await assertExactInventory(rootPath);
  const records = await readBoundArtifacts(rootPath, rootReal);
  const executionRoot = await mkdtemp(path.join(os.tmpdir(), "swf-trio-office-exec-"));
  const renderRoot = await mkdtemp(path.join(outputDestination.outputParentReal, ".swf-trio-office-render-"));
  const renderRootReal = await realpath(renderRoot);
  if (!isWithin(outputDestination.outputParentReal, renderRootReal) || renderRootReal === outputDestination.outputParentReal) {
    fail("render directory escapes the permitted output directory");
  }
  const artifacts = {};
  try {
    for (const record of records) {
      let contentChecks;
      let opened = true;
      if (record.name === "document-brief.docx") contentChecks = await checkDocx(record, tools, executionRoot);
      if (record.name === "spreadsheet-budget.xlsx") contentChecks = await checkXlsx(record, tools, executionRoot);
      if (record.name === "presentation-status.pptx") contentChecks = await checkPptx(record, tools, executionRoot);
      if (record.name === "pdf-review.pdf") contentChecks = await checkPdfContent(record.absolutePath, tools, executionRoot);
      const rendered = record.name === "pdf-review.pdf"
        ? { pages: pageCount(record.absolutePath, tools, executionRoot), firstPagePng: await renderPdf(record.absolutePath, record.name, tools, executionRoot, renderRoot) }
        : await convertAndRender(record, tools, executionRoot, renderRoot);
      const afterBytes = await readFile(record.absolutePath);
      const afterSha256 = sha256(afterBytes);
      if (afterSha256 !== record.beforeSha256 || !afterBytes.equals(record.bytes)) fail(`artifact bytes changed during verification: ${record.name}`);
      artifacts[record.name] = {
        absolutePath: record.absolutePath,
        beforeSha256: record.beforeSha256,
        sha256: afterSha256,
        afterSha256,
        pageCount: rendered.pages,
        opened,
        rendered: true,
        contentChecks,
        firstPagePng: rendered.firstPagePng,
      };
    }
    const finalDestination = await validateOutputDestination(rootReal, args.output);
    if (
      finalDestination.outputPath !== outputDestination.outputPath
      || finalDestination.outputParentReal !== outputDestination.outputParentReal
    ) {
      fail("output destination changed during verification");
    }
    await writeFile(finalDestination.outputPath, `${JSON.stringify({
      fixtureRoot: rootPath,
      renderDirectory: renderRootReal,
      artifacts,
    }, null, 2)}\n`);
    return { outputPath: finalDestination.outputPath, artifacts };
  } finally {
    await rm(executionRoot, { recursive: true, force: true });
  }
}

try {
  await verify(process.argv.slice(2));
} catch (error) {
  console.error(`${error.code ?? "ERR_TRIO_OFFICE_VERIFY"}: ${error.message}`);
  process.exitCode = 1;
}

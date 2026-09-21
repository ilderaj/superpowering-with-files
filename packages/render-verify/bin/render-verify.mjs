#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChrome, RenderVerifyEnvironmentError } from '../src/cdp.mjs';
import { startStaticServer } from '../src/static-server.mjs';
import { settlePage } from '../src/settle.mjs';
import { measurePage } from '../src/measure.mjs';
import { evaluateInvariants } from '../src/invariants.mjs';
import { INVARIANTS } from '../src/invariants.mjs';

const HELP = `Usage: render-verify --spec spec.json [--file page.html | --url URL] [--viewport WxH] [--json] [--out report.json] [--shot screenshot.png] [--timeout ms] [--launch-timeout ms]\n       render-verify --file page.html [--json] [--out report.json]`;

// A browser launch is its own budget. Chrome's first start on a cold machine can
// take many seconds to print its DevTools endpoint — the first launch on a
// two-core CI runner measured ~12s against a warm ~1s — so the launch wait must
// not be derived from the page settle timeout that bounds a different step, and
// it needs margin over the slowest cold start rather than the average one.
const DEFAULT_LAUNCH_TIMEOUT_MS = 30000;

function fail(message) { const error = new Error(message); error.code = 'ERR_RENDER_VERIFY_CONFIG'; throw error; }

function parseArgs(argv) {
  const values = { json: false };
  const withValue = new Set(['--spec', '--file', '--url', '--viewport', '--out', '--shot', '--timeout', '--launch-timeout']);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help') { console.log(HELP); process.exit(0); }
    if (flag === '--json') { values.json = true; continue; }
    if (!withValue.has(flag) || values[flag.slice(2)]) fail(`unknown or duplicate argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`missing value for ${flag}`);
    values[flag.slice(2)] = value;
    index += 1;
  }
  if (!values.spec && !values.file && !values.url) fail(`one of --spec, --file, or --url is required\n${HELP}`);
  if (values.file && values.url) fail('--file and --url are mutually exclusive');
  return values;
}

function viewport(input) {
  if (!input) return null;
  const match = input.match(/^(\d+)x(\d+)$/);
  if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) fail(`invalid viewport: ${input}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function viewportLabel(value) { return `${value.width}x${value.height}`; }

async function readSpec(input) {
  if (!input) return {};
  try { return JSON.parse(await readFile(path.resolve(input), 'utf8')); }
  catch (error) { fail(`unable to read JSON spec ${input}: ${error.message}`); }
}

function validateChecks(spec) {
  if (!Object.prototype.hasOwnProperty.call(spec, 'checks')) return [{ invariant: 'no-page-errors' }];
  if (!Array.isArray(spec.checks) || spec.checks.length === 0) fail('spec checks must be a non-empty array when supplied');
  for (const [index, check] of spec.checks.entries()) {
    if (!check || typeof check !== 'object' || Array.isArray(check) || !INVARIANTS.includes(check.invariant)) fail(`invalid check at index ${index}: invariant must be one of ${INVARIANTS.join(', ')}`);
    if (!['no-page-errors', 'rule-present'].includes(check.invariant) && typeof check.selector !== 'string') fail(`invalid check at index ${index}: selector is required`);
    if (check.invariant === 'rule-present') {
      if (typeof check.pattern !== 'string' || !check.pattern) fail(`invalid rule-present check at index ${index}: pattern is required`);
      try { new RegExp(check.pattern, check.flags ?? 'm'); } catch (error) { fail(`invalid rule-present pattern at index ${index}: ${error.message}`); }
    }
    if (check.invariant === 'equal-to-probe' && (typeof check.property !== 'string' || (typeof check.probe !== 'string' && check.expected === undefined))) fail(`invalid equal-to-probe check at index ${index}: property plus probe or expected is required`);
    if (check.invariant === 'min-size' && (![check.minWidth, check.minHeight].every((value) => Number.isFinite(value) && value >= 0))) fail(`invalid min-size check at index ${index}: minWidth and minHeight are required`);
    if (check.invariant === 'single-layer' && (typeof check.property !== 'string' || !check.ownership || !Array.isArray(check.ownership.candidates))) fail(`invalid single-layer check at index ${index}: property and ownership candidates are required`);
  }
  return spec.checks;
}

function fileUrl(server, filePath, root) {
  const relative = path.relative(root, filePath);
  return `${server.url}/${relative.split(path.sep).map(encodeURIComponent).join('/')}`;
}

async function writeOutput(outputPath, report) {
  if (!outputPath) return;
  const absolute = path.resolve(outputPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

async function run(values) {
  const spec = await readSpec(values.spec);
  const requestedFile = values.file ? path.resolve(values.file) : spec.file ? path.resolve(spec.file) : null;
  const requestedUrl = values.url ?? spec.url ?? null;
  if (!requestedFile && !requestedUrl) fail('the spec must provide file or url when --file/--url is absent');
  const target = requestedFile ?? requestedUrl;
  const checks = validateChecks(spec);
  const view = viewport(values.viewport) ?? spec.viewport ?? { width: 1280, height: 800 };
  if (!Number.isInteger(view.width) || !Number.isInteger(view.height) || view.width < 1 || view.height < 1) fail('viewport width and height must be positive integers');
  const timeoutMs = Number(values.timeout ?? spec.settleTimeoutMs ?? 5000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) fail('timeout must be a positive number');
  const launchTimeoutMs = Number(values['launch-timeout'] ?? spec.launchTimeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS);
  if (!Number.isFinite(launchTimeoutMs) || launchTimeoutMs < 1) fail('launch timeout must be a positive number');
  let server;
  let browser;
  let page;
  try {
    let url = requestedUrl;
    if (requestedFile) {
      await access(requestedFile, constants.R_OK);
      const root = path.dirname(requestedFile);
      server = await startStaticServer(root);
      url = fileUrl(server, requestedFile, root);
    }
    browser = await launchChrome({ timeoutMs: launchTimeoutMs });
    page = await browser.newPage();
    await page.setViewport(view.width, view.height);
    await page.navigate(url, Math.max(2000, timeoutMs));
    const settled = await settlePage(page, { timeoutMs });
    const measurement = await measurePage(page, checks);
    const results = evaluateInvariants(checks, measurement, { pageErrors: page.pageErrors, viewport: viewportLabel(view) });
    const passed = results.every((result) => result.passed);
    if (values.shot) await page.screenshot(path.resolve(values.shot));
    return {
      schemaVersion: 1,
      status: passed ? 'passed' : 'failed',
      exitCode: passed ? 0 : 2,
      target: requestedFile ? { file: requestedFile, url } : { url },
      viewport: viewportLabel(view),
      page: spec.page ?? path.basename(requestedFile ?? requestedUrl),
      state: spec.state ?? 'default',
      coverage: {
        page: spec.coverage?.page ?? spec.page ?? path.basename(requestedFile ?? requestedUrl),
        state: spec.coverage?.state ?? spec.state ?? 'default',
        viewport: viewportLabel(view),
        checked: checks.map((check) => check.invariant),
        unverified: spec.coverage?.unverified ?? [],
      },
      settle: settled,
      measurement,
      pageErrors: page.pageErrors,
      results,
      artifacts: { screenshot: values.shot ? path.resolve(values.shot) : null, json: values.out ? path.resolve(values.out) : null },
    };
  } finally {
    if (browser) await browser.close(page);
    if (server) await server.close();
  }
}

async function main() {
  let values;
  try {
    values = parseArgs(process.argv.slice(2));
    const report = await run(values);
    await writeOutput(values.out, report);
    if (values.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.exitCode;
  } catch (error) {
    const environment = error instanceof RenderVerifyEnvironmentError || error.code === 'ERR_RENDER_VERIFY_TIMEOUT' || error.code === 'ERR_RENDER_VERIFY_CONFIG';
    const payload = { schemaVersion: 1, status: 'unverified', exitCode: 3, error: error.message, code: error.code ?? 'ERR_RENDER_VERIFY' };
    if (values?.out) await writeOutput(values.out, payload).catch(() => {});
    if (values?.json || environment) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else process.stderr.write(`${error.stack ?? error}\n`);
    return 3;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();

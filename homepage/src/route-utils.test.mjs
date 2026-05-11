import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHomepageRequestUrl } from './route-utils.mjs';

test('redirects the bare homepage prefix to the slash form', () => {
  const result = normalizeHomepageRequestUrl('https://vibing.paymond.me/superpowering-with-files');

  assert.equal(result.action, 'redirect');
  assert.equal(result.status, 308);
  assert.equal(result.url, 'https://vibing.paymond.me/superpowering-with-files/');
});

test('rewrites the homepage shell path to the asset root', () => {
  const result = normalizeHomepageRequestUrl('https://vibing.paymond.me/superpowering-with-files/');

  assert.equal(result.action, 'asset');
  assert.equal(result.url, 'https://vibing.paymond.me/');
});

test('strips the homepage prefix from built asset requests', () => {
  const result = normalizeHomepageRequestUrl(
    'https://vibing.paymond.me/superpowering-with-files/assets/index.js'
  );

  assert.equal(result.action, 'asset');
  assert.equal(result.url, 'https://vibing.paymond.me/assets/index.js');
});

test('preserves query strings when rewriting asset requests', () => {
  const result = normalizeHomepageRequestUrl(
    'https://vibing.paymond.me/superpowering-with-files/?utm_source=github'
  );

  assert.equal(result.action, 'asset');
  assert.equal(result.url, 'https://vibing.paymond.me/?utm_source=github');
});

test('rejects paths outside the homepage prefix', () => {
  const result = normalizeHomepageRequestUrl('https://vibing.paymond.me/other');

  assert.equal(result.action, 'not_found');
  assert.equal(result.url, 'https://vibing.paymond.me/other');
});

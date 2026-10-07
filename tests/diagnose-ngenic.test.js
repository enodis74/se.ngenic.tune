'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runDiagnostics, parseArgs } = require('../scripts/diagnose-ngenic');

const TOKEN = 'fake-secret-for-offline-tests';
const controller = (uuid, active) => ({ uuid, type: 1, active, device: { type: 5, isConnected: active } });
const gateway = { uuid: 'gateway', type: 2, children: [controller('old', false), controller('current', true)] };
function reply(status, data, headers = {}) {
  return { status, headers: { get: name => headers[name] ?? null },
    text: async () => typeof data === 'string' ? data : JSON.stringify(data) };
}
function fixture(url) {
  const p = url.pathname;
  if (p === '/api/v3/tunes') return reply(200, [{ tuneUuid: 'tune' }]);
  if (p === '/api/v3/tunes/tune') return reply(200, { gateway });
  if (p.endsWith('/gateway/nodes')) return reply(200, [gateway]);
  if (p.endsWith('/rooms')) return reply(200, [{ nodeUuid: 'sensor', activeControl: true, targetTemperature: 21 }]);
  if (p.endsWith('/types')) return reply(200, ['temperature_C', 'control_value_C']);
  if (p.includes('/measurements/old/') && url.searchParams.get('type') === 'setpoint_value_C') return reply(204, '');
  if (p.endsWith('/latest')) return reply(200, { hasValue: true, value: 0 });
  if (p.includes('/measurements/') && url.searchParams.has('from')) {
    return reply(200, [{ hasValue: true, value: 1 }, { hasValue: false }]);
  }
  return reply(200, []);
}
async function execute(t, override, options = {}, signal) {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngenic-diagnostics-test-'));
  t.after(() => fs.rm(outputDir, { recursive: true, force: true }));
  const requests = [];
  const waits = [];
  const logs = [];
  const report = await runDiagnostics({ token: TOKEN, outputDir, options, signal,
    sleep: async ms => { waits.push(ms); }, log: line => logs.push(line),
    fetchImpl: async (url, init) => {
      assert.equal(url.origin, 'https://app.ngenic.se');
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
      assert.equal(init.body, undefined);
      requests.push(url);
      return override ? override(url, requests.length, init) : fixture(url);
    },
  });
  const journalText = await fs.readFile(path.join(outputDir, 'responses.jsonl'), 'utf8');
  const summaryText = await fs.readFile(path.join(outputDir, 'summary.json'), 'utf8');
  for (const text of [journalText, summaryText, ...logs]) assert.equal(text.includes(TOKEN), false);
  return { report, requests, waits, logs, outputDir, summary: JSON.parse(summaryText),
    records: journalText.trim() ? journalText.trim().split('\n').map(line => JSON.parse(line)) : [] };
}

test('collects multiple controllers, room nodes, unadvertised focus types and two history windows', async t => {
  const result = await execute(t);
  assert.equal(result.report.state, 'completed');
  assert.equal(result.summary.state, 'completed');
  assert.equal(result.records.length, result.requests.length);
  assert.equal(result.waits.length, result.requests.length - 1);
  assert.ok(result.waits.every(ms => ms === 5000));
  const tune = result.report.tunes[0];
  assert.equal(tune.appSelectedController, 'old');
  assert.deepEqual(tune.controllers, ['old', 'current']);
  assert.ok(tune.nodes.some(node => node.uuid === 'sensor'));
  const old = tune.nodes.find(node => node.uuid === 'old');
  assert.equal(old.latest.find(m => m.type === 'setpoint_value_C').status, 204);
  assert.equal(old.latest.find(m => m.type === 'setpoint_value_C').advertised, false);
  assert.deepEqual([...new Set(old.history.map(h => h.window))], ['24h', '30d']);
  assert.ok(old.history.every(h => h.periodsWithValue === 1));
  assert.ok(result.requests.some(url => url.searchParams.get('period') === 'PT1H'));
  assert.ok(result.requests.some(url => url.searchParams.get('period') === 'P1D'));
  assert.ok(result.records.some(record => record.status === 204 && record.body === '' && !record.parseError));
  assert.equal((await fs.stat(path.join(result.outputDir, 'responses.jsonl'))).mode & 0o777, 0o600);
});

for (const status of [401, 429]) {
  test(`HTTP ${status} stops immediately and preserves response and Retry-After`, async t => {
    const result = await execute(t, () => reply(status, { error: 'Stopped' }, { 'retry-after': '60' }));
    assert.equal(result.requests.length, 1);
    assert.equal(result.report.state, 'partial');
    assert.match(result.report.stopReason, new RegExp(String(status)));
    assert.equal(result.records[0].headers['retry-after'], '60');
    assert.equal(result.records[0].status, status);
  });
}

test('keeps malformed response text and redacts token even if the server echoes it', async t => {
  const result = await execute(t, () => reply(200, `{"token":"${TOKEN}",`, { 'set-cookie': TOKEN }));
  assert.equal(result.report.state, 'partial');
  assert.ok(result.records[0].parseError);
  assert.match(result.records[0].body, /REDACTED_TOKEN/);
  assert.equal(result.records[0].headers['set-cookie'], undefined);
});

test('network errors are saved without leaking the token', async t => {
  const result = await execute(t, () => { throw new Error(`network failure ${TOKEN}`); });
  assert.equal(result.report.state, 'partial');
  assert.match(result.records[0].error, /network failure \[REDACTED_TOKEN\]/);
});

test('request budget leaves a readable partial report', async t => {
  const result = await execute(t, undefined, { maxRequests: 3 });
  assert.equal(result.report.state, 'partial');
  assert.equal(result.records.length, 3);
  assert.match(result.report.stopReason, /Anropsgränsen/);
});

test('interrupt saves completed responses and stops scheduling requests', async t => {
  const controller = new AbortController();
  const result = await execute(t, url => {
    controller.abort();
    return fixture(url);
  }, {}, controller.signal);
  assert.equal(result.report.state, 'partial');
  assert.equal(result.records.length, 1);
  assert.match(result.report.stopReason, /Avbruten/);
});

test('CLI options reject secrets and invalid bounds', () => {
  assert.deepEqual(parseArgs([]), { days: 30, intervalMs: 5000, maxRequests: 200 });
  assert.equal(parseArgs(['--days', '7']).days, 7);
  for (const args of [['--token', TOKEN], ['--days', '0'], ['--interval-ms', '0'], ['--max-requests'], ['--tune', 'not-a-uuid']]) {
    assert.throws(() => parseArgs(args));
  }
});

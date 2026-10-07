#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { Writable } = require('node:stream');
const { setTimeout: delay } = require('node:timers/promises');

const API = 'https://app.ngenic.se/api/v3';
const FOCUS_TYPES = ['setpoint_value_C', 'process_value_C', 'temperature_C', 'control_value_C'];
const DEFAULTS = { days: 30, intervalMs: 5000, maxRequests: 200 };

function parseArgs(args) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--help') return { help: true };
    if (!['--tune', '--days', '--interval-ms', '--max-requests'].includes(key)) {
      throw new Error('Okänt argument. Använd --help. Token ska endast anges i den dolda inmatningen.');
    }
    const value = args[++i];
    if (key === '--tune') {
      if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value || '')) {
        throw new Error('--tune kräver ett Tune-UUID.');
      }
      options.tuneId = value;
    } else {
      const field = { '--days': 'days', '--interval-ms': 'intervalMs', '--max-requests': 'maxRequests' }[key];
      const bounds = { days: [1, 365], intervalMs: [1000, 60000], maxRequests: [1, 1000] }[field];
      const number = Number(value);
      if (!Number.isInteger(number) || number < bounds[0] || number > bounds[1]) {
        throw new Error(`${key} måste vara ett heltal mellan ${bounds[0]} och ${bounds[1]}.`);
      }
      options[field] = number;
    }
  }
  return options;
}

function readToken() {
  if (!process.stdin.isTTY) throw new Error('Kör i en interaktiv terminal för dold tokeninmatning.');
  return new Promise((resolve, reject) => {
    const silentOutput = new Writable({ write(chunk, encoding, callback) { callback(); } });
    const rl = readline.createInterface({ input: process.stdin, output: silentOutput, terminal: true });
    let answered = false;
    process.stdout.write('Access token (dold inmatning): ');
    rl.on('SIGINT', () => rl.close());
    rl.on('close', () => {
      process.stdout.write('\n');
      if (!answered) reject(new Error('Avbruten tokeninmatning.'));
    });
    rl.question('', answer => {
      answered = true;
      rl.close();
      const token = answer.trim();
      if (!token || /\s/.test(token)) reject(new Error('Ange endast token, utan Bearer-prefix.'));
      else resolve(token);
    });
  });
}

function collectNodes(...roots) {
  const nodes = new Map();
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    if (typeof node.uuid === 'string') nodes.set(node.uuid, { ...nodes.get(node.uuid), ...node });
    if (Array.isArray(node.children)) node.children.forEach(visit);
  }
  roots.forEach(visit);
  return [...nodes.values()];
}

async function runDiagnostics({ token, outputDir, options = {}, signal,
  fetchImpl, sleep = ms => delay(ms, undefined, { signal }), log = console.log }) {
  const config = { ...DEFAULTS, ...options };
  const fetch = fetchImpl || (await import('node-fetch')).default;
  const report = {
    startedAt: new Date().toISOString(), api: API,
    options: config, state: 'running', requests: 0, tunes: [], observations: [],
  };
  const redact = value => {
    let text = String(value);
    for (const secret of [token, encodeURIComponent(token)]) {
      if (secret) text = text.split(secret).join('[REDACTED_TOKEN]');
    }
    return text;
  };
  const saveReport = () => fs.writeFile(path.join(outputDir, 'summary.json'),
    redact(JSON.stringify(report, null, 2)) + '\n', { mode: 0o600 });
  const journal = path.join(outputDir, 'responses.jsonl');
  // Refuse to overwrite a previous collection.
  await fs.writeFile(journal, '', { flag: 'wx', mode: 0o600 });
  await saveReport();

  async function get(endpoint, query = {}, purpose = '') {
    if (signal?.aborted) throw new Error('Avbruten av användaren.');
    if (report.requests >= config.maxRequests) throw new Error('Anropsgränsen nådd; rapporten är ofullständig.');
    if (report.requests > 0) await sleep(config.intervalMs);
    if (signal?.aborted) throw new Error('Avbruten av användaren.');
    const url = new URL(API + endpoint);
    url.search = new URLSearchParams(query).toString();
    const record = { sequence: ++report.requests, at: new Date().toISOString(),
      method: 'GET', url: url.toString(), purpose };
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 20000);
    let data;
    try {
      const response = await fetch(url, {
        method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error', signal: controller.signal, size: 2 * 1024 * 1024,
      });
      record.status = response.status;
      record.headers = {};
      for (const name of ['content-type', 'content-length', 'date', 'retry-after',
        'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset']) {
        const value = response.headers.get(name);
        if (value !== null) record.headers[name] = value;
      }
      record.body = await response.text();
      record.receivedBytes = Buffer.byteLength(record.body, 'utf8');
      if (response.status !== 204) {
        try { data = JSON.parse(record.body); }
        catch { record.parseError = 'Svaret är inte giltig JSON (eller är tomt).'; }
      }
    } catch (error) {
      record.error = redact(error.message);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
    record.durationMs = Date.now() - Date.parse(record.at);
    await fs.appendFile(journal, redact(JSON.stringify(record)) + '\n');
    log(redact(`[${record.sequence}/${config.maxRequests}] ${record.status ?? 'NÄTVERKSFEL'} ${url.pathname}${url.search}`));
    if (record.error || record.parseError || record.status >= 400 || record.status === 204) {
      report.observations.push({ request: record.sequence, url: record.url, status: record.status,
        issue: record.error || record.parseError || (record.status === 204 ? 'No content' : 'HTTP error') });
    }
    await saveReport();
    if ([401, 429].includes(record.status)) {
      throw new Error(`HTTP ${record.status}: avbryter. Retry-After: ${record.headers['retry-after'] || 'saknas'}.`);
    }
    if (signal?.aborted) throw new Error('Avbruten av användaren.');
    return { record, data: record.status === 200 ? data : undefined };
  }

  try {
    const tunes = new Map();
    for (let page = 0; ; page++) {
      const { data } = await get('/tunes', { page, pageSize: 100 }, 'Lista Tune-system');
      if (!Array.isArray(data)) throw new Error('Kunde inte läsa listan över Tune-system.');
      for (const tune of data) if (tune.tuneUuid) tunes.set(tune.tuneUuid, tune);
      if (data.length < 100 || (config.tuneId && tunes.has(config.tuneId))) break;
    }
    if (config.tuneId && !tunes.has(config.tuneId)) throw new Error('Valt Tune-system finns inte i API-listan.');
    const to = report.startedAt;
    const fromDay = new Date(Date.parse(to) - 86400000).toISOString();
    const fromHistory = new Date(Date.parse(to) - config.days * 86400000).toISOString();
    for (const [id] of tunes) {
      if (config.tuneId && config.tuneId !== id) continue;
      const prefix = `/tunes/${encodeURIComponent(id)}`;
      const { data: tune } = await get(prefix, {}, 'Tune-detaljer och nodstruktur');
      const { data: nodes } = await get(`${prefix}/gateway/nodes`, {}, 'Alla noder inklusive alternativa controllers');
      const { data: rooms } = await get(`${prefix}/rooms`, {}, 'Rum och aktiv reglering');
      await get(`${prefix}/controlsettings`, {}, 'Reglerinställningar');
      await get(`${prefix}/nodestatus`, {}, 'Anslutning, radio och batteri');
      await get(`${prefix}/setpointschedules`, {}, 'Schemaläggning');
      const appController = tune?.gateway?.children?.find(node => node.type === 1)?.uuid;
      const nodeList = collectNodes(tune?.gateway, nodes);
      for (const room of Array.isArray(rooms) ? rooms : []) {
        if (room.nodeUuid && !nodeList.some(node => node.uuid === room.nodeUuid)) {
          nodeList.push({ uuid: room.nodeUuid, type: 0, discoveredVia: 'rooms' });
        }
      }
      const overview = { tuneId: id, appSelectedController: appController ?? null,
        controllers: nodeList.filter(node => node.type === 1).map(node => node.uuid), nodes: [] };
      report.tunes.push(overview);
      if (!nodeList.length) report.observations.push({ tuneId: id, issue: 'Ingen nodstruktur kunde läsas.' });
      // Aggregate responses help detect whether values exist on another node.
      for (const type of FOCUS_TYPES) {
        await get(`${prefix}/measurements/latest`, { type }, 'Senaste värden för alla noder');
      }
      nodeList.sort((a, b) => Number(b.uuid === appController) - Number(a.uuid === appController)
        || Number(b.type === 1) - Number(a.type === 1));
      for (const node of nodeList) {
        const measurementPath = `${prefix}/measurements/${encodeURIComponent(node.uuid)}`;
        const { data: types } = await get(`${measurementPath}/types`, {}, 'Annonserade mätvärdestyper');
        const advertised = Array.isArray(types) ? types.filter(type => typeof type === 'string') : [];
        const isController = node.type === 1;
        const detail = { uuid: node.uuid, type: node.type, active: node.active,
          deviceType: node.device?.type, isConnected: node.device?.isConnected,
          lastTimeConnected: node.device?.lastTimeConnected,
          advertisedTypes: Array.isArray(types) ? advertised : null, latest: [], history: [] };
        overview.nodes.push(detail);
        const wanted = [...new Set([...advertised, ...(isController ? FOCUS_TYPES : [])])];
        for (const type of wanted) {
          const { record, data } = await get(`${measurementPath}/latest`, { type }, 'Senaste värde per nod och typ');
          detail.latest.push({ type, advertised: Array.isArray(types) ? advertised.includes(type) : null,
            request: record.sequence, status: record.status, measurement: data });
        }
        if (isController) {
          const historyTypes = wanted.filter(type => FOCUS_TYPES.includes(type) || /temperature|setpoint|process|control|target/.test(type));
          for (const type of historyTypes) {
            for (const [window, from, period] of [['24h', fromDay, 'PT1H'], [`${config.days}d`, fromHistory, 'P1D']]) {
              const { record, data } = await get(measurementPath, { type, from, to, period }, 'Mäthistorik för controller');
              detail.history.push({ type, window, request: record.sequence, status: record.status,
                periods: Array.isArray(data) ? data.length : null,
                periodsWithValue: Array.isArray(data) ? data.filter(item => item?.hasValue === true).length : null });
            }
          }
        }
        await saveReport();
      }
    }
    report.state = 'completed';
  } catch (error) {
    report.state = 'partial';
    report.stopReason = redact(error.message);
  } finally {
    report.finishedAt = new Date().toISOString();
    await saveReport();
  }
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Användning: npm run diagnose -- [--tune UUID] [--days 30] [--interval-ms 5000] [--max-requests 200]
Token efterfrågas dolt. Endast GET till https://app.ngenic.se/api/v3.
Utan --tune undersöks alla Tune-system som tokenen ger tillgång till.
Svaren sparas i diagnostics/ngenic-*/responses.jsonl och summary.json.
Ctrl+C sparar en delrapport. HTTP 401/429 stoppar körningen.
Rapporten innehåller API-data, inklusive eventuella personuppgifter, men inte tokenen.`);
    return;
  }
  const token = await readToken();
  const root = path.resolve(__dirname, '../diagnostics');
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const outputDir = await fs.mkdtemp(path.join(root, `ngenic-${new Date().toISOString().replace(/[:.]/g, '-')}-`));
  console.log(`Sparar till ${outputDir}\nEndast GET, ${options.intervalMs} ms mellan anrop. Ctrl+C avbryter och sparar.`);
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    const report = await runDiagnostics({ token, outputDir, options, signal: controller.signal });
    console.log(`${report.state === 'completed' ? 'Klart' : 'Delrapport'}: ${report.requests} anrop. ${report.stopReason || ''}\n${outputDir}`);
    if (report.state !== 'completed') process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}

if (require.main === module) main().catch(() => {
  // Avoid printing error objects that might contain request headers or input.
  console.error('Kunde inte starta diagnostiken. Kontrollera argument (--help), terminal och skrivrättigheter.');
  process.exitCode = 1;
});
module.exports = { parseArgs, readToken, collectNodes, runDiagnostics };

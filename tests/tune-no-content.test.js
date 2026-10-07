'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Client = require('../lib/NgenicTunesClient');

// Exercise the real device code without requiring a running Homey.
const deviceModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../drivers/tune/device.js'), 'utf8'), {
  module: deviceModule,
  require(name) {
    if (name === 'homey') return { Device: class {} };
    if (name === '../../lib/NgenicTunesClient') return Client;
    if (name === '../../lib/TimeSupport') return {};
    throw new Error(`Unexpected module: ${name}`);
  },
});
const TuneDevice = deviceModule.exports;

async function withApi(measurementResponse, run) {
  const originalUrl = Client.API_URL;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let data;
    if (url.pathname.endsWith('/controlsettings')) {
      data = { controlOnSpotPrice: false, spotPriceFactorIndex: 1 };
    } else if (url.pathname.endsWith('/rooms')) {
      data = [{ activeControl: true, targetTemperature: 21 }];
    } else if (url.pathname.endsWith('/nodestatus')) {
      data = [{ nodeUuid: 'controller', battery: 3, maxBattery: 4, radioStatus: 2, maxRadioStatus: 4 }];
    } else if (url.pathname.endsWith('/setpointschedules')) {
      data = [];
    } else if (url.pathname.endsWith('/latest')) {
      const result = measurementResponse(url.searchParams.get('type'));
      response.writeHead(result.status, { 'Content-Type': 'application/json' });
      response.end(result.body);
      return;
    } else {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(data));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  Client.API_URL = `http://127.0.0.1:${server.address().port}/tunes`;
  try {
    await run();
  } finally {
    Client.API_URL = originalUrl;
    await new Promise(resolve => server.close(resolve));
  }
}

function createDevice() {
  const device = new TuneDevice();
  device.values = { 'measure_temperature.setpoint': 19 };
  device.errors = [];
  device.getData = () => ({ id: 'tune', controllerId: 'controller' });
  device.setSettings = async () => {};
  device.setCapabilityValue = async (key, value) => { device.values[key] = value; };
  device.log = () => {};
  device.error = (...args) => device.errors.push(args);
  device.homey = { app: { timeSupport: { inPlanningPeriod: () => false } } };
  return device;
}

const validMeasurement = { status: 200, body: '{"hasValue":true,"value":0}' };

for (const [type, capability] of [
  ['setpoint_value_C', 'measure_temperature.setpoint'],
  ['process_value_C', 'measure_temperature'],
  ['temperature_C', 'measure_temperature.outside'],
  ['control_value_C', 'measure_temperature.control'],
]) {
  test(`204 for ${type} clears only that measurement and completes the update`, async () => {
    await withApi(requestedType => requestedType === type ? { status: 204 } : validMeasurement, async () => {
      const device = createDevice();
      await device.updateState();
      assert.equal(device.errors.length, 0);
      assert.equal(device.values[capability], null);
      assert.equal(device.values.target_temperature, 21);
      for (const other of ['measure_temperature.setpoint', 'measure_temperature', 'measure_temperature.outside', 'measure_temperature.control']) {
        if (other !== capability) assert.equal(device.values[other], 0);
      }
      assert.equal(device.values.measure_battery, 75);
      assert.equal(device.values.measure_signal_strength, 50);
      assert.equal(device.values.in_planning, false);
    });
  });
}

test('hasValue false clears a stale reading, and later valid data restores it', async () => {
  let missing = true;
  await withApi(type => type === 'setpoint_value_C' && missing
    ? { status: 200, body: '{"hasValue":false,"value":99}' }
    : validMeasurement, async () => {
    const device = createDevice();
    await device.updateState();
    assert.equal(device.values['measure_temperature.setpoint'], null);
    missing = false;
    await device.updateState();
    assert.equal(device.values['measure_temperature.setpoint'], 0);
    assert.equal(device.errors.length, 0);
  });
});

test('client reports 204 with a distinct code rather than a JSON syntax error', async () => {
  await withApi(() => ({ status: 204 }), async () => {
    await assert.rejects(Client.getNodeSetpoint('tune', 'controller'), {
      code: 'NGENIC_NO_CONTENT', status: 204,
    });
  });
});

test('successful API responses do not produce diagnostic logs', async t => {
  const log = t.mock.method(console, 'log', () => {});
  const errorLog = t.mock.method(console, 'error', () => {});
  await withApi(() => validMeasurement, async () => {
    const measurement = await Client.getNodeSetpoint('tune', 'controller');
    assert.equal(measurement.value, 0);
    assert.equal(log.mock.callCount(), 0);
    assert.equal(errorLog.mock.callCount(), 0);
  });
});

test('invalid JSON errors retain metadata without exposing response contents', async t => {
  const errorLog = t.mock.method(console, 'error', () => {});
  const privateValue = 'synthetic-customer@example.invalid';
  const body = `PRIVATE ${privateValue}`;
  await withApi(() => ({ status: 200, body }), async () => {
    await assert.rejects(Client.getNodeSetpoint('tune', 'controller'), error => {
      assert.match(error.message, /GET .*\/latest\?type=setpoint_value_C/);
      assert.match(error.message, /HTTP 200/);
      assert.ok(error.message.includes(`${Buffer.byteLength(body, 'utf8')} bytes`));
      assert.match(error.message, /Content-Type: application\/json/);
      assert.equal(error.message.includes(privateValue), false);
      assert.equal(error.message.includes('PRIVATE'), false);
      return true;
    });
    assert.equal(errorLog.mock.callCount(), 1);
    const output = errorLog.mock.calls.map(call => call.arguments.map(String).join(' ')).join('\n');
    assert.equal(output.includes(privateValue), false);
    assert.equal(output.includes('PRIVATE'), false);
  });
});

for (const [label, response, expectedMessage] of [
  ['empty 200', { status: 200, body: '' }, /HTTP 200, 0 bytes/],
  ['truncated JSON', { status: 200, body: '{"value":' }, /HTTP 200/],
  ['unauthorized request', { status: 401 }, /Unauthorized/],
]) {
  test(`${label} remains an error instead of being treated as missing data`, async () => {
    await withApi(() => response, async () => {
      const device = createDevice();
      await device.updateState();
      assert.equal(device.errors.length, 1);
      assert.match(device.errors[0][1].message, expectedMessage);
      assert.equal(device.values['measure_temperature.setpoint'], 19);
      assert.equal(device.values.in_planning, undefined);
    });
  });
}


test('missing setpoint and process values allow repeated updates without error logs', async t => {
  const errorLog = t.mock.method(console, 'error', () => {});
  await withApi(type => ['setpoint_value_C', 'process_value_C'].includes(type)
    ? { status: 204 }
    : validMeasurement, async () => {
    const device = createDevice();
    for (let i = 0; i < 2; i++) {
      await device.updateState();
      assert.equal(device.values['measure_temperature.setpoint'], null);
      assert.equal(device.values.measure_temperature, null);
      assert.equal(device.values.target_temperature, 21);
      assert.equal(device.values['measure_temperature.outside'], 0);
      assert.equal(device.values['measure_temperature.control'], 0);
      assert.equal(device.values.measure_battery, 75);
      assert.equal(device.values.in_planning, false);
    }
    assert.equal(device.errors.length, 0);
    assert.equal(errorLog.mock.callCount(), 0);
  });
});

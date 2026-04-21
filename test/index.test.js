const assert = require('node:assert/strict');
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const Module = require('node:module');
const test = require('node:test');

function loadPluginForTest() {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'express') {
      const express = () => ({
        get() {},
        post() {},
        delete() {},
        use() {},
        set() {},
        listen(_port, _bind, cb) {
          if (cb) cb();
          return { on() {} };
        },
      });
      express.json = () => (_req, _res, next) => next();
      return express;
    }
    if (request === 'express-rate-limit') {
      return () => (_req, _res, next) => next();
    }
    if (request === 'jsonwebtoken') {
      return { sign: () => 'signed-test-token' };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve('../index.js')];
    return require('../index.js')._test;
  } finally {
    Module._load = originalLoad;
  }
}

const {
  RoomStore,
  normalizeRoomName,
  parseAccessories,
  mapType,
  resolveAction,
  clamp,
  ROOMS_FILE_NAME,
} = loadPluginForTest();

function makeTempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'openclaw-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeLog() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

test('normalizes room names by trimming and collapsing whitespace', () => {
  assert.equal(normalizeRoomName('  Living   Room  '), 'Living Room');
  assert.equal(normalizeRoomName(null), '');
});

test('RoomStore persists device room assignments', t => {
  const dir = makeTempDir(t);
  const firstStore = new RoomStore(dir, makeLog());

  const entry = firstStore.setRoom('device-1', '  Office  ');
  assert.equal(entry.room, 'Office');
  assert.match(entry.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

  const roomFile = join(dir, ROOMS_FILE_NAME);
  assert.equal(existsSync(roomFile), true);
  assert.deepEqual(JSON.parse(readFileSync(roomFile, 'utf8')).devices['device-1'].room, 'Office');

  const secondStore = new RoomStore(dir, makeLog());
  assert.equal(secondStore.getRoom('device-1'), 'Office');
});

test('RoomStore clears rooms and lists rooms with stale devices', t => {
  const dir = makeTempDir(t);
  const store = new RoomStore(dir, makeLog());

  store.setRoom('light-1', 'Kitchen');
  store.setRoom('switch-1', 'Kitchen');
  store.setRoom('missing-1', 'Office');
  store.clearRoom('switch-1');

  assert.equal(store.getRoom('switch-1'), null);
  assert.deepEqual(store.listRooms([{ id: 'light-1', name: 'Ceiling Light', type: 'lightbulb' }]), [
    {
      name: 'Kitchen',
      count: 1,
      devices: [{ id: 'light-1', name: 'Ceiling Light', type: 'lightbulb' }],
    },
    {
      name: 'Office',
      count: 1,
      devices: [{ id: 'missing-1', stale: true }],
    },
  ]);
});

test('RoomStore tolerates corrupt room memory files', t => {
  const dir = makeTempDir(t);
  writeFileSync(join(dir, ROOMS_FILE_NAME), '{bad json');

  const warnings = [];
  const store = new RoomStore(dir, { ...makeLog(), warn: message => warnings.push(message) });

  assert.equal(store.getRoom('device-1'), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Could not read room memory/);
});

test('RoomStore applies bulk assignments with per-item errors', t => {
  const dir = makeTempDir(t);
  const store = new RoomStore(dir, makeLog());

  assert.deepEqual(store.applyAssignments([
    { id: 'light-1', room: 'Kitchen' },
    { id: '', room: 'Kitchen' },
    { id: 'switch-1', room: '' },
  ]), [
    { id: 'light-1', success: true, room: 'Kitchen' },
    { id: '', success: false, error: 'Missing device id.' },
    { id: 'switch-1', success: false, error: 'Missing room.' },
  ]);
});

test('parseAccessories maps services into device objects with learned rooms', () => {
  const roomStore = { getRoom: id => id === 'light-1' ? 'Office' : null };
  const devices = parseAccessories([
    {
      uniqueId: 'light-1',
      serviceName: 'Desk Lamp',
      humanType: 'Lightbulb',
      values: { On: true },
      serviceCharacteristics: [
        { type: 'On', canWrite: true },
        { type: 'CurrentAmbientLightLevel', canWrite: false },
      ],
      accessoryInformation: {
        Manufacturer: 'Acme',
        Model: 'A1',
      },
    },
    {
      uniqueId: 'info-1',
      serviceName: 'Info',
      humanType: 'AccessoryInformation',
    },
    {
      uniqueId: 'api-1',
      serviceName: 'OpenClaw API',
      humanType: 'Switch',
    },
  ], roomStore);

  assert.deepEqual(devices, [
    {
      id: 'light-1',
      name: 'Desk Lamp',
      type: 'lightbulb',
      humanType: 'Lightbulb',
      room: 'Office',
      state: { On: true },
      characteristics: ['On'],
      manufacturer: 'Acme',
      model: 'A1',
    },
  ]);
});

test('mapType recognizes common HomeKit service names', () => {
  assert.equal(mapType('Lightbulb'), 'lightbulb');
  assert.equal(mapType('Window Covering'), 'blinds');
  assert.equal(mapType('Garage Door Opener'), 'garage');
  assert.equal(mapType('Humidity Sensor'), 'sensor');
  assert.equal(mapType('Something Else'), 'other');
});

test('resolveAction returns characteristic writes and clamps numeric values', () => {
  assert.deepEqual(resolveAction('on', true), { characteristicType: 'On', value: true });
  assert.deepEqual(resolveAction('brightness', 150), { characteristicType: 'Brightness', value: 100 });
  assert.deepEqual(resolveAction('tilt', -120), { characteristicType: 'TargetHorizontalTiltAngle', value: -90 });
  assert.deepEqual(resolveAction('mode', 'cool'), { characteristicType: 'TargetHeatingCoolingState', value: 2 });
  assert.deepEqual(resolveAction('color', { hue: 240, saturation: 90 }), [
    { characteristicType: 'Hue', value: 240 },
    { characteristicType: 'Saturation', value: 90 },
  ]);
  assert.equal(resolveAction('nope', true), null);
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
});

// Logic tests for main.js. Run: node --test
// Loads main.js with a minimal Obsidian stand-in and reaches its internal helpers.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class Base { constructor(app) { this.app = app; } }
const notices = [];
const obsidian = {
  Plugin: class extends Base {}, ItemView: Base, Modal: Base, PluginSettingTab: Base, Menu: Base,
  FuzzySuggestModal: Base, MarkdownRenderChild: Base, TFile: Base, Setting: Base,
  Notice: class { constructor(m) { notices.push(m); } hide() {} },
  setIcon() {}, addIcon() {}, normalizePath: (p) => p,
};
global.createFragment = () => ({});

const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', src + `
module.exports.__t = { addMonthsISO, daysBetween, intervalStatus, documentStatus, efficiency, normalizeVehicle,
  normalizeData, spendBy, monthlySpend, needsAttention, dueLabel, presetsFor, odometerOf, statsOf, efficiencySeries,
  priceSeries, fillTrio, toCSV, csvEntries, parseCSV };`)(mod, mod.exports, () => obsidian);
const T = mod.exports.__t;
const DATA = T.normalizeData({});

const vehicle = (extra) => T.normalizeVehicle({ name: 'Test', ...extra });

test('addMonthsISO keeps month ends', () => {
  assert.equal(T.addMonthsISO('2025-01-31', 1), '2025-02-28');
  assert.equal(T.addMonthsISO('2024-01-31', 1), '2024-02-29');
  assert.equal(T.addMonthsISO('2025-11-30', 3), '2026-02-28');
  assert.equal(T.addMonthsISO('2025-06-15', 12), '2026-06-15');
  assert.equal(T.addMonthsISO('', 1), '');
});

test('daysBetween counts calendar days across DST and years', () => {
  assert.equal(T.daysBetween('2026-03-01', '2026-04-01'), 31);
  assert.equal(T.daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(T.daysBetween('2026-01-10', '2026-01-01'), -9);
});

test('intervalStatus: whichever of distance or time runs out first', () => {
  const iv = { distance: 10000, months: 12, lastDistance: 30000, lastDate: '2026-01-01' };
  assert.equal(T.intervalStatus(iv, 40500, '2026-03-01', DATA).status, 'overdue', 'by distance');
  assert.equal(T.intervalStatus(iv, 31000, '2027-01-05', DATA).status, 'overdue', 'by date');
  assert.equal(T.intervalStatus(iv, 39600, '2026-03-01', DATA).status, 'soon', 'within 500 km');
  assert.equal(T.intervalStatus(iv, 31000, '2026-12-10', DATA).status, 'soon', 'within 30 days');
  const ok = T.intervalStatus(iv, 35000, '2026-03-01', DATA);
  assert.equal(ok.status, 'ok');
  assert.equal(ok.distLeft, 5000);
  assert.equal(ok.dueDate, '2027-01-01');
  assert.ok(ok.pct > 0.49 && ok.pct < 0.51);
});

test('intervalStatus: distance-only and due-today edges', () => {
  const st = T.intervalStatus({ distance: 600, months: 0, lastDistance: 1000, lastDate: '' }, 1600, '2026-01-01', DATA);
  assert.equal(st.status, 'soon');
  assert.equal(T.dueLabel(st, 'km'), 'due now');
  assert.equal(T.intervalStatus({ distance: 0, months: 6, lastDistance: 0, lastDate: '' }, 0, '2026-01-01', DATA).status, 'ok', 'never done, no date');
});

test('documentStatus', () => {
  assert.equal(T.documentStatus({ due: '2026-01-01' }, '2026-01-02', DATA).status, 'overdue');
  assert.equal(T.documentStatus({ due: '2026-01-20' }, '2026-01-02', DATA).status, 'soon');
  assert.equal(T.documentStatus({ due: '' }, '2026-01-02', DATA).status, 'ok');
});

test('efficiency: full-tank method with a partial fill in between', () => {
  const v = vehicle({ fills: [
    { odometer: 1000, amount: 40, full: true },
    { odometer: 1500, amount: 10, full: false },
    { odometer: 2000, amount: 30, full: true },
  ] });
  assert.deepEqual(T.efficiency(v, DATA), { value: 25, unit: 'km/L' });
});

test('efficiency: first fill or partials only give nothing', () => {
  assert.equal(T.efficiency(vehicle({ fills: [{ odometer: 1000, amount: 40 }] }), DATA), null);
  assert.equal(T.efficiency(vehicle({ fills: [{ odometer: 1000, amount: 4, full: false }, { odometer: 1200, amount: 5, full: false }] }), DATA), null);
});

test('efficiency: EV kWh/100km and US units', () => {
  const ev = vehicle({ fuel: 'electric', fills: [{ odometer: 100, amount: 50 }, { odometer: 400, amount: 45, full: false }] });
  assert.deepEqual(T.efficiency(ev, DATA), { value: 15, unit: 'kWh/100km' }, 'EV charges count as complete');
  const us = T.normalizeData({ distanceUnit: 'mi', volumeUnit: 'gal' });
  const car = vehicle({ fills: [{ odometer: 100, amount: 10 }, { odometer: 400, amount: 10 }] });
  assert.deepEqual(T.efficiency(car, us), { value: 30, unit: 'MPG' });
});

test('normalizeVehicle cleans bad records without dropping usable ones', () => {
  assert.equal(T.normalizeVehicle({ name: '  ' }), null);
  assert.equal(T.normalizeVehicle(null), null);
  const v = vehicle({
    type: 'spaceship', odometer: 'abc',
    services: [{ task: 'Oil', odometer: 5200, cost: '-4' }, { task: '' }, null],
    fills: [{ amount: 0 }, { amount: 12, odometer: 5300, date: 'nope' }],
    intervals: [{ name: 'Oil', distance: 5000 }, { name: 'Nothing' }],
  });
  assert.equal(v.type, 'car');
  assert.equal(v.services.length, 1);
  assert.equal(v.services[0].cost, 0);
  assert.equal(v.services[0].date, '');
  assert.equal(v.fills.length, 1);
  assert.equal(v.intervals.length, 1);
  assert.equal(v.odometer, 5300, 'odometer is the highest logged reading');
});

test('normalizeData defaults to India', () => {
  assert.equal(DATA.currency, 'INR');
  assert.equal(DATA.distanceUnit, 'km');
  assert.equal(DATA.volumeUnit, 'L');
  assert.equal(DATA.soonDistance, 500);
  assert.equal(DATA.soonDays, 30);
});

test('spendBy counts only the range; all time includes undated', () => {
  const vs = [
    vehicle({ id: 'a', services: [{ task: 'x', date: '2026-01-05', cost: 100 }, { task: 'y', cost: 7 }], fills: [{ date: '2025-12-31', amount: 1, cost: 50 }] }),
    vehicle({ id: 'b', fuel: 'electric', fills: [{ date: '2026-02-01', amount: 1, cost: 20 }] }),
  ];
  const y = T.spendBy(vs, '2026-01-01', '2026-12-31');
  assert.equal(y.total, 120);
  assert.deepEqual(y.byKind, { service: 100, fuel: 0, charging: 20 });
  assert.equal(y.byVehicle.a, 100);
  assert.equal(T.spendBy(vs, '', '2026-12-31').total, 177);
  const months = T.monthlySpend(vs, 12, '2026-02-15');
  assert.equal(months.length, 12);
  assert.equal(months[11].amount, 20);
  assert.equal(months[10].amount, 100);
  assert.equal(months[9].amount, 50);
});

test('needsAttention sorts overdue first and skips ok items', () => {
  const v = vehicle({
    odometer: 10000,
    intervals: [
      { id: 'ok', name: 'Fine', distance: 10000, lastDistance: 9000 },
      { id: 'soon', name: 'Soon', distance: 1000, lastDistance: 9200 },
      { id: 'late', name: 'Late', distance: 1000, lastDistance: 8000 },
    ],
    documents: [{ name: 'Insurance', due: '2026-01-10' }],
  });
  const names = T.needsAttention([v], '2026-01-01', DATA).map((i) => i.item.name);
  assert.deepEqual(names, ['Late', 'Insurance', 'Soon']);
});

test('presets fit the vehicle and convert to miles', () => {
  assert.ok(T.presetsFor('bike', 'petrol', 'km').some((p) => p.name === 'Chain clean & lube' && p.distance === 600));
  assert.ok(T.presetsFor('car', 'electric', 'km').every((p) => !/oil/i.test(p.name)));
  assert.equal(T.presetsFor('car', 'petrol', 'mi')[0].distance, 6200);
});

// ── Plugin mutations ──
async function plugin(data) {
  let saved = null;
  const P = mod.exports;
  const p = new P();
  p.app = { workspace: { getLeavesOfType: () => [], onLayoutReady() {} } };
  p.loadData = async () => data;
  p.saveData = async (d) => { saved = JSON.parse(JSON.stringify(d)); };
  Object.assign(p, { registerView() {}, addRibbonIcon() {}, addSettingTab() {}, registerMarkdownCodeBlockProcessor() {}, addCommand() {} });
  await p.onload();
  return { p, saved: () => saved };
}

test('saveEntry: a lower odometer is logged but never lowers the vehicle', async () => {
  const { p, saved } = await plugin({ vehicles: [{ id: 'v', name: 'Car', odometer: 20000, intervals: [{ id: 'oil', name: 'Oil', distance: 10000, lastDistance: 10000, lastDate: '2025-01-01' }] }] });
  await p.saveEntry('v', 'services', { id: 'e1', date: '2025-06-01', odometer: 15000, task: 'Oil', cost: 900, where: 'shop', notes: '', resets: ['oil'] });
  const v = saved().vehicles[0];
  assert.equal(v.odometer, 20000);
  assert.equal(v.services.length, 1);
  assert.equal(v.intervals[0].lastDistance, 15000);
  assert.equal(v.intervals[0].lastDate, '2025-06-01');
});

test('saveEntry: an older service does not move "last done" backwards', async () => {
  const { p, saved } = await plugin({ vehicles: [{ id: 'v', name: 'Car', intervals: [{ id: 'oil', name: 'Oil', distance: 10000, lastDistance: 30000, lastDate: '2026-06-15' }] }] });
  await p.saveEntry('v', 'services', { id: 'e1', date: '2025-05-10', odometer: 10000, task: 'Oil', cost: 0, where: 'shop', notes: '', resets: ['oil'] });
  assert.equal(saved().vehicles[0].intervals[0].lastDistance, 30000);
});

test('deleteEntry removes the entry and offers undo', async () => {
  const { p, saved } = await plugin({ vehicles: [{ id: 'v', name: 'Car', fills: [{ id: 'f', amount: 10, odometer: 100 }] }] });
  await p.deleteEntry('v', 'fills', 'f');
  assert.equal(saved().vehicles[0].fills.length, 0);
});

test('setOdometer refuses readings below the log', async () => {
  const { p } = await plugin({ vehicles: [{ id: 'v', name: 'Car', fills: [{ id: 'f', amount: 10, odometer: 5000 }] }] });
  const v = p.data.vehicles[0];
  assert.equal(p.setOdometer(v, 4000), false);
  assert.equal(p.setOdometer(v, 0), false);
  assert.equal(p.setOdometer(v, 6000), true);
  assert.equal(v.odometer, 6000);
});

test('a short interval is not due soon right after it is done', () => {
  const monthly = { distance: 1000, months: 1, lastDistance: 12000, lastDate: '2026-01-01' };
  assert.equal(T.intervalStatus(monthly, 12000, '2026-01-01', DATA).status, 'ok');
  assert.equal(T.intervalStatus(monthly, 12800, '2026-01-02', DATA).status, 'soon', 'within a quarter of 1,000 km');
  assert.equal(T.intervalStatus(monthly, 12000, '2026-01-25', DATA).status, 'soon', 'within a quarter of a month');
});

test('a missed fill starts mileage over instead of skewing it', () => {
  const v = vehicle({ fills: [
    { odometer: 1000, amount: 40 },
    { odometer: 2000, amount: 40 },
    { odometer: 4000, amount: 40, missed: true }, // a fill in between was never logged
    { odometer: 4500, amount: 20 },
  ] });
  assert.deepEqual(T.efficiency(v, DATA), { value: 25, unit: 'km/L' }, '(1000 + 500) km / 60 L');
  assert.deepEqual(T.efficiencySeries(v, DATA).map((p) => p.value), [25, 25]);
});

test('price per unit follows each fill with a cost', () => {
  const v = vehicle({ fills: [{ date: '2026-02-01', amount: 10, cost: 1050 }, { date: '2026-01-01', amount: 20, cost: 2000 }, { amount: 5 }] });
  assert.deepEqual(T.priceSeries(v).map((p) => p.value), [100, 105]);
});

test('fillTrio works out the field not typed last', () => {
  assert.equal(T.fillTrio({ amount: 30, price: 104.5, cost: 0 }, ['amount', 'price']).cost, 3135);
  assert.equal(T.fillTrio({ amount: 0, price: 100, cost: 2500 }, ['cost', 'price']).amount, 25);
  assert.equal(T.fillTrio({ amount: 4, price: 0, cost: 410 }, ['cost', 'amount']).price, 102.5);
  // typed cost, then amount, then amount again: cost stays what the user typed
  assert.equal(T.fillTrio({ amount: 5, price: 100, cost: 500 }, ['cost', 'amount']).cost, 500);
  assert.equal(T.fillTrio({ amount: 5.5, price: 100, cost: 500 }, ['cost', 'amount']).price, 90.91);
});

test('expenses count in spend by category and in cost per km', () => {
  const v = vehicle({
    id: 'a',
    services: [{ task: 'Oil', date: '2026-01-05', odometer: 1000, cost: 1000 }],
    expenses: [{ date: '2026-01-10', odometer: 2000, category: 'toll', cost: 500 }, { date: '2026-01-11', category: 'nope', cost: 100 }, { cost: 0 }],
  });
  assert.equal(v.expenses.length, 2);
  assert.equal(v.expenses[1].category, 'other');
  const sp = T.spendBy([v], '2026-01-01', '2026-12-31');
  assert.equal(sp.total, 1600);
  assert.equal(sp.byKind.toll, 500);
  assert.equal(sp.byKind.other, 100);
  assert.equal(T.statsOf(v, DATA).costPerDistance, 1.6);
  assert.equal(v.odometer, 2000);
});

test('CSV round-trips our own export, quotes and all', () => {
  const v = vehicle({
    name: 'Swift, "red"',
    services: [{ date: '2026-01-05', odometer: 1000, task: 'Oil\nand filter', cost: 900, where: 'diy' }],
    fills: [{ date: '2026-01-06', odometer: 1100, amount: 30.5, cost: 3200, full: false, missed: true, receipt: 'r/a.jpg' }],
    expenses: [{ date: '2026-01-07', category: 'toll', cost: 85 }],
  });
  const rows = T.csvEntries(T.toCSV([v]));
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.vehicle === 'Swift, "red"'));
  const [s, f, x] = rows;
  assert.deepEqual([s.kind, s.entry.task, s.entry.where, s.entry.cost], ['services', 'Oil\nand filter', 'diy', 900]);
  assert.deepEqual([f.kind, f.entry.amount, f.entry.full, f.entry.missed, f.entry.receipt], ['fills', 30.5, false, true, 'r/a.jpg']);
  assert.deepEqual([x.kind, x.entry.category, x.entry.odometer], ['expenses', 'toll', 0]);
});

test('CSV import reads a Fuelio-style log section', () => {
  const csv = [
    '## Vehicle', '"Name","Description"', '"Car",""',
    '## Log', '"Data","Odo (km)","Fuel (litres)","Full","Price (optional)","Notes (optional)","Missed","FuelType","VolumePrice"',
    '"2024-01-05 10:00","12,000","30.5","1","3200","hi","0","100","104.9"',
    '"05/02/2024","12500","10","0","1050","","1","100","105"',
    '## CostCategories', '"x"',
  ].join('\r\n');
  const rows = T.csvEntries(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].entry, { date: '2024-01-05', odometer: 12000, cost: 3200, notes: 'hi', receipt: '', amount: 30.5, full: true, missed: false });
  assert.equal(rows[1].entry.date, '2024-02-05', 'day first');
  assert.equal(rows[1].entry.full, false);
  assert.equal(rows[1].entry.missed, true);
  assert.deepEqual(T.csvEntries('just,some\ncells,here'), []);
});

test('importCSV adds rows to named vehicles and skips duplicates', async () => {
  const { p, saved } = await plugin({ vehicles: [{ id: 'v', name: 'Car' }] });
  const csv = 'vehicle,kind,date,odometer,item,amount,cost\ncar,fuel,2026-01-01,100,,10,1000\nNew bike,service,2026-01-02,50,Chain,,200\n';
  p.app.vault = { read: async () => csv };
  await p.importCSV({ name: 'log.csv' });
  await p.importCSV({ name: 'log.csv' });
  const vs = saved().vehicles;
  assert.equal(vs.length, 2);
  assert.equal(vs[0].fills.length, 1);
  assert.equal(vs[1].name, 'New bike');
  assert.equal(vs[1].services[0].task, 'Chain');
});

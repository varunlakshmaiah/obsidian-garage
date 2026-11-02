import {
  Plugin, ItemView, Modal, Setting, Notice, PluginSettingTab, Menu, FuzzySuggestModal,
  MarkdownRenderChild, TFile, setIcon, addIcon, normalizePath,
} from 'obsidian';

// ============================================================
// Constants
// ============================================================
const VIEW_TYPE = 'vehicle-garage';

// Logo: a car with a wrench-shaped service mark, on a 24px grid scaled to the 100-unit icon box
const ICON_ID = 'garage';
const ICON_SVG = '<g transform="scale(4.1667)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M5 17H3v-5l2-5h10l3 5h3v5h-2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>'
  + '<path d="M9.5 17h5"/><path d="M5 12h14"/></g>';

const CURRENCIES = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$', CAD: 'CA$', AED: 'AED',
  SGD: 'S$', CHF: 'CHF', NZD: 'NZ$', ZAR: 'R', BRL: 'R$', MYR: 'RM', THB: '฿', IDR: 'Rp',
  PHP: '₱', SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', KRW: '₩', CNY: 'CN¥', SAR: 'SAR',
};

const TYPES = {
  car: { label: 'Car', icon: 'car' },
  bike: { label: 'Motorcycle', icon: 'bike' },
  scooter: { label: 'Scooter', icon: 'bike' },
  truck: { label: 'Truck / SUV', icon: 'truck' },
};

const FUELS = {
  petrol: 'Petrol', diesel: 'Diesel', cng: 'CNG', lpg: 'LPG', hybrid: 'Hybrid', electric: 'Electric',
};

// Costs that are neither service nor fuel
const EXPENSES = {
  insurance: 'Insurance', tax: 'Tax & registration', loan: 'Loan / EMI', parking: 'Parking', toll: 'Tolls',
  wash: 'Cleaning', fine: 'Fines', accessories: 'Accessories', other: 'Other',
};

const DEFAULT_DATA = {
  currency: 'INR',
  distanceUnit: 'km',
  volumeUnit: 'L',
  soonDistance: 500,
  soonDays: 30,
  reminders: true,
  lastReminder: '',
  exportFolder: 'Garage',
  vehicles: [],
};

// Presets in km; converted for vehicles tracked in miles
const PRESETS = {
  bike: [
    ['Chain clean & lube', 600, 0], ['Engine oil & filter', 5000, 12], ['Tyre pressure & tread', 1000, 1],
    ['Chain slack check', 1000, 0], ['Brake fluid', 0, 24], ['Air filter', 10000, 12], ['Spark plugs', 15000, 0],
  ],
  electric: [
    ['Tyre rotation', 10000, 6], ['Cabin air filter', 20000, 12], ['Brake fluid', 0, 24],
    ['12V battery check', 0, 24], ['Wiper blades', 0, 12],
  ],
  car: [
    ['Engine oil & filter', 10000, 12], ['Tyre rotation', 10000, 6], ['Cabin air filter', 15000, 12],
    ['Engine air filter', 30000, 24], ['Brake pads & fluid', 40000, 24], ['Coolant', 40000, 48],
    ['Spark plugs', 60000, 48], ['Wiper blades', 0, 12],
  ],
};

const DEFAULT_DOCUMENTS = ['Insurance', 'Pollution (PUC)'];
const UNDO_MS = 8000;
const LOG_PAGE = 100; // log rows drawn at a time, so years of entries stay quick on phones
const RECEIPT_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'bmp', 'svg', 'pdf']);
const LONG_PRESS_MS = 500;

// ============================================================
// Helpers: dates, numbers, money
// ============================================================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? [+m[1], +m[2], +m[3]] : null;
}

function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayISO() {
  return isoOf(new Date());
}

/** Add months without skipping short months (Jan 31 + 1 → Feb 28/29) */
function addMonthsISO(iso, n) {
  const p = parseISO(iso);
  if (!p) return '';
  const d = new Date(p[0], p[1] - 1 + n, 1);
  d.setDate(Math.min(p[2], new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return isoOf(d);
}

/** Whole days from a to b, in calendar days (no timezone drift) */
function daysBetween(a, b) {
  const p = parseISO(a);
  const q = parseISO(b);
  if (!p || !q) return null;
  return Math.round((Date.UTC(q[0], q[1] - 1, q[2]) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000);
}

function shortDate(iso, withYear = true) {
  const p = parseISO(iso);
  if (!p) return 'No date';
  const opts = { day: 'numeric', month: 'short' };
  if (withYear) opts.year = 'numeric';
  return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, opts);
}

function fmtNum(n, dp = 0) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtMoney(n, cur, dp = 0) {
  return (CURRENCIES[cur] || cur) + fmtNum(n, dp);
}

function whenDays(d) {
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 60) return `in ${d} days`;
  return `in ${Math.round(d / 30.44)} months`;
}

const isEV = (v) => v.fuel === 'electric';
const energyWord = (v) => (isEV(v) ? 'charge' : 'fuel');

// ============================================================
// Records: one place cleans everything that is saved or imported
// ============================================================
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v == null ? '' : String(v).trim());
const num = (v) => {
  const n = parseFloat(v);
  return isFinite(n) && n >= 0 ? n : 0;
};
const dateOf = (v) => (parseISO(v) ? String(v).slice(0, 10) : '');
const idOf = (v) => str(v) || uid();

/** Highest reading the vehicle has ever shown: its own field or any log entry */
function odometerOf(v) {
  return Math.max(num(v.odometer), loggedOdometer(v));
}

/** Highest reading in the log alone */
function loggedOdometer(v) {
  return Math.max(0, ...v.services.map((s) => s.odometer), ...v.fills.map((f) => f.odometer), ...v.expenses.map((x) => x.odometer));
}

/** Returns null when the record has no usable name */
function normalizeVehicle(r) {
  if (!r || typeof r !== 'object') return null;
  const name = str(r.name);
  if (!name) return null;
  const v = {
    id: idOf(r.id),
    name,
    type: TYPES[r.type] ? r.type : 'car',
    fuel: FUELS[r.fuel] ? r.fuel : 'petrol',
    make: str(r.make),
    model: str(r.model),
    year: str(r.year),
    plate: str(r.plate),
    vin: str(r.vin),
    notes: str(r.notes),
    odometer: num(r.odometer),
    intervals: arr(r.intervals)
      .map((i) => ({
        id: idOf(i && i.id), name: str(i && i.name), distance: num(i && i.distance), months: num(i && i.months),
        lastDistance: num(i && i.lastDistance), lastDate: dateOf(i && i.lastDate),
      }))
      .filter((i) => i.name && (i.distance || i.months)),
    documents: arr(r.documents)
      .map((d) => ({ id: idOf(d && d.id), name: str(d && d.name), due: dateOf(d && d.due) }))
      .filter((d) => d.name),
    services: arr(r.services)
      .filter((s) => s && typeof s === 'object')
      .map((s) => ({
        id: idOf(s.id), date: dateOf(s.date), odometer: num(s.odometer), task: str(s.task), cost: num(s.cost),
        where: s.where === 'diy' ? 'diy' : 'shop', notes: str(s.notes), resets: arr(s.resets).map(String), receipt: str(s.receipt),
      }))
      .filter((s) => s.task),
    fills: arr(r.fills)
      .filter((f) => f && typeof f === 'object')
      .map((f) => ({
        id: idOf(f.id), date: dateOf(f.date), odometer: num(f.odometer), amount: num(f.amount), cost: num(f.cost),
        full: f.full !== false && f.full !== 'false', missed: f.missed === true || f.missed === 'true',
        notes: str(f.notes), receipt: str(f.receipt),
      }))
      .filter((f) => f.amount > 0),
    expenses: arr(r.expenses)
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        id: idOf(x.id), date: dateOf(x.date), odometer: num(x.odometer), category: EXPENSES[x.category] ? x.category : 'other',
        cost: num(x.cost), notes: str(x.notes), receipt: str(x.receipt),
      }))
      .filter((x) => x.cost > 0),
    createdAt: str(r.createdAt) || new Date().toISOString(),
  };
  v.odometer = odometerOf(v);
  return v;
}

function normalizeData(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const pos = (v, d) => (num(v) > 0 ? num(v) : d);
  return {
    currency: CURRENCIES[r.currency] ? r.currency : DEFAULT_DATA.currency,
    distanceUnit: r.distanceUnit === 'mi' ? 'mi' : 'km',
    volumeUnit: r.volumeUnit === 'gal' ? 'gal' : 'L',
    soonDistance: pos(r.soonDistance, DEFAULT_DATA.soonDistance),
    soonDays: pos(r.soonDays, DEFAULT_DATA.soonDays),
    reminders: r.reminders !== false,
    lastReminder: dateOf(r.lastReminder),
    exportFolder: str(r.exportFolder) || DEFAULT_DATA.exportFolder,
    vehicles: arr(r.vehicles).map(normalizeVehicle).filter(Boolean),
  };
}

function presetsFor(type, fuel, unit) {
  const list = PRESETS[type === 'bike' || type === 'scooter' ? 'bike' : fuel === 'electric' ? 'electric' : 'car'];
  const conv = (km) => (unit === 'mi' ? Math.round((km * 0.621371) / 100) * 100 : km);
  return list.map(([name, km, months]) => ({ id: uid(), name, distance: conv(km), months, lastDistance: 0, lastDate: '' }));
}

const clone = (o) => JSON.parse(JSON.stringify(o));

// ============================================================
// Engine: what is due, how efficient, where the money went
// ============================================================

/** Status of one maintenance interval: whichever of distance or time runs out first */
function intervalStatus(iv, odo, today, data) {
  let distLeft = null;
  let daysLeft = null;
  let pct = 0;
  let dueDate = '';
  if (iv.distance) {
    distLeft = iv.lastDistance + iv.distance - odo;
    pct = Math.max(pct, (odo - iv.lastDistance) / iv.distance);
  }
  if (iv.months && iv.lastDate) {
    dueDate = addMonthsISO(iv.lastDate, iv.months);
    daysLeft = daysBetween(today, dueDate);
    const total = daysBetween(iv.lastDate, dueDate) || 1;
    pct = Math.max(pct, (total - daysLeft) / total);
  }
  const overdue = (distLeft !== null && distLeft < 0) || (daysLeft !== null && daysLeft < 0);
  // The warning window never covers more than a quarter of the interval, so a monthly check is not "due soon" the day it is done
  const soonDist = Math.min(data.soonDistance, iv.distance / 4);
  const soonDays = dueDate ? Math.min(data.soonDays, daysBetween(iv.lastDate, dueDate) / 4) : 0;
  const soon = !overdue && ((distLeft !== null && distLeft <= soonDist) || (daysLeft !== null && daysLeft <= soonDays));
  return { status: overdue ? 'overdue' : soon ? 'soon' : 'ok', pct: Math.min(1, Math.max(0, pct)), distLeft, daysLeft, dueDate };
}

function documentStatus(doc, today, data) {
  const daysLeft = doc.due ? daysBetween(today, doc.due) : null;
  const status = daysLeft === null ? 'ok' : daysLeft < 0 ? 'overdue' : daysLeft <= data.soonDays ? 'soon' : 'ok';
  const pct = daysLeft === null ? 0 : Math.min(1, Math.max(0, 1 - daysLeft / 365));
  return { status, pct, distLeft: null, daysLeft, dueDate: doc.due };
}

function dueLabel(st, unit) {
  const parts = [];
  if (st.status === 'overdue') {
    if (st.distLeft !== null && st.distLeft < 0) parts.push(`${fmtNum(-st.distLeft)} ${unit} overdue`);
    if (st.daysLeft !== null && st.daysLeft < 0) parts.push(`${-st.daysLeft}d overdue`);
    return parts.join(' · ');
  }
  if (st.distLeft !== null) parts.push(st.distLeft === 0 ? 'due now' : `in ${fmtNum(st.distLeft)} ${unit}`);
  if (st.daysLeft !== null) parts.push(st.daysLeft === 0 ? 'due today' : whenDays(st.daysLeft));
  return parts.join(' · ') || 'Set when last done';
}

function everyLabel(iv, unit) {
  const parts = [];
  if (iv.distance) parts.push(`${fmtNum(iv.distance)} ${unit}`);
  if (iv.months) parts.push(iv.months === 1 ? 'month' : `${iv.months} months`);
  return 'Every ' + parts.join(' or ');
}

const RANK = { overdue: 0, soon: 1, ok: 2 };

/** Every interval and document of the given vehicles, most urgent first */
function dueItems(vehicles, today, data) {
  const items = [];
  vehicles.forEach((v) => {
    const odo = odometerOf(v);
    v.intervals.forEach((iv) => items.push({ vehicle: v, kind: 'interval', item: iv, st: intervalStatus(iv, odo, today, data) }));
    v.documents.forEach((d) => items.push({ vehicle: v, kind: 'document', item: d, st: documentStatus(d, today, data) }));
  });
  const days = (i) => (i.st.daysLeft === null ? Infinity : i.st.daysLeft);
  return items.sort((a, b) => RANK[a.st.status] - RANK[b.st.status] || b.st.pct - a.st.pct || days(a) - days(b));
}

const needsAttention = (vehicles, today, data) => dueItems(vehicles, today, data).filter((i) => i.st.status !== 'ok');

function vehicleStatus(v, today, data) {
  const first = dueItems([v], today, data)[0];
  return first ? first.st.status : 'ok';
}

function efficiencyUnit(v, data) {
  if (isEV(v)) return data.distanceUnit === 'mi' ? 'mi/kWh' : 'kWh/100km';
  if (data.distanceUnit === 'mi' && data.volumeUnit === 'gal') return 'MPG';
  return `${data.distanceUnit}/${data.volumeUnit}`;
}

/**
 * Full-tank method: a partial fill adds its amount to the next full fill.
 * Charging sessions all count as complete, since EVs are rarely charged to 100%.
 * A fill marked "missed" (one before it was never logged) starts over, so the gap does not skew the result.
 * Returns one { date, dist, used } per stretch between full fills.
 */
function fillSegments(v) {
  const fills = v.fills.filter((f) => f.odometer > 0).sort((a, b) => a.odometer - b.odometer);
  const out = [];
  let start = null;
  let pending = 0;
  fills.forEach((f) => {
    const full = isEV(v) || f.full;
    if (f.missed) start = null;
    if (start === null) {
      pending = 0;
      if (full) start = f.odometer;
      return;
    }
    pending += f.amount;
    if (full) {
      if (f.odometer > start) out.push({ date: f.date, dist: f.odometer - start, used: pending });
      pending = 0;
      start = f.odometer;
    }
  });
  return out;
}

function efficiencyValue(dist, used, unit) {
  const value = unit === 'kWh/100km' ? (used / dist) * 100 : dist / used;
  return Math.round(value * 10) / 10;
}

function efficiency(v, data) {
  const segs = fillSegments(v);
  const dist = segs.reduce((n, s) => n + s.dist, 0);
  const used = segs.reduce((n, s) => n + s.used, 0);
  if (!(dist > 0 && used > 0)) return null;
  const unit = efficiencyUnit(v, data);
  return { value: efficiencyValue(dist, used, unit), unit };
}

/** Efficiency of each stretch between full fills, oldest first */
function efficiencySeries(v, data) {
  const unit = efficiencyUnit(v, data);
  return fillSegments(v).filter((s) => s.used > 0).map((s) => ({ date: s.date, value: efficiencyValue(s.dist, s.used, unit) }));
}

/** Price per litre (or kWh) of each fill with a cost, oldest first */
function priceSeries(v) {
  return v.fills
    .filter((f) => f.cost > 0 && f.amount > 0)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.odometer - b.odometer)
    .map((f) => ({ date: f.date, value: Math.round((f.cost / f.amount) * 100) / 100 }));
}

/** Fills in whichever of amount, price per unit and cost was not among the two typed last (`typed`, oldest first) */
function fillTrio(vals, typed) {
  const out = { ...vals };
  const r = (n) => Math.round(n * 100) / 100;
  const free = ['cost', 'price', 'amount'].find((k) => !typed.slice(-2).includes(k));
  if (free === 'cost' && vals.amount > 0 && vals.price > 0) out.cost = r(vals.amount * vals.price);
  if (free === 'price' && vals.amount > 0 && vals.cost > 0) out.price = r(vals.cost / vals.amount);
  if (free === 'amount' && vals.price > 0 && vals.cost > 0) out.amount = r(vals.cost / vals.price);
  return out;
}

function statsOf(v, data) {
  const serviceSpend = v.services.reduce((n, s) => n + s.cost, 0);
  const energySpend = v.fills.reduce((n, f) => n + f.cost, 0);
  const otherSpend = v.expenses.reduce((n, x) => n + x.cost, 0);
  const readings = [...v.services, ...v.fills, ...v.expenses].map((e) => e.odometer).filter((o) => o > 0);
  const covered = readings.length > 1 ? Math.max(...readings) - Math.min(...readings) : 0;
  const spend = serviceSpend + energySpend + otherSpend;
  return {
    spend,
    serviceSpend,
    energySpend,
    otherSpend,
    costPerDistance: covered > 0 && spend > 0 ? spend / covered : null,
    efficiency: efficiency(v, data),
  };
}

/** Every log entry, tagged with its vehicle and kind, newest first */
function entriesOf(vehicles) {
  const list = [];
  vehicles.forEach((v) => {
    v.services.forEach((e) => list.push({ vehicle: v, kind: 'services', entry: e }));
    v.fills.forEach((e) => list.push({ vehicle: v, kind: 'fills', entry: e }));
    v.expenses.forEach((e) => list.push({ vehicle: v, kind: 'expenses', entry: e }));
  });
  return list.sort((a, b) => (b.entry.date || '').localeCompare(a.entry.date || '') || b.entry.odometer - a.entry.odometer);
}

/** Spend within [from, to] (ISO, inclusive); from '' means all time, including undated entries */
function spendBy(vehicles, from, to) {
  const out = { total: 0, byVehicle: {}, byKind: { service: 0, fuel: 0, charging: 0 } };
  entriesOf(vehicles).forEach(({ vehicle, kind, entry }) => {
    if (from && (!entry.date || entry.date < from || entry.date > to)) return;
    // Expenses are keyed by their category (insurance, toll…)
    const key = kind === 'services' ? 'service' : kind === 'expenses' ? entry.category : isEV(vehicle) ? 'charging' : 'fuel';
    out.total += entry.cost;
    out.byKind[key] = (out.byKind[key] || 0) + entry.cost;
    out.byVehicle[vehicle.id] = (out.byVehicle[vehicle.id] || 0) + entry.cost;
  });
  return out;
}

/** Spend per calendar month for the last n months, oldest first */
function monthlySpend(vehicles, n, today) {
  const p = parseISO(today);
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(p[0], p[1] - 1 - i, 1);
    months.push({ key: isoOf(d).slice(0, 7), label: d.toLocaleDateString(undefined, { month: 'short' }), amount: 0 });
  }
  const byKey = Object.fromEntries(months.map((m) => [m.key, m]));
  entriesOf(vehicles).forEach(({ entry }) => {
    const m = byKey[(entry.date || '').slice(0, 7)];
    if (m) m.amount += entry.cost;
  });
  return months;
}

// ============================================================
// CSV: our own export, and the log section of other apps' exports (Fuelio, Drivvo…)
// ============================================================
const CSV_COLS = ['vehicle', 'kind', 'date', 'odometer', 'item', 'amount', 'cost', 'full', 'missed', 'where', 'notes', 'receipt'];
const KIND_WORD = { services: 'service', fills: 'fuel', expenses: 'expense' };

function csvCell(x) {
  const s = String(x == null ? '' : x);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Every log entry as one CSV row, oldest first */
function toCSV(vehicles) {
  const rows = entriesOf(vehicles).reverse().map(({ vehicle, kind, entry: e }) => [
    vehicle.name, KIND_WORD[kind], e.date, e.odometer || '',
    kind === 'services' ? e.task : kind === 'expenses' ? EXPENSES[e.category] : '',
    kind === 'fills' ? e.amount : '', e.cost,
    kind === 'fills' ? (e.full ? 1 : 0) : '', kind === 'fills' ? (e.missed ? 1 : 0) : '',
    kind === 'services' ? e.where : '', e.notes, e.receipt,
  ]);
  return [CSV_COLS, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** RFC 4180 rows: quoted cells, doubled quotes, newlines inside quotes; commas or semicolons */
function parseCSV(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

// dd/mm/yyyy is read day first (India, Europe), so a US mm/dd export would swap day and month
function csvDate(s) {
  const t = str(s);
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(t);
  return dmy ? dateOf(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`) : dateOf(t);
}

/**
 * Log entries from CSV text: [{ vehicle (name or ''), kind, entry }].
 * Reads the first table with a date and an odometer column, until the next "## section" line.
 */
function csvEntries(text) {
  const rows = parseCSV(text);
  const at = rows.findIndex((r) => r.some((h) => /^(date|data|datum|fecha)\b/i.test(h.trim())) && r.some((h) => /odo/i.test(h)));
  if (at === -1) return [];
  const head = rows[at].map((h) => h.trim());
  // First pattern that matches any header wins, so the order is a priority list
  const col = (...res) => {
    for (const re of res) {
      const i = head.findIndex((h) => re.test(h));
      if (i !== -1) return i;
    }
    return -1;
  };
  const c = {
    vehicle: col(/^vehicle/i, /^car$/i), kind: col(/^kind$/i, /^type$/i), date: col(/^(date|data|datum|fecha)\b/i),
    odo: col(/odo/i), item: col(/^item/i, /task|category|description|service/i),
    amount: col(/^amount/i, /^fuel\b/i, /litre|liter|^volume\b|quantity|kwh/i), cost: col(/total/i, /^cost/i, /^price\b/i),
    full: col(/full/i), missed: col(/^missed/i), where: col(/^where$/i), notes: col(/^notes?\b/i, /comment/i), receipt: col(/^receipt/i),
  };
  const get = (r, k) => (c[k] === -1 ? '' : str(r[c[k]]));
  // Drops currency signs and thousands commas. A decimal comma (1.234,5) is not supported.
  const n = (r, k) => num(get(r, k).replace(/[^\d.]/g, ''));
  const yes = (s) => /^(1|true|yes|y)$/i.test(s);
  const out = [];
  for (const r of rows.slice(at + 1)) {
    if (/^##/.test(str(r[0]))) break;
    if (!r.some((x) => str(x))) continue;
    const word = get(r, 'kind').toLowerCase();
    const amount = n(r, 'amount');
    const kind = /serv/.test(word) ? 'services' : /exp|cost|other/.test(word) ? 'expenses' : word || amount > 0 ? 'fills' : 'services';
    const base = { date: csvDate(get(r, 'date')), odometer: n(r, 'odo'), cost: n(r, 'cost'), notes: get(r, 'notes'), receipt: get(r, 'receipt') };
    const item = get(r, 'item');
    let entry;
    if (kind === 'fills') entry = { ...base, amount, full: c.full === -1 || yes(get(r, 'full')), missed: yes(get(r, 'missed')) };
    else if (kind === 'services') entry = { ...base, task: item, where: get(r, 'where') === 'diy' ? 'diy' : 'shop', resets: [] };
    else {
      const key = Object.keys(EXPENSES).find((k) => k === item.toLowerCase() || EXPENSES[k].toLowerCase() === item.toLowerCase());
      entry = { ...base, category: key || 'other', notes: key || !item ? base.notes : [item, base.notes].filter(Boolean).join(' · ') };
    }
    out.push({ vehicle: get(r, 'vehicle'), kind, entry });
  }
  return out;
}

// ============================================================
// DOM helpers
// ============================================================
function icon(parent, name, cls = 'vm-icon') {
  const span = parent.createSpan({ cls });
  setIcon(span, name);
  return span;
}

/** Fixed field: a small caps label over a value */
function field(parent, label, value) {
  const f = parent.createDiv({ cls: 'vm-field' });
  f.createSpan({ cls: 'vm-field-tab', text: label });
  f.createSpan({ cls: 'vm-field-val', text: value });
  return f;
}

function bar(parent, pct, status) {
  const track = parent.createDiv({ cls: 'vm-bar is-' + status });
  track.setAttr('role', 'progressbar');
  track.setAttr('aria-valuenow', String(Math.round(pct * 100)));
  track.setAttr('aria-valuemin', '0');
  track.setAttr('aria-valuemax', '100');
  track.createDiv({ cls: 'vm-bar-fill' }).setCssProps({ '--vm-pct': Math.round(pct * 100) + '%' });
  return track;
}

// Points are evenly spaced by entry, not by date
function lineChart(parent, title, points, fmt) {
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const first = points[0];
  const last = points[points.length - 1];
  const card = parent.createDiv({ cls: 'vm-card vm-panel' });
  const head = card.createDiv({ cls: 'vm-card-head' });
  head.createSpan({ text: title });
  head.createSpan({ text: fmt(last.value) });
  const W = 300;
  const H = 80;
  const y = (n) => (max === min ? H / 2 : 6 + (1 - (n - min) / (max - min)) * (H - 12));
  const svg = card.createDiv({ cls: 'vm-chart-wrap' }).createSvg('svg', {
    cls: 'vm-chart',
    attr: {
      viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img',
      'aria-label': `${title}: ${points.length} entries, from ${fmt(first.value)} to ${fmt(last.value)}, low ${fmt(min)}, high ${fmt(max)}`,
    },
  });
  svg.createSvg('polyline', { attr: { points: points.map((p, i) => `${((i / (points.length - 1)) * W).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ') } });
  const foot = card.createDiv({ cls: 'vm-chart-foot vm-muted' });
  foot.createSpan({ text: `${shortDate(first.date)} – ${shortDate(last.date)}` });
  foot.createSpan({ text: `low ${fmt(min)} · high ${fmt(max)}` });
}

const STAMP = { overdue: 'Overdue', soon: 'Due soon' };

/** Right-click on desktop, long-press on touch screens */
function onMenu(el, show) {
  let timer = null;
  let fired = false;
  const cancel = () => window.clearTimeout(timer);
  // Android fires contextmenu on long-press too: whichever comes first wins
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    cancel();
    if (!fired) show((m) => m.showAtMouseEvent(e));
  });
  el.addEventListener('touchstart', (e) => {
    fired = false;
    const t = e.touches[0];
    timer = window.setTimeout(() => {
      fired = true;
      show((m) => m.showAtPosition({ x: t.clientX, y: t.clientY }));
    }, LONG_PRESS_MS);
  }, { passive: true });
  el.addEventListener('touchmove', cancel, { passive: true });
  el.addEventListener('touchend', cancel);
  // A long-press must not also count as a tap
  el.addEventListener('click', (e) => {
    if (fired) {
      e.preventDefault();
      e.stopImmediatePropagation();
      fired = false;
    }
  }, true);
}

function numberInput(t, value, placeholder) {
  t.inputEl.type = 'number';
  t.inputEl.inputMode = 'decimal';
  t.inputEl.min = '0';
  t.inputEl.step = 'any';
  t.setPlaceholder(placeholder || '0').setValue(value ? String(value) : '');
  return t;
}

function dateInput(t, value) {
  t.inputEl.type = 'date';
  t.setValue(value || '');
  return t;
}

// ============================================================
// Modals
// ============================================================
class VehicleModal extends Modal {
  constructor(app, plugin, vehicle) {
    super(app);
    this.plugin = plugin;
    this.isEdit = !!vehicle;
    const unit = plugin.data.distanceUnit;
    this.v = vehicle
      ? clone(vehicle)
      : normalizeVehicle({
        name: '-', type: 'car', fuel: 'petrol', intervals: presetsFor('car', 'petrol', unit),
        documents: DEFAULT_DOCUMENTS.map((name) => ({ name })),
      });
    if (!vehicle) {
      this.v.name = '';
      this.v.odometer = 0;
    }
    this.touchedIntervals = this.isEdit;
  }

  section(title) {
    new Setting(this.contentEl).setName(title).setHeading().setClass('vm-modal-section');
  }

  onOpen() {
    const { contentEl } = this;
    const v = this.v;
    const unit = this.plugin.data.distanceUnit;
    contentEl.empty();
    contentEl.addClass('vm-modal');
    this.titleEl.setText(this.isEdit ? `Edit ${v.name}` : 'Add vehicle');

    // New vehicles get the presets that match their type until the list is edited
    const represet = () => {
      if (!this.touchedIntervals) v.intervals = presetsFor(v.type, v.fuel, unit);
      this.onOpen();
    };

    this.section('Vehicle');
    new Setting(contentEl).setName('Name').addText((t) => {
      t.setPlaceholder('City car').setValue(v.name).onChange((x) => (v.name = x));
      if (!this.isEdit) window.setTimeout(() => t.inputEl.focus(), 0);
    });
    new Setting(contentEl)
      .setName('Type')
      .addDropdown((dd) => {
        Object.entries(TYPES).forEach(([k, t]) => dd.addOption(k, t.label));
        dd.setValue(v.type).onChange((x) => {
          v.type = x;
          represet();
        });
      })
      .addDropdown((dd) => {
        Object.entries(FUELS).forEach(([k, t]) => dd.addOption(k, t));
        dd.setValue(v.fuel).onChange((x) => {
          v.fuel = x;
          represet();
        });
      });
    new Setting(contentEl)
      .setName('Make and model')
      .addText((t) => t.setPlaceholder('Maruti').setValue(v.make).onChange((x) => (v.make = x)))
      .addText((t) => t.setPlaceholder('Swift').setValue(v.model).onChange((x) => (v.model = x)));
    new Setting(contentEl)
      .setName('Year and plate')
      .addText((t) => {
        t.inputEl.inputMode = 'numeric';
        t.setPlaceholder(String(new Date().getFullYear())).setValue(v.year).onChange((x) => (v.year = x));
      })
      .addText((t) => t.setPlaceholder('Number plate').setValue(v.plate).onChange((x) => (v.plate = x)));
    new Setting(contentEl).setName('Chassis number').addText((t) => t.setValue(v.vin).onChange((x) => (v.vin = x)));
    new Setting(contentEl)
      .setName(`Odometer (${unit})`)
      .addText((t) => numberInput(t, v.odometer, '0').onChange((x) => (v.odometer = num(x))));

    this.section('Maintenance schedule');
    contentEl.createEl('p', {
      cls: 'vm-hint',
      text: `Each item is due after its distance or its months, whichever comes first. Leave a box empty to track by one only.${this.isEdit ? '' : ' Last done defaults to today at the current odometer.'}`,
    });
    const ivList = contentEl.createDiv({ cls: 'vm-rows' });
    v.intervals.forEach((iv, idx) => {
      const row = ivList.createDiv({ cls: 'vm-row' });
      const touch = () => (this.touchedIntervals = true);
      const input = (label, type, value, set, cls = '') => {
        const wrap = row.createEl('label', { cls: 'vm-row-field ' + cls });
        wrap.createSpan({ cls: 'vm-field-tab', text: label });
        const el = wrap.createEl('input', { type });
        if (type === 'number') {
          el.inputMode = 'decimal';
          el.min = '0';
          el.step = 'any';
        }
        el.value = value ? String(value) : '';
        el.addEventListener('input', () => {
          touch();
          set(el.value);
        });
        return el;
      };
      input('Item', 'text', iv.name, (x) => (iv.name = x), 'is-name');
      input(`Every ${unit}`, 'number', iv.distance, (x) => (iv.distance = num(x)));
      input('Every months', 'number', iv.months, (x) => (iv.months = num(x)));
      input(`Last done ${unit}`, 'number', iv.lastDistance, (x) => (iv.lastDistance = num(x)));
      input('Last done date', 'date', iv.lastDate, (x) => (iv.lastDate = dateOf(x)));
      const del = row.createEl('button', { cls: 'vm-icon-btn', attr: { 'aria-label': `Remove ${iv.name || 'item'}` } });
      setIcon(del, 'x');
      del.addEventListener('click', () => {
        touch();
        v.intervals.splice(idx, 1);
        this.onOpen();
      });
    });
    const ivAdd = contentEl.createDiv({ cls: 'vm-chip-row' });
    ivAdd.createEl('button', { cls: 'vm-chip', text: 'Add item' }).addEventListener('click', () => {
      this.touchedIntervals = true;
      v.intervals.push({ id: uid(), name: '', distance: 0, months: 0, lastDistance: 0, lastDate: '' });
      this.onOpen();
    });
    if (this.isEdit) {
      ivAdd.createEl('button', { cls: 'vm-chip', text: 'Add missing presets' }).addEventListener('click', () => {
        const have = new Set(v.intervals.map((i) => i.name.toLowerCase()));
        presetsFor(v.type, v.fuel, unit).forEach((p) => {
          if (!have.has(p.name.toLowerCase())) v.intervals.push({ ...p, lastDistance: odometerOf(v), lastDate: todayISO() });
        });
        this.onOpen();
      });
    }

    this.section('Documents and renewals');
    const docList = contentEl.createDiv({ cls: 'vm-rows' });
    v.documents.forEach((d, idx) => {
      const row = docList.createDiv({ cls: 'vm-row vm-row-doc' });
      const nameWrap = row.createEl('label', { cls: 'vm-row-field is-name' });
      nameWrap.createSpan({ cls: 'vm-field-tab', text: 'Document' });
      const nameEl = nameWrap.createEl('input', { type: 'text' });
      nameEl.value = d.name;
      nameEl.addEventListener('input', () => (d.name = nameEl.value));
      const dueWrap = row.createEl('label', { cls: 'vm-row-field' });
      dueWrap.createSpan({ cls: 'vm-field-tab', text: 'Due' });
      const dueEl = dueWrap.createEl('input', { type: 'date' });
      dueEl.value = d.due;
      dueEl.addEventListener('input', () => (d.due = dateOf(dueEl.value)));
      const del = row.createEl('button', { cls: 'vm-icon-btn', attr: { 'aria-label': `Remove ${d.name || 'document'}` } });
      setIcon(del, 'x');
      del.addEventListener('click', () => {
        v.documents.splice(idx, 1);
        this.onOpen();
      });
    });
    const docAdd = contentEl.createDiv({ cls: 'vm-chip-row' });
    ['Insurance', 'Pollution (PUC)', 'Registration', 'Fitness / inspection', 'Road tax', 'Other'].forEach((name) => {
      docAdd.createEl('button', { cls: 'vm-chip', text: '+ ' + name }).addEventListener('click', () => {
        v.documents.push({ id: uid(), name: name === 'Other' ? '' : name, due: '' });
        this.onOpen();
      });
    });

    this.section('Notes');
    new Setting(contentEl).setClass('vm-notes').addTextArea((ta) => {
      ta.setPlaceholder('Tyre size, oil grade, service centre…').setValue(v.notes).onChange((x) => (v.notes = x));
      ta.inputEl.rows = 3;
    });

    const actions = new Setting(contentEl).setClass('vm-modal-actions');
    if (this.isEdit) {
      actions.addButton((b) => b.setButtonText('Delete').setWarning().onClick(() => {
        this.close();
        this.plugin.deleteVehicle(v.id);
      }));
    }
    actions.addButton((b) => b.setButtonText(this.isEdit ? 'Save' : 'Add vehicle').setCta().onClick(() => {
      if (!v.name.trim()) return new Notice('Enter a name for the vehicle.');
      if (!this.isEdit) {
        v.intervals.forEach((iv) => {
          iv.lastDistance = iv.lastDistance || v.odometer;
          iv.lastDate = iv.lastDate || todayISO();
        });
      }
      const clean = normalizeVehicle(v);
      this.close();
      this.plugin.commitVehicle(clean, this.isEdit ? `Saved ${clean.name}` : `Added ${clean.name}`);
    }));
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Add or edit one service ('services'), fuel/charge ('fills') or other cost ('expenses') entry */
class EntryModal extends Modal {
  constructor(app, plugin, vehicle, kind, entry, resetId) {
    super(app);
    this.plugin = plugin;
    this.vehicle = vehicle;
    this.kind = kind;
    this.isEdit = !!entry;
    const preset = vehicle.intervals.find((i) => i.id === resetId);
    this.e = entry
      ? clone(entry)
      : kind === 'services'
        ? { id: uid(), date: todayISO(), odometer: odometerOf(vehicle), task: preset ? preset.name : '', cost: 0, where: 'shop', notes: '', resets: preset ? [preset.id] : [], receipt: '' }
        : kind === 'fills'
          ? { id: uid(), date: todayISO(), odometer: 0, amount: 0, cost: 0, full: true, missed: false, notes: '', receipt: '' }
          : { id: uid(), date: todayISO(), odometer: 0, category: 'other', cost: 0, notes: '', receipt: '' };
    this.typed = []; // fill fields the user typed, oldest first, for the price auto-fill
  }

  onOpen() {
    const { contentEl } = this;
    const { data } = this.plugin;
    const v = this.vehicle;
    const e = this.e;
    const service = this.kind === 'services';
    const expense = this.kind === 'expenses';
    const cur = CURRENCIES[data.currency] || data.currency;
    contentEl.empty();
    contentEl.addClass('vm-modal');
    this.titleEl.setText(`${this.isEdit ? 'Edit' : 'Log'} ${service ? 'service' : expense ? 'expense' : energyWord(v)} · ${v.name}`);

    new Setting(contentEl).setName('Date').addText((t) => dateInput(t, e.date).onChange((x) => (e.date = dateOf(x))));
    new Setting(contentEl)
      .setName(`Odometer (${data.distanceUnit})`)
      .setDesc(`${expense ? 'Optional. ' : ''}Last reading: ${fmtNum(odometerOf(v))} ${data.distanceUnit}`)
      .addText((t) => {
        numberInput(t, e.odometer, String(odometerOf(v))).onChange((x) => (e.odometer = num(x)));
        if (this.kind === 'fills' && !this.isEdit) window.setTimeout(() => t.inputEl.focus(), 0);
      });

    if (service) {
      new Setting(contentEl).setName('Work done').addText((t) => {
        t.setPlaceholder('Oil change, new wiper blades').setValue(e.task).onChange((x) => (e.task = x));
        if (!this.isEdit && !e.task) window.setTimeout(() => t.inputEl.focus(), 0);
      });
      new Setting(contentEl)
        .setName(`Cost (${cur})`)
        .addText((t) => numberInput(t, e.cost).onChange((x) => (e.cost = num(x))))
        .addDropdown((dd) => dd.addOption('shop', 'Workshop').addOption('diy', 'DIY').setValue(e.where).onChange((x) => (e.where = x)));
      if (v.intervals.length) {
        new Setting(contentEl).setName('Mark as done').setHeading().setClass('vm-modal-section');
        const list = contentEl.createDiv({ cls: 'vm-checks' });
        v.intervals.forEach((iv) => {
          const lbl = list.createEl('label', { cls: 'vm-check' });
          const cb = lbl.createEl('input', { type: 'checkbox' });
          cb.checked = e.resets.includes(iv.id);
          cb.addEventListener('change', () => {
            e.resets = cb.checked ? [...e.resets, iv.id] : e.resets.filter((id) => id !== iv.id);
          });
          lbl.createSpan({ text: iv.name });
        });
      }
    } else if (expense) {
      new Setting(contentEl).setName('Category').addDropdown((dd) => {
        Object.entries(EXPENSES).forEach(([k, label]) => dd.addOption(k, label));
        dd.setValue(e.category).onChange((x) => (e.category = x));
      });
      new Setting(contentEl).setName(`Cost (${cur})`).addText((t) => {
        numberInput(t, e.cost).onChange((x) => (e.cost = num(x)));
        if (!this.isEdit) window.setTimeout(() => t.inputEl.focus(), 0);
      });
    } else {
      // Type any two of amount, price and cost; the third follows
      const unit = isEV(v) ? 'kWh' : data.volumeUnit;
      const vals = { amount: e.amount, price: e.amount > 0 && e.cost > 0 ? Math.round((e.cost / e.amount) * 100) / 100 : 0, cost: e.cost };
      const inputs = {};
      const typed = (key, x) => {
        vals[key] = num(x);
        this.typed = [...this.typed.filter((k) => k !== key), key];
        Object.assign(vals, fillTrio(vals, this.typed));
        Object.keys(inputs).forEach((k) => {
          if (k !== key) inputs[k].setValue(vals[k] ? String(vals[k]) : '');
        });
        e.amount = vals.amount;
        e.cost = vals.cost;
      };
      const trio = (name, key) => new Setting(contentEl).setName(name).addText((t) => {
        inputs[key] = numberInput(t, vals[key]);
        t.onChange((x) => typed(key, x));
      });
      trio(isEV(v) ? 'Energy added (kWh)' : `Fuel added (${unit})`, 'amount');
      trio(`Price per ${unit} (${cur})`, 'price');
      trio(`Cost (${cur})`, 'cost');
      if (!isEV(v)) {
        new Setting(contentEl)
          .setName('Filled to full')
          .setDesc('Turn off for a partial fill. Mileage is worked out between full fills.')
          .addToggle((tg) => tg.setValue(e.full).onChange((x) => (e.full = x)));
      }
      new Setting(contentEl)
        .setName(`Missed the ${energyWord(v)} before this`)
        .setDesc('Turn on if one was never logged. Mileage starts over from here, so the gap does not skew it.')
        .addToggle((tg) => tg.setValue(e.missed).onChange((x) => (e.missed = x)));
    }

    new Setting(contentEl).setName('Notes').setClass('vm-notes').addTextArea((ta) => {
      ta.setPlaceholder(service ? 'Parts, workshop, invoice number…' : expense ? 'What it was for…' : 'Station…').setValue(e.notes).onChange((x) => (e.notes = x));
      ta.inputEl.rows = 2;
    });

    const receipt = new Setting(contentEl).setName('Receipt').setDesc(e.receipt || 'A photo or PDF of the bill, kept in your vault.');
    if (e.receipt) {
      receipt
        .addExtraButton((b) => b.setIcon('external-link').setTooltip('Open receipt').onClick(() => this.plugin.openReceipt(e.receipt)))
        .addExtraButton((b) => b.setIcon('x').setTooltip('Remove receipt').onClick(() => {
          e.receipt = '';
          this.onOpen();
        }));
    }
    receipt
      .addButton((b) => b.setButtonText('From vault').onClick(() => new FilePicker(this.app, 'Choose a receipt', (f) => RECEIPT_TYPES.has(f.extension.toLowerCase()), (f) => {
        e.receipt = f.path;
        this.onOpen();
      }).open()))
      .addButton((b) => b.setButtonText('Add photo').onClick(() => {
        // The system picker offers the camera on phones
        // iOS ignores clicks on an input that is not in the page
        const input = activeDocument.body.createEl('input', { type: 'file', attr: { accept: 'image/*,application/pdf', hidden: '' } });
        input.addEventListener('change', async () => {
          input.remove();
          if (!input.files || !input.files[0]) return;
          const path = await this.plugin.saveReceipt(input.files[0], e.date);
          if (path) {
            e.receipt = path;
            this.onOpen();
          }
        });
        input.click();
      }));

    const actions = new Setting(contentEl).setClass('vm-modal-actions');
    if (this.isEdit) {
      actions.addButton((b) => b.setButtonText('Delete').setWarning().onClick(() => {
        this.close();
        this.plugin.deleteEntry(v.id, this.kind, e.id);
      }));
    }
    actions.addButton((b) => b.setButtonText(this.isEdit ? 'Save' : 'Log it').setCta().onClick(() => {
      if (!e.date) return new Notice('Enter a date.');
      if (!expense && !(e.odometer > 0)) return new Notice('Enter the odometer reading.');
      if (service && !e.task.trim()) return new Notice('Describe the work done.');
      if (expense && !(e.cost > 0)) return new Notice('Enter the cost.');
      if (this.kind === 'fills' && !(e.amount > 0)) return new Notice(`Enter how much ${isEV(v) ? 'energy' : 'fuel'} was added.`);
      e.task = service ? e.task.trim() : e.task;
      this.close();
      this.plugin.saveEntry(v.id, this.kind, e);
    }));
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** One value, one button: odometer readings and renewal dates */
class PromptModal extends Modal {
  constructor(app, { title, label, desc, type, value, cta, onSubmit }) {
    super(app);
    Object.assign(this, { title, label, desc, type, value, cta, onSubmit });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('vm-modal');
    this.titleEl.setText(this.title);
    let value = this.value;
    let input;
    new Setting(contentEl).setName(this.label).setDesc(this.desc || '').addText((t) => {
      input = t.inputEl;
      if (this.type === 'date') dateInput(t, value);
      else numberInput(t, value);
      t.onChange((x) => (value = x));
      window.setTimeout(() => input.focus(), 0);
    });
    const submit = () => {
      if (this.onSubmit(value) !== false) this.close();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    new Setting(contentEl).setClass('vm-modal-actions').addButton((b) => b.setButtonText(this.cta || 'Save').setCta().onClick(submit));
  }

  onClose() {
    this.contentEl.empty();
  }
}

class VehiclePicker extends FuzzySuggestModal {
  constructor(app, vehicles, onPick) {
    super(app);
    this.vehicles = vehicles;
    this.onPick = onPick;
    this.setPlaceholder('Choose a vehicle');
  }

  getItems() { return this.vehicles; }
  getItemText(v) { return v.name; }
  onChooseItem(v) { this.onPick(v); }
}

class FilePicker extends FuzzySuggestModal {
  constructor(app, placeholder, filter, onPick) {
    super(app);
    Object.assign(this, { filter, onPick });
    this.setPlaceholder(placeholder);
  }

  getItems() { return this.app.vault.getFiles().filter(this.filter); }
  getItemText(f) { return f.path; }
  onChooseItem(f) { this.onPick(f); }
}

class ImportChoiceModal extends Modal {
  constructor(app, plugin, file, vehicles) {
    super(app);
    Object.assign(this, { plugin, file, vehicles });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('vm-modal');
    this.titleEl.setText('Import vehicles');
    const n = this.vehicles.length;
    contentEl.createEl('p', { text: `${this.file.name} has ${n} vehicle${n === 1 ? '' : 's'}. Merge keeps your vehicles and updates matching ones; replace swaps everything.` });
    new Setting(contentEl)
      .setClass('vm-modal-actions')
      .addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((b) => b.setButtonText('Replace all').setWarning().onClick(() => {
        this.close();
        this.plugin.applyImport(this.vehicles, 'replace');
      }))
      .addButton((b) => b.setButtonText('Merge').setCta().onClick(() => {
        this.close();
        this.plugin.applyImport(this.vehicles, 'merge');
      }));
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ============================================================
// Dashboard view
// ============================================================
class GarageView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.tab = 'garage';     // 'garage' | 'log' | 'spend' | 'settings'
    this.vehicleId = null;   // null = all vehicles
    this.logFilter = 'all';  // 'all' | 'services' | 'fills' | 'expenses'
    this.logLimit = LOG_PAGE;
    this.period = 'year';    // 'month' | 'year' | 'all'
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Garage'; }
  getIcon() { return ICON_ID; }

  async onOpen() {
    this.render();
  }

  async onClose() {
    this.contentEl.empty();
  }

  get data() {
    return this.plugin.data;
  }

  /** The vehicles in scope: the selected one, or all */
  scope() {
    const all = this.data.vehicles;
    if (all.length === 1) return all;
    const one = all.find((v) => v.id === this.vehicleId);
    if (!one) this.vehicleId = null;
    return one ? [one] : all;
  }

  render() {
    const root = this.contentEl;
    const scroll = root.scrollTop;
    root.empty();
    root.addClass('vm-root');
    const wrap = root.createDiv({ cls: 'vm-wrap' });
    this.renderTopBar(wrap);
    if (this.tab === 'settings') this.renderSettings(wrap);
    else if (!this.data.vehicles.length) this.renderEmpty(wrap);
    else {
      this.renderPills(wrap);
      if (this.tab === 'log') this.renderLog(wrap);
      else if (this.tab === 'spend') this.renderSpend(wrap);
      else this.renderGarage(wrap);
    }
    root.scrollTop = scroll;
  }

  renderTopBar(parent) {
    const bar = parent.createEl('header', { cls: 'vm-top' });
    const title = bar.createEl('h2', { cls: 'vm-title' });
    icon(title, ICON_ID, 'vm-icon vm-mark');
    title.createSpan({ text: 'Garage' });

    const tabs = bar.createDiv({ cls: 'vm-tabs', attr: { role: 'tablist' } });
    [['garage', 'Garage'], ['log', 'Log'], ['spend', 'Spend'], ['settings', 'Settings']].forEach(([id, label]) => {
      const b = tabs.createEl('button', { cls: 'vm-tab', text: label, attr: { role: 'tab', 'aria-selected': String(this.tab === id) } });
      b.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
    });

    const tools = bar.createDiv({ cls: 'vm-tools' });
    const add = tools.createEl('button', { cls: 'vm-btn mod-cta', attr: { 'aria-label': 'Add vehicle' } });
    icon(add, 'plus');
    add.createSpan({ cls: 'vm-btn-label', text: 'Vehicle' });
    add.addEventListener('click', () => this.plugin.openVehicleModal(null));
  }

  renderEmpty(parent) {
    const c = parent.createDiv({ cls: 'vm-card vm-empty' });
    c.createDiv({ cls: 'vm-card-head' }).createSpan({ text: 'Your garage is empty' });
    const body = c.createDiv({ cls: 'vm-card-body' });
    body.createEl('p', { text: 'Add a car, motorcycle, scooter or electric vehicle. A service schedule that fits it is filled in for you, and you will see here what needs doing next.' });
    const row = body.createDiv({ cls: 'vm-chip-row' });
    row.createEl('button', { cls: 'mod-cta', text: 'Add your first vehicle' }).addEventListener('click', () => this.plugin.openVehicleModal(null));
    row.createEl('button', { text: 'Import a backup' }).addEventListener('click', () => this.plugin.openImport());
  }

  renderPills(parent) {
    const all = this.data.vehicles;
    if (all.length < 2) return;
    const today = todayISO();
    const pills = parent.createDiv({ cls: 'vm-pills', attr: { role: 'group', 'aria-label': 'Vehicle' } });
    const pill = (id, label, status) => {
      const p = pills.createEl('button', { cls: 'vm-pill', attr: { 'aria-pressed': String(this.vehicleId === id) } });
      if (status && status !== 'ok') p.createSpan({ cls: 'vm-dot is-' + status, attr: { 'aria-label': STAMP[status] } });
      p.createSpan({ text: label });
      p.addEventListener('click', () => {
        this.vehicleId = id;
        this.render();
      });
    };
    pill(null, 'All', null);
    all.forEach((v) => pill(v.id, v.name, vehicleStatus(v, today, this.data)));
  }

  sectionHead(parent, title, aside) {
    const sec = parent.createEl('section', { cls: 'vm-section' });
    const head = sec.createDiv({ cls: 'vm-section-head' });
    head.createEl('h3', { cls: 'vm-section-title', text: title });
    if (aside) head.createSpan({ cls: 'vm-muted', text: aside });
    return sec;
  }

  // ── Garage: what needs doing ──
  renderGarage(parent) {
    const vehicles = this.scope();
    if (vehicles.length === 1) this.renderVehicle(parent, vehicles[0]);
    else this.renderFleet(parent, vehicles);
  }

  renderFleet(parent, vehicles) {
    const { data } = this;
    const today = todayISO();
    const due = needsAttention(vehicles, today, data);
    const overdue = due.filter((i) => i.st.status === 'overdue').length;

    const sum = parent.createEl('section', { cls: 'vm-summary' });
    const lead = sum.createDiv({ cls: 'vm-lead' });
    lead.createDiv({ cls: 'vm-lead-fig', text: String(due.length) });
    const line = lead.createDiv({ cls: 'vm-lead-line' });
    line.createEl('b', { text: due.length === 1 ? 'item needs attention' : 'items need attention' });
    line.createSpan({ text: due.length ? ` · ${overdue} overdue` : ' · everything is up to date' });
    const strip = sum.createDiv({ cls: 'vm-strip' });
    const y = today.slice(0, 4);
    field(strip, 'This month', fmtMoney(spendBy(vehicles, today.slice(0, 7) + '-01', today).total, data.currency));
    field(strip, 'This year', fmtMoney(spendBy(vehicles, y + '-01-01', today).total, data.currency));
    field(strip, 'Vehicles', String(vehicles.length));

    if (due.length) {
      const sec = this.sectionHead(parent, 'Needs attention', due.length > 8 ? `top 8 of ${due.length}` : '');
      const row = sec.createDiv({ cls: 'vm-cards' });
      due.slice(0, 8).forEach((i) => this.renderDueCard(row, i, true));
    }

    const sec = this.sectionHead(parent, 'Vehicles', String(vehicles.length));
    const grid = sec.createDiv({ cls: 'vm-tiles' });
    vehicles.forEach((v) => {
      const status = vehicleStatus(v, today, data);
      const t = grid.createEl('button', { cls: 'vm-tile is-' + status });
      icon(t, TYPES[v.type].icon, 'vm-icon vm-tile-icon');
      const mid = t.createSpan({ cls: 'vm-tile-mid' });
      mid.createSpan({ cls: 'vm-name', text: v.name });
      mid.createSpan({ cls: 'vm-muted vm-ellipsis', text: [[v.make, v.model].filter(Boolean).join(' '), v.plate].filter(Boolean).join(' · ') || FUELS[v.fuel] });
      const right = t.createSpan({ cls: 'vm-tile-right' });
      right.createSpan({ cls: 'vm-fig', text: `${fmtNum(odometerOf(v))} ${data.distanceUnit}` });
      if (STAMP[status]) right.createSpan({ cls: 'vm-stamp is-' + status, text: STAMP[status] });
      t.addEventListener('click', () => {
        this.vehicleId = v.id;
        this.render();
      });
      onMenu(t, (show) => show(this.vehicleMenu(v)));
    });
  }

  vehicleMenu(v) {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle('Log service').setIcon('wrench').onClick(() => this.plugin.openEntryModal(v, 'services')));
    menu.addItem((i) => i.setTitle(`Log ${energyWord(v)}`).setIcon(isEV(v) ? 'zap' : 'fuel').onClick(() => this.plugin.openEntryModal(v, 'fills')));
    menu.addItem((i) => i.setTitle('Log expense').setIcon('receipt').onClick(() => this.plugin.openEntryModal(v, 'expenses')));
    menu.addItem((i) => i.setTitle('Update odometer').setIcon('gauge').onClick(() => this.plugin.openOdometer(v)));
    menu.addItem((i) => i.setTitle('Edit vehicle').setIcon('pencil').onClick(() => this.plugin.openVehicleModal(v)));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle('Delete vehicle').setIcon('trash-2').onClick(() => this.plugin.deleteVehicle(v.id)));
    return menu;
  }

  /** One due interval or document as a card with its action */
  renderDueCard(parent, { vehicle, kind, item, st }, showVehicle) {
    const unit = this.data.distanceUnit;
    const c = parent.createEl('article', { cls: 'vm-card is-' + st.status });
    const head = c.createDiv({ cls: 'vm-card-head' });
    head.createSpan({ cls: 'vm-card-when', text: dueLabel(st, unit) });
    if (showVehicle) head.createSpan({ cls: 'vm-ellipsis', text: vehicle.name });
    const body = c.createDiv({ cls: 'vm-card-body' });
    body.createDiv({ cls: 'vm-name', text: item.name });
    body.createDiv({
      cls: 'vm-muted',
      text: kind === 'interval' ? everyLabel(item, unit) : item.due ? `Due ${shortDate(item.due)}` : 'No date set',
    });
    bar(body, st.pct, st.status);
    const act = c.createDiv({ cls: 'vm-card-actions' });
    if (kind === 'interval') {
      act.createEl('button', { cls: 'vm-btn', text: 'Mark done' }).addEventListener('click', () => this.plugin.openEntryModal(vehicle, 'services', null, item.id));
    } else {
      act.createEl('button', { cls: 'vm-btn', text: 'Renew' }).addEventListener('click', () => this.plugin.openRenew(vehicle, item));
    }
  }

  renderVehicle(parent, v) {
    const { data } = this;
    const today = todayISO();
    const unit = data.distanceUnit;
    const s = statsOf(v, data);

    const head = parent.createEl('section', { cls: 'vm-vehicle-head' });
    icon(head, TYPES[v.type].icon, 'vm-icon vm-vehicle-icon');
    const id = head.createDiv({ cls: 'vm-vehicle-id' });
    id.createEl('h3', { cls: 'vm-vehicle-name', text: v.name });
    id.createDiv({
      cls: 'vm-muted',
      text: [[v.year, v.make, v.model].filter(Boolean).join(' '), FUELS[v.fuel], v.plate].filter(Boolean).join(' · '),
    });
    const edit = head.createEl('button', { cls: 'vm-icon-btn', attr: { 'aria-label': `Edit ${v.name}` } });
    setIcon(edit, 'pencil');
    edit.addEventListener('click', () => this.plugin.openVehicleModal(v));

    const strip = parent.createDiv({ cls: 'vm-strip vm-strip-wide' });
    const odo = strip.createEl('button', { cls: 'vm-field vm-field-btn', attr: { 'aria-label': 'Update odometer' } });
    odo.createSpan({ cls: 'vm-field-tab', text: 'Odometer' });
    odo.createSpan({ cls: 'vm-field-val', text: `${fmtNum(odometerOf(v))} ${unit}` });
    odo.addEventListener('click', () => this.plugin.openOdometer(v));
    field(strip, isEV(v) ? 'Efficiency' : 'Mileage', s.efficiency ? `${fmtNum(s.efficiency.value, 1)} ${s.efficiency.unit}` : '—');
    field(strip, `Cost / ${unit}`, s.costPerDistance === null ? '—' : fmtMoney(s.costPerDistance, data.currency, 2));
    field(strip, 'Spent', fmtMoney(s.spend, data.currency));

    const act = parent.createDiv({ cls: 'vm-actions' });
    // Short labels fit three buttons across a phone; the aria-label says what each does
    const btn = (text, label, ic, fn, cta) => {
      const b = act.createEl('button', { cls: 'vm-btn' + (cta ? ' mod-cta' : ''), attr: { 'aria-label': label } });
      icon(b, ic);
      b.createSpan({ text });
      b.addEventListener('click', fn);
    };
    btn('Service', 'Log service', 'wrench', () => this.plugin.openEntryModal(v, 'services'), true);
    btn(isEV(v) ? 'Charge' : 'Fuel', `Log ${energyWord(v)}`, isEV(v) ? 'zap' : 'fuel', () => this.plugin.openEntryModal(v, 'fills'));
    btn('Expense', 'Log expense', 'receipt', () => this.plugin.openEntryModal(v, 'expenses'));
    btn('Odometer', 'Update odometer', 'gauge', () => this.plugin.openOdometer(v));

    const items = dueItems([v], today, data);
    const ivs = items.filter((i) => i.kind === 'interval');
    const docs = items.filter((i) => i.kind === 'document');
    const due = items.filter((i) => i.st.status !== 'ok');

    if (due.length) {
      const sec = this.sectionHead(parent, 'Needs attention', String(due.length));
      const row = sec.createDiv({ cls: 'vm-cards' });
      due.forEach((i) => this.renderDueCard(row, i, false));
    }

    const sec = this.sectionHead(parent, 'Maintenance schedule', ivs.length ? '' : 'none yet');
    if (!ivs.length) this.emptyLine(sec, 'No maintenance items.', 'Add some', () => this.plugin.openVehicleModal(v));
    const list = sec.createDiv({ cls: 'vm-list' });
    ivs.forEach(({ item, st }) => {
      const row = list.createDiv({ cls: 'vm-list-row is-' + st.status });
      const main = row.createDiv({ cls: 'vm-list-main' });
      const top = main.createDiv({ cls: 'vm-list-top' });
      top.createSpan({ cls: 'vm-name', text: item.name });
      top.createSpan({ cls: 'vm-list-when', text: dueLabel(st, unit) });
      bar(main, st.pct, st.status);
      main.createDiv({
        cls: 'vm-muted',
        text: `${everyLabel(item, unit)} · last ${item.lastDate ? shortDate(item.lastDate) : 'never'}${item.distance ? ` at ${fmtNum(item.lastDistance)} ${unit}` : ''}`,
      });
      const done = row.createEl('button', { cls: 'vm-icon-btn', attr: { 'aria-label': `Mark ${item.name} done` } });
      setIcon(done, 'check');
      done.addEventListener('click', () => this.plugin.openEntryModal(v, 'services', null, item.id));
    });

    const dsec = this.sectionHead(parent, 'Documents and renewals', docs.length ? '' : 'none yet');
    if (!docs.length) this.emptyLine(dsec, 'Track insurance, PUC and registration dates.', 'Add documents', () => this.plugin.openVehicleModal(v));
    const dlist = dsec.createDiv({ cls: 'vm-list' });
    docs.forEach(({ item, st }) => {
      const row = dlist.createDiv({ cls: 'vm-list-row is-' + st.status });
      const main = row.createDiv({ cls: 'vm-list-main' });
      const top = main.createDiv({ cls: 'vm-list-top' });
      top.createSpan({ cls: 'vm-name', text: item.name });
      top.createSpan({
        cls: 'vm-list-when',
        text: !item.due ? 'No date set' : st.daysLeft < 0 ? `Expired ${-st.daysLeft}d ago` : st.daysLeft === 0 ? 'Expires today' : `Expires ${whenDays(st.daysLeft)}`,
      });
      main.createDiv({ cls: 'vm-muted', text: item.due ? shortDate(item.due) : 'Add the expiry date to get reminders' });
      const renew = row.createEl('button', { cls: 'vm-icon-btn', attr: { 'aria-label': `Renew ${item.name}` } });
      setIcon(renew, 'refresh-cw');
      renew.addEventListener('click', () => this.plugin.openRenew(v, item));
    });

    if (v.notes) {
      const nsec = this.sectionHead(parent, 'Notes');
      nsec.createEl('p', { cls: 'vm-notes-text', text: v.notes });
    }
  }

  emptyLine(parent, text, link, fn) {
    const e = parent.createDiv({ cls: 'vm-no-match' });
    e.createSpan({ text: text + ' ' });
    e.createEl('button', { cls: 'vm-link', text: link }).addEventListener('click', fn);
  }

  // ── Log: every service and fill, editable ──
  renderLog(parent) {
    const { data } = this;
    const vehicles = this.scope();
    const all = entriesOf(vehicles);
    const counts = { all: all.length, services: 0, fills: 0, expenses: 0 };
    all.forEach((x) => counts[x.kind]++);

    const sec = parent.createEl('section', { cls: 'vm-section' });
    const head = sec.createDiv({ cls: 'vm-section-head' });
    head.createEl('h3', { cls: 'vm-section-title', text: 'Log' });
    const pills = head.createDiv({ cls: 'vm-pills vm-pills-inline' });
    const fuelLabel = vehicles.every(isEV) ? 'Charging' : vehicles.some(isEV) ? 'Fuel & charging' : 'Fuel';
    [['all', 'All'], ['services', 'Service'], ['fills', fuelLabel], ['expenses', 'Other']].forEach(([id, label]) => {
      const p = pills.createEl('button', { cls: 'vm-pill', attr: { 'aria-pressed': String(this.logFilter === id) } });
      p.createSpan({ text: label });
      p.createSpan({ cls: 'vm-pill-count', text: String(counts[id]) });
      p.addEventListener('click', () => {
        this.logFilter = id;
        this.logLimit = LOG_PAGE;
        this.render();
      });
    });
    if (vehicles.length === 1) {
      const v = vehicles[0];
      const tools = head.createDiv({ cls: 'vm-head-tools' });
      [['services', 'wrench', 'Log service'], ['fills', isEV(v) ? 'zap' : 'fuel', `Log ${energyWord(v)}`], ['expenses', 'receipt', 'Log expense']].forEach(([kind, ic, label]) => {
        const b = tools.createEl('button', { cls: 'vm-icon-btn', attr: { 'aria-label': label } });
        setIcon(b, ic);
        b.addEventListener('click', () => this.plugin.openEntryModal(v, kind));
      });
    }

    const list = all.filter((x) => this.logFilter === 'all' || x.kind === this.logFilter);
    if (!list.length) {
      const v = vehicles[0];
      this.emptyLine(sec, 'Nothing logged yet.', vehicles.length === 1 ? 'Log a service' : 'Pick a vehicle to log', () => {
        if (vehicles.length === 1) this.plugin.openEntryModal(v, 'services');
        else this.plugin.pickVehicle((x) => this.plugin.openEntryModal(x, 'services'));
      });
      return;
    }

    const rows = sec.createDiv({ cls: 'vm-entries' });
    list.slice(0, this.logLimit).forEach(({ vehicle, kind, entry }) => {
      const service = kind === 'services';
      const expense = kind === 'expenses';
      const r = rows.createEl('button', { cls: 'vm-entry' });
      icon(r, service ? 'wrench' : expense ? 'receipt' : isEV(vehicle) ? 'zap' : 'fuel', 'vm-icon vm-entry-icon');
      const mid = r.createSpan({ cls: 'vm-entry-mid' });
      const unit = isEV(vehicle) ? 'kWh' : data.volumeUnit;
      const nm = mid.createSpan({
        cls: 'vm-name',
        text: service ? entry.task : expense ? EXPENSES[entry.category]
          : `${fmtNum(entry.amount, 2)} ${unit}${!isEV(vehicle) && !entry.full ? ' · partial' : ''}${entry.missed ? ' · after a missed one' : ''}`,
      });
      if (entry.receipt) icon(nm, 'paperclip', 'vm-icon vm-inline-icon').setAttr('aria-label', 'Has a receipt');
      const bits = [shortDate(entry.date)];
      if (entry.odometer) bits.push(`${fmtNum(entry.odometer)} ${data.distanceUnit}`);
      if (kind === 'fills' && entry.cost) bits.push(`${fmtMoney(entry.cost / entry.amount, data.currency, 2)}/${unit}`);
      if (service) bits.push(entry.where === 'diy' ? 'DIY' : 'Workshop');
      if (vehicles.length > 1) bits.push(vehicle.name);
      mid.createSpan({ cls: 'vm-muted vm-ellipsis', text: bits.join(' · ') });
      if (entry.notes) mid.createSpan({ cls: 'vm-muted vm-ellipsis vm-entry-notes', text: entry.notes });
      r.createSpan({ cls: 'vm-fig', text: fmtMoney(entry.cost, data.currency) });
      r.addEventListener('click', () => this.plugin.openEntryModal(vehicle, kind, entry));
      onMenu(r, (show) => {
        const menu = new Menu();
        menu.addItem((i) => i.setTitle('Edit').setIcon('pencil').onClick(() => this.plugin.openEntryModal(vehicle, kind, entry)));
        if (entry.receipt) menu.addItem((i) => i.setTitle('Open receipt').setIcon('paperclip').onClick(() => this.plugin.openReceipt(entry.receipt)));
        menu.addItem((i) => i.setTitle('Delete').setIcon('trash-2').onClick(() => this.plugin.deleteEntry(vehicle.id, kind, entry.id)));
        show(menu);
      });
    });
    if (list.length > this.logLimit) {
      this.emptyLine(sec, `Showing ${this.logLimit} of ${list.length}.`, 'Show more', () => {
        this.logLimit += LOG_PAGE;
        this.render();
      });
    }
  }

  // ── Spend: where the money goes ──
  renderSpend(parent) {
    const { data } = this;
    const vehicles = this.scope();
    const today = todayISO();
    const from = { month: today.slice(0, 7) + '-01', year: today.slice(0, 4) + '-01-01', all: '' }[this.period];
    const sp = spendBy(vehicles, from, today);

    const sum = parent.createEl('section', { cls: 'vm-summary' });
    const lead = sum.createDiv({ cls: 'vm-lead' });
    lead.createDiv({ cls: 'vm-lead-fig', text: fmtMoney(sp.total, data.currency) });
    const line = lead.createDiv({ cls: 'vm-lead-line' });
    line.createEl('b', { text: { month: 'spent this month', year: 'spent this year', all: 'spent in total' }[this.period] });
    if (vehicles.length === 1) line.createSpan({ text: ` · ${vehicles[0].name}` });
    const seg = sum.createDiv({ cls: 'vm-seg', attr: { role: 'group', 'aria-label': 'Period' } });
    [['month', 'Month'], ['year', 'Year'], ['all', 'All time']].forEach(([id, label]) => {
      const b = seg.createEl('button', { text: label, attr: { 'aria-pressed': String(this.period === id) } });
      b.addEventListener('click', () => {
        this.period = id;
        this.render();
      });
    });

    const panels = parent.createDiv({ cls: 'vm-panels' });
    const panel = (title, rows) => {
      const p = panels.createDiv({ cls: 'vm-card vm-panel' });
      const ph = p.createDiv({ cls: 'vm-card-head' });
      ph.createSpan({ text: title });
      ph.createSpan({ text: fmtMoney(sp.total, data.currency) });
      const list = p.createDiv({ cls: 'vm-bars' });
      const shown = rows.filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount);
      if (!shown.length) list.createDiv({ cls: 'vm-muted', text: 'Nothing spent in this period.' });
      shown.forEach((r) => {
        const pct = sp.total > 0 ? (r.amount / sp.total) * 100 : 0;
        const row = list.createDiv({ cls: 'vm-bar-row' });
        row.setCssProps({ '--vm-bar': r.color, '--vm-pct': pct.toFixed(1) + '%' });
        const lbl = row.createSpan({ cls: 'vm-bar-label' });
        lbl.createEl('i', { cls: 'vm-swatch' });
        lbl.createSpan({ text: r.label });
        lbl.createSpan({ cls: 'vm-muted', text: ` ${Math.round(pct)}%` });
        row.createSpan({ cls: 'vm-fig', text: fmtMoney(r.amount, data.currency) });
        row.createSpan({ cls: 'vm-bar-track' }).createSpan({ cls: 'vm-bar-fill' });
      });
    };
    const hues = ['blue', 'purple', 'cyan', 'pink', 'orange', 'green', 'yellow', 'red'];
    panel('By kind', [
      { label: 'Service', amount: sp.byKind.service, color: 'var(--color-blue)' },
      { label: 'Fuel', amount: sp.byKind.fuel, color: 'var(--color-orange)' },
      { label: 'Charging', amount: sp.byKind.charging, color: 'var(--color-green)' },
      ...Object.entries(EXPENSES).map(([k, label], i) => ({ label, amount: sp.byKind[k] || 0, color: `var(--color-${['purple', 'cyan', 'pink', 'yellow', 'red'][i % 5]})` })),
    ]);
    if (vehicles.length > 1) {
      panel('By vehicle', vehicles.map((v, i) => ({ label: v.name, amount: sp.byVehicle[v.id] || 0, color: `var(--color-${hues[i % hues.length]})` })));
    }

    const months = monthlySpend(vehicles, 12, today);
    const max = Math.max(...months.map((m) => m.amount), 1);
    const msec = this.sectionHead(parent, 'Last 12 months', fmtMoney(months.reduce((n, m) => n + m.amount, 0), data.currency));
    const cols = msec.createDiv({ cls: 'vm-cols', attr: { role: 'list' } });
    months.forEach((m) => {
      const col = cols.createDiv({ cls: 'vm-col', attr: { role: 'listitem', 'aria-label': `${m.label}: ${fmtMoney(m.amount, data.currency)}`, title: fmtMoney(m.amount, data.currency) } });
      col.createDiv({ cls: 'vm-col-bar' }).setCssProps({ '--vm-h': Math.max(m.amount ? 3 : 0, (m.amount / max) * 100) + '%' });
      col.createDiv({ cls: 'vm-col-label', text: m.label });
    });

    if (vehicles.length === 1) this.renderTrends(parent, vehicles[0]);
  }

  /** Mileage per fill and price per unit over time, for one vehicle */
  renderTrends(parent, v) {
    const { data } = this;
    const eff = efficiencySeries(v, data);
    const price = priceSeries(v);
    const unit = isEV(v) ? 'kWh' : data.volumeUnit;
    const sec = this.sectionHead(parent, 'Trends', '');
    if (eff.length < 2 && price.length < 2) {
      sec.createDiv({ cls: 'vm-no-match', text: `Log a few full ${isEV(v) ? 'charges' : 'tanks'} with their cost to see trends.` });
      return;
    }
    const panels = sec.createDiv({ cls: 'vm-panels vm-panels-tight' });
    const effUnit = efficiencyUnit(v, data);
    if (eff.length >= 2) lineChart(panels, isEV(v) ? 'Efficiency per charge' : 'Mileage per fill', eff, (x) => `${fmtNum(x, 1)} ${effUnit}`);
    if (price.length >= 2) lineChart(panels, `Price per ${unit}`, price, (x) => fmtMoney(x, data.currency, 2));
  }

  // ── Settings, inside the view ──
  renderSettings(parent) {
    const sec = parent.createEl('section', { cls: 'vm-section vm-settings' });
    const panel = (title, aside) => {
      const p = sec.createDiv({ cls: 'vm-card vm-panel' });
      const head = p.createDiv({ cls: 'vm-card-head' });
      head.createSpan({ text: title });
      if (aside) head.createSpan({ text: aside });
      return p.createDiv({ cls: 'vm-settings-body' });
    };
    renderPreferences(panel('Preferences'), this.plugin);
    const n = this.data.vehicles.length;
    renderDataSettings(panel('Data', `${n} vehicle${n === 1 ? '' : 's'}`), this.plugin);
  }
}

// ============================================================
// Code block embeds: ```vehicle-garage``` and ```vehicle-card```
// ============================================================
class GarageEmbed extends MarkdownRenderChild {
  /** vehicleName: null for the garage list, a name ('' = the only vehicle) for one card */
  constructor(el, plugin, vehicleName) {
    super(el);
    this.plugin = plugin;
    this.vehicleName = vehicleName;
  }

  onload() {
    this.plugin.embeds.add(this);
    this.render();
  }

  onunload() {
    this.plugin.embeds.delete(this);
  }

  render() {
    const { data } = this.plugin;
    const el = this.containerEl;
    el.empty();
    el.addClass('vm-root', 'vm-embed');
    const today = todayISO();
    const unit = data.distanceUnit;
    const c = el.createDiv({ cls: 'vm-card' });
    const head = c.createDiv({ cls: 'vm-card-head' });
    const list = c.createDiv({ cls: 'vm-embed-list' });
    const foot = c.createDiv({ cls: 'vm-embed-foot' });

    let vehicles = data.vehicles;
    if (this.vehicleName !== null) {
      const want = this.vehicleName.toLowerCase();
      const v = want ? vehicles.find((x) => x.name.toLowerCase() === want) : vehicles.length === 1 ? vehicles[0] : null;
      if (!v) {
        head.createSpan({ text: 'Vehicle card' });
        list.createEl('p', {
          cls: 'vm-muted',
          text: vehicles.length
            ? `${want ? `No vehicle named “${this.vehicleName}”.` : 'Name a vehicle.'} Write vehicle: followed by one of: ${vehicles.map((x) => x.name).join(', ')}.`
            : 'Add a vehicle in the garage first.',
        });
        this.openLink(foot, null);
        return;
      }
      vehicles = [v];
      const s = statsOf(v, data);
      head.createSpan({ cls: 'vm-ellipsis', text: v.name });
      head.createSpan({ text: `${fmtNum(odometerOf(v))} ${unit}` });
      const strip = list.createDiv({ cls: 'vm-fields' });
      field(strip, isEV(v) ? 'Efficiency' : 'Mileage', s.efficiency ? `${fmtNum(s.efficiency.value, 1)} ${s.efficiency.unit}` : '—');
      field(strip, `Cost / ${unit}`, s.costPerDistance === null ? '—' : fmtMoney(s.costPerDistance, data.currency, 2));
      field(strip, 'Spent', fmtMoney(s.spend, data.currency));
      const act = foot.createDiv({ cls: 'vm-chip-row' });
      act.createEl('button', { cls: 'vm-chip', text: 'Log service' }).addEventListener('click', () => this.plugin.openEntryModal(v, 'services'));
      act.createEl('button', { cls: 'vm-chip', text: `Log ${energyWord(v)}` }).addEventListener('click', () => this.plugin.openEntryModal(v, 'fills'));
    } else {
      head.createSpan({ text: 'Garage · needs attention' });
    }

    const due = needsAttention(vehicles, today, data);
    if (this.vehicleName === null) head.createSpan({ text: String(due.length) });
    if (!due.length) list.createEl('p', { cls: 'vm-muted', text: vehicles.length ? 'Everything is up to date.' : 'Add a vehicle to start tracking.' });
    due.slice(0, 8).forEach(({ vehicle, kind, item, st }) => {
      const row = list.createEl('button', { cls: 'vm-embed-row is-' + st.status });
      row.createSpan({ cls: 'vm-embed-when', text: dueLabel(st, unit) });
      const nm = row.createSpan({ cls: 'vm-embed-name' });
      nm.createSpan({ cls: 'vm-name', text: item.name });
      if (this.vehicleName === null) nm.createSpan({ cls: 'vm-muted vm-ellipsis', text: vehicle.name });
      row.addEventListener('click', () => {
        if (kind === 'interval') this.plugin.openEntryModal(vehicle, 'services', null, item.id);
        else this.plugin.openRenew(vehicle, item);
      });
    });
    if (due.length > 8) list.createDiv({ cls: 'vm-muted', text: `and ${due.length - 8} more` });
    this.openLink(foot, vehicles.length === 1 ? vehicles[0].id : null);
  }

  openLink(parent, vehicleId) {
    parent.createEl('button', { cls: 'vm-link', text: 'Open garage' })
      .addEventListener('click', () => this.plugin.activateView({ vehicleId }));
  }
}

// ============================================================
// Settings, shared by the in-view tab and Obsidian's settings screen
// ============================================================
function renderPreferences(el, plugin) {
  const { data } = plugin;

  new Setting(el).setName('Currency').addDropdown((dd) => {
    Object.keys(CURRENCIES).forEach((c) => dd.addOption(c, `${c} ${CURRENCIES[c]}`));
    dd.setValue(data.currency).onChange((v) => plugin.update({ currency: v }));
  });

  new Setting(el)
    .setName('Units')
    .setDesc('Distance and fuel volume for every vehicle. Changing them relabels numbers, it does not convert them.')
    .addDropdown((dd) => dd.addOption('km', 'Kilometres').addOption('mi', 'Miles').setValue(data.distanceUnit).onChange((v) => plugin.update({ distanceUnit: v })))
    .addDropdown((dd) => dd.addOption('L', 'Litres').addOption('gal', 'Gallons').setValue(data.volumeUnit).onChange((v) => plugin.update({ volumeUnit: v })));

  const positive = (t, key) => {
    numberInput(t, data[key]);
    // Commit on change, not every keystroke, so the view doesn't redraw mid-typing
    t.inputEl.addEventListener('change', () => {
      const n = num(t.getValue());
      if (n > 0) plugin.update({ [key]: n });
    });
  };
  new Setting(el)
    .setName('Due soon')
    .setDesc(`Flag an item when it is this close: distance (${data.distanceUnit}) and days. Short intervals warn within a quarter of the interval instead.`)
    .addText((t) => positive(t, 'soonDistance'))
    .addText((t) => positive(t, 'soonDays'));

  new Setting(el)
    .setName('Reminders')
    .setDesc('When the vault opens, list overdue and due-soon items. Shown once a day.')
    .addToggle((tg) => tg.setValue(data.reminders).onChange((v) => plugin.update({ reminders: v }, false)));
}

function renderDataSettings(el, plugin) {
  new Setting(el)
    .setName('Export folder')
    .setDesc('Backups are saved to this vault folder.')
    .addText((t) => {
      t.setPlaceholder(DEFAULT_DATA.exportFolder).setValue(plugin.data.exportFolder);
      t.inputEl.addEventListener('change', () => plugin.update({ exportFolder: t.getValue().trim() || DEFAULT_DATA.exportFolder }, false));
    });
  new Setting(el)
    .setName('Backup')
    .setDesc('Export everything to a JSON file in your vault, or import one. Works on mobile too.')
    .addButton((b) => b.setButtonText('Export').onClick(() => plugin.exportJSON()))
    .addButton((b) => b.setButtonText('Import…').onClick(() => plugin.openImport()));
  new Setting(el)
    .setName('Log as CSV')
    .setDesc('Every service, fill and expense as a spreadsheet. Import reads this file back, or a fuel log exported by another app.')
    .addButton((b) => b.setButtonText('Export CSV').onClick(() => plugin.exportCSV()))
    .addButton((b) => b.setButtonText('Import CSV…').onClick(() => plugin.openImport()));
}

class VehicleSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** Obsidian before 1.13 draws the tab with display(); 1.13+ uses getSettingDefinitions() and lists them in settings search */
  display() {
    const { containerEl } = this;
    containerEl.empty();
    renderPreferences(containerEl, this.plugin);
    new Setting(containerEl).setName('Data').setHeading();
    renderDataSettings(containerEl, this.plugin);
  }

  getSettingDefinitions() {
    const { data } = this.plugin;
    const positive = (v) => (num(v) > 0 ? '' : 'Enter a number above 0.');
    return [
      { name: 'Currency', control: { type: 'dropdown', key: 'currency', options: Object.fromEntries(Object.keys(CURRENCIES).map((c) => [c, `${c} ${CURRENCIES[c]}`])) } },
      {
        name: 'Distance unit', desc: 'Changing units relabels numbers, it does not convert them.', aliases: ['kilometres', 'miles'],
        control: { type: 'dropdown', key: 'distanceUnit', options: { km: 'Kilometres', mi: 'Miles' } },
      },
      { name: 'Volume unit', aliases: ['litres', 'gallons'], control: { type: 'dropdown', key: 'volumeUnit', options: { L: 'Litres', gal: 'Gallons' } } },
      {
        name: 'Due soon distance', desc: `Flag an item this many ${data.distanceUnit} before it is due. Short intervals warn within a quarter of the interval instead.`,
        control: { type: 'number', key: 'soonDistance', min: 1, validate: positive },
      },
      { name: 'Due soon days', desc: 'Flag an item this many days before it is due.', control: { type: 'number', key: 'soonDays', min: 1, validate: positive } },
      { name: 'Reminders', desc: 'When the vault opens, list overdue and due-soon items. Shown once a day.', control: { type: 'toggle', key: 'reminders' } },
      {
        type: 'group', heading: 'Data', items: [
          { name: 'Export folder', desc: 'Backups, CSV exports and receipts are saved to this vault folder.', control: { type: 'folder', key: 'exportFolder' } },
          { name: 'Export backup', desc: 'Everything, to a JSON file in the export folder.', action: () => this.plugin.exportJSON() },
          { name: 'Export log as CSV', desc: 'Every service, fill and expense as a spreadsheet.', action: () => this.plugin.exportCSV() },
          { name: 'Import backup or CSV log', desc: 'From a .json backup, this plugin\'s CSV, or a fuel log exported by another app.', action: () => this.plugin.openImport() },
        ],
      },
    ];
  }

  getControlValue(key) {
    return this.plugin.data[key];
  }

  setControlValue(key, value) {
    if (key === 'soonDistance' || key === 'soonDays') value = num(value) || DEFAULT_DATA[key];
    if (key === 'exportFolder') value = str(value) || DEFAULT_DATA.exportFolder;
    return this.plugin.update({ [key]: value }, key !== 'reminders' && key !== 'exportFolder');
  }
}

// ============================================================
// Plugin
// ============================================================
class GaragePlugin extends Plugin {
  async onload() {
    this.data = normalizeData(await this.loadData());
    this.embeds = new Set();

    addIcon(ICON_ID, ICON_SVG);
    this.registerView(VIEW_TYPE, (leaf) => new GarageView(leaf, this));
    this.addRibbonIcon(ICON_ID, 'Open garage', () => this.activateView());
    this.addSettingTab(new VehicleSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor('vehicle-garage', (source, el, ctx) => {
      ctx.addChild(new GarageEmbed(el, this, null));
    });
    this.registerMarkdownCodeBlockProcessor('vehicle-card', (source, el, ctx) => {
      const name = (source.match(/vehicle\s*:\s*(.+)/i) || [])[1];
      ctx.addChild(new GarageEmbed(el, this, str(name)));
    });

    this.addCommand({ id: 'open-dashboard', name: 'Open dashboard', callback: () => this.activateView() });
    this.addCommand({ id: 'add-vehicle', name: 'Add vehicle', callback: () => this.openVehicleModal(null) });
    this.addCommand({ id: 'log-service', name: 'Log service', callback: () => this.pickVehicle((v) => this.openEntryModal(v, 'services')) });
    this.addCommand({ id: 'log-fuel', name: 'Log fuel or charge', callback: () => this.pickVehicle((v) => this.openEntryModal(v, 'fills')) });
    this.addCommand({ id: 'log-expense', name: 'Log other expense', callback: () => this.pickVehicle((v) => this.openEntryModal(v, 'expenses')) });
    this.addCommand({ id: 'update-odometer', name: 'Update odometer', callback: () => this.pickVehicle((v) => this.openOdometer(v)) });
    this.addCommand({ id: 'show-reminders', name: 'Show what needs attention', callback: () => this.remind(true) });
    this.addCommand({ id: 'export', name: 'Export backup (JSON)', callback: () => this.exportJSON() });
    this.addCommand({ id: 'export-csv', name: 'Export log (CSV)', callback: () => this.exportCSV() });
    this.addCommand({ id: 'import', name: 'Import backup or CSV log', callback: () => this.openImport() });

    this.app.workspace.onLayoutReady(() => this.remind());
  }

  async save() {
    await this.saveData(this.data);
  }

  /** Obsidian Sync (or another device) changed data.json: reload instead of overwriting it later */
  async onExternalSettingsChange() {
    this.data = normalizeData(await this.loadData());
    this.refresh();
  }

  /** Change settings, save, and optionally redraw */
  async update(patch, redraw = true) {
    Object.assign(this.data, patch);
    await this.save();
    if (redraw) this.refresh();
  }

  refresh() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof GarageView) leaf.view.render();
    });
    this.embeds.forEach((e) => e.render());
  }

  vehicle(id) {
    return this.data.vehicles.find((v) => v.id === id);
  }

  // ── Mutations ──
  async commitVehicle(v, message) {
    v.odometer = odometerOf(v);
    const list = this.data.vehicles;
    const idx = list.findIndex((x) => x.id === v.id);
    if (idx === -1) list.push(v);
    else list[idx] = v;
    await this.save();
    this.refresh();
    if (message) new Notice(message);
  }

  async replaceAll(vehicles) {
    this.data.vehicles = vehicles;
    await this.save();
    this.refresh();
  }

  async deleteVehicle(id) {
    const before = [...this.data.vehicles];
    const v = before.find((x) => x.id === id);
    if (!v) return;
    await this.replaceAll(before.filter((x) => x.id !== id));
    this.notifyUndo(`Deleted ${v.name}`, () => this.replaceAll(before));
  }

  /** Add or replace a log entry; a service also marks its ticked intervals done */
  async saveEntry(vehicleId, kind, entry) {
    const v = this.vehicle(vehicleId);
    if (!v) return;
    const list = v[kind];
    const idx = list.findIndex((x) => x.id === entry.id);
    if (idx === -1) list.push(entry);
    else list[idx] = entry;
    if (kind === 'services') {
      v.intervals.forEach((iv) => {
        // Logging an older service must not move a newer "last done" backwards
        if (entry.resets.includes(iv.id) && (!iv.lastDate || entry.date >= iv.lastDate)) {
          iv.lastDistance = entry.odometer;
          iv.lastDate = entry.date;
        }
      });
    }
    const what = kind === 'services' ? entry.task
      : kind === 'expenses' ? `${EXPENSES[entry.category]} ${fmtMoney(entry.cost, this.data.currency)}`
        : `${fmtNum(entry.amount, 2)} ${isEV(v) ? 'kWh' : this.data.volumeUnit}`;
    const eff = kind === 'fills' ? efficiency(v, this.data) : null;
    await this.commitVehicle(v, `${idx === -1 ? 'Logged' : 'Saved'} ${what} · ${v.name}${eff ? ` · average ${fmtNum(eff.value, 1)} ${eff.unit}` : ''}`);
  }

  async deleteEntry(vehicleId, kind, entryId) {
    const v = this.vehicle(vehicleId);
    if (!v) return;
    const before = clone(v);
    v[kind] = v[kind].filter((x) => x.id !== entryId);
    await this.commitVehicle(v);
    this.notifyUndo('Deleted entry', () => this.commitVehicle(before));
  }

  /** Returns false (and says why) when the reading is invalid; saves in the background otherwise */
  setOdometer(v, value) {
    const logged = loggedOdometer(v);
    if (!(value > 0)) {
      new Notice('Enter the reading.');
      return false;
    }
    if (value < logged) {
      new Notice(`The log already shows ${fmtNum(logged)} ${this.data.distanceUnit}. Enter that or more.`);
      return false;
    }
    v.odometer = value;
    this.commitVehicle(v, `${v.name} · ${fmtNum(value)} ${this.data.distanceUnit}`);
    return true;
  }

  /** A notice with an Undo button that restores a snapshot */
  notifyUndo(message, undo) {
    const notice = new Notice(createFragment((f) => {
      f.createSpan({ text: message + ' ' });
      f.createEl('button', { text: 'Undo', cls: 'vm-notice-btn' }).addEventListener('click', async () => {
        notice.hide();
        await undo();
      });
    }), UNDO_MS);
  }

  // ── Modals ──
  openVehicleModal(v) {
    new VehicleModal(this.app, this, v).open();
  }

  openEntryModal(v, kind, entry = null, resetId = null) {
    new EntryModal(this.app, this, v, kind, entry, resetId).open();
  }

  openOdometer(v) {
    new PromptModal(this.app, {
      title: `Odometer · ${v.name}`,
      label: `Reading (${this.data.distanceUnit})`,
      desc: `Currently ${fmtNum(odometerOf(v))} ${this.data.distanceUnit}`,
      value: odometerOf(v),
      onSubmit: (x) => this.setOdometer(v, num(x)),
    }).open();
  }

  openRenew(v, doc) {
    new PromptModal(this.app, {
      title: `Renew ${doc.name} · ${v.name}`,
      label: 'New expiry date',
      desc: doc.due ? `Was ${shortDate(doc.due)}` : '',
      type: 'date',
      value: addMonthsISO(doc.due && doc.due > todayISO() ? doc.due : todayISO(), 12),
      cta: 'Renew',
      onSubmit: (x) => {
        if (!dateOf(x)) {
          new Notice('Enter a date.');
          return false;
        }
        const d = v.documents.find((y) => y.id === doc.id);
        if (d) d.due = dateOf(x);
        this.commitVehicle(v, `${doc.name} renewed until ${shortDate(dateOf(x))}`);
      },
    }).open();
  }

  /** Run cb with a vehicle: the only one, or the one the user picks */
  pickVehicle(cb) {
    const list = this.data.vehicles;
    if (!list.length) {
      new Notice('Add a vehicle first.');
      this.openVehicleModal(null);
    } else if (list.length === 1) cb(list[0]);
    else new VehiclePicker(this.app, list, cb).open();
  }

  // ── Reminders ──
  async remind(force = false) {
    const today = todayISO();
    if (!force && (!this.data.reminders || this.data.lastReminder === today)) return;
    if (!force) await this.update({ lastReminder: today }, false);
    const due = needsAttention(this.data.vehicles, today, this.data);
    if (!due.length) {
      if (force) new Notice('Nothing needs attention. Everything is up to date.');
      return;
    }
    const overdue = due.filter((i) => i.st.status === 'overdue').length;
    const notice = new Notice(createFragment((f) => {
      f.createEl('strong', { text: `${due.length} vehicle item${due.length === 1 ? '' : 's'} need attention${overdue ? ` · ${overdue} overdue` : ''}` });
      const ul = f.createEl('ul', { cls: 'vm-notice-list' });
      due.slice(0, 5).forEach((i) => ul.createEl('li', { text: `${i.vehicle.name} · ${i.item.name} · ${dueLabel(i.st, this.data.distanceUnit)}` }));
      if (due.length > 5) f.createDiv({ text: `and ${due.length - 5} more` });
      f.createEl('button', { text: 'Open garage', cls: 'vm-notice-btn' }).addEventListener('click', () => {
        notice.hide();
        this.activateView();
      });
    }), 15000);
  }

  // ── View ──
  async activateView(state) {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
    if (state && leaf.view instanceof GarageView) {
      leaf.view.tab = 'garage';
      leaf.view.vehicleId = state.vehicleId || null;
      leaf.view.render();
    }
  }

  // ── Export / import through vault files, so both work on mobile ──
  exportFolder(sub = '') {
    return normalizePath((this.data.exportFolder || DEFAULT_DATA.exportFolder) + sub);
  }

  async ensureFolder(folder) {
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
  }

  /** Write today's export file, replacing one from earlier today */
  async writeExport(ext, content, what) {
    const { vault } = this.app;
    const path = normalizePath(`${this.exportFolder()}/vehicles-${todayISO()}.${ext}`);
    try {
      await this.ensureFolder(this.exportFolder());
      const existing = vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) await vault.modify(existing, content);
      else await vault.create(path, content);
      new Notice(`Exported ${what} to ${path}`);
    } catch (e) {
      new Notice(`Export failed: ${e.message}`);
    }
  }

  exportJSON() {
    const n = this.data.vehicles.length;
    return this.writeExport('json', JSON.stringify({ exportedAt: new Date().toISOString(), schema: 1, ...this.data }, null, 2), `${n} vehicle${n === 1 ? '' : 's'}`);
  }

  exportCSV() {
    const n = entriesOf(this.data.vehicles).length;
    return this.writeExport('csv', toCSV(this.data.vehicles), `${n} log entr${n === 1 ? 'y' : 'ies'}`);
  }

  /** Save a picked photo or PDF under the export folder; returns its vault path, or '' on failure */
  async saveReceipt(file, date) {
    const { vault } = this.app;
    const folder = this.exportFolder('/Receipts');
    const name = `${date || todayISO()} ${file.name}`.replace(/[\\/:*?"<>|#^[\]]/g, '-');
    try {
      await this.ensureFolder(this.exportFolder());
      await this.ensureFolder(folder);
      let path = normalizePath(`${folder}/${name}`);
      if (vault.getAbstractFileByPath(path)) path = normalizePath(`${folder}/${uid()} ${name}`);
      await vault.createBinary(path, await file.arrayBuffer());
      return path;
    } catch (e) {
      new Notice(`Could not save the receipt: ${e.message}`);
      return '';
    }
  }

  openReceipt(path) {
    if (!this.app.vault.getAbstractFileByPath(path)) return new Notice(`Receipt not found: ${path}`);
    this.app.workspace.openLinkText(path, '', true);
  }

  /** Add CSV log rows to the vehicles they name; rows without a vehicle go to one the user picks */
  async importCSV(file) {
    let rows;
    try {
      rows = csvEntries(await this.app.vault.read(file));
    } catch (e) {
      new Notice(`Could not read ${file.name}: ${e.message}`);
      return;
    }
    if (!rows.length) {
      new Notice(`No log entries found in ${file.name}. It needs a header row with a date and an odometer column.`);
      return;
    }
    const apply = async (fallback) => {
      const before = clone(this.data.vehicles);
      const vehicles = clone(this.data.vehicles);
      const byName = new Map(vehicles.map((v) => [v.name.toLowerCase(), v]));
      let added = 0;
      rows.forEach(({ vehicle, kind, entry }) => {
        const key = (vehicle || fallback.name).toLowerCase();
        let v = byName.get(key);
        if (!v) {
          v = normalizeVehicle({ name: vehicle });
          vehicles.push(v);
          byName.set(key, v);
        }
        // Importing the same file twice adds nothing the second time
        if (v[kind].some((x) => x.date === entry.date && x.odometer === entry.odometer && x.cost === entry.cost)) return;
        v[kind].push(entry);
        added++;
      });
      await this.replaceAll(vehicles.map(normalizeVehicle).filter(Boolean));
      this.notifyUndo(`Imported ${added} of ${rows.length} entries from ${file.name}`, () => this.replaceAll(before));
    };
    if (rows.every((r) => r.vehicle)) await apply(null);
    else this.pickVehicle((v) => apply(v));
  }

  openImport() {
    new FilePicker(this.app, 'Choose a backup (.json) or a log (.csv) to import', (f) => f.extension === 'json' || f.extension === 'csv', (f) => this.importFrom(f)).open();
  }

  async importFrom(file) {
    if (file.extension === 'csv') return this.importCSV(file);
    let vehicles;
    try {
      const raw = JSON.parse(await this.app.vault.read(file));
      vehicles = normalizeData(Array.isArray(raw) ? { vehicles: raw } : raw).vehicles;
    } catch (e) {
      new Notice(`Could not read ${file.name}: ${e.message}`);
      return;
    }
    if (!vehicles.length) {
      new Notice(`No vehicles found in ${file.name}.`);
      return;
    }
    new ImportChoiceModal(this.app, this, file, vehicles).open();
  }

  async applyImport(vehicles, mode) {
    const before = [...this.data.vehicles];
    let next = vehicles;
    if (mode === 'merge') {
      const byId = new Map(before.map((v) => [v.id, v]));
      vehicles.forEach((v) => byId.set(v.id, v));
      next = [...byId.values()];
    }
    await this.replaceAll(next);
    this.notifyUndo(mode === 'merge' ? `Merged ${vehicles.length} vehicles` : `Replaced with ${vehicles.length} vehicles`, () => this.replaceAll(before));
  }
}

export default GaragePlugin;

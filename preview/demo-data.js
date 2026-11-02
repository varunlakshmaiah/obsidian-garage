// Fictional garage for the preview. Dates are relative to today so the dashboard always has something due.
window.__demoData = () => {
  const iso = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return {
    currency: 'INR', distanceUnit: 'km', volumeUnit: 'L', soonDistance: 500, soonDays: 30, reminders: true,
    vehicles: [
      {
        id: 'swift', name: 'Swift', type: 'car', fuel: 'petrol', make: 'Maruti Suzuki', model: 'Swift ZXi', year: '2021',
        plate: 'KA 05 MN 4821', odometer: 48250, notes: 'Oil: 0W-16 synthetic, 3.1 L. Tyres 185/65 R15.',
        intervals: [
          { id: 'oil', name: 'Engine oil & filter', distance: 10000, months: 12, lastDistance: 38600, lastDate: iso(-330) },
          { id: 'rot', name: 'Tyre rotation', distance: 10000, months: 6, lastDistance: 38600, lastDate: iso(-150) },
          { id: 'cab', name: 'Cabin air filter', distance: 15000, months: 12, lastDistance: 33000, lastDate: iso(-400) },
          { id: 'air', name: 'Engine air filter', distance: 30000, months: 24, lastDistance: 33000, lastDate: iso(-400) },
          { id: 'brk', name: 'Brake pads & fluid', distance: 40000, months: 24, lastDistance: 20000, lastDate: iso(-500) },
          { id: 'wip', name: 'Wiper blades', distance: 0, months: 12, lastDistance: 40000, lastDate: iso(-200) },
        ],
        documents: [
          { id: 'ins', name: 'Insurance', due: iso(18) },
          { id: 'puc', name: 'Pollution (PUC)', due: iso(-3) },
          { id: 'reg', name: 'Registration', due: iso(3600) },
        ],
        services: [
          { id: 's1', date: iso(-400), odometer: 33000, task: 'Periodic service, cabin & air filters', cost: 6850, where: 'shop', notes: 'Authorised service centre, invoice 4471', resets: ['cab', 'air'] },
          { id: 's2', date: iso(-330), odometer: 38600, task: 'Engine oil & filter, tyre rotation', cost: 4200, where: 'shop', resets: ['oil', 'rot'] },
          { id: 's3', date: iso(-200), odometer: 42100, task: 'Wiper blades', cost: 780, where: 'diy', resets: ['wip'] },
        ],
        fills: [
          { id: 'f1', date: iso(-60), odometer: 46310, amount: 32.4, cost: 3420, full: true, notes: 'HP, Indiranagar' },
          { id: 'f2', date: iso(-41), odometer: 46980, amount: 12, cost: 1270, full: false },
          { id: 'f3', date: iso(-28), odometer: 47520, amount: 25.1, cost: 2655, full: true },
          { id: 'f4', date: iso(-9), odometer: 48250, amount: 34.8, cost: 3680, full: true, notes: 'Highway trip to Mysuru' },
        ],
        expenses: [
          { id: 'x1', date: iso(-120), category: 'insurance', cost: 14200, notes: 'Comprehensive, renewed online' },
          { id: 'x2', date: iso(-9), odometer: 48250, category: 'toll', cost: 245, notes: 'Bengaluru–Mysuru expressway' },
          { id: 'x3', date: iso(-5), category: 'wash', cost: 600 },
        ],
      },
      {
        id: 'classic', name: 'Classic 350', type: 'bike', fuel: 'petrol', make: 'Royal Enfield', model: 'Classic 350', year: '2023',
        plate: 'KA 03 HX 0912', odometer: 12680,
        intervals: [
          { id: 'chain', name: 'Chain clean & lube', distance: 600, months: 0, lastDistance: 12020, lastDate: iso(-25) },
          { id: 'eoil', name: 'Engine oil & filter', distance: 5000, months: 12, lastDistance: 10000, lastDate: iso(-120) },
          { id: 'tyre', name: 'Tyre pressure & tread', distance: 1000, months: 1, lastDistance: 12300, lastDate: iso(-12) },
          { id: 'bf', name: 'Brake fluid', distance: 0, months: 24, lastDistance: 0, lastDate: iso(-600) },
        ],
        documents: [
          { id: 'bins', name: 'Insurance', due: iso(210) },
          { id: 'bpuc', name: 'Pollution (PUC)', due: iso(95) },
        ],
        services: [
          { id: 'b1', date: iso(-120), odometer: 10000, task: '10,000 km service', cost: 3150, where: 'shop', resets: ['eoil'] },
          { id: 'b2', date: iso(-25), odometer: 12020, task: 'Chain clean & lube', cost: 350, where: 'diy', resets: ['chain'] },
        ],
        fills: [
          { id: 'bf1', date: iso(-34), odometer: 11720, amount: 11.2, cost: 1180, full: true },
          { id: 'bf2', date: iso(-15), odometer: 12110, amount: 10.4, cost: 1095, full: true },
          { id: 'bf3', date: iso(-2), odometer: 12680, amount: 14.6, cost: 1540, full: true },
        ],
      },
      {
        id: 'nexon', name: 'Nexon EV', type: 'car', fuel: 'electric', make: 'Tata', model: 'Nexon EV Max', year: '2024',
        plate: 'KA 51 EV 2207', odometer: 21400,
        intervals: [
          { id: 'nrot', name: 'Tyre rotation', distance: 10000, months: 6, lastDistance: 20000, lastDate: iso(-40) },
          { id: 'ncab', name: 'Cabin air filter', distance: 20000, months: 12, lastDistance: 10000, lastDate: iso(-250) },
          { id: 'n12', name: '12V battery check', distance: 0, months: 24, lastDistance: 0, lastDate: iso(-300) },
        ],
        documents: [{ id: 'nins', name: 'Insurance', due: iso(120) }],
        services: [
          { id: 'n1', date: iso(-40), odometer: 20000, task: '20,000 km check-up, tyre rotation', cost: 1850, where: 'shop', resets: ['nrot'] },
        ],
        fills: [
          { id: 'nf1', date: iso(-21), odometer: 20480, amount: 28.5, cost: 245, notes: 'Home, overnight' },
          { id: 'nf2', date: iso(-13), odometer: 20890, amount: 52, cost: 1040, notes: 'DC fast charger' },
          { id: 'nf3', date: iso(-4), odometer: 21400, amount: 66.2, cost: 570, notes: 'Home, overnight' },
        ],
      },
    ],
  };
};

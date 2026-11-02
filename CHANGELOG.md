# Changelog

## 1.0.3 — 2026-11-02

- Release files now carry GitHub artifact attestations, so anyone can verify they were built from this repository (`gh attestation verify main.js --repo varunlakshmaiah/obsidian-garage`).
- Styles work the same on older Obsidian versions: scrollbars use the WebKit pseudo-elements, and the odometer's dotted underline is a border.

## 1.0.2 — 2026-11-02

- Re-exporting a backup or CSV on the same day now updates the file with `Vault.process`, as Obsidian's guidelines recommend.
- Files and folders are looked up by path directly instead of through a general lookup.
- Receipt paths from imported files are normalised before opening.

## 1.0.1 — 2026-11-02

- Settings appear in Obsidian's settings search (Obsidian 1.13 and later).
- The command to open the dashboard is now **Open dashboard**.
- Clearer labels in the vehicle form and settings.
- Source moved to `src/` and checked against Obsidian's official review rules on every change; `main.js` is now built and attached to each release.

## 1.0.0 — 2026-11-02

First public release.

- Garage dashboard: what needs attention across all vehicles, vehicle tiles, and a page per vehicle with odometer, mileage, cost per km and spend.
- Service schedules by distance or months, whichever comes first, with presets for cars, motorcycles, scooters and EVs. Logging a service resets the items you tick.
- Documents and renewals (insurance, PUC, registration, road tax…) with a Renew action.
- Fuel and charging log with full-tank mileage, partial and missed fills, and price per litre worked out from any two of litres, price and cost.
- Other expenses: insurance, tax, EMI, parking, tolls, cleaning, fines, accessories.
- Receipts on any entry, from the vault or the phone camera.
- Spend by kind, by vehicle and by month; mileage and fuel price trends per vehicle.
- Log of every entry with edit, delete and Undo.
- A once-a-day reminder when the vault opens.
- `vehicle-garage` and `vehicle-card` blocks for notes.
- JSON backup and import; CSV export, and CSV import from this plugin or other apps' fuel logs.
- Desktop and mobile, any pane width, light and dark themes. No network requests.

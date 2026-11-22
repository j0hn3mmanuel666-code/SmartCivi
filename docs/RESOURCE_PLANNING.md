# Resource planning workflow

SmartCivi implements the requested planning functions using the existing authenticated MySQL application. Resource officers and administrators can access **Resources**, **Budget**, **Personnel**, **Planning reports**, and **System diagrams** from the sidebar. Front desk staff, registrars and citizens retain their existing resident/civil-registry permissions.

## Available functions

- **Dashboard:** nonarchived resource count, active personnel count, department allocation/spending/remaining/usage for a selected fiscal year, and Needs attention alerts for overspending, Poor/unserviceable resources and supplies at or below their stock threshold. Personnel remain counted as active employees while assigned; employment status is independent of assignment availability.
- **Resources:** name, category, department, quantity, unit, physical condition and location; optional manual code or automatic unique code; search/category/archive filters; editing, confirmed archive/restore, matching CSV export and matching print view. Existing codes remain unchanged. Quantities continue to change through the allocation, return, replenishment and consumption ledger. A resource with outstanding allocations must be returned before archiving.
- **Condition badges:** Good, Fair and Poor are available alongside legacy Serviceable, Maintenance and Unserviceable values. Low stock is calculated from supply quantity and threshold, independently of physical condition. Only Good/Fair/Serviceable resources can be allocated.
- **Budget:** department, item, fiscal year, allocation and actual spending; editing, search, archive/restore, CSV and print. Amounts use DECIMAL storage and exact centavo arithmetic; screen amounts display Philippine pesos. Spending above allocation flags the department as over budget. A zero allocation has no applicable usage percentage, and positive spending still produces an over-budget alert.
- **Personnel:** a dedicated view of existing personnel Resource records, with full name, position, department, contact and Active/On leave/Inactive status. Supports search, editing, confirmed archive/restore, CSV, printing and a link to assignment history. Only active, nonarchived personnel in an assignable condition can receive assignments. On leave/inactive status does not silently clear existing assignments.
- **Planning reports:** current resource record counts by category, active personnel, and the selected year's department budget totals. CSV and print views use the same selection. Resource quantities with different units are not added together.
- **System diagrams:** one structural or behavioral SVG at a time, chosen from the existing 18-figure manifest, with SVG download and printing. The package is labeled as historical documentation; original notes may describe old or proposed behavior.

## How this differs from the prototype description

Login and role permissions remain required. Records are stored in MySQL and included in encrypted backups, rather than browser local storage. Removing a record archives it after confirmation and retains its history; it can be restored. Use **Sign out** to end the saved session. Closing a browser is not a substitute for sign-out.

CSV and full print views are limited to 10,000 matching records; narrow filters for larger datasets. Resource lists remain paginated for normal browsing. Old backups without budget records remain restorable. Additive startup preserves legacy codes, stock values, conditions and accounts; it does not reset the database.

## Verification

`tests/planningRules.test.js`, `tests/planning.test.js`, `tests/resourcePlanningRules.test.js`, and `tests/resourceFeatures.test.js` cover arithmetic, permissions, active counts, alerts, immutable codes, stock and personnel assignment restrictions, matching CSV/print rows, and diagram allowlisting. Migration and backup tests cover legacy data and the new budget table. `scripts/planning-visual-check.mjs` checks real forms, 13 screens at desktop/tablet/mobile widths, badges, archive confirmation, SVG downloads and print PDFs in a disposable test database.

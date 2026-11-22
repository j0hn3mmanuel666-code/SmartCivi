# SmartCivi Implementation Plan

**Goal:** Convert the existing app to the approved registry and resource planning scope while retaining citizen services.
**Architecture:** Existing server and MySQL, additive tables and focused platform routes/service. Server-rendered staff screens share the current branding; authenticated APIs reuse business rules.
**Tech stack:** Express, Handlebars, Sequelize, mysql2, Node built-ins.
**Spec:** ../specs/2026-11-08-smartcivi-design.md

## Constraints and review focus
Exact user title; retain citizen requests/appointments/payments; no destructive migrations; no invented external connectivity. Review privilege changes, duplicate resident identifiers, invalid/future dates, concurrent stock allocation, private report exports and request ownership.

## Tasks
- [x] 1. Add `services/platformRules.js` and `tests/platform.test.js`; prove validation/role/stock rules RED then GREEN. Add platform models, additive initialization and a single User definition.
- [x] 2. Add `services/platform.js` and `routes/platform.js`: resident and registry CRUD/archive, resource allocation/return, reports, alerts, audit, integration readiness and authenticated JSON/SOAP interfaces. Verify through HTTP/MySQL integration tests.
- [x] 3. Add shared `views/partials/staffNav.xian`, platform templates and `public/platform.css`. Update exact title, public summary and staff navigation; preserve existing citizen routes.
- [x] 4. Integrate session persistence/expiry, current-role refresh, ownership/permission guards, CSRF, request notifications/timelines and appointment persistence. Verify citizen/staff access and failed writes.
- [x] 5. Add encrypted backup/recovery tools and maintenance documentation; run tests, template checks, smoke/browser review and record external configuration limits in `docs/IMPLEMENTATION_STATUS.md`.

## Execution ledger
Proceeding inline in the user's existing checkout on `codex/smartcivi-registry-resources`; no separate worktree or dependency install required. The user said “ok go”, so implementation continues without another approval round. Docker was stopped at baseline; starting the installed Docker Desktop to enable isolated database verification. Existing project has no test script.


Verification: 21 unit/HTTP checks passed, with the legacy migration check run separately (1 passed). The normal suite deliberately skips that migration check because it needs a distinct legacy-schema database. Desktop/mobile checks passed for nine office screens, template compilation, real CSRF form submission and the Asia/Manila appointment calendar. Encrypted backup verification and restore passed in an empty test database.

Independent review found release/download eligibility, outstanding-allocation truncation, SOAP identifier coverage, appointment calendar dates and archived-parent restoration gaps. These were fixed with targeted verification. Payment completion now persists independently as paidAt; unpaid released requests cannot download payment records. Outstanding allocations are separately paginated. SOAP accepts XML-escaped registry identifiers. Existing citizen links to missing request/profile/help templates were repaired and added to smoke coverage.

Operational choices: retain a single Express/MySQL process; external agency/identity/mobile/infrastructure integrations remain explicitly unconfigured. Database-field/host encryption remains deployment configuration; encrypted backups are implemented. Local backup worker uses a generated key in ignored .env and a persistent Docker volume. No cloud publishing, repository push or production deployment occurred. Branch changes remain available for user review.

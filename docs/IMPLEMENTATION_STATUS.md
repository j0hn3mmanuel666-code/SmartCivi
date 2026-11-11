# SmartCivi implementation status

System title: **SmartCivi: A Smart Civil Registry and Resource Planning Platform for Local Government Units (LGUs)**

Implementing office: Municipality of Bansud, Oriental Mindoro. Work started 8 November 2026; verified locally 9 November 2026. Citizen services and incumbent green/cream/copper branding are retained. There is no cloud or production deployment in this task.

## Implemented locally

| Proposal capability | Implementation |
| --- | --- |
| Civil registry | Linked birth, marriage, death and other civil records; create/edit, unique registry numbers, event/registration dates, parent/spouse details, searchable paginated lists, archive/restore and retained history. |
| Residents/clients | Master profiles, unique local resident IDs, name/date duplicate constraint, contact/address/barangay, validation, linked registry records and verified request references. Local IDs are not national identity verification. |
| Document processing | Existing citizen requests remain. Staff review, assignment to authorized personnel, status changes, verified resident/record links and persistent processing timelines. Cancellation retains history. |
| Personnel | Individual resource entries, department/position, availability, assignments, due dates and returns. This is operational personnel allocation, not a payroll/HR suite. |
| Supplies/equipment | Opening balances, replenishment, consumption of supplies, allocation/return, condition tracking, transactional row locks, low-stock notifications and outstanding-allocation pagination. |
| Dashboard | Live role-scoped counts, recent requests, resource attention list and notifications. |
| Search/filter | Resident, civil-record, resource and request lists with filters, active/archive views and pagination. |
| Reports | Live resident, registry, request, resource, allocation and stock-movement reports; date filtering, CSV export and browser printing. Preview caps at 100 records; CSV caps at 10,000 and requests a narrower date range beyond that. |
| Access control | Administrator, civil registrar, resource officer, front desk staff and citizen permissions checked on every request; role changes take effect on existing sessions. |
| Notifications | Database-backed private notifications for request changes, assignments, registry changes and low stock; per-user read status. These are in-app notifications. |
| Audit | Sign-ins/failures, account changes, registry/resident/resource changes, request updates, exports, SOAP lookup and completed backups. No destructive log editing UI. |
| Security | bcrypt passwords, expiring database sessions, session regeneration at sign-in, CSRF protection, private-response cache controls, request ownership checks, escaped output and spreadsheet-formula-safe CSV. HTTPS-only cookies are configurable for a TLS deployment. |
| Internal integration | A single login session across modules; role-protected JSON APIs and a narrow SOAP/WSDL civil-record metadata lookup. |
| Backup/recovery | Authenticated AES-256-GCM encrypted database snapshots; configurable daily backup worker, archive verification and restore into an empty database. Backup key is held in the ignored local .env file. See MAINTENANCE.md. |
| Monitoring | Public minimal health endpoint plus administrator database connectivity, process uptime/memory, table size estimates and last successful encrypted backup. |
| Citizen services | Requests, scheduled appointments, rescheduling requests, payment demonstrations, payment history and downloadable previews remain. Appointment status is independent of document status. Payment completion survives document release. |

## Requires real provider or deployment setup

External identity-provider SSO, national ID verification, Police/Fire/Social Welfare data exchange, payroll/finance replication, agency-portal synchronization, SMS/Expo/mobile push, server clusters, cloud replication, fiber networks, load balancers and firewall appliances are not live integrations. The administrator Integration readiness screen explicitly shows them as not connected. Provider agreements, endpoints, credentials and infrastructure were not supplied.

The existing payment gateway is simulated; no real online payment is processed. Generated request certificates are previews, not automatically valid official civil certificates. Attachment uploads and geographic/address lookups retain their pre-existing limitations; this proposal conversion does not claim new scanning/OCR, delivery, payment gateway or attachment-storage integrations.

The proposal's MD5/DES wording was not used to weaken the existing password handling: bcrypt remains and backups use AES-256-GCM. Application database-field encryption, host disk encryption and TLS termination require deployment-specific key management and infrastructure configuration. Backups encrypt the database export; they do not encrypt the running MySQL volume.

## Verification

- Node unit and isolated MySQL HTTP tests cover validation, duplicate constraints, permissions, CSRF, current-role refresh, resident/registry CRUD, concurrent allocation, bounded returns, request ownership, notices/timelines, appointment status/rescheduling, SOAP/XML entities, released payment downloads and old outstanding allocations.
- An additional legacy-schema test verifies repeatable additive initialization preserves an existing request.
- Browser checks compile every template and verify nine office screens at 1440px/390px, no document overflow or JavaScript errors, a real form submission and Asia/Manila appointment calendar dates. Images are local QA only under ignored tmp/visual-check.
- An encrypted test snapshot was authenticated and restored successfully into a separate empty MySQL database. Wrong keys and tampered archives are rejected.
- Local Docker app/database health and the full public system title are checked after the rebuild. Existing local data was backed up before container replacement. Test fixtures remain in a separate disposable database, not the local application database.

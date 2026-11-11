# SmartCivi conversion design

User approved proceeding on 2026-11-08 after confirming the citizen portal, requests, appointments and payments remain. Exact title: **SmartCivi: A Smart Civil Registry and Resource Planning Platform for Local Government Units (LGUs)**. Bansud, Oriental Mindoro remains the implementing office.

## Approach
Extend the existing Express/Handlebars/Sequelize/MySQL application. Rebuilding would discard working citizen flows; separate services would add deployment complexity without improving this local application. Preserve the incumbent forest green, cream, white and copper visual language, using accessible forms and responsive tables for office work.

## Scope
Add resident master records with unique identifiers and duplicate checks; linked birth, marriage, death and other civil records with archive rather than destructive deletion; searchable paginated lists and edit forms; personnel, supplies, equipment and other resources with transaction-safe allocation, returns, replenishment and low-stock alerts; database-backed overview, reports/CSV, notifications, request timelines and audit history; role permissions for admin, registrar, resource officer, staff and citizen. Keep existing citizen routes, add ownership checks, persist appointment information and request assignment. Add session expiry, CSRF protections and database sessions. Add secure internal JSON APIs and a minimal documented SOAP/WSDL lookup service. External agency connections, identity-provider SSO, SMS/push, payroll replication, national ID verification and hybrid infrastructure require credentials, agreements and deployed infrastructure; represent their readiness truthfully rather than fabricate successful connections. One authenticated session serves all internal modules.

## Data and security
Use additive schema initialization, no drops or forced sync. Link residents to civil records and requests with restricted foreign keys. Record changes and notifications in the same database transaction where possible. Inventory updates lock the resource row to prevent over-allocation. Never accept posted roles from citizens, arbitrary assignment users, negative stock or unbounded report queries. No raw personal data in audit messages or integration readiness screens. Retain bcrypt; the document's MD5/DES references will not replace password hashing. HTTPS and at-rest storage encryption are deployment responsibilities. Encrypted application backups and explicit restoration tooling support recovery; no restore runs as part of development.

## Verification
Node built-in tests for validation, permissions and inventory rules; isolated MySQL integration checks for the main CRUD/notification/report/ownership/CSRF flows and concurrent allocation. Check citizen routes still render, compile all templates, inspect desktop/mobile staff pages. No production deployment or real payment/provider transactions.

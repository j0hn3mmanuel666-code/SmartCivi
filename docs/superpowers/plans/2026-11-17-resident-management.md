# Resident-management integration

Scope approved by the request to integrate all missing RIMS features into SmartCivi, Municipality of Bongabong. Preserve accounts, records, civil-registry workflows, resources and existing role boundaries. No production deployment or destructive migration.

1. Add optional unique usernames and active/inactive accounts. Support password and Google sign-in checks, session revocation, administrator controls and self-service usernames. Existing accounts remain active and email login continues working.
2. Add resident civil status, retaining “Not recorded” for existing records. Generate immutable human-readable Resident IDs on creation; retain all existing IDs.
3. Add barangay catalog creation, editing, archive and restore for authorized resident-management staff. Import only barangay names already present in resident records; do not invent an official geographic list. Validate new resident selections against active catalog entries. Renames preserve resident associations and activity history.
4. Add a read-only resident profile and a dedicated printable profile. Log important resident actions without placing full personal records in audit detail strings.
5. Add population reports with barangay, sex, civil status, age and registration-date filters; counts and demographic breakdowns; a paginated resident list; filtered CSV and print. Labels refer to registered residents, not a verified municipal census.
6. Give front desk staff and registrars access to the relevant reports and resident activity monitor. Keep security/account audit history and user management administrator-only; resource officers retain their existing resource permissions.
7. Verify additive migration against an old schema, concurrent resident ID generation, catalog rename/archive consistency, population totals and exports, print layouts, disabled accounts and role barriers. Use only disposable test databases for fixtures. Run desktop/mobile browser checks, compile local styles and review before delivery.

Account work is isolated in its own controller/model/view files. Resident catalog, reporting and route integration remain with the coordinating implementation to avoid conflicting edits.

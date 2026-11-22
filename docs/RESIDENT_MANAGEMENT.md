# Resident information management

SmartCivi retains its Bongabong branding and existing civil-registry and resource workflows.

## Access

Front desk staff, civil registrars and administrators can manage residents and barangays, print resident profiles, view population statistics and review resident activity. Civil registrars also retain civil-record management. Resource officers and citizens cannot access these resident modules. Full security audit history and account administration remain administrator-only.

## Workflow

1. Sign in with email or an optional username. The staff dashboard provides direct links to Resident Profiles, Barangay Management, Reports and Statistics, and Resident Activity. Inactive accounts cannot sign in with a password or Google; existing sessions lose access on their next request. Administrators set account status in User management. Users can set their own username in My profile.
2. Open **Barangay management** to add the locations available for registration. Existing resident locations are imported automatically. This is a local catalog; an official municipality-wide list is not assumed. Names must be unique. Renaming a barangay updates its resident associations, including archived residents. Archive only after moving or archiving active residents.
3. Open **Residents → Add resident**. Enter personal details and civil status, and select an active barangay. A new Resident ID is generated when the record is saved. Existing IDs are retained and cannot be edited. Existing civil status defaults to **Not recorded** until corrected.
4. Open a resident to review the profile, edit details, print a profile or inspect activity. Archive and restore controls are on the edit page. Active linked civil records must be archived first. Restore the barangay before restoring a resident whose barangay is archived.
5. Open **Population statistics** to filter by name/ID, barangay, sex, civil status, age, registration dates and archive status. Ages use the selected calculation date. Registration date filters use Philippine calendar dates. Counts and demographic breakdowns use the same filters as the paginated list and CSV. CSV exports include up to 10,000 matching residents; narrow filters for larger datasets. Print includes the summary and current list page. These are registered-resident statistics, not a verified municipal census.
6. Open **Resident activity** for resident and barangay changes, profile views/print requests and resident exports. Filter by staff/action text, internal resident reference or dates. Account login and security events remain in the administrator audit module.

7. Select **Sign out** to end the session. SmartCivi deletes the saved session and expires its browser cookie before returning to login.

## Data preservation and backups

Normal startup adds the new tables and columns without deleting records. It does not reset accounts or renumber existing residents. `npm run migrate` uses the same additive initialization and is safe to run against an existing installation.

Encrypted backups include the barangay catalog and archive states. Older archives without a catalog remain readable; restoration derives barangays only from resident locations in that archive. Restore continues to require an empty target database.

## Verification

Database tests require a disposable database name ending in `_test` and `RUN_DB_TESTS=1`. The separate additive-migration test uses `RUN_MIGRATION_TESTS=1` with a database ending in `_legacy_test`. Browser checks are in `scripts/visual-check.mjs` and `scripts/auth-visual-check.mjs`; they require `PLAYWRIGHT_MODULE` pointing to an installed Playwright module and a disposable test database.

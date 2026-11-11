# SmartCivi local operation and recovery

## Start and sign in

From the project directory, run `docker compose --profile maintenance up -d --build app backup`. Open http://localhost:3000. The existing MySQL named volume is retained. Never use `docker compose down -v` to restart this project: that removes its data volumes.

The first local administrator's login details, if created during setup, are in the ignored `tmp/LOCAL_ADMIN_LOGIN.txt`. Additional office accounts and roles are created through **Users**. Citizen self-registration always creates a citizen account.

For a fresh installation without an administrator, run `docker compose exec app node scripts/create-admin.js` and follow the terminal prompts. Alternatively supply ADMIN_EMAIL and ADMIN_PASSWORD as environment variables and use `--from-env`. The command refuses to bootstrap another administrator once one exists. Do not place initial passwords in committed source or screenshots.

## Office workflows

1. Open **Residents**, search before adding a profile, then select **Register civil record** for that resident.
2. Open **Requests** to review a citizen submission, assign a responsible staff member, link verified database references and update processing status. Civil record references must match the resident and document type.
3. Open **Resources** to add personnel (quantity 1), supplies, equipment or another operational resource. Change availability only through Allocate, Return, Replenish or Consume. Outstanding allocations stay available through pagination even when old.
4. Use **Appointments** to confirm or reschedule a date, add client-visible notes and resolve rescheduling requests. Changing appointment status does not change document status.
5. Use **Reports** for date-filtered live datasets, CSV exports or printing; **Notifications** for private updates; **Audit history** for accountability.

Archive retains records and history. A resident with active civil records cannot be archived. Restore a resident before restoring its civil records. A resource with outstanding allocations cannot be archived.

## Backups

`BACKUP_KEY` must be 64 hexadecimal characters (32 random bytes). The local ignored `.env` contains the configured key. Keep a protected copy of this key separately from the backup volume; losing it makes encrypted snapshots unrecoverable. Do not share it or commit it.

The optional `maintenance` profile runs the `backup` service after the app is healthy. It creates a backup immediately and then every BACKUP_INTERVAL_SECONDS (86400 seconds by default). Archives are stored in the Docker `smartcivi_backups` named volume at `/app/backups`. Snapshots use a repeatable-read database transaction and authenticated AES-256-GCM encryption. Sessions are excluded so a restore requires new sign-in. They include database records, account password hashes, request metadata and audit history; copy application files, deployment configuration and any externally stored attachments separately.

Run a manual snapshot with `docker compose exec app node scripts/backup.js`. This writes inside the app container; copy it out before replacing that container. Prefer `docker compose exec backup node scripts/backup.js` when the backup service is running, because its directory uses the persistent backup volume.

Inspect successful runs with `docker compose logs --tail 20 backup` and **Operations**. Copy a chosen archive outside Docker with `docker compose cp backup:/app/backups/ARCHIVE.scbackup ./backups/ARCHIVE.scbackup` after creating the local backups directory. No automatic rotation removes historical backups; schedule off-host copies and retention appropriate to the office.

## Verify and restore

With BACKUP_KEY available in the command environment, `node scripts/backup.js --restore PATH.scbackup` authenticates and inspects an archive without modifying a database.

For an isolated recovery drill, configure DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD for a separate EMPTY database. Run `node scripts/backup.js --restore PATH.scbackup --apply`. It creates missing schema and restores in one database transaction. It refuses a target containing application data. Validate record counts, sign-in, civil records, requests and allocations before considering a recovered deployment usable. Never run recovery experiments against the active database.

The pre-conversion local database snapshot is separately encrypted at `tmp/pre-conversion/database.sql.scbackup` with the same local BACKUP_KEY. It contains a SQL dump in an authenticated `{format: 'sql-1', sql: ...}` archive, rather than the application snapshot format. The exported `decryptArchive` helper in `services/backupArchive.js` can decode it for an administrator-controlled SQL recovery into a separate database. The before-conversion image tag is `smartcivi-app:before-proposal-20261108`; rolling an image back alone does not roll database changes back.

## Infrastructure setup

For an HTTPS reverse proxy, configure PUBLIC_ORIGIN to the real origin and set COOKIE_SECURE=true and TRUST_PROXY=true only when traffic passes through the trusted proxy. Set the server/disk/database access policy and storage encryption independently. Choose recovery point/time targets with the LGU; the default backup interval is not an approved disaster recovery SLA.

No production/cloud deployment, real payment, external agency exchange, SMS or remote identity-provider setup is included. **Integrations** shows the exact local readiness state.

## Developer checks

`npm test` runs rules/archive tests and skips database tests unless explicitly enabled. For isolated MySQL tests set RUN_DB_TESTS=1 and use a DB_NAME ending in `_test`; then run `npm test`. For the legacy migration test use RUN_MIGRATION_TESTS=1 and a separate `_legacy_test` database, then `node --test tests/migration.test.js`. Never point these tests at the application's actual database.

`scripts/visual-check.mjs` takes PLAYWRIGHT_MODULE pointing at an existing Playwright install and an isolated `_test` database. It uses installed Edge, writes ignored screenshots under tmp and does not add a browser dependency to the app.

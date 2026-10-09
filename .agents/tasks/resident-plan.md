# Bansud Resident Information Management System (RIMS) Implementation Plan

## Overview
This plan implements a complete Resident Information Management System module for SmartCivi, including resident CRUD operations, barangay management, reporting, and activity tracking with role-based access control.

## Decomposition: 4 Sequential Features
The work decomposes into 4 independent but sequential features (FEAT-001 through FEAT-004), each building on the prior. See `.agents/tasks/resident-rims/features/` for detailed task definitions.

---

## FEAT-001: Database Models (Resident, Barangay, ResidentActivity)

**Goal:** Create three new database models and register associations in models/index.js.

### Steps:
1. Create `models/Barangay.js` with fields: id (PK), name (unique, string), description (text), createdAt, updatedAt. Table: 'barangays'.
2. Create `models/Resident.js` with fields:
   - id (PK)
   - resident_id (unique, string, auto-generated as BSD-YYYY-NNNNN)
   - first_name, middle_name, last_name
   - birthdate (date)
   - sex (ENUM: Male/Female)
   - civil_status (ENUM: Single/Married/Widowed/Separated/Annulled)
   - address (text)
   - barangay_id (FK to barangays)
   - contact_number, email
   - status (ENUM: active/archived, default: active)
   - created_at, updated_at
   - Table: 'residents'
   - Associations: belongsTo Barangay, hasMany ResidentActivity

3. Create `models/ResidentActivity.js` with fields:
   - id (PK)
   - resident_id (FK to residents)
   - action (ENUM: created/updated/archived/restored)
   - description (text)
   - user_id (FK to users)
   - createdAt
   - Table: 'resident_activities'
   - Associations: belongsTo Resident, belongsTo User

4. Update `models/index.js` to import all three new models.
5. Add associations in `models/index.js`:
   - Barangay.hasMany(Resident, { foreignKey: 'barangay_id' })
   - Resident.belongsTo(Barangay, { foreignKey: 'barangay_id' })
   - Resident.hasMany(ResidentActivity, { foreignKey: 'resident_id' })
   - ResidentActivity.belongsTo(Resident, { foreignKey: 'resident_id' })
   - ResidentActivity.belongsTo(User, { foreignKey: 'user_id' })
   - User.hasMany(ResidentActivity, { foreignKey: 'user_id' })

6. Export all three models from `models/index.js`.

### Files Modified:
- `models/Barangay.js` (create)
- `models/Resident.js` (create)
- `models/ResidentActivity.js` (create)
- `models/index.js` (update imports, associations, exports)

### Verification:
- `npm run xian` starts without database errors
- `mysql -u root` → `USE SmartCivi;` → `SHOW TABLES;` confirms barangays, residents, resident_activities exist
- `DESCRIBE residents;` shows all fields and types correct
- No JavaScript import errors

---

## FEAT-002: Controllers & Routes

**Goal:** Implement all resident management controllers and wire routes with permission middleware.

### Controllers to Create:

#### `controllers/residentController.js`
Exports async functions:
- `listResidents(req, res)` - GET /residents with search, filter, pagination
  - Query params: search (name/email), barangay (filter), sex (filter), status (filter), page, limit
  - Uses Sequelize Op.like, Op.or for search
  - Implements pagination (offset, limit, totalPages)
  - Returns residents list with counts

- `showAddResidentPage(req, res)` - GET /residents/add: render form
  - Fetch all barangays for dropdown
  - Render residents-add.xian

- `addResident(req, res)` - POST /residents/add: create resident
  - Generate resident_id as 'BSD-' + current year + '-' + zero-padded 5-digit sequence
  - Validate required fields, prevent duplicates
  - Create Resident record
  - Log activity: logAudit(userId, 'RESIDENT_CREATED', null, 'Created resident: ' + fullName)
  - Redirect to /residents with success message

- `showResident(req, res)` - GET /residents/:id: view profile
  - Fetch resident with barangay details
  - Render residents-profile.xian

- `showEditResidentPage(req, res)` - GET /residents/:id/edit: render edit form
  - Fetch resident and all barangays
  - Render residents-edit.xian with data

- `updateResident(req, res)` - POST /residents/:id/edit: update resident
  - Update fields (excluding resident_id, status)
  - Log activity with changes
  - Redirect to /residents/:id with success message

- `archiveResident(req, res)` - POST /residents/:id/archive: soft-delete
  - Set status = 'archived'
  - Log activity: action='RESIDENT_ARCHIVED'

- `restoreResident(req, res)` - POST /residents/:id/restore: unarchive
  - Set status = 'active'
  - Log activity: action='RESIDENT_RESTORED'

- `printResident(req, res)` - GET /residents/:id/print: render print view (no sidebar/topbar)

#### `controllers/reportController.js`
Exports:
- `residentReport(req, res)` - GET /reports/residents: render report page with filters
  - Query params: barangay, sex, age_from, age_to, status
  - Render reports.xian

- `exportResidentsCSV(req, res)` - GET /reports/residents/export: stream CSV
  - Accept filters: barangay, sex, age_from, age_to, status
  - Build query with Op filters
  - Format as CSV: resident_id, name, birthdate, sex, barangay, contact, status
  - Set Content-Type: text/csv, Content-Disposition: attachment

#### `controllers/residentActivityController.js`
Exports:
- `listResidentActivities(req, res)` - GET /resident-activities: activity log
  - Query params: resident_id (optional filter), action (optional filter), page, limit
  - Join with Resident and User models
  - Render resident-activities.xian with log

#### `controllers/barangayController.js`
Exports:
- `listBarangays(req, res)` - GET /barangays: list with resident counts
  - Fetch all barangays
  - For each: count associated residents (status='active' and 'archived')
  - Render barangays.xian

### Routes to Add to `routes/index.js`:
```
GET    /residents                            → isAuthenticated → residentController.listResidents
GET    /residents/add                        → isAuthenticated, hasPermission('manage_residents')|adminOnly → showAddResidentPage
POST   /residents/add                        → isAuthenticated, hasPermission('manage_residents')|adminOnly → addResident
GET    /residents/:id                        → isAuthenticated → showResident
GET    /residents/:id/edit                   → isAuthenticated, hasPermission('manage_residents')|adminOnly → showEditResidentPage
POST   /residents/:id/edit                   → isAuthenticated, hasPermission('manage_residents')|adminOnly → updateResident
POST   /residents/:id/archive                → isAuthenticated, hasPermission('manage_residents')|adminOnly → archiveResident
POST   /residents/:id/restore                → isAuthenticated, hasPermission('manage_residents')|adminOnly → restoreResident
GET    /residents/:id/print                  → printResident (no auth required, public print)
GET    /barangays                            → isAuthenticated → barangayController.listBarangays
GET    /reports/residents                    → isAuthenticated → reportController.residentReport
GET    /reports/residents/export             → isAuthenticated → reportController.exportResidentsCSV
GET    /resident-activities                  → isAuthenticated → residentActivityController.listResidentActivities
```

Note: All routes using isAuthenticated. Routes with archive/restore/add/edit require `hasPermission('manage_residents')` OR `adminOnly`.

### Files Modified:
- `controllers/residentController.js` (create)
- `controllers/reportController.js` (create)
- `controllers/residentActivityController.js` (create)
- `controllers/barangayController.js` (create)
- `routes/index.js` (add route definitions and imports)

### Verification:
- `npm run xian` starts without errors
- `npm run route:list` outputs all 14 new routes
- `npm run route:list | grep -E 'residents|barangays|reports'` confirms routes exist
- GET /residents loads (renders view)
- POST /residents/add creates resident with BSD-2026-NNNNN ID
- GET /residents/:id shows resident profile
- POST /residents/:id/archive sets status='archived'
- GET /reports/residents/export returns CSV data (Content-Type: text/csv)

---

## FEAT-003: View Templates

**Goal:** Create 8 .xian view files for the RIMS UI and update sidebar + dashboard partials.

### View Files to Create:

1. **`views/residents.xian`** - Main resident list
   - Search form (input name=search, submit searches list)
   - Filters: barangay (select), sex (select), status (select: all/active/archived)
   - Pagination (prev/next buttons, page dropdown)
   - "Add Resident" button → GET /residents/add
   - Table: Resident ID, Full Name, Barangay, Contact, Status
   - Actions: View (→ /residents/:id), Edit (→ /residents/:id/edit), Archive (POST /residents/:id/archive)

2. **`views/residents-add.xian`** - Add resident form
   - Fields: first_name (text), middle_name (text), last_name (text)
   - birthdate (input type=date, use {{formatDate}} for value if editing)
   - sex (select: Male/Female)
   - civil_status (select: Single/Married/Widowed/Separated/Annulled)
   - address (textarea)
   - barangay_id (select from all barangays)
   - contact_number (text)
   - email (text)
   - Submit button: "Create Resident"
   - Cancel button: back to /residents

3. **`views/residents-edit.xian`** - Edit resident form
   - Same form as add, pre-populated with resident object
   - Cannot edit: resident_id, status (shown but disabled)
   - Submit button: "Update Resident"

4. **`views/residents-profile.xian`** - Resident profile view
   - Display: Resident ID, Full Name, Age (calculated), Birthdate, Sex, Civil Status
   - Address, Barangay (link to filter), Contact Number, Email, Status
   - Edit button (→ /residents/:id/edit)
   - Print button (→ /residents/:id/print)
   - If status='active': Archive button (POST /residents/:id/archive)
   - If status='archived': Restore button (POST /residents/:id/restore)

5. **`views/residents-print.xian`** - Print-friendly profile
   - Same data as profile, but no sidebar/topbar
   - Minimal styling, optimized for print (white bg, black text)
   - No buttons

6. **`views/barangays.xian`** - Barangay list with resident counts
   - Table: Barangay Name, Active Residents, Archived Residents, Total
   - Each barangay name is a link to /residents?barangay=:barangayId

7. **`views/reports.xian`** - Report generation page
   - Filters: barangay (select), sex (select), age_from (input), age_to (input), status (select)
   - Report Type: radio buttons (All Residents, By Barangay, By Sex, By Age Group)
   - "Generate Report" button (GET /reports/residents with filters as query params)
   - "Export as CSV" button (GET /reports/residents/export with same params)
   - Results table (dynamic based on selection)

8. **`views/resident-activities.xian`** - Activity log
   - Table: Resident ID, Resident Name, Action, User, Date/Time, Description
   - Filters: resident search (text), action (select: all/created/updated/archived/restored)
   - Pagination

### Partials to Update:

**`views/partials/sidebar.xian`** - Update to add RIMS nav
- Keep existing Dashboard and My Profile links
- Add new section "Residents Management" (visible to all authenticated users, not admin-only):
  - Residents (→ /residents)
  - Barangays (→ /barangays)
  - Reports (→ /reports/residents)
  - Resident Activity Log (→ /resident-activities)
- Keep existing Admin section (User Management, Audit Logs) for admin-only

**`views/dashboard.xian`** - Update to add resident stats for admin
- After "Total Users" stats card group, add "Residents" stats section ({{#eq role 'Administrator'}}):
  - Total Residents (card with count and icon)
  - Active Residents (card)
  - Archived Residents (card)
  - Top 5 Barangays by Resident Count (table or simple list)

### Files Modified:
- `views/residents.xian` (create)
- `views/residents-add.xian` (create)
- `views/residents-edit.xian` (create)
- `views/residents-profile.xian` (create)
- `views/residents-print.xian` (create)
- `views/barangays.xian` (create)
- `views/reports.xian` (create)
- `views/resident-activities.xian` (create)
- `views/partials/sidebar.xian` (update)
- `views/dashboard.xian` (update)

### Verification:
- `npm run xian` starts
- GET /residents renders without Handlebars errors, shows search form, filters, table (empty)
- GET /residents/add renders form with all fields
- GET /barangays renders (empty until seed)
- GET /reports/residents renders report page
- GET /resident-activities renders activity log
- Sidebar includes all 4 new menu items
- Dashboard shows resident stats section for admin role

---

## FEAT-004: Seed Data & HBS Helpers

**Goal:** Populate database with 18 barangays and 15 fictional residents. Register 8 HBS helpers.

### Barangay Seed Data (18 municipalities of Bansud, Oriental Mindoro):
1. Poblacion
2. Caloocan
3. Cabulao
4. Carunog
5. Cawayan
6. Ipil
7. Mamburao
8. Mansalay
9. Olandoy
10. Panaluran
11. Pinamalayan
12. Pindasan
13. Rosario
14. Salogon
15. Talusan
16. Tigbao
17. Tinahak
18. Tiniguiban

### Resident Seed Data (15 fictional residents):
- Varied birthdates (adults, some elderly)
- Balanced sex distribution
- Mixed civil status
- Distributed across barangays (5 in Poblacion, 5 in Mamburao, 5 distributed)
- 13 active, 2 archived (for testing filter)
- Realistic Filipino names
- Contact numbers, addresses

### Updates to `models/seed.js`:

Add function `seedBarangays()`:
```javascript
export async function seedBarangays() {
  const barangays = [
    'Poblacion', 'Caloocan', 'Cabulao', 'Carunog', 'Cawayan', 'Ipil',
    'Mamburao', 'Mansalay', 'Olandoy', 'Panaluran', 'Pinamalayan',
    'Pindasan', 'Rosario', 'Salogon', 'Talusan', 'Tigbao', 'Tinahak', 'Tiniguiban'
  ];
  for (const name of barangays) {
    await Barangay.findOrCreate({
      where: { name },
      defaults: { name, description: `Barangay ${name}, Bansud, Oriental Mindoro` }
    });
  }
}
```

Add function `seedResidents()`:
```javascript
export async function seedResidents() {
  // Create 15 resident records with:
  // - Auto-generated resident_id as BSD-2026-00001 through BSD-2026-00015
  // - Varied birthdates, names, barangays, contact numbers
  // - 13 active, 2 archived
  // Use ResidentActivity to create 'created' action for each
}
```

Update `seedData()` to call:
```javascript
await seedBarangays();
await seedResidents();
```

### HBS Helpers to Register in `index.js`:

Add after existing helpers:
```javascript
hbs.registerHelper('multiply', function(a, b) {
  return parseInt(a) * parseInt(b);
});

hbs.registerHelper('json', function(obj) {
  return JSON.stringify(obj);
});

hbs.registerHelper('formatDate', function(date) {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
});

hbs.registerHelper('calculateAge', function(birthdate) {
  if (!birthdate) return '';
  const bd = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const monthDiff = today.getMonth() - bd.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < bd.getDate())) {
    age--;
  }
  return age;
});

hbs.registerHelper('or', function(a, b, options) {
  return (a || b) ? options.fn(this) : options.inverse(this);
});

hbs.registerHelper('and', function(a, b, options) {
  return (a && b) ? options.fn(this) : options.inverse(this);
});

hbs.registerHelper('ne', function(a, b, options) {
  return a !== b ? options.fn(this) : options.inverse(this);
});

hbs.registerHelper('includes', function(array, value, options) {
  if (Array.isArray(array) && array.includes(value)) {
    return options.fn(this);
  }
  return options.inverse(this);
});
```

### Updates to `setup.js`:
- Ensure it still runs seedData() which now calls seedBarangays() and seedResidents()
- Keep console output of demo credentials at end (admin/Admin@2026!, staff/Staff@2026!, resident/Resident@2026!)
- Credentials displayed only in console during setup, not in views

### Files Modified:
- `models/seed.js` (add seedBarangays, seedResidents, call in seedData)
- `index.js` (add 8 HBS helpers)
- `setup.js` (no changes, but verify it still works)

### Verification:
- `npm run xian` starts, console shows seed messages
- `mysql -u root` → `USE SmartCivi;` → `SELECT COUNT(*) FROM barangays;` = 18
- `SELECT * FROM residents;` shows 15 rows with resident_id BSD-2026-00001 through BSD-2026-00015
- GET /barangays shows 18 barangays with resident counts
- GET /residents shows 15 active residents
- GET /residents?status=archived shows 2 archived residents
- Resident profile shows age calculated correctly (e.g., {{calculateAge birthdate}})
- Form birthdate input shows in YYYY-MM-DD format (e.g., {{formatDate birthdate}} for value)
- No HBS rendering errors in any view

---

## Integration & Review Loop

After all 4 FEATs complete:

1. **Integration Verification** (fixer step):
   - Full build test: npm run xian
   - Route list verification
   - Database table check
   - Manual browser test: login, navigate all new routes, create/edit/archive/restore residents, test CSV export
   - Verify role-based access (admin vs staff vs resident)
   - Check audit logs recorded all actions

2. **Code Review** (reviewer step):
   - All models, controllers, routes, views follow existing patterns
   - All acceptance criteria from each FEAT met
   - No console errors, no database errors
   - Clean git history
   - Write verdict.json with APPROVED or CHANGES_REQUESTED

3. **Final Merge** (merge step):
   - Confirm all 4 commits exist
   - Final smoke test
   - Summary of implementation

---

## Summary of Changes

### New Models:
- `models/Barangay.js`
- `models/Resident.js`
- `models/ResidentActivity.js`

### New Controllers:
- `controllers/residentController.js`
- `controllers/reportController.js`
- `controllers/residentActivityController.js`
- `controllers/barangayController.js`

### New Routes (14 total):
- GET /residents, GET /residents/add, POST /residents/add
- GET /residents/:id, GET /residents/:id/edit, POST /residents/:id/edit
- POST /residents/:id/archive, POST /residents/:id/restore, GET /residents/:id/print
- GET /barangays
- GET /reports/residents, GET /reports/residents/export
- GET /resident-activities

### New Views (8 total):
- `views/residents.xian`
- `views/residents-add.xian`
- `views/residents-edit.xian`
- `views/residents-profile.xian`
- `views/residents-print.xian`
- `views/barangays.xian`
- `views/reports.xian`
- `views/resident-activities.xian`

### Updated Views:
- `views/partials/sidebar.xian` (add RIMS menu)
- `views/dashboard.xian` (add resident stats)

### Seed Data:
- 18 barangays (Bansud municipalities)
- 15 fictional residents (BSD-2026-00001 through 00015)

### HBS Helpers (8 new):
- multiply, json, formatDate, calculateAge, or, and, ne, includes

### Total Impact:
- 3 new database models
- 4 new controllers with ~40 functions
- 14 new routes with permission enforcement
- 8 new view templates + 2 updated partials
- Full audit trail via ResidentActivity
- 18 barangays + 15 resident test data
- 8 HBS helpers for templates

**No changes to existing models, controllers, or routes.**
**No dependencies added to package.json.**

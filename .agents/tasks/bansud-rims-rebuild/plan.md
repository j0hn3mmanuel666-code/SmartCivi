# Implementation Plan: Bansud Resident Information Management System Rebuild

## Overview
Transform SmartCivi from a User & Access Management system into a focused Bansud Resident Information Management System (RIMS). This plan removes all user management, role-based permissions, profiles, and audit logging for users, and replaces them with a simplified staff authentication layer. All resident, barangay, and resident activity functionality is retained.

---

## Files to DELETE

Remove the following files as they are part of the old User & Access Management system and have no place in RIMS:

1. `models/User.js` — full User model with roles/permissions tracking
2. `models/Profile.js` — user profile model
3. `models/Role.js` — role definitions
4. `models/Permission.js` — permission definitions
5. `models/RolePermission.js` — role-permission junction table
6. `models/UserRole.js` — user-role junction table
7. `models/AuditLog.js` — system audit logging model
8. `controllers/userController.js` — user management endpoints
9. `controllers/profileController.js` — profile management endpoints
10. `controllers/auditLogController.js` — audit log viewing endpoints
11. `views/users.xian` — user list view
12. `views/users-add.xian` — add user form
13. `views/users-edit.xian` — edit user form
14. `views/users-profile.xian` — user profile view
15. `views/users-assign-role.xian` — role assignment view
16. `views/profile.xian` — own profile view
17. `views/profile-edit.xian` — own profile edit form
18. `views/profile-change-password.xian` — password change form
19. `views/audit-logs.xian` — audit log list view
20. `views/forgot-password.xian` — password recovery page

---

## Files to CREATE

### 1. `models/StaffUser.js`
**Purpose**: Simplified authentication model for staff/admin users logging into RIMS.

**Outline**:
- Table: `staff_users` (not `users`)
- Fields:
  - `id` (PK, INTEGER, auto-increment)
  - `username` (STRING, unique, not null)
  - `email` (STRING, unique, not null)
  - `password_hash` (STRING, not null)
  - `status` (ENUM: 'active'/'inactive', default 'active')
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)
- No roles, no permissions, no associations to User-related models
- Used only for authentication/session tracking

---

## Files to UPDATE

### 1. `models/index.js`
**Current**: Exports User, Profile, Role, Permission, RolePermission, UserRole, AuditLog and their associations

**Changes**:
- Remove imports: User, Profile, Role, Permission, RolePermission, UserRole, AuditLog
- Add import: StaffUser
- Remove all User/Role/Permission/RolePermission/UserRole/AuditLog associations
- Update ResidentActivity foreign key association: change from `User` to `StaffUser`
  - Remove: `ResidentActivity.belongsTo(User, { foreignKey: 'user_id' })`
  - Remove: `User.hasMany(ResidentActivity, { foreignKey: 'user_id' })`
  - Add: `ResidentActivity.belongsTo(StaffUser, { foreignKey: 'user_id' })`
  - Add: `StaffUser.hasMany(ResidentActivity, { foreignKey: 'user_id' })`
- Keep Barangay/Resident/ResidentActivity associations unchanged
- Export: `{ sequelize, StaffUser, Barangay, Resident, ResidentActivity }`
- Keep `syncAll()` export

**Reasoning**: The models layer now has a much simpler scope: just staff users for auth, residents for data, barangays for organization, and activity logs tied to staff. No role/permission complexity.

---

### 2. `models/ResidentActivity.js`
**Current**: `user_id` references 'users' table, User foreign key

**Changes**:
- Change foreign key reference table name from 'users' to 'staff_users'
- Keep field name as `user_id` (the actual field name in the db)
- Keep the rest of the model unchanged (id, resident_id, action, description, timestamps)

**Reasoning**: ResidentActivity must still log who performed an action on a resident (for audit trail), but now it references staff users instead of the complex User model.

---

### 3. `middleware/auth.js`
**Current**: 
- `isAuthenticated`: passes userId, username, email, role, permissions to res.locals
- `hasPermission(permissionName)`: checks if user has a specific permission
- `adminOnly`: uses hasPermission('view_all_users')

**Changes**:
- Keep `isAuthenticated` middleware but simplify:
  - Remove `permissions` from res.locals (no permissions in RIMS)
  - Remove `role` from res.locals (no roles in RIMS)
  - Store in session: userId, username, email only
  - Pass to res.locals: userId, username only
- Delete `hasPermission` function entirely (no permission checks)
- Delete `adminOnly` function entirely (all authenticated users have same access)
- Export only `isAuthenticated`

**Reasoning**: RIMS has no role-based access control. All authenticated staff users see all resident data and can perform all resident operations. The only check is "are you logged in?"

---

### 4. `controllers/authController.js`
**Current**: 
- Searches User by email/username
- Fetches roles and permissions
- Stores role/permissions in session
- Shows admin-only vs staff/resident dashboard variants

**Changes**:
- `loginPage`: unchanged (renders login form)
- `loginUser`:
  - Replace User model with StaffUser
  - Remove role/permission fetching logic
  - Change session storage to: `userId`, `username`, `email` only
  - Keep password hashing check (bcrypt)
  - Keep inactive account check (status field exists on StaffUser)
  - Keep `remember_me` logic
  - Simplify condition: all logged-in users are "staff" (no role distinctions)
  - Log to console (no AuditLog model): "User [username] logged in at [timestamp]"
- `logoutUser`:
  - Keep session destroy logic
  - Log to console: "User logged out"
  - Remove AuditLog call
- `forgotPasswordPage`: can keep as-is (template exists) or remove if not needed; if kept, do nothing functional
- `showDashboard`:
  - Simplify: all users see resident-focused stats (no user management stats)
  - Stats to show: total residents, active residents, archived residents, residents by barangay, top barangays
  - No user counts, role counts, or recent AuditLog entries
  - Remove role-branching logic (all users see same dashboard)
  - Fetch only: StaffUser (for username), Resident, Barangay counts
  - Render dashboard with stats only

**Reasoning**: Simplified auth flow. No roles, no permissions, no complex user profiles. All staff see resident data equally. Dashboard is resident-centric.

---

### 5. `routes/index.js`
**Current**: 
- `/login`, `/logout`, `/forgot-password`, `/dashboard`
- `/profile/*`, `/users/*`, `/audit-logs`
- `/residents/*`, `/barangays`, `/reports/*`, `/resident-activities`
- Middleware: `isAuthenticated`, `adminOnly`, `hasPermission`

**Changes**:
- Keep routes:
  - `GET /` → redirect to `/login`
  - `GET /login` → loginPage
  - `POST /login` → loginUser
  - `GET /logout` → logoutUser (wrapped in `isAuthenticated`)
  - `GET /dashboard` → showDashboard (wrapped in `isAuthenticated`)
  - `GET /residents`, `POST /residents/add`, `GET /residents/add`, `GET /residents/:id`, `GET /residents/:id/edit`, `POST /residents/:id/edit`, `POST /residents/:id/archive`, `POST /residents/:id/restore`, `GET /residents/:id/print` (all wrapped in `isAuthenticated`)
  - `GET /barangays` → listBarangays (wrapped in `isAuthenticated`)
  - `GET /reports/residents` → residentReport (wrapped in `isAuthenticated`)
  - `GET /reports/residents/export` → exportResidentsCSV (wrapped in `isAuthenticated`)
  - `GET /resident-activities` → listResidentActivities (wrapped in `isAuthenticated`)
  - `(req, res) => 404` handler
- Remove all routes:
  - `/profile/*`
  - `/users/*`
  - `/audit-logs`
  - `/forgot-password` (if truly not needed for RIMS scope)
- Remove middleware imports: `adminOnly`, `hasPermission`
- Remove controller imports: userController, profileController, auditLogController
- Keep controller imports: authController, residentController, barangayController, reportController, residentActivityController
- Update all resident/barangay/report/activity routes to use only `isAuthenticated` (no hasPermission checks)

**Reasoning**: Flat permission model. All logged-in staff access the same resident functions. No user, profile, or audit log routes. Simpler routing tree.

---

### 6. `controllers/residentController.js`
**Changes** (minimal):
- Remove import of `User` model
- Update ResidentActivity creation calls to still use `user_id: req.session.userId` (no change to code logic; the association in index.js changed to StaffUser)
- Remove `logAudit` calls if present (AuditLog model deleted)
- Everything else stays the same: Resident CRUD, filtering, archiving, printing logic

**Reasoning**: Resident operations stay intact. They just log via ResidentActivity to StaffUser instead of AuditLog to User.

---

### 7. `controllers/reportController.js`
**Changes** (minimal):
- If it has any User imports/references, remove them
- Keep Resident query/export logic intact

**Reasoning**: Reports are resident-data-focused; no user data to remove.

---

### 8. `controllers/residentActivityController.js`
**Changes** (minimal):
- If it includes User model, ensure associations work with StaffUser (should auto-work if index.js is updated)
- Keep listing and filtering logic intact

**Reasoning**: Activity logs display user_id references; those now point to StaffUser. No code changes needed if association is correct.

---

### 9. `controllers/barangayController.js`
**Changes**: None (no user/permission/auth logic)

---

### 10. `models/seed.js`
**Current**:
- Seeds roles, permissions, role-permission assignments
- Seeds admin/staff users with demo credentials
- Seeds residents and barangays
- Logs credentials to console

**Changes**:
- Remove all Permission, Role, RolePermission, UserRole seed logic
- Replace User seed with StaffUser seed:
  - Create 2 StaffUser records (admin, staff)
  - `admin`: username='admin', email='admin@bansud.local', password hashed (use bcrypt.hash)
  - `staff`: username='staff', email='staff@bansud.local', password hashed
  - Both status='active'
  - DO NOT console.log credentials after creation (per user request: "don't show demo credentials")
  - Instead, add a comment in the seed file: "Default credentials seeded; credentials are only logged during setup in console—do not display in views"
- Keep Barangay seed (18 barangays for Bansud)
- Keep Resident seed (15 residents for demo)
- Update imports to remove Permission, Role, RolePermission, UserRole, AuditLog; keep StaffUser, Barangay, Resident, ResidentActivity

**Reasoning**: Simplified seed flow. No complex role setup. StaffUser is minimal. Credentials logged only to console during development, never shown to end users (per requirement "dont show the demo credentials").

---

### 11. `views/login.xian`
**Current**: May show demo credentials or old title

**Changes**:
- Update page title/heading to: "Bansud Resident Information Management System"
- Update page description/subtitle to: "Login to access resident management"
- Keep form structure: username/email field + password field + submit button + remember me checkbox
- Remove any demo credential display
- Keep flash messages for error/success

**Reasoning**: User-facing rebranding. No credentials shown to end users (only seeded to console).

---

### 12. `views/dashboard.xian`
**Current**:
- Branches logic: if role === 'Administrator' show user stats, else show staff/resident stats
- Shows user counts, role distribution, audit logs
- Quick actions include /users/*, /profile/*, /audit-logs

**Changes**:
- Remove role branching (all users see same dashboard)
- Remove user management stats (total users, active users, admin/staff/resident counts, user distribution chart)
- Keep resident stats:
  - Total residents, active residents, archived residents, total barangays
  - Top barangays by resident count
  - Resident statistics (average per barangay, active %, archived %)
- Replace "Quick Actions" from [Add User, Manage Users, Audit Logs, My Profile] to [Add Resident, View Residents, View Reports, View Activity Logs]
- Remove Recent Activity section (no AuditLog model)
- Update page title to: "Dashboard" (or "Resident Dashboard")

**Reasoning**: Resident-centric dashboard. No user management visibility. All staff see the same resident-focused metrics.

---

### 13. `views/partials/sidebar.xian`
**Current**:
- Navigation: Dashboard, Residents, Barangays, Reports, User Management, Audit Logs, My Profile, Logout

**Changes**:
- Keep: Dashboard, Residents, Barangays, Reports, Resident Activity, Logout
- Remove: User Management (entire section), Audit Logs, My Profile

**Reasoning**: Simplified navigation. User/admin functions removed. All nav is resident-focused.

---

### 14. `views/partials/topbar.xian`
**Current**:
- May show user profile dropdown with "My Profile", "Change Password", "Logout"

**Changes**:
- Keep simple: "Logged in as: [username]" text
- Add a Logout button or link
- Remove profile dropdown
- Remove "My Profile" and "Change Password" links

**Reasoning**: No personal profile view in RIMS. Just show who's logged in and logout option.

---

### 15. `setup.js`
**Current**:
- Calls syncAll() to sync schema
- Calls seedData() to seed demo data
- Logs completion message

**Changes**:
- Add console messages before each step (helpful for debugging)
- Output structure:
  ```
  📋 Syncing database schema...
  ✓ Schema synced successfully
  🌱 Seeding demo data...
  ✓ StaffUser accounts created (check console for details—never displayed in views)
  ✓ Barangays created
  ✓ Residents created
  ✅ Setup completed successfully!
  ```
- No changes to the flow logic, just messaging

---

### 16. `index.js` (main entry point)
**Changes** (minimal):
- If there are any User/Role/Permission/Profile model references in helpers or middleware setup, remove them
- Keep all HBS helpers (they work with whatever data structure)
- Keep session setup
- Keep XianFire engine configuration
- Keep route setup

**Reasoning**: The index.js file is mostly configuration. No explicit changes needed if models/routes/controllers are clean.

---

## Dependency Order & Verification Strategy

**Phase 1: Model Layer** (must be done first; other layers depend on this)
1. Create `models/StaffUser.js` — NEW model
2. Delete old User/Profile/Role/Permission models (6 files)
3. Update `models/index.js` — change imports/exports/associations
4. Update `models/ResidentActivity.js` — update foreign key reference
5. Update `models/seed.js` — new StaffUser seed, remove role/permission seed
   - **Verify**: Inspect seed.js for correctness (grep for 'StaffUser', confirm no 'Role' or 'Permission' references)

**Phase 2: Middleware & Controllers** (depends on Phase 1)
6. Update `middleware/auth.js` — simplify auth
7. Update `controllers/authController.js` — simplify login/dashboard
8. Update `controllers/residentController.js` — remove User imports if any
   - **Verify**: Build and check for import errors

**Phase 3: Routes & Views** (depends on Phases 1–2)
9. Update `routes/index.js` — remove user/profile/audit routes, remove permission middleware
10. Delete user/profile/audit views (11 files)
11. Update `views/login.xian` — rebrand title, remove credentials
12. Update `views/dashboard.xian` — remove user stats, add resident stats, remove role branching
13. Update `views/partials/sidebar.xian` — remove user management/profile nav
14. Update `views/partials/topbar.xian` — simplify user display, no profile dropdown

**Phase 4: Entry Point & Setup**
15. Update `setup.js` — ensure it only syncs RIMS models
16. Update `index.js` if needed (inspect for stray references)

**Phase 5: Integration Verification**
17. Run `npm run start` (or dev server) to verify app starts without errors
18. Run `node setup.js` to verify database sync and seeding
19. Test login with seeded staff account (admin / admin@bansud.local)
20. Verify dashboard loads with resident stats only
21. Verify sidebar/topbar show only resident navigation
22. Verify `/users`, `/profile`, `/audit-logs` routes return 404

---

## Verification Steps (End-to-End)

After implementing all changes, run these verification checks in order:

1. **Build & Start**:
   ```
   npm install  (if needed)
   npm start
   ```
   ✅ Expect: App starts on localhost:3000, no errors in console

2. **Database Setup**:
   ```
   node setup.js
   ```
   ✅ Expect: Schema synced, StaffUser/Barangay/Resident seeded without credential display

3. **Login Test**:
   - Navigate to http://localhost:3000/login
   - Login with: username='admin', password='Admin@2026!' (or actual seeded password from seed.js)
   ✅ Expect: Redirect to /dashboard, "Welcome" message

4. **Dashboard Test**:
   - At /dashboard
   ✅ Expect: Shows resident stats (total, active, archived residents, top barangays), NOT user stats

5. **Navigation Test**:
   - Check sidebar
   ✅ Expect: Links to Dashboard, Residents, Barangays, Reports, Resident Activity, Logout — NO User Management, Audit Logs, or My Profile

6. **Deleted Routes Test**:
   - Try accessing /users, /profile, /audit-logs, /forgot-password
   ✅ Expect: All return 404 page

7. **Residents Module Test**:
   - Navigate to /residents
   ✅ Expect: List of 15 seeded residents, search/filter works, pagination works

8. **Database Schema Check**:
   - Verify no 'users' table exists, only 'staff_users' table
   - Verify 'resident_activities' table has 'user_id' column referencing 'staff_users.id'
   ✅ Expect: Correct schema

---

## Summary of Changes

| Category | Count | Details |
|----------|-------|---------|
| Files Deleted | 20 | All User/Profile/Role/Permission/AuditLog models, controllers, views |
| Files Created | 1 | StaffUser.js |
| Files Updated | 15 | Models, middleware, controllers, routes, views, setup, index |
| Models Kept Intact | 3 | Barangay.js, Resident.js, ResidentActivity.js |
| Controllers Kept Intact | 3 | barangayController, reportController, residentActivityController |
| Views Kept Intact | 6 | residents.xian, residents-add.xian, residents-edit.xian, residents-profile.xian, residents-print.xian, barangays.xian, reports.xian, resident-activities.xian |

---

## Implementation Notes

- **No breaking changes to resident/barangay functionality**: All resident CRUD, reporting, filtering, and barangay operations continue to work.
- **Simplified authentication**: One authentication layer, no role/permission complexity.
- **Audit trail preserved**: ResidentActivity still tracks who did what to each resident record.
- **Database compatibility**: MySQL localhost:3306, database SmartCivi, user root, no password.
- **Credentials security**: Demo credentials only logged to console during setup, never displayed in views.
- **Framework preserved**: XianFire (Express + Handlebars), ESM modules, Sequelize ORM, all remain unchanged.

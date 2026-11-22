# SmartCivi workspace design

The user requested VitalMatch as the visual reference on 12 November 2026. SmartCivi retains its name, full system title, Bongabong office context, green brand and existing role-based workflows.

## Reference and implementation

VitalMatch's local UI_DESIGN_SYSTEM.md, public/css/internal.css, typography.css and shared account sidebar/header supplied the reference: a 232px sidebar, 66px header, Inter typography, neutral working surfaces, 4px controls, compact summaries, semantic status labels and a responsive drawer. Its blood-service colors, copy, data and features are not part of SmartCivi.

SmartCivi's adaptation is implemented in public/workspace.css, the shared staffNav/officeNavLinks/navIcon/roleLabel partials, workspace-icons.svg and public/platform.js. Existing platform.css remains the base for record, form, table and retained citizen workflows. Native office views use local styles; legacy utility-based screens still receive the utilities they need.

## Foundations

- Local Inter variable font, regular through bold, with its original SIL Open Font License under public/fonts.
- Brand green #1f593e, hover #173b2b; ink #252b2d; supporting text #596367; page #f5f6f3; white working surfaces; separators #dce0df.
- Page titles 25–28px, section headings 17px, body 15px, controls 14px and table content 13px. Mobile form inputs are 16px.
- Desktop sidebar 232px, header 66px, content maximum 1240px and gutters 16–36px. Navigation groups follow existing role permissions.
- Neutral secondary actions; a strong green primary action per task; restrained 4px corners. Status labels retain text and add amber pending, blue processing, green successful and red rejected/cancelled states.
- Dashboard totals use a compact neutral summary row. Existing live values are retained; no illustrative charts or invented metrics are introduced.

## Responsive interaction

Below 1024px, enhanced navigation uses a drawer with a backdrop, isolated/inert background, focus loop, close control, Escape handling, restored focus and scroll locking. Desktop resizing clears drawer-only state. Native menu disclosure remains available without JavaScript. Sidebar links scroll independently while the brand, account and sign-out remain available.

Forms retain names, required fields, server validation and CSRF behavior. Tables scroll within their own keyboard-accessible region. Keyboard focus is visible; reduced-motion preferences suppress transitions. A real header search submits to existing role-appropriate resident, resource or citizen-request search pages.

## Verification

Automated unit/HTTP checks cover permissions and the rendered shell. scripts/visual-check.mjs covers office screens at 1440/1024/768/390px, citizen desktop/mobile screens, drawer open/close/focus/backdrop/resize behavior, templates, form submission and appointment dates. Screenshots under ignored tmp/visual-check are local QA fixtures, not real resident records.

The hamburger also controls desktop sidebar visibility. The desktop preference persists across pages using local storage; mobile opening stays temporary and independent. Signed-in Services, the office directory and confirmation pages use this same shared shell.

Pages with main content include a compact Back link above the page title. It uses browser history for a previous SmartCivi page, excluding sign-in, sign-out and verification routes. Direct visits fall back to the current role's dashboard, or Home when signed out. The link works without JavaScript, is hidden when printing, and becomes inert with the background while the mobile navigation drawer is open.

## Services directory

The Services directory uses two balanced columns of compact service entries, with icons beside the content, shorter spacing and a single column on phones. Its public header aligns with the content and identifies the Municipality of Bongabong. All eight existing destinations, client-side search and empty-state feedback remain available.

## Admin and citizen consistency

The November 16 refinement brings transaction headings inside main content, places Back navigation consistently above them, and adds the common office footer. Shared rules normalize toolbars, forms, record actions, status badges, tables, disclosures, notifications and processing timelines. User management has a searchable, paginated account directory, with account creation and role guidance in native disclosures. Payment history uses a compact live summary, pressed-state filters and a native dialog with keyboard dismissal. Request review selects the existing processing status. Account and transaction timestamps use Philippine time.

Legacy form utilities are compiled into public/utilities.css with Tailwind 3; pages no longer download a browser styling compiler. Run npm run build:css after changing utility classes. npm run xian runs this build automatically before starting. The compiled stylesheet is committed and copied into the Docker image, so production does not require the development compiler. Native workspace views continue to use the existing local platform.css and workspace.css. Payment screens remain demonstrations and identify unavailable gateway/bank configuration without showing placeholder account details.

The browser verification now covers 18 office screens at desktop/tablet/phone widths and 16 citizen screens at desktop/phone widths using populated disposable fixtures, including request details, confirmation, attachments, payment pages, payment filters and the payment-details dialog. Existing account roles, requests, records, resource operations and authentication are retained.

## Sign-in page

The login page uses local styles and Inter, a plain neutral background, an open service introduction and a compact white form. On phones, the form appears first. Labels, autocomplete, CSRF fields, account links and authentication endpoints remain in place. An accessible show/hide password control changes only local field visibility. Browser checks cover desktop/tablet/phone layout, password visibility, failed-login alerts and successful sign-in.

Registration now shares that layout. Google sign-in appears before the email form; unavailable providers are disabled with a short explanation. New email accounts continue to a matching verification screen with a resend action. Email links show an explicit confirmation button before consuming the token. Existing accounts connect Google from My profile. The authentication browser check at scripts/auth-visual-check.mjs covers desktop/tablet/phone layouts, registration, email confirmation, sign-in and provider-unavailable states using simulated providers. Provider setup is documented in docs/AUTH_SETUP.md.

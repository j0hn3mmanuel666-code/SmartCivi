# SmartCivi UI refinement

Verified locally on 11 November 2026. Existing branding, permissions and workflows are preserved.

- Shared desktop navigation groups administrator tools; mobile navigation uses a native disclosure with keyboard support, Escape handling and outside-click dismissal.
- The citizen dashboard separates document requests from appointment booking and makes tracking, payments and notifications easier to find.
- Retained request, appointment, tracking, payment, record and attachment screens use the common navigation. Forms have associated labels, proper page headings, consistent touch targets and responsive name fields. Radio inputs retain their native dimensions.
- Tables expose horizontal scrolling to keyboard users and show a scrolling hint only when needed.
- Native office templates and the citizen dashboard opt out of the external Tailwind browser compiler. Legacy utility-based pages continue to load the styles they require.

Measured in Edge at 390px: administrator header height decreased from 237px to 86px. Dashboard script requests decreased from two to one by eliminating the compiler request. These are structural measurements, not a production speed or Core Web Vitals claim.

Validation: 21 automated unit/HTTP checks passed (the unchanged legacy migration test is run separately and skipped by this suite). Browser checks covered 10 office and 7 citizen screens at 1440px and 390px, menu interactions, template compilation, real form submission and Asia/Manila calendar dates. No page overflow or JavaScript errors were found. The design detector reported no findings.

## VitalMatch reference adaptation on 12 November 2026

The later UI request replaces the previous horizontal navigation with a 232px desktop sidebar and a 66px compact header based on VitalMatch's local workspace patterns. It includes local Inter typography and its license, neutral dashboard summaries and panels, consistent field/table/button sizing, icon navigation, real header search and semantic status colors. SmartCivi's green identity, office context, routes and permissions remain intact. See DESIGN.md for the current design authority.

Mobile navigation is now an enhanced drawer with a focus loop, inert background, backdrop, scroll lock, Escape handling and restored focus; a native disclosure remains the no-JavaScript fallback. Earlier header measurements in this document describe the prior refinement, not the current shell. Current workspace headers are 66px at desktop and phone widths.
The design detector flags Inter as a common typeface. It is deliberately retained because the user explicitly requested VitalMatch, whose established workspace font is Inter; its original license is included.

## Consistent Services navigation

The signed-in Services page, office directory and request confirmation now use the same sidebar/header partial as Dashboard. Services uses native workspace styles and retains all eight service links and live filtering. The desktop hamburger collapses or expands the sidebar and stores that preference locally; mobile drawer state remains independent. Browser regression checks now visit Services as well as Dashboard, check the shared shell, exercise service filtering and verify the desktop preference survives navigation. All 21 automated checks passed; the separate legacy migration test is unchanged and skipped in this run.

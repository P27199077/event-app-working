# PinPoint

A zoomable campus event map prototype for BITS Hyderabad. Includes event posting, category filters, a local Interested shortlist, reporting, street/satellite views, and an optional classroom layer.

## Run locally

Requires Python 3. From this repository:

```sh
python3 -m http.server 3017 --bind 127.0.0.1
```

Open http://127.0.0.1:3017 in a WebGL-capable browser. There is no build step. With Node.js installed, `npm start` runs the same server.

## Structure

- `index.html`: page markup and dialogs.
- `src/app.js`: event rendering, UI state, and form interactions.
- `src/data/`: campus geometry, sample events, and browser persistence/migrations.
- `src/map/`: map initialization and basemap styling.
- `src/utils.js`: coordinates, dates, escaping, and link validation.
- `src/styles/app.css`: consolidated application styles, in cascade order.
- `public/`: runtime map data, bundled MapLibre, and font assets.
- `reference/`: original map references retained for future campus-map edits; not loaded by the app.
- `tests/`: unit checks and a browser interaction regression test.

Source files are served directly. The former `dist/` folder was the only source, not generated output. It has been replaced with the folders above. Keep the repository root as the server/hosting directory so asset paths resolve.

## Development checks

Requires Node.js and npm:

```sh
npm ci
npm test
npm run format:check
npm run test:reports-db
npm run test:browser
```

Browser tests default to Google Chrome at its standard macOS path. Set `CHROME_PATH` to a compatible Chromium executable on another system. Tests start their own server on port 3017; stop an existing preview first.

The automated browser runner could not launch Chrome in the restricted development environment. The app was opened separately in the in-app browser and its map and six sample pins loaded. Full interaction and visual regression checks remain pending; see `CLEANUP.md` for details.

## Prototype limits

Published events and event requests use Supabase. Interest selections and recent private request links remain in browser storage. Shared reporting is implemented and requires the new `supabase/event-reports.sql` migration before use. Old local-only reports are not uploaded automatically. Changing host or port uses separate browser storage.

Classroom pins start hidden on each page load. Use the map-key switch or classroom filter to enable them. Availability is user-reported, with no timetable integration or occupancy detection. Demo activities and room details are illustrative.

## Map data and dependencies

Campus basemap data is derived from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) under ODbL 1.0. Boundary geometry is maintained once in `src/data/campus-boundary.js`. Original road and boundary references remain in `reference/`.

MapLibre GL JS and its license are bundled in `public/vendor/`; font attribution is in `public/fonts/NOTICE.txt`. Optional satellite imagery uses Esri World Imagery and requires internet access. Application code does not require a package download to run. npm dependencies are development tools only.

## Live events and interest

Explore and Interested show only events where the start time has arrived and the end time has not. My events also includes the current browser’s upcoming posts. Interest is private to this browser; no student login is required. Event boundaries refresh automatically, including when returning to the tab. The internal `rsvps` array is retained for compatibility with existing saved selections.

## Prepared shared backend

Supabase shared mode is enabled after the schema was applied successfully. Organizer Auth redirects and authenticated end-to-end checks are still pending. Follow `supabase/README.md`. The publishable project credentials are in `src/config.js`; no privileged key is used. The shared feed starts empty; demo posts remain in separate browser storage.

## Placing exact venue locations

After signing in with an approved reviewer account, choose **Set venue pins**. Select each room, choose **Place on map**, zoom and click, then **Save location**. Drafts persist only in that browser and do not modify the public venue definitions or existing event pins. Download the JSON and provide it for applying reviewed coordinates to `src/data/venues.js`.

The setup button is hidden for visitors. Opening, placing, and exporting also check reviewer state. There is no public API that changes the official venue catalog; official coordinates remain part of the deployed source. Auditorium, LTC Lobby, and F101–F106 now use the eight exact campus-owner locations imported on 22 October 2026. Existing event records keep their stored coordinates; new events use the confirmed defaults. Different events may share a venue and overlapping times. Nearby event markers group at low zoom and separate at high zoom, with visual offsets for identical coordinates.

## Organizer password sign-in

The organizer dialog supports both email/password and email links. Email is the login ID. After signing in using an email link once, approved reviewers can choose **Set / change password**. Forgot password sends a recovery link and the app opens the new-password form when Supabase emits PASSWORD_RECOVERY. Passwords are sent only to Supabase Auth and are never stored by application code in browser storage or event records. Organizer privileges continue to be enforced by the existing database approval check.

UI method switching and existing unit checks have been verified. Creating a real password, signing in with it, and completing a recovery link require the account owner's testing; no account credentials were entered or changed by the assistant.

## Appearance

The header toggle switches between light and dark mode, including the street-map palette. The preference is stored separately as `pinpoint-theme`, applied before the page paints, and synced across open tabs. Light mode remains the default on a new browser. Satellite imagery keeps its original colors. Theme changes recolor existing map layers without replacing map data or event pins.

## Owner management and private request tracking

The owner editor, event archive, and private request-status UI are implemented. The user confirmed successful application of the combined owner/tracking upgrade on 22 October 2026. It provisions the two existing approved accounts as owners; the repository migrations omit personal addresses.

Owners can manage events created by every reviewer, edit existing details and map points, cancel events, and restore cancelled events whose end time has not passed. Edits preserve the event ID, original creator and current status. A revision check prevents silently overwriting a more recent edit. Reviewers retain publishing, request review and own-event cancellation; existing event details can only be edited by owners. Public visibility remains live-only.

New public requests receive a random private tracking capability. The token stays in the URL fragment and browser storage; the database stores its SHA-256 hash. The status function returns one matching request's title, review status, rejection reason and timestamps, without exposing client/reviewer IDs or the queue. Treat the complete private link as access to that request. Rejection reasons are required and visible to the submitter. Older requests without a token do not acquire a tracking link automatically. Recent links may be removed from this browser without deleting the database request or invalidating another copy of the link.

Phone screens use a compact 30px heading and a smaller decorative mark; the redundant hero footer is hidden below 760px. Desktop layout is unchanged.

Verification: unit tests cover owner filtering, revision/error mapping, tracking URL validation and status copy. UI checks use isolated sample backends and never mutate production events. SQL and PL/pgSQL syntax were also checked with the PostgreSQL parser. Read-only live checks passed for public event reads, denied anonymous request reads and owner/review mutations, invalid tracking tokens and invalid submissions. Authenticated end-to-end and multi-session concurrency checks remain pending.

## Private event reporting

Apply `supabase/event-reports.sql` after the existing setup and owner migrations, then reload. This reporting migration has not yet been applied to the live project. Visitors can report a live event with a reason and up to 500 characters of details, without signing in. Confirmation appears only after the server accepts the report. Reports do not automatically hide events.

Only owners can open **Review reports**. The queue supports editing the event, resolving or dismissing a report, and cancelling an event while resolving its open reports in one transaction. Cancellation can be reversed in Manage all events. Optional review notes stay private. Reports retain their title snapshot if an event is deleted. Switching accounts clears the private queue from the screen.

The server prevents repeat open reports for the same event/browser, limits five reports per browser per ten minutes, and caps global traffic and open reports. Browser identity can be reset, so these are best-effort abuse limits. Public table reads and direct client writes are denied.

Verification: 21 unit tests and seven database scenarios passed. Database scenarios run the actual report migration and owner functions in local PostgreSQL through PGlite, covering permissions, duplicates, validation, limits, stale revisions, cancellation, restoration and history. Sample-browser checks covered visitor submission, owner-only queue visibility and cancellation with resolved history. These checks do not certify the unapplied live migration or multi-session races.

## Vercel deployment from GitHub

Import the GitHub repository into Vercel with the repository root as the root directory and framework preset Other. The checked-in `vercel.json` runs `node scripts/build-site.js` and serves only `site/`, which contains the runtime HTML, source modules and public assets. Dependencies are already bundled, so deployment skips package installation. SQL migrations, tests, reference images and local previews are excluded from the public site.

Push changes to the connected production branch (`main`) to redeploy automatically. Database migrations still need to be applied separately in Supabase; deployments do not change the database. Add the final HTTPS Vercel address to Supabase Auth URL Configuration for organizer email links and password recovery.

## Browse events at a chosen time

The map opens in live mode on every page load. Its **Now** control opens a date/time chooser. A selected time uses IST, keeps the preview fixed while the real clock moves, and shows only approved events with `start <= selected time < end`. **Back to live now** restores the moving current-time feed. Search, categories, Interested and map groups use the selected time too; My events includes upcoming own events only in live mode.

`supabase/event-time-view.sql` adds a paginated read-only function for approved events active at the chosen instant. The existing direct table policy is unchanged. Cancelled events and private requests are excluded; creator IDs are returned only to the matching signed-in user. The user confirmed application on 22 October 2026; live anonymous chosen-time reads returned 200 and invalid input was rejected.

Event creation and editing now explicitly interpret inputs as IST on every device. Schedule entries can be entered before the fest and remain editable in owner management. No event dates are baked into application code. Run `npm run test:time-db` for the real SQL boundary and permission scenarios.

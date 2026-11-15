# PinPoint

**Campus event discovery and navigation for BITS Hyderabad.**

[Live app](https://pinpoint-nu-three.vercel.app/)

I built PinPoint independently and released it before ATMOS. Attendees used the map to find and navigate to events throughout the day. The longer-term goal is a shared campus event map that remains useful beyond the fest.

## Why I built it

Knowing an event exists is only part of the problem: students also need to know where it is and whether it is happening now. PinPoint brings venue details, event times, and discovery into one campus map.

Public submissions go through an approval queue. I chose this workflow to limit spam while allowing students to suggest events; submitting a request does not publish a pin immediately.

## Features

- Zoomable campus map with category filters, venue details, and street/satellite views.
- Time-aware pins: events become visible 15 minutes before their start and disappear when they end.
- A chosen-time view for previewing events, alongside the live view.
- Public event requests with reviewer approval or rejection.
- Owner event editing, cancellation, restoration, and revision checks.
- An Interested shortlist saved privately in the current browser.
- Light/dark themes and an optional user-reported empty-classroom layer.

Event reporting and the complete upcoming-event schedule have corresponding SQL migrations. Their availability on a deployment depends on those migrations being applied.

## Stack and architecture

| Layer | Implementation |
| --- | --- |
| Interface | HTML, CSS, JavaScript modules |
| Map | MapLibre GL JS; campus geometry derived from OpenStreetMap |
| Shared data | Supabase PostgreSQL and database functions |
| Organizer sign-in | Supabase Auth |
| Browser state | Interest selections, theme preferences, drafts, and recent request links |
| Hosting | Static frontend on Vercel |

Visitors can browse without an account. Published events and submission requests use the shared backend; organizer/reviewer permissions are enforced by database rules. Owner edits include revision checks to detect stale updates.

The request-status flow uses a private tracking link. Treat that link as access to the request's status; do not post it publicly.

## Run locally

Requires Git, Python 3, and a WebGL-capable browser.

```sh
git clone https://github.com/P27199077/event-app-working.git
cd event-app-working
python3 -m http.server 3017 --bind 127.0.0.1
```

Open **http://127.0.0.1:3017/**. Runtime libraries are bundled, so serving the existing frontend does not require an npm install.

**The checked-in configuration points to the existing shared backend.** Use a separate Supabase project and update `src/config.js` before testing writes. Starting a local web server does not create an isolated database.

For a separate backend, follow [shared-event setup](supabase/README.md). Configure its schema, approved organizer accounts, and Auth redirect URLs. Never place a service-role key in frontend code.

## Development checks

Install Node.js and npm, then:

```sh
npm ci
npm test
npm run format:check
npm run test:reports-db
npm run test:time-db
npm run test:browser
```

- Unit tests exercise event records, visibility, map labels, requests, and owner-management helpers.
- Database tests exercise SQL behavior through PGlite.
- Browser tests use the executable configured in `playwright.config.js`; set `CHROME_PATH` if needed. They start a server on port 3017.

Test commands are provided for reproducibility; their presence does not certify the deployed backend. Previously recorded authenticated, multi-session, and full browser checks remain incomplete. See [operational notes](docs/OPERATIONS.md) for feature-specific details.

## Repository map

- `index.html`: application markup and dialogs.
- `src/app.js`: interface orchestration.
- `src/data/`: event records, shared-data access, venue geometry, and browser storage.
- `src/map/`: map styles, markers, and label layout.
- `src/review-queue.js`, `src/event-management.js`: review and owner workflows.
- `supabase/`: schema, feature migrations, and backend setup.
- `tests/`: unit, database, and browser checks.
- `scripts/build-site.js`: copies runtime assets into `site/` for hosting.

## Deployment and limitations

The checked-in `vercel.json` builds the static site with `node scripts/build-site.js` and serves `site/`. Database migrations are applied separately; a frontend deployment does not update the schema.

- ATMOS navigation use is confirmed by the developer; analytics were not enabled, so no user count is claimed.
- The Interested shortlist is browser-local, not a cross-device RSVP or attendance count.
- Classroom availability is user-reported, not occupancy detection or timetable integration.
- Browser-ID submission limits are best-effort controls; the approval queue does not eliminate all abuse.
- Sample event locations and room details are illustrative. An empty live feed is possible outside scheduled activities.
- The prior setup notes mark reporting and upcoming-schedule rollout as requiring migration work. Check the target database rather than assuming every feature is live.

## Attribution

Campus map data is derived from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) under ODbL. MapLibre and other bundled dependencies retain their license notices in `public/vendor/`; font attribution is in `public/fonts/NOTICE.txt`. Optional satellite imagery uses Esri World Imagery.

See [operational notes](docs/OPERATIONS.md) for venue setup, draft imports, tracking links, and recorded verification limitations.

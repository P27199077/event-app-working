# PinPoint operational notes

This guide describes the checked-in implementation. It does not establish which migrations are currently applied to a hosted database.

## Backend setup and rollout

Follow [the backend guide](../supabase/README.md) for SQL setup, approved organizer accounts, and authentication. The base schema is in [setup.sql](../supabase/setup.sql); additional files implement requests, owner management, tracking, reporting, chosen-time views, and upcoming schedules.

The checked-in config enables shared events and public requests. When creating a separate environment, configure and verify its backend before enabling those paths.

Earlier development notes recorded the base/request/owner/tracking/chosen-time setup as applied, but reporting and the upcoming-schedule migration as requiring rollout. Those are historical notes, not a live database audit.

A frontend deployment does not apply SQL. Review feature dependencies before applying migrations, and verify permissions with disposable accounts.

## Review and owner workflows

Public submissions create private requests. Approval creates a published event; rejection retains the request privately with its reason. Approval is required before public visibility.

Reviewers can publish, review requests, and cancel their own events. Owners can edit, cancel, and restore events across reviewers, subject to event status/time constraints. Revision checks reject stale edits.

Request limits use a browser identifier that can be reset. They provide best-effort throttling, not verified identity or a complete anti-bot system. The host/club field is self-reported.

## Venue locations and drafts

- Public venue coordinates are maintained in `src/data/venues.js`.
- Approved reviewers can prepare venue pins through the setup interface. Draft locations stay in that browser; exporting a JSON file does not itself alter the deployed catalog.
- Organizer forms reuse room locations from the account's previous events. Room variants such as `g102` and `G-102` are normalized.
- Manual map selections and stored event coordinates are retained.
- ATMOS schedule drafts merge by stable source ID. Importing a draft does not publish it automatically.
- Nearby markers group at low zoom; visual offsets do not change saved coordinates.

## Time and visibility

Event inputs and displays use IST. Live pins include the 15-minute arrival window and expire at the event's end. Chosen-time preview holds the selected instant fixed; returning to live restores the real clock.

The upcoming schedule depends on its read function/migration. Until configured, fallback reads may provide incomplete upcoming/early visibility. Classroom pins are optional and user-reported.

## Private tracking and reports

New event requests can receive a private status link. The capability token stays in the URL fragment and browser storage; its hash is stored in the backend. Do not share a complete tracking link publicly.

The reporting implementation requires [event-reports.sql](../supabase/event-reports.sql). A report does not automatically hide an event. Owners can review reports and resolve them alongside cancellation; reported title snapshots are retained for history.

The reporting code includes duplicate checks and browser/global limits. These are application controls, not a guarantee against determined abuse.

## Authentication

Organizer sign-in supports password and email-link flows. Recovery redirects must return to an allowed application origin. Configure a sender appropriate for organizer email delivery. No privileged database key belongs in `src/config.js`.

Creating an account does not itself grant reviewer or owner privileges; backend approval determines those rights.

## Verification boundaries

The repository includes unit, PGlite database, and Playwright browser tests. Database tests exercise actual SQL in a local test engine; they do not prove a hosted migration is installed.

Earlier notes leave authenticated end-to-end, multi-session concurrency, and full automated browser verification pending. Re-run applicable checks in the intended test environment rather than treating those notes as a current pass.

The [backend guide](../supabase/README.md) and [cleanup notes](../CLEANUP.md) retain more implementation context.

## Data and dependency attribution

Retain the OpenStreetMap ODbL attribution, MapLibre/dependency notices under `public/vendor/`, and font notice under `public/fonts/NOTICE.txt`. Optional satellite imagery is supplied by Esri World Imagery.

# Shared events setup

The Supabase URL and publishable key are configured in `src/config.js`. Shared mode is enabled after the database setup succeeded; email redirect configuration still needs confirmation. No demo posts are automatically uploaded.

## Apply the schema

Run the supplied `pinpoint-database-setup.sql` deliverable in Supabase SQL Editor. It contains this repository's schema plus the two approved organizer emails. The repository version of `setup.sql` omits personal email addresses; running that version alone requires inserting the approved emails into `private.organizer_emails` as the database owner.

This creates the events table, row-level security, an organizer-check function, campus location validation, and a duplicate exclusion constraint. There are no destructive data operations. The supplied setup script was applied successfully, and anonymous event reads return HTTP 200. Authenticated permissions and concurrent duplicate checks still need live validation.

## Configure email sign-in

In Authentication > URL Configuration:

- Site URL for local testing: `http://127.0.0.1:3017/`
- Allowed redirect URLs: `http://127.0.0.1:3017/` and `http://localhost:3017/`
- Add the final HTTPS site address when deployed.

Keep email confirmation enabled. Approved organizers sign in using an email link; do not share database passwords or service-role keys. Email self-signup does not grant event posting rights: only confirmed users whose emails are approved can write events.

Supabase's default email sender only delivers to project organization members and has low rate limits. Configure custom SMTP before using this with organizers outside that team; do not grant dashboard access simply to deliver login emails. See https://supabase.com/docs/guides/auth/auth-smtp.

## Enable and verify

After schema setup and redirects are confirmed, set `SHARED_EVENTS_ENABLED` to `true` in `src/config.js`. Reload the app. The shared feed starts empty and demo events remain in separate browser storage. Students can browse and keep private interest selections without login. Shared events refresh every 15 seconds and when returning to the tab.

Required live checks before launch:

1. Anonymous visitor sees live events and cannot insert/update events.
2. Approved organizer can publish, see upcoming own events, and cancel own events.
3. A non-owner reviewer cannot edit event details, and cannot cancel another reviewer's events. An explicitly approved owner can edit/cancel/restore events across accounts after the owner migration.
4. Duplicate title/venue with overlapping times is rejected, including simultaneous attempts.
5. A later non-overlapping session and a different title at the same venue are accepted.
6. An event created on one device becomes visible on another while live.
7. Both organizer emails receive sign-in links through the configured sender.

## Duplicate rule and remaining scope

Titles, areas, and room names ignore case, punctuation, and spaces for duplicate matching. Both the normalized title and normalized area/room must match, with overlapping start/end times. Adjacent sessions are allowed. Coordinates must lie in the campus polygon.

Different spellings or venue aliases (for example Auditorium vs Main Hall) are not fuzzy-matched. A canonical venue catalog would make this stricter. This rule does not prevent different events at the same location.

Shared report moderation is implemented and awaits the reporting migration below. Interest is not sent to the server. There is no public attendee count.

The bundled Supabase SDK is rebuilt with `npm run build:vendor` after dependency updates. The app itself still needs no build step. Its public key is intentionally browser-visible; RLS enforces data access.

## Public event requests and review

Apply `event-requests.sql` after the existing setup, then set `PUBLIC_REQUESTS_ENABLED` to `true` in `src/config.js`.

Visitors can fill out the event form and choose a pin without signing in. Submission goes to a private request table through a restricted function. The browser supplies a persistent random ID for best-effort submission limits, not verified identity. Requests are not added to the public event feed or anyone's Interested list.

The two already-approved accounts act as reviewers. Sign in, choose Review event requests, inspect the details, and Approve or Reject. Approval creates the published event and marks the request approved in one transaction. Approved future events appear only when live. A reviewer cannot accidentally approve the same request twice; row locks and database duplicate constraints protect simultaneous reviews. Rejected requests stay private.

The queue has a 500-pending-request cap, a five-pending-request cap per browser ID, and a two-per-minute limit per browser ID. Browser IDs can be reset or forged; these are not strong anti-bot controls. Add verified identity or server-validated CAPTCHA/rate limiting before exposing submissions broadly during the fest. The host/club field is self-reported, not a verified identity.

The event-request migration was applied successfully and public requests are enabled. Live API checks confirm public event reads work, anonymous request-table reads are denied, anonymous approval is denied, and null submissions are rejected. A complete valid submission and authenticated approve/reject flow, concurrent reviews, and duplicate checks still need live testing. Personal contact details and student IDs are not collected for interest or requests.

## Owner and tracking upgrade (applied)

Apply `owner-management.sql`, provision the intended emails in `private.owner_emails`, then apply `request-tracking.sql`. The combined `pinpoint-owner-and-tracking-upgrade.sql` deliverable performs these steps in one transaction and includes the two approved owner addresses. Reload the app afterward. Do not re-run the earlier event-request migration after this upgrade: it grants the older two-argument review endpoint again. If it is re-run, apply `request-tracking.sql` again to restore the required-reason wrapper permissions.

The owner migration adds `is_owner()`, a revision counter and owner-only edit/status functions. Existing events, request history, event IDs and creator IDs are retained. Direct authenticated column updates are reduced to status changes under the existing own-event RLS policy; owner detail edits go through an explicit field whitelist and revision check. Public RLS remains live-only, with full archive access only for owners.

Tracking uses 32 random bytes rendered as hex, carried in a URL fragment. PostgreSQL's built-in `sha256(bytea)` stores a token hash; no extension is required for hashing (see https://www.postgresql.org/docs/current/functions-binarystring.html). Status lookup needs both the request UUID and correct token. It does not rely on browser IDs for access. Invalid tokens and unknown requests return the same null response. The request table remains private. Reasons are stored atomically with review; direct client access to the earlier review function is revoked.

After applying, verify against the live database:

- Anonymous and non-owner accounts cannot invoke owner edits/status changes or read cancelled events. The schedule RPC intentionally exposes approved upcoming event details; other organizers' IDs and private requests remain hidden.
- Both intended owner accounts can edit an event created by the other, preserving ID/creator/status and interest selections.
- Invalid locations/times and overlapping duplicates are rejected on edit or restore. Older revisions return a conflict after a newer edit or cancellation.
- A new anonymous submission has a private link that works on another browser. An incorrect token or UUID does not reveal its title or status.
- Rejection without a reason fails, approval/rejection updates tracking, and cancelled published events are identified as cancelled on the approved request.
- Existing requests without a tracking token remain available for reviewer moderation but have no automatically generated private link.

The user confirmed successful application of the combined upgrade on 22 October 2026. Eight read-only live API checks passed: public event reads; denied anonymous request reads; owner check false for visitors; incorrect tracking token returns null; anonymous owner edit/status and review denied; invalid submission rejected. Authenticated end-to-end and multi-session checks above remain pending. UI validation used an isolated sample backend.

## Event reporting upgrade (pending application)

Apply `event-reports.sql` in a new SQL Editor query after the migrations above, or use the identical `pinpoint-event-reports-upgrade.sql` deliverable. Existing events and requests are retained. Reload afterward. No new project key or account setup is needed.

Visitors submit reports through `submit_event_report`; they cannot read the report table. Only owners can read the queue or call `review_event_report`. Reasons and details are validated, repeat open reports are deduplicated, and server limits constrain browser and global traffic. Browser IDs are hashed for storage and are not verified identities. Old local reports are not migrated.

Review actions resolve or dismiss reports without changing the event, or cancel the event and resolve all its open reports atomically. Cancellation uses the owner function with revision protection and can be reversed in owner management. Reports never automatically remove public events.

`npm run test:reports-db` runs seven scenarios using the actual reporting migration and owner functions in local PostgreSQL via PGlite. They passed, along with 21 unit tests. Browser checks used isolated sample data for visitor submission, owner access and cancellation/history. After applying, verify live anonymous table access and review are denied, then test a report from a visitor browser and review it with the owner account. No reporting migration or authenticated reporting flow has yet been verified against the live project.

## Selected-time browsing (applied)

The user confirmed `event-time-view.sql` applied successfully on 22 October 2026. A live anonymous future-time request succeeded, and null viewing time was rejected with `22023`. The function returns approved events active at the selected instant, including future or past scheduled times, without changing direct table RLS or exposing private request records. Pagination is bounded to 500 per call. Other organizers' IDs are omitted. Live mode retains the existing feed.

Local PostgreSQL tests cover overlapping events, inclusive starts/exclusive ends, pagination, equivalent timezone representations, invalid input, hidden cancelled events, private request-table denial and blocked direct writes. These do not replace testing a real populated fest schedule.

## Upcoming schedule and 15-minute early pins (application pending)

Run `upcoming-events.sql` once in SQL Editor. It only creates/replaces a read function and its execute grants. It does not update or delete events, pins, requests, reports or browser drafts. Running it again preserves the same data. `event_schedule(from_time,page_size,page_offset)` returns published, non-ended events ordered by start then ID, with at most 500 per page. It rejects non-finite times, invalid page sizes and negative offsets. Other organizers' IDs are omitted. The direct table policy remains unchanged, and private requests stay inaccessible. The app filters map pins to 15 minutes before start through the end; the Upcoming list keeps all future approved events.

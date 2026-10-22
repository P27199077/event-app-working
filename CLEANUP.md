# Repository cleanup

## Changes

- Replaced the source-only `dist/` directory with a root entry page, `src/`, and `public/`.
- Split campus configuration, demo events, persistence, map initialization, and shared helpers into ES modules.
- Formatted application HTML, CSS, and JavaScript for editing.
- Consolidated stylesheets and removed 299 overridden declarations and obsolete rules, including old Tech/Social/Sports category styles.
- Removed duplicate boundary GeoJSON after verifying it exactly matched the JavaScript geometry. The canonical geometry is `src/data/campus-boundary.js`.
- Moved unused reference imagery and map traces to `reference/` for future map work.
- Retained bundled map/font assets and attribution notices.
- Kept the browser storage key and added recovery for missing RSVP/report arrays and invalid stored records.
- Added date validity checks before converting submitted dates.
- Added development scripts, a lockfile, ignore rules, and tests.

## Validation

- Three unit tests pass: campus boundary validation, safe links/HTML escaping, and browser-state recovery/persistence.
- Formatting and JavaScript syntax checks pass.
- In-app browser inspection confirmed the campus map, six sample activities, and six map pins loaded.
- Automated browser testing could not launch Chrome in this restricted environment. The saved interaction test has not passed here.
- The in-app browser connection ended before posting/RSVP/cancellation checks and an equal-viewport stylesheet comparison could finish. These remain pending.

## Current scope

This remains a static prototype using localStorage. No shared database, authentication, or production backend has been added. All changes are local and uncommitted; the remote repository has not been updated.

The local server now serves the repository root, rather than `dist/`. Any external hosting configuration that explicitly serves `dist/` must be updated before deploying this structure.

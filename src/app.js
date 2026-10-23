import {
  createEventClock,
  istInput,
  parseIstInput,
  activeAt,
} from "./event-clock.js";
import { createEventReporting } from "./event-reports.js";
import { initializeThemeToggle } from "./theme.js";
import { createOrganizerAuth } from "./organizer-auth.js";
import { createVenueSetup } from "./venue-setup.js?places=2";
import { renderEventPins } from "./map/event-pins.js?labels=1";
import { countdown, locationLabel } from "./event-presentation.js";
import { SAVED_VENUES, savedVenue } from "./data/venues.js";
import {
  createRequestTracker,
  newTrackingToken,
} from "./request-tracking.js?tracking=2";
import { createEventManager } from "./event-management.js";
import { createScheduleDrafts } from "./schedule-drafts.js";
import { createReviewQueue } from "./review-queue.js?requests=2";
import { SHARED_EVENTS_ENABLED, PUBLIC_REQUESTS_ENABLED } from "./config.js";
import {
  visibleAtTime,
  pinVisibleAt,
  upcomingEvents,
  PIN_LEAD_MS,
} from "./data/event-visibility.js";
import { areas } from "./data/campus.js";
import { H } from "./data/events.js";
import { loadState, persistState } from "./data/storage.js";
import { esc, safeLink, inside, ongoing, date } from "./utils.js";
import { createCampusMap, fit } from "./map/map.js?places=12";
import { CAMPUS_STREET_STYLE } from "./map/street-style.js";
const $ = (selector) => document.querySelector(selector);
initializeThemeToggle();
const pageHeader = document.querySelector("body > header");
const sizeHeader = () =>
  document.documentElement.style.setProperty(
    "--header-height",
    `${pageHeader.getBoundingClientRect().height}px`,
  );
sizeHeader();
new ResizeObserver(sizeHeader).observe(pageHeader);
$("#browseEvents").onclick = () =>
  $(".search").scrollIntoView({ behavior: "smooth", block: "start" });
let storage;
try {
  storage = localStorage;
} catch {}
const state = loadState(storage);
// Keep local demo posts separate from the shared event feed.
if (SHARED_EVENTS_ENABLED) {
  state.events = [];
  try {
    state.rsvps = JSON.parse(storage?.getItem("pinpoint-interest-v1") || "[]");
  } catch {
    state.rsvps = [];
  }
  if (!Array.isArray(state.rsvps)) state.rsvps = [];
}
let authUi, venueSetup, reviewQueue, eventManager, requestId, browserId;
let editingEvent = null,
  scheduleDraft = null,
  requestToken;
try {
  browserId = storage?.getItem("pinpoint-request-browser");
} catch {}
if (!browserId) {
  browserId = crypto.randomUUID();
  try {
    storage?.setItem("pinpoint-request-browser", browserId);
  } catch {}
}
let backend,
  currentUser = null,
  organizer = false,
  owner = false,
  posting = false,
  syncing = false,
  syncRequested = false,
  syncGeneration = 0;

const reporting = createEventReporting({
  getBackend: () => backend,
  ownerIdentity: () => (owner && currentUser ? currentUser.id : null),
  browserId,
  onEdit: openEventEditor,
  onChange: syncSharedEvents,
  notify: toast,
});
const requestTracker = createRequestTracker({
  getBackend: () => backend,
  storage,
  notify: toast,
});
const scheduleDrafts = createScheduleDrafts({
  accountIdentity: () => (organizer && currentUser ? currentUser.id : null),
  storage,
  onOpen: openScheduleDraft,
});

let filter = "All",
  scheduleEvents = [],
  pendingScheduleSelection = null,
  view = "Explore",
  selected = null,
  selectedGroup = null,
  map,
  markers = [],
  picking = false,
  draftPoint = null,
  satellite = false,
  showEmptyClassrooms = false;
const eventClock = createEventClock({
  onChange() {
    syncGeneration++;
    selected = null;
    selectedGroup = null;
    if (SHARED_EVENTS_ENABLED) state.events = [];
    $("#connectionStatus").textContent = "Loading events…";
    render();
    syncSharedEvents();
  },
});
const eventTiming = (event) =>
  eventClock.isPreview()
    ? Date.parse(event.start) > eventClock.now()
      ? `Starts ${date(event.start)} IST`
      : `Ends ${date(event.end)} IST`
    : countdown(event);
function toast(s, duration = 4000) {
  $("#toast").textContent = s;
  $("#toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(
    () => ($("#toast").style.display = "none"),
    duration,
  );
}
function save() {
  try {
    if (SHARED_EVENTS_ENABLED) {
      storage.setItem("pinpoint-interest-v1", JSON.stringify(state.rsvps));
    } else persistState(state, localStorage);
  } catch {
    toast("Browser storage unavailable. Changes last for this session.");
  }
}
function shownEvents() {
  let q = $("#search").value.toLowerCase();
  return state.events.filter(
    (e) =>
      inside(e.coords) &&
      (e.category !== "Empty classroom" || showEmptyClassrooms) &&
      (eventClock.isPreview()
        ? pinVisibleAt(e, eventClock.now()) && (view !== "Mine" || e.mine)
        : visibleAtTime(e, view)) &&
      (view !== "Interested" || state.rsvps.includes(e.id)) &&
      (filter === "All" ||
        (filter === "Now"
          ? activeAt(e, eventClock.now())
          : e.category === filter)) &&
      [e.title, e.area, e.host, e.room].join(" ").toLowerCase().includes(q),
  );
}
function setClassroomVisibility(visible) {
  showEmptyClassrooms = visible;
  $("#toggleClassrooms").setAttribute("aria-pressed", String(visible));
  if (!visible && filter === "Empty classroom") {
    filter = "All";
    document
      .querySelectorAll("[data-filter]")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.filter === filter),
      );
  }
  render();
}
function selectEvent(id) {
  selectedGroup = null;
  selected = id;
  render();
  let e = state.events.find((e) => e.id === id);
  if (map && e) {
    map.easeTo({ center: e.coords, duration: 400 });
    if (innerWidth <= 760)
      $("#campusMap").scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
function renderUpcoming() {
  const query = $("#search").value.toLowerCase();
  const events = upcomingEvents(
    SHARED_EVENTS_ENABLED ? scheduleEvents : state.events,
  ).filter(
    (event) =>
      inside(event.coords) &&
      (event.category !== "Empty classroom" || showEmptyClassrooms) &&
      (["All", "Now"].includes(filter) || event.category === filter) &&
      [event.title, event.host, event.area, event.room]
        .join(" ")
        .toLowerCase()
        .includes(query),
  );
  $("#upcomingCount").textContent =
    `${events.length} ${events.length === 1 ? "event" : "events"}`;
  let lastDay = "";
  $("#upcomingEvents").innerHTML =
    events
      .map((event) => {
        const day = istInput(Date.parse(event.start)).slice(0, 10);
        const heading =
          day !== lastDay
            ? `<h3 class="schedule-day">${esc(new Date(event.start).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "long" }))}</h3>`
            : "";
        lastDay = day;
        return `${heading}<button class="event" data-category="${esc(event.category)}" data-preview-event="${esc(event.id)}"><div class="event-top"><span class="tag">${esc(event.category)}</span><span>${esc(countdown(event))}</span></div><h3>${esc(event.title)}<span class="event-arrow" aria-hidden="true">↗</span></h3><p>${esc(date(event.start))} – ${esc(date(event.end))} IST</p><p class="event-location">⌖ ${esc(locationLabel(event))}</p><p class="host">By ${esc(event.host)}</p></button>`;
      })
      .join("") ||
    '<p class="empty">No upcoming events match right now. New approved events will appear here.</p>';
  $("#upcomingEvents")
    .querySelectorAll("[data-preview-event]")
    .forEach((button) => {
      button.onclick = () => {
        const event = events.find(
          (item) => String(item.id) === button.dataset.previewEvent,
        );
        const instant = Date.parse(event.start);
        if (
          eventClock.value() === instant &&
          state.events.some((item) => item.id === event.id)
        ) {
          selectEvent(event.id);
        } else {
          pendingScheduleSelection = { id: event.id, time: instant };
          eventClock.showAt(instant);
        }
      };
    });
}
function render() {
  // Refresh at event boundaries, including when an open event ends.
  clearTimeout(render.timer);
  const now = Date.now();
  const boundaries = state.events
    .flatMap((e) => [
      Date.parse(e.start) - PIN_LEAD_MS,
      Date.parse(e.start),
      Date.parse(e.end),
    ])
    .filter((t) => t > now);
  render.timer = setTimeout(
    render,
    Math.min(60000, ...boundaries.map((t) => t - now + 20)),
  );
  eventClock.update();
  const preview = eventClock.isPreview();
  $("[data-filter='Now']").textContent = preview
    ? "At chosen time"
    : "Happening now";
  if (SHARED_EVENTS_ENABLED)
    $("#feedNote").textContent = preview
      ? `Events at ${date(eventClock.now())} IST · Your interest stays in this browser.`
      : "Pins appear 15 minutes before the start and stay until the event ends.";
  renderUpcoming();
  let shown = shownEvents();
  $("#count").textContent =
    shown.length + " " + (shown.length === 1 ? "event" : "events");
  $(".list-heading h2").textContent =
    view === "Mine"
      ? "My events"
      : view === "Interested"
        ? "Events you’re interested in"
        : preview
          ? `Events at ${date(eventClock.now())} IST`
          : "Live & starting soon";
  $("#events").innerHTML = shown.length
    ? shown
        .map(
          (e) =>
            `<button data-category="${esc(e.category)}" class="event ${selected === e.id ? "selected" : ""}" data-id="${e.id}"><div class="event-top"><span class="tag">${esc(e.category)}</span><span>${esc(eventTiming(e))}</span></div><h3>${esc(e.title)}<span class="event-arrow" aria-hidden="true">↗</span></h3><p class="event-location">⌖ ${esc(locationLabel(e))}</p><p class="host">By ${esc(e.host)}${state.rsvps.includes(e.id) ? " · ✓ Interested" : ""}</p></button>`,
        )
        .join("")
    : `<p class="empty">${view === "Mine" ? (SHARED_EVENTS_ENABLED && !currentUser ? "Organizers: sign in to see and manage your events." : "Your posted events will appear here.") : view === "Interested" ? (preview ? "No interested events at the chosen time. Explore the map to find events." : "See something you’d like to join? Tap “I’m interested” on a live event.") : preview ? "No events match this time. Choose another time or filter." : "No live events match right now. Try another filter or check back soon."}</p>`;
  let pinGroups = [];
  if (map) {
    const result = renderEventPins(
      map,
      shown.filter((event) => pinVisibleAt(event, eventClock.now())),
      {
        previous: markers,
        selected,
        selectedGroup,
        onSelect: selectEvent,
        onGroup(group) {
          selected = null;
          selectedGroup = group.key;
          render();
          map.easeTo({ center: group.coords, duration: 400 });
        },
      },
    );
    markers = result.markers;
    pinGroups = result.groups;
  }
  let e = shown.find((e) => e.id === selected);
  const group = pinGroups.find((group) => group.key === selectedGroup);
  $("#detail").innerHTML = e
    ? `<button class="close" id="closeDetail" aria-label="Close event details">×</button>
      <span class="badge">${esc(e.category)} · ${e.mine ? "YOUR EVENT" : SHARED_EVENTS_ENABLED ? "CAMPUS EVENT" : "SAMPLE EVENT"}</span>
      <h2>${esc(e.title)}</h2>
      <p class="event-countdown">${esc(eventTiming(e))}</p>
      <dl class="event-facts"><div><dt>Where</dt><dd>${esc(locationLabel(e))}</dd></div>
      <div><dt>When · IST</dt><dd>${esc(date(e.start))} – ${esc(date(e.end))}</dd></div>
      <div><dt>Hosted by</dt><dd>${esc(e.host)}</dd></div></dl>
      <p>${esc(e.description)}</p>
      ${safeLink(e.link) ? `<a class="event-link" href="${esc(safeLink(e.link))}" target="_blank" rel="noopener noreferrer">Event / registration link ↗</a>` : ""}
      <div class="detail-actions">${Date.parse(e.end) > Date.now() && (preview || pinVisibleAt(e)) ? `<button class="primary" id="interest" aria-pressed="${state.rsvps.includes(e.id)}">${state.rsvps.includes(e.id) ? "✓ Interested · Remove" : "I’m interested"}</button>` : ""}
      ${owner ? '<button class="text-button" id="editEvent">Edit event</button>' : ""}
      ${e.mine ? '<button class="text-button" id="cancelEvent">Cancel event</button>' : owner ? '<button class="text-button" id="openManagement">Manage event</button>' : ongoing(e) ? '<button class="text-button" id="reportEvent">Report event</button>' : ""}</div>
      <p class="footnote">${preview ? `Viewing events at ${esc(date(eventClock.now()))} IST. Interest stays on this device.` : ongoing(e) ? "Interest stays on this device. Follow the event link for registration, if required." : "Scheduled event · Choose its time to preview it on the map."}</p>`
    : group
      ? `<button class="close" id="closeDetail" aria-label="Close events at this pin">×</button><span class="badge">${group.events.length} EVENTS AT THIS PIN</span><h2>Choose an event</h2><p>Zoom in to see individual pins, or choose an event below.</p>${group.events.map((event) => `<button class="venue-event-choice" data-id="${esc(event.id)}"><strong>${esc(event.title)}</strong><span>${esc(locationLabel(event))}</span><span>${esc(eventTiming(event))} · ${esc(event.host)}</span></button>`).join("")}`
      : "";
  if ($("#closeDetail"))
    $("#closeDetail").onclick = () => {
      selected = null;
      selectedGroup = null;
      render();
    };
  document
    .querySelectorAll("[data-id]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          selectEvent(
            SHARED_EVENTS_ENABLED ? b.dataset.id : Number(b.dataset.id),
          )),
    );
  if (e) {
    $("#closeDetail").onclick = () => {
      selected = null;
      selectedGroup = null;
      render();
    };
    if ($("#editEvent")) $("#editEvent").onclick = () => openEventEditor(e);
    if ($("#openManagement"))
      $("#openManagement").onclick = () => eventManager?.open();
    if ($("#interest"))
      $("#interest").onclick = () => {
        state.rsvps = state.rsvps.includes(e.id)
          ? state.rsvps.filter((id) => id !== e.id)
          : [...state.rsvps, e.id];
        save();
        render();
      };
    if ($("#cancelEvent"))
      $("#cancelEvent").onclick = async () => {
        if (SHARED_EVENTS_ENABLED) {
          if (!backend || !organizer)
            return toast("Sign in as an approved organizer first.");
          const button = $("#cancelEvent");
          button.disabled = true;
          try {
            await backend.cancelEvent(e.id);
          } catch (error) {
            button.disabled = false;
            return toast(backend.friendlyError(error));
          }
        }
        state.events = state.events.filter((item) => item.id !== e.id);
        state.rsvps = state.rsvps.filter((id) => id !== e.id);
        save();
        selected = null;
        render();
        toast(
          SHARED_EVENTS_ENABLED
            ? "Your event was cancelled."
            : "Your event was removed from this demo.",
        );
      };
    if ($("#reportEvent"))
      $("#reportEvent").onclick = () => {
        if (SHARED_EVENTS_ENABLED) {
          reporting.openReport(e);
          return;
        }
        if (!state.reports.some((r) => r.event === e.id)) {
          state.reports.push({
            event: e.id,
            reason: "Flagged for review",
            created: new Date().toISOString(),
          });
          save();
        }
        toast("Report saved locally. This demo has no moderation service.");
      };
  }
}
function stopPicking() {
  picking = false;
  $("#mapHint").textContent = "Drag to explore · Pinch or use + / − to zoom";
  $("#pickLocation").textContent = "＋ Drop a pin";
  $("#campusMap").classList.remove("picking");
}
function startPicking() {
  if (!canPost()) return;
  venueSetup?.cancel();
  if (!map) return;
  $("#postDialog").close();
  selected = null;
  render();
  picking = true;
  $("#mapHint").textContent = "Tap a point inside campus · Esc to cancel";
  $("#pickLocation").textContent = "Cancel pin placement";
  $("#campusMap").classList.add("picking");
  $("#campusMap").scrollIntoView({ behavior: "smooth", block: "center" });
}
function localInput(d) {
  return istInput(d.getTime());
}

function updatePostCopy() {
  $("#postDialog h2").textContent = editingEvent
    ? "Edit event."
    : scheduleDraft
      ? "Review & place event."
      : "Add a campus event.";
  $("#postIntro").textContent = editingEvent
    ? "Update the details or move the pin. Saving keeps this event and its existing interest selections."
    : "Add the details, choose a location, and help students discover your event.";
  $('#postForm button[type="submit"]').textContent = editingEvent
    ? "Save changes →"
    : scheduleDraft
      ? "Approve & publish event →"
      : organizer
        ? "Publish event →"
        : "Submit for approval →";
  $("#postingNote").textContent = editingEvent
    ? editingEvent.status === "cancelled"
      ? "This event is cancelled. Saving edits does not restore it to the map."
      : "Scheduled events appear at their selected time and automatically in live mode when they start."
    : organizer
      ? "You are signed in as a reviewer. Your own events can be published directly."
      : "Requests are reviewed before appearing on the map. No student login required.";
}
function openScheduleDraft(event, saved, accountId) {
  if (!organizer || currentUser?.id !== accountId) return;
  venueSetup?.cancel();
  stopPicking();
  resetDraft();
  scheduleDraft = { ...event, accountId };
  const form = $("#postForm"),
    values = saved || event;
  for (const name of [
    "title",
    "category",
    "room",
    "host",
    "description",
    "link",
    "start",
    "end",
  ])
    form.elements[name].value = values[name] || "";
  form.elements.area.value = "Custom pin";
  if (saved?.coords && inside(saved.coords)) draftPoint = [...saved.coords];
  $("#locationStatus").textContent = draftPoint
    ? "Your saved draft pin is selected. Check it before publishing."
    : "Choose a saved venue or place an exact pin. No location has been invented.";
  $("#scheduleSourceNotes").hidden = false;
  $("#scheduleSourceNotes").innerHTML =
    `<p><b>Event list:</b> ${esc(event.catalog_date)} · ${esc(event.catalog_time)}</p>
    ${event.bookings.map((b) => `<p><b>Room booking:</b> ${esc(b.room)} · ${esc(b.start.replace("T", " "))} – ${esc(b.end.replace("T", " "))} IST</p>`).join("")}
    ${event.issues.map((issue) => `<p class="draft-issue">${esc(issue)}</p>`).join("")}
    <p class="footnote">Confirm conflicting hours below. They are left blank until you decide.</p>`;
  $("#scheduleConfirmLabel").hidden = false;
  $("#scheduleConfirmed").required = true;
  updatePostCopy();
  $("#postDialog").showModal();
}
function rememberScheduleDraft() {
  if (!scheduleDraft) return;
  const fields = Object.fromEntries(new FormData($("#postForm")));
  fields.coords = draftPoint || savedVenue(fields.venue)?.coords || null;
  scheduleDrafts.remember(scheduleDraft.id, scheduleDraft.accountId, fields);
}
$("#postForm").addEventListener("input", rememberScheduleDraft);
$("#postForm").addEventListener("change", rememberScheduleDraft);
$("#postDialog").addEventListener("close", rememberScheduleDraft);
function openEventEditor(event) {
  if (!owner || !currentUser || !event) return;
  venueSetup?.cancel();
  stopPicking();
  resetDraft();
  editingEvent = { ...event, accountId: currentUser.id };
  const form = $("#postForm");
  for (const name of [
    "title",
    "category",
    "area",
    "room",
    "host",
    "description",
    "link",
  ])
    form.elements[name].value = event[name] || "";
  if (!form.elements.area.value) form.elements.area.value = "Custom pin";
  form.elements.start.value = localInput(new Date(event.start));
  form.elements.end.value = localInput(new Date(event.end));
  // Preserve the actual existing pin, including offsets from a saved venue.
  draftPoint = [...event.coords];
  $("#locationStatus").textContent =
    "Existing event pin kept. Choose a saved venue or map point to move it.";
  updatePostCopy();
  $("#postDialog").showModal();
}
function resetDraft() {
  editingEvent = null;
  scheduleDraft = null;
  $("#scheduleSourceNotes").hidden = true;
  $("#scheduleSourceNotes").innerHTML = "";
  $("#scheduleConfirmLabel").hidden = true;
  $("#scheduleConfirmed").required = false;
  updatePostCopy();
  requestId = crypto.randomUUID();
  requestToken = newTrackingToken();
  $("#submissionStatus").textContent = "";
  draftPoint = null;
  $("#postForm").reset();
  $("#postForm").elements.room.readOnly = false;
  $("#postForm").elements.start.value = localInput(new Date());
  $("#postForm").elements.end.value = localInput(new Date(Date.now() + H));
  $("#locationStatus").textContent =
    "Choose an area, or pick a point on the map.";
}
$("#add").onclick = () => {
  if (!canPost()) return;
  venueSetup?.cancel();
  stopPicking();
  resetDraft();
  $("#postDialog").showModal();
};
$("#pickLocation").onclick = () => {
  if (picking) stopPicking();
  else {
    resetDraft();
    startPicking();
  }
};
$("#chooseMap").onclick = startPicking;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const resumeEdit = picking && editingEvent;
    stopPicking();
    if (resumeEdit) $("#postDialog").showModal();
  }
});
$("#fitCampus").onclick = () => fit(map);
$("#basemap").onclick = () => {
  if (!map || !map.isStyleLoaded()) return;
  satellite = !satellite;
  $(".place-legend").style.display = satellite ? "none" : "";
  map.setLayoutProperty(
    "satellite",
    "visibility",
    satellite ? "visible" : "none",
  );
  for (const layer of CAMPUS_STREET_STYLE.layers)
    map.setLayoutProperty(
      layer.id,
      "visibility",
      satellite ? "none" : "visible",
    );
  $("#basemap").textContent = satellite ? "Satellite" : "Street";
  $("#basemap").setAttribute("aria-pressed", String(satellite));
  $("#mapStatus").textContent = "";
};
$("#postForm").elements.venue.innerHTML += SAVED_VENUES.map(
  (venue) => `<option value="${venue.id}">${esc(venue.label)}</option>`,
).join("");
$("#postForm").elements.venue.onchange = (event) => {
  const venue = savedVenue(event.target.value),
    form = $("#postForm");
  draftPoint = null;
  form.elements.room.readOnly = Boolean(venue);
  if (venue) {
    form.elements.area.value = venue.area;
    form.elements.room.value = venue.room;
    $("#locationStatus").textContent =
      venue.accuracy === "building"
        ? `${venue.label} selected · Building-level pin. Check the room before attending.`
        : `${venue.label} selected · Saved map location.`;
  } else {
    form.elements.room.value = "";
    $("#locationStatus").textContent =
      "Enter the classroom / landmark and choose an area or exact map point.";
  }
};
$("#postForm").elements.area.onchange = (e) => {
  $("#postForm").elements.venue.value = "";
  $("#postForm").elements.room.readOnly = false;
  draftPoint = null;
  $("#locationStatus").textContent =
    e.target.value === "Custom pin"
      ? "Pick a point on the map before posting."
      : "Approximate area pin selected. Add exact room details below.";
};
$("#postForm").onsubmit = async (e) => {
  e.preventDefault();
  if (posting || !canPost()) return;
  if (
    scheduleDraft &&
    (!organizer || currentUser?.id !== scheduleDraft.accountId)
  )
    return;
  if (scheduleDraft && !$("#scheduleConfirmed").checked) {
    toast("Check the source details and confirm them before publishing.");
    return;
  }
  if (SHARED_EVENTS_ENABLED && !organizer && !PUBLIC_REQUESTS_ENABLED) {
    $("#submissionStatus").textContent =
      "Public requests are being set up. Please check back shortly.";
    return;
  }
  if (
    SHARED_EVENTS_ENABLED &&
    !organizer &&
    $("#postForm").elements.website.value
  )
    return;
  let data = Object.fromEntries(new FormData(e.target)),
    start = new Date(parseIstInput(data.start) ?? NaN),
    end = new Date(parseIstInput(data.end) ?? NaN);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start ||
    (!editingEvent && end <= new Date())
  ) {
    toast(
      editingEvent
        ? "Choose an end time after the start."
        : "Choose an end time after the start and in the future.",
    );
    return;
  }
  let coords =
    draftPoint ||
    savedVenue(data.venue)?.coords ||
    (scheduleDraft ? null : areas[data.area]);
  if (!inside(coords)) {
    if (scheduleDraft)
      $("#submissionStatus").textContent =
        "Choose a saved venue or pick an exact map point before publishing this draft.";
    toast("Pick a location inside the campus boundary first.");
    return;
  }
  if (data.link && !safeLink(data.link)) {
    toast("Use an http or https event link.");
    return;
  }
  let item = {
    ...data,
    id: Date.now(),
    start: start.toISOString(),
    end: end.toISOString(),
    coords,
    mine: true,
  };
  if (SHARED_EVENTS_ENABLED) {
    posting = true;
    const button = $('#postForm button[type="submit"]');
    button.disabled = true;
    try {
      if (editingEvent) {
        if (!owner || currentUser?.id !== editingEvent.accountId) {
          $("#submissionStatus").textContent =
            "Sign in with your owner account to edit events.";
          return;
        }
        const account = currentUser.id;
        item = await backend.editEvent(
          { ...item, id: editingEvent.id, revision: editingEvent.revision },
          account,
        );
        if (!owner || currentUser?.id !== account) return;
        $("#postDialog").close();
        resetDraft();
        selected = null;
        await syncSharedEvents();
        toast("Event updated.");
        eventManager?.open();
        return;
      } else if (organizer) {
        const imported = scheduleDraft && {
          id: scheduleDraft.id,
          account: scheduleDraft.accountId,
        };
        item = await backend.createEvent(item, currentUser.id);
        if (imported)
          scheduleDrafts.published(imported.id, imported.account, item.id);
      } else {
        const tracking = {
          id: requestId,
          token: requestToken,
          title: item.title,
        };
        await backend.submitRequest(
          item,
          tracking.id,
          browserId,
          tracking.token,
        );
        const savedLink = requestTracker.remember(tracking);
        $("#postDialog").close();
        resetDraft();
        toast("Request sent. Track it in My event requests.", 2000);
        if (!savedLink) requestTracker.open();
        return;
      }
    } catch (error) {
      $("#submissionStatus").textContent = backend.friendlyError(error);
      return;
    } finally {
      posting = false;
      button.disabled = false;
    }
  }
  state.events.unshift(item);
  save();
  view = "Mine";
  filter = "All";
  $("#search").value = "";
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document
    .querySelectorAll("[data-filter]")
    .forEach((b) => b.classList.toggle("active", b.dataset.filter === filter));
  $("#postDialog").close();
  selectEvent(item.id);
  toast(
    item.category === "Empty classroom" && !showEmptyClassrooms
      ? "Classroom saved. Turn on Empty classrooms in the map key to show it."
      : SHARED_EVENTS_ENABLED
        ? "Event published. Choose its time to preview it; it appears in live mode when it starts."
        : "Event added to My events on this device.",
  );
  resetDraft();
};
$("#toggleClassrooms").onclick = () =>
  setClassroomVisibility(!showEmptyClassrooms);
$("#search").oninput = render;
document.querySelectorAll("[data-filter]").forEach(
  (b) =>
    (b.onclick = () => {
      filter = b.dataset.filter;
      if (filter === "Empty classroom") {
        showEmptyClassrooms = true;
        $("#toggleClassrooms").setAttribute("aria-pressed", "true");
      }
      document
        .querySelectorAll("[data-filter]")
        .forEach((c) => c.classList.toggle("active", c === b));
      render();
    }),
);
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      view = b.dataset.view;
      document
        .querySelectorAll("[data-view]")
        .forEach((c) => c.classList.toggle("active", c === b));
      render();
    }),
);
$("#about").onclick = () => $("#aboutDialog").showModal();
document
  .querySelectorAll("dialog .close")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
resetDraft();
render();
map = createCampusMap({
  onLoad: render,
  onPick(point) {
    if (venueSetup?.handleMapClick(point)) return;
    if (!picking) return;
    if (!inside(point)) {
      toast("Choose a point inside the campus boundary.");
      return;
    }
    draftPoint = point;
    rememberScheduleDraft();
    stopPicking();
    if (!savedVenue($("#postForm").elements.venue.value))
      $("#postForm").elements.area.value = "Custom pin";
    $("#locationStatus").textContent =
      "✓ Exact map point selected. Add building and room details below.";
    $("#postDialog").showModal();
  },
});
venueSetup = createVenueSetup({
  getMap: () => map,
  isReviewer: () => Boolean(currentUser && organizer),
  storage,
  notify: toast,
  beforePick: () => {
    stopPicking();
    $("#postDialog").close();
    selected = null;
    selectedGroup = null;
    render();
  },
});
$("#venueSetup").onclick = () => venueSetup.open();
map?.on("moveend", render);
map?.on("resize", render);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});

function canPost() {
  if (!SHARED_EVENTS_ENABLED) return true;
  if (!backend) {
    toast("Connecting… Please try again in a moment.");
    return false;
  }
  if (organizer) return true;
  return true;
}
async function syncSharedEvents() {
  if (!backend) return;
  if (syncing) {
    syncRequested = true;
    return;
  }
  syncing = true;
  const requestedUser = currentUser?.id,
    requestedTime = eventClock.value(),
    generation = syncGeneration;
  const stillCurrent = () =>
    currentUser?.id === requestedUser &&
    eventClock.value() === requestedTime &&
    syncGeneration === generation;
  try {
    let events,
      schedule,
      needsScheduleUpgrade = false;
    try {
      if (requestedTime === null)
        events = schedule = await backend.fetchSchedule(requestedUser);
      else
        [events, schedule] = await Promise.all([
          backend.fetchSchedule(
            requestedUser,
            new Date(requestedTime).toISOString(),
          ),
          backend.fetchSchedule(requestedUser),
        ]);
    } catch (error) {
      if (!["PGRST202", "42883"].includes(error?.code)) throw error;
      needsScheduleUpgrade = true;
      events =
        requestedTime === null
          ? await backend.fetchEvents(requestedUser)
          : await backend.fetchEventsAtTime(
              new Date(requestedTime).toISOString(),
              requestedUser,
            );
    }
    if (!stillCurrent()) {
      syncRequested = true;
      return;
    }
    state.events = events;
    if (schedule) scheduleEvents = schedule;
    $("#scheduleStatus").textContent = needsScheduleUpgrade
      ? "Upcoming events and early pins need the upcoming-events database update. Current events remain available."
      : "";
    $("#connectionStatus").textContent = "";
    if (
      pendingScheduleSelection &&
      pendingScheduleSelection.time !== requestedTime
    )
      pendingScheduleSelection = null;
    if (
      pendingScheduleSelection &&
      state.events.some((event) => event.id === pendingScheduleSelection.id)
    ) {
      const id = pendingScheduleSelection.id;
      pendingScheduleSelection = null;
      selectEvent(id);
    }
    render();
  } catch (error) {
    if (stillCurrent())
      $("#connectionStatus").textContent =
        requestedTime !== null && ["PGRST202", "42883"].includes(error?.code)
          ? "Time browsing needs the database update. Choose Back to live now to return to current events."
          : backend.friendlyError(error) +
            " Displayed events may be out of date.";
  } finally {
    syncing = false;
    if (syncRequested) {
      syncRequested = false;
      syncSharedEvents();
    }
  }
}

async function updateAccount(session) {
  pendingScheduleSelection = null;
  currentUser = session?.user || null;
  organizer = false;
  owner = false;
  scheduleDrafts.clear();
  $("#scheduleDrafts").hidden = true;
  eventManager?.clear();
  reporting.clear();
  $("#reviewReports").hidden = true;
  if (
    (editingEvent && editingEvent.accountId !== currentUser?.id) ||
    scheduleDraft
  ) {
    $("#postDialog").close();
    stopPicking();
    resetDraft();
  }
  $("#manageEvents").hidden = true;
  reviewQueue?.clear();
  venueSetup?.cancel();
  $("#venueSetupDialog").close();
  $("#venueSetup").hidden = true;
  $("#reviewEvents").hidden = true;
  $("#setPassword").hidden = true;
  // Clear previous account ownership immediately before any network request.
  state.events = state.events.map((event) => ({ ...event, mine: false }));
  scheduleEvents = scheduleEvents.map((event) => ({ ...event, mine: false }));
  render();
  const userAtStart = currentUser?.id;
  if (currentUser) {
    const [reviewerResult, ownerResult] = await Promise.all([
      backend.supabase.rpc("is_organizer"),
      backend.supabase.rpc("is_owner"),
    ]);
    if (currentUser?.id !== userAtStart) return;
    organizer = !reviewerResult.error && reviewerResult.data === true;
    owner = !ownerResult.error && ownerResult.data === true;
    if (editingEvent && !owner) {
      $("#postDialog").close();
      stopPicking();
      resetDraft();
    }
  }
  $("#organizerLogin").textContent = currentUser
    ? "Sign out"
    : "Organizer sign in";
  $("#accountStatus").textContent = currentUser
    ? organizer
      ? owner
        ? "Owner signed in"
        : "Organizer signed in"
      : "Signed in · Event requests need reviewer approval"
    : "";
  $("#reviewEvents").hidden = !organizer || !PUBLIC_REQUESTS_ENABLED;
  $("#scheduleDrafts").hidden = !organizer;
  $("#venueSetup").hidden = !organizer;
  $("#setPassword").hidden = !organizer;
  $("#manageEvents").hidden = !owner;
  $("#reviewReports").hidden = !owner;
  updatePostCopy();
  await syncSharedEvents();
}
async function initializeSharedEvents() {
  if (!SHARED_EVENTS_ENABLED) return;
  $("#organizerLogin").hidden = false;
  $("#connectionStatus").textContent = "Loading live events…";
  $("#postingNote").textContent =
    "Anyone can request an event. Requests appear publicly after review and approval.";
  $("#feedNote").textContent =
    "Live campus events · Your interest stays in this browser.";
  $("#aboutStorage").textContent =
    "Events are shared across devices. Anyone can submit a request. Reviewers approve or reject requests before they appear publicly. Your Interested shortlist stays in this browser. Event reports go privately to the owner for review.";
  try {
    backend = await import("./data/shared-events.js?upcoming=1");
    eventManager = createEventManager({
      backend,
      ownerIdentity: () => (owner && currentUser ? currentUser.id : null),
      onEdit: openEventEditor,
      onChange: syncSharedEvents,
      notify: toast,
    });
    reviewQueue = createReviewQueue({
      backend,
      isReviewer: () => organizer,
      onReview: syncSharedEvents,
    });
    backend.supabase.auth.onAuthStateChange((event, session) => {
      setTimeout(async () => {
        await updateAccount(session);
        authUi.accountChanged(event, session);
      }, 0);
    });
    const { data, error } = await backend.supabase.auth.getSession();
    if (error) throw error;
    await updateAccount(data.session);
    requestTracker.ready();
    setInterval(() => {
      if (!document.hidden) syncSharedEvents();
    }, 15000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) syncSharedEvents();
    });
  } catch {
    $("#connectionStatus").textContent =
      "Could not connect to shared events. Please reload and try again.";
  }
}
$("#reviewReports").onclick = () => reporting.openQueue();
$("#manageEvents").onclick = () => eventManager?.open();
$("#scheduleDrafts").onclick = () => scheduleDrafts.open();
$("#reviewEvents").onclick = () => reviewQueue?.open();
$("#refreshReviews").onclick = () => reviewQueue?.refresh();
$("#organizerLogin").onclick = async () => {
  if (currentUser && backend) {
    const { error } = await backend.supabase.auth.signOut();
    if (error) toast("Could not sign out. Please try again.");
  } else authUi.open();
};
authUi = createOrganizerAuth({
  getClient: () => backend?.supabase,
  getUser: () => currentUser,
  isReviewer: () => organizer,
  notify: toast,
});
initializeSharedEvents();

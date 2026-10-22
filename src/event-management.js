import { esc, date } from "./utils.js";
import { locationLabel } from "./event-presentation.js";

export function managementStatus(event, now = Date.now()) {
  if (event.status === "cancelled") return "cancelled";
  if (Date.parse(event.end) <= now) return "ended";
  return Date.parse(event.start) > now ? "upcoming" : "live";
}
export function filterManagedEvents(events, filter, query, now = Date.now()) {
  const search = query.trim().toLowerCase();
  return events.filter((event) => {
    const status = managementStatus(event, now);
    return (
      (filter === "all" ||
        filter === status ||
        (filter === "active" && ["live", "upcoming"].includes(status))) &&
      [event.title, event.host, event.area, event.room]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  });
}
export function createEventManager({
  backend,
  ownerIdentity,
  onEdit,
  onChange,
  notify,
}) {
  const $ = (selector) => document.querySelector(selector);
  const dialog = $("#manageDialog"),
    list = $("#managedEvents"),
    status = $("#manageStatus");
  let events = [],
    busy = false,
    generation = 0;
  function render() {
    const shown = filterManagedEvents(
      events,
      $("#manageFilter").value,
      $("#manageSearch").value,
    );
    list.innerHTML = shown.length
      ? shown
          .map((event) => {
            const phase = managementStatus(event),
              cancelled = phase === "cancelled";
            return `<article class="managed-event"><div class="managed-event-top"><span class="tag">${esc(event.category)}</span><span class="managed-phase">${phase}</span></div>
        <h3>${esc(event.title)}</h3><p>${esc(locationLabel(event))}</p>
        <p>${esc(date(event.start))} – ${esc(date(event.end))} · IST</p><p>Hosted by ${esc(event.host)}</p>
        <div class="detail-actions"><button class="primary" data-edit-event="${esc(event.id)}">Edit event</button>
        <button class="text-button" data-event-status="${esc(event.id)}" ${cancelled && Date.parse(event.end) <= Date.now() ? "disabled" : ""}>${cancelled ? "Restore event" : "Cancel event"}</button></div>
        ${cancelled ? '<p class="footnote">Hidden from the public map. Edit its timing before restoring if it has ended.</p>' : ""}</article>`;
          })
          .join("")
      : '<p class="empty">No events match these filters.</p>';
    list.querySelectorAll("[data-edit-event]").forEach(
      (button) =>
        (button.onclick = () => {
          if (!ownerIdentity() || busy) return;
          const event = events.find((e) => e.id === button.dataset.editEvent);
          dialog.close();
          onEdit(event);
        }),
    );
    list.querySelectorAll("[data-event-status]").forEach(
      (button) =>
        (button.onclick = async () => {
          const account = ownerIdentity();
          if (!account || busy) return;
          const event = events.find((e) => e.id === button.dataset.eventStatus);
          const action = ++generation;
          busy = true;
          list.querySelectorAll("button").forEach((b) => (b.disabled = true));
          const cancelled = event.status !== "cancelled";
          let succeeded = false;
          try {
            await backend.setEventStatus(
              event,
              cancelled ? "cancelled" : "published",
            );
            if (ownerIdentity() !== account || action !== generation) return;
            notify(
              cancelled
                ? "Event cancelled. You can restore it here."
                : "Event restored. It appears publicly while live.",
            );
            await onChange();
            succeeded = true;
          } catch (error) {
            if (ownerIdentity() === account && action === generation)
              status.textContent = backend.friendlyError(error);
          } finally {
            if (action === generation) busy = false;
          }
          if (ownerIdentity() === account && action === generation) {
            if (succeeded) await refresh();
            else render();
          }
        }),
    );
  }
  async function refresh() {
    const account = ownerIdentity();
    if (!account || busy) return;
    const request = ++generation;
    busy = true;
    $("#refreshManagedEvents").disabled = true;
    status.textContent = "Loading events…";
    list
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = true));
    try {
      const result = await backend.fetchManagedEvents(account);
      if (ownerIdentity() !== account || request !== generation) return;
      events = result;
      status.textContent = `${events.length} events · Owner access`;
      render();
    } catch (error) {
      if (ownerIdentity() === account && request === generation) {
        status.textContent = backend.friendlyError(error);
        render();
      }
    } finally {
      if (request === generation) {
        busy = false;
        $("#refreshManagedEvents").disabled = false;
      }
    }
  }
  $("#manageSearch").oninput = render;
  $("#manageFilter").onchange = render;
  $("#refreshManagedEvents").onclick = refresh;
  return {
    open() {
      if (ownerIdentity()) {
        dialog.showModal();
        refresh();
      }
    },
    refresh,
    clear() {
      generation++;
      busy = false;
      events = [];
      list.innerHTML = "";
      status.textContent = "";
      $("#refreshManagedEvents").disabled = false;
      dialog.close();
    },
  };
}

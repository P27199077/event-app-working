import { esc, date } from "./utils.js";
const STORAGE_KEY = "pinpoint-request-tracking-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{64}$/;
export function newTrackingToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function validTrackingEntry(entry) {
  return Boolean(
    entry &&
    typeof entry.id === "string" &&
    typeof entry.token === "string" &&
    UUID.test(entry.id) &&
    TOKEN.test(entry.token),
  );
}
export function parseTrackingLink(hash) {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("request");
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const entry = { id: parts[0], token: parts[1] };
  return validTrackingEntry(entry) ? entry : null;
}
export function trackingUrl(entry, base) {
  if (!validTrackingEntry(entry)) return "";
  const url = new URL("./", base);
  url.hash = `request=${entry.id}.${entry.token}`;
  return url.href;
}
export function requestStatusMessage(result) {
  if (result.status === "rejected")
    return result.reason || "This request was not approved.";
  if (result.status === "approved")
    return result.eventStatus === "cancelled"
      ? "Your request was approved, but the published event has since been cancelled."
      : "Approved. Its pin appears on the public map while the event is live.";
  return "Your request is waiting for review. It is not on the public map yet.";
}
export function createRequestTracker({ getBackend, storage, notify }) {
  const $ = (selector) => document.querySelector(selector);
  const dialog = $("#trackingDialog"),
    list = $("#trackedRequests"),
    status = $("#trackingStatus");
  let entries = [],
    generation = 0,
    busy = false,
    canSave = Boolean(storage);
  let openedLink = parseTrackingLink(location.hash);
  const attemptedLink = new URLSearchParams(location.hash.slice(1)).has(
    "request",
  );
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved))
      entries = saved.filter(validTrackingEntry).slice(0, 20);
  } catch {}
  function remember(entry) {
    if (!validTrackingEntry(entry)) return false;
    entries = [
      { ...entry, title: String(entry.title || "Event request").slice(0, 80) },
      ...entries.filter((e) => e.id !== entry.id),
    ].slice(0, 20);
    try {
      if (!storage) {
        canSave = false;
        return false;
      }
      storage.setItem(STORAGE_KEY, JSON.stringify(entries));
      canSave = true;
      return true;
    } catch {
      canSave = false;
      return false;
    }
  }
  if (attemptedLink) {
    // Keep the capability out of copied page URLs and incidental navigation.
    history.replaceState(null, "", location.pathname + location.search);
  }
  async function refresh() {
    const backend = getBackend();
    if (!backend || busy) return;
    const request = ++generation;
    busy = true;
    $("#refreshTracking").disabled = true;
    const requestedEntries = openedLink
      ? [openedLink, ...entries.filter((e) => e.id !== openedLink.id)]
      : [...entries];
    status.textContent = requestedEntries.length
      ? "Checking request status…"
      : "Requests submitted from this browser will appear here. You can also open a private tracking link.";
    try {
      const results = await Promise.all(
        requestedEntries.map(async (entry) => {
          try {
            return { entry, result: await backend.trackRequest(entry) };
          } catch (error) {
            return { entry, error };
          }
        }),
      );
      if (request !== generation) return;
      for (const { entry, result } of results)
        if (result && entry.id === openedLink?.id)
          remember({ ...entry, title: result.title });
      list.innerHTML = results
        .map(({ entry, result, error }) => {
          const link = trackingUrl(entry, location.href);
          return `<article class="tracked-request"><span class="tracking-phase" data-status="${esc(result?.status || "unknown")}">${esc(result?.status || (error ? "Connection problem" : "Unavailable"))}</span>
          <h3>${esc(result?.title || entry.title || "Event request")}</h3>
          <p>${esc(error ? "Could not check this request. Refresh when your connection is back." : result ? requestStatusMessage(result) : "This tracking link is invalid or the request is no longer available.")}</p>
          ${result ? `<p class="footnote">Submitted ${esc(date(result.created))}${result.reviewed ? ` · Reviewed ${esc(date(result.reviewed))}` : ""}</p>` : ""}
          <button class="text-button" data-copy-tracking="${esc(entry.id)}">Copy private link</button> <button class="text-button" data-forget-tracking="${esc(entry.id)}">Remove from this browser</button>
          <details><summary>View private link</summary><input readonly aria-label="Private tracking link" value="${esc(link)}" /></details></article>`;
        })
        .join("");
      status.textContent = requestedEntries.length
        ? canSave
          ? "Keep each link private: it gives access to that request’s status. Recent links stay in this browser."
          : "This browser could not save your links. Copy your private link before closing the page."
        : status.textContent;
      list.querySelectorAll("[data-forget-tracking]").forEach(
        (button) =>
          (button.onclick = () => {
            const id = button.dataset.forgetTracking;
            entries = entries.filter((entry) => entry.id !== id);
            if (openedLink?.id === id) openedLink = null;
            try {
              storage?.setItem(STORAGE_KEY, JSON.stringify(entries));
            } catch {
              canSave = false;
            }
            refresh();
          }),
      );
      list.querySelectorAll("[data-copy-tracking]").forEach(
        (button) =>
          (button.onclick = async () => {
            const entry = requestedEntries.find(
              (e) => e.id === button.dataset.copyTracking,
            );
            try {
              await navigator.clipboard.writeText(
                trackingUrl(entry, location.href),
              );
              notify(
                "Private link copied. Anyone with this link can see the request status.",
              );
            } catch {
              button.closest("article").querySelector("details").open = true;
              notify("Select and copy the private link below.");
            }
          }),
      );
    } finally {
      if (request === generation) {
        busy = false;
        $("#refreshTracking").disabled = false;
      }
    }
  }
  function open() {
    if (!getBackend())
      return notify("Still connecting. Please try again shortly.");
    if (!dialog.open) dialog.showModal();
    refresh();
  }
  $("#myRequests").onclick = open;
  $("#refreshTracking").onclick = refresh;
  return {
    remember,
    open,
    ready() {
      if (openedLink) open();
      else if (attemptedLink) {
        dialog.showModal();
        status.textContent =
          "This tracking link is invalid. Check that you copied the entire link.";
      }
    },
  };
}

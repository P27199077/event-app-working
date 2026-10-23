import { esc } from "./utils.js";
import { parseIstInput } from "./event-clock.js";

export function mergeDraftEvents(existing, incoming) {
  const merged = new Map(existing.map((event) => [event.id, event]));
  for (const event of incoming) merged.set(event.id, event);
  if (merged.size > 200)
    throw new Error("Keep at most 200 drafts in one browser batch.");
  return [...merged.values()].sort(
    (a, b) =>
      draftDay(a).localeCompare(draftDay(b)) ||
      (a.start || "99").localeCompare(b.start || "99") ||
      a.title.localeCompare(b.title),
  );
}
export function draftDay(event) {
  return (
    (event.start || event.bookings?.[0]?.start || "").slice(0, 10) ||
    (/23 October 2026/.test(event.catalog_date)
      ? "2026-10-23"
      : "Needs date review")
  );
}

export function createScheduleDrafts({ accountIdentity, storage, onOpen }) {
  const dialog = document.querySelector("#scheduleDraftDialog");
  const list = document.querySelector("#scheduleDraftList");
  const status = document.querySelector("#scheduleDraftStatus");
  const fileInput = document.querySelector("#scheduleDraftFile");
  const dayChoice = document.querySelector("#scheduleDraftDay");
  let events = [],
    generation = 0;
  const key = (account) => `pinpoint-schedule-drafts-v1-${account}`;
  const batchKey = (account) => `${key(account)}-batch`;
  function progress(account) {
    try {
      return JSON.parse(storage?.getItem(key(account)) || "{}");
    } catch {
      return {};
    }
  }
  function save(account, id, value) {
    try {
      const data = progress(account);
      data[id] = { ...data[id], ...value };
      storage.setItem(key(account), JSON.stringify(data));
    } catch {
      status.textContent =
        "Browser storage unavailable. Keep this page open to retain progress.";
    }
  }
  function render(account) {
    if (accountIdentity() !== account) return;
    const saved = progress(account);
    const choice = dayChoice.value;
    const days = [...new Set(events.map(draftDay))].sort();
    dayChoice.innerHTML =
      '<option value="">All dates</option>' +
      days
        .map((day) => `<option value="${esc(day)}">${esc(day)}</option>`)
        .join("");
    if (days.includes(choice)) dayChoice.value = choice;
    const remaining = events.filter(
      (event) =>
        !saved[event.id]?.published &&
        (!dayChoice.value || draftDay(event) === dayChoice.value),
    );
    const totalRemaining = events.filter(
      (event) => !saved[event.id]?.published,
    ).length;
    status.textContent = events.length
      ? `${remaining.length} shown · ${totalRemaining} remaining across all dates · ${events.length - totalRemaining} published from this browser`
      : "Choose your event draft JSON file above. It stays in this browser until you publish an event.";
    list.innerHTML =
      remaining
        .map((event) => {
          const fields = saved[event.id]?.fields || event;
          const ended = fields.end && parseIstInput(fields.end) <= Date.now();
          return `<article class="review-request"><span class="tag">${esc(event.host)}</span><h3>${esc(event.title)}</h3>
        <p><b>${esc(draftDay(event))}</b> · ${esc(event.room || "Venue needs confirmation")}</p>
        <p><b>Event list:</b> ${esc(event.catalog_date)} · ${esc(event.catalog_time)}</p>
        ${event.bookings.map((b) => `<p><b>Room booking:</b> ${esc(b.room)} · ${esc(b.start.replace("T", " "))} – ${esc(b.end.replace("T", " "))} IST</p>`).join("")}
        <p>${esc(event.description || "Description missing in the event list.")}</p>
        ${event.issues.map((issue) => `<p class="draft-issue">${esc(issue)}</p>`).join("")}
        ${ended ? "<p>This draft has ended. Review its date before publishing.</p>" : ""}
        <p class="footnote">${esc(event.catalog_source)} · ${esc(event.bookings.map((b) => b.source).join(", "))}</p>
        <button class="primary" data-schedule-draft="${esc(event.id)}">Review details & place pin →</button></article>`;
        })
        .join("") ||
      (events.length && !totalRemaining
        ? "<p>All drafts in this batch have been published from this browser.</p>"
        : events.length
          ? "<p>No remaining drafts for this date. Choose another date above.</p>"
          : "");
    list.querySelectorAll("[data-schedule-draft]").forEach((button) => {
      button.onclick = () => {
        if (accountIdentity() !== account) return;
        const event = events.find((e) => e.id === button.dataset.scheduleDraft);
        dialog.close();
        onOpen(event, saved[event.id]?.fields, account);
      };
    });
  }
  dayChoice.onchange = () => {
    const account = accountIdentity();
    if (account) render(account);
  };
  function validateBatch(batch) {
    if (
      batch?.version !== 1 ||
      !Array.isArray(batch.events) ||
      batch.events.length > 200
    )
      throw new Error("Choose a PinPoint draft file with at most 200 events.");
    const ids = new Set();
    for (const event of batch.events) {
      if (!event || typeof event.id !== "string" || ids.has(event.id))
        throw new Error("The draft file contains an invalid or repeated ID.");
      ids.add(event.id);
      for (const field of [
        "id",
        "title",
        "host",
        "description",
        "room",
        "catalog_time",
        "catalog_date",
        "catalog_source",
      ])
        if (typeof event[field] !== "string" || event[field].length > 4000)
          throw new Error("The draft file has invalid event details.");
      if (
        !Array.isArray(event.bookings) ||
        !Array.isArray(event.issues) ||
        event.bookings.length > 30 ||
        event.issues.length > 30
      )
        throw new Error("The draft file has invalid source notes.");
      if (
        event.issues.some(
          (issue) => typeof issue !== "string" || issue.length > 4000,
        )
      )
        throw new Error("Invalid source note.");
      for (const b of event.bookings)
        for (const field of ["room", "start", "end", "source"])
          if (typeof b[field] !== "string" || b[field].length > 1000)
            throw new Error("Invalid room booking.");
      if (
        !["Speaker", "Workshop", "Contest", "Fun", "Other"].includes(
          event.category,
        )
      )
        throw new Error("Invalid event category.");
      for (const field of ["start", "end"])
        if (
          typeof event[field] !== "string" ||
          (event[field] && parseIstInput(event[field]) === null)
        )
          throw new Error("Invalid event time.");
    }
    return batch.events;
  }
  fileInput.onchange = async () => {
    const account = accountIdentity(),
      file = fileInput.files[0],
      request = ++generation;
    if (!account || !file) return;
    try {
      if (file.size > 1000000)
        throw new Error("Choose a draft file smaller than 1 MB.");
      const batch = JSON.parse(await file.text());
      const imported = validateBatch(batch);
      if (request !== generation || accountIdentity() !== account) return;
      const savedBatch = JSON.parse(
        storage?.getItem(batchKey(account)) || "null",
      );
      const existing = savedBatch ? validateBatch(savedBatch) : [];
      const merged = mergeDraftEvents(existing, imported);
      storage.setItem(
        batchKey(account),
        JSON.stringify({ ...batch, events: merged }),
      );
      events = merged;
      dayChoice.value = "";
      render(account);
    } catch (error) {
      if (request === generation && accountIdentity() === account)
        status.textContent = error.message || "Could not read the draft file.";
    } finally {
      fileInput.value = "";
    }
  };
  return {
    open() {
      const account = accountIdentity();
      if (!account) return;
      ++generation;
      dialog.showModal();
      status.textContent = "Loading event drafts…";
      list.innerHTML = "";
      try {
        const savedBatch = storage?.getItem(batchKey(account));
        events = savedBatch ? validateBatch(JSON.parse(savedBatch)) : [];
        render(account);
      } catch {
        status.textContent =
          "Choose your draft file again to restore this list.";
      }
    },
    remember(id, account, fields) {
      if (accountIdentity() === account) save(account, id, { fields });
    },
    published(id, account, eventId) {
      if (accountIdentity() === account)
        save(account, id, { published: eventId });
    },
    clear() {
      generation++;
      events = [];
      list.innerHTML = "";
      status.textContent = "";
      fileInput.value = "";
      dialog.close();
    },
  };
}

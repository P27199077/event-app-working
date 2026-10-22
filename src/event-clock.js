import { date, esc } from "./utils.js";
const IST_OFFSET_MS = 330 * 60000;
export function istInput(value = Date.now()) {
  const instant = Number(value);
  if (!Number.isFinite(instant)) return "";
  return new Date(instant + IST_OFFSET_MS).toISOString().slice(0, 16);
}
export function parseIstInput(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  )
    return null;
  const instant = Date.parse(`${value}:00+05:30`);
  return Number.isFinite(instant) && istInput(instant) === value
    ? instant
    : null;
}
export function activeAt(event, instant) {
  return (
    event.status !== "cancelled" &&
    Date.parse(event.start) <= instant &&
    Date.parse(event.end) > instant
  );
}
export function createEventClock({ onChange }) {
  const $ = (selector) => document.querySelector(selector);
  const dialog = $("#timeViewDialog"),
    form = $("#timeViewForm"),
    button = $("#viewTimeButton");
  let selectedTime = null;
  function update() {
    const label = selectedTime === null ? "Now" : `${date(selectedTime)} IST`;
    button.innerHTML = `${selectedTime === null ? "<i></i>" : '<span aria-hidden="true">◷</span>'}<span>${esc(label)}</span><span aria-hidden="true">⌄</span>`;
    button.classList.toggle("time-preview", selectedTime !== null);
    button.setAttribute("aria-label", `View events at a time: ${label}`);
    $("#returnToLive").hidden = selectedTime === null;
  }
  function select(instant) {
    const changed = selectedTime !== instant;
    selectedTime = instant;
    update();
    dialog.close();
    if (changed) onChange();
  }
  button.onclick = () => {
    form.elements.viewTime.value = istInput(selectedTime ?? Date.now());
    $("#timeViewStatus").textContent = "";
    dialog.showModal();
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    const instant = parseIstInput(form.elements.viewTime.value);
    if (instant === null) {
      $("#timeViewStatus").textContent = "Choose a valid date and time in IST.";
      return;
    }
    select(instant);
  };
  $("#returnToLive").onclick = () => select(null);
  update();
  return {
    value: () => selectedTime,
    now: () => selectedTime ?? Date.now(),
    isPreview: () => selectedTime !== null,
    update,
  };
}

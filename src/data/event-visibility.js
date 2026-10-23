export const PIN_LEAD_MS = 15 * 60000;
export function pinVisibleAt(event, now = Date.now()) {
  const start = Date.parse(event.start),
    end = Date.parse(event.end);
  return (
    event.status !== "cancelled" &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start <= now + PIN_LEAD_MS &&
    end > now
  );
}
export function upcomingEvents(events, now = Date.now()) {
  return events
    .filter(
      (event) =>
        event.status !== "cancelled" &&
        Date.parse(event.start) > now &&
        Date.parse(event.end) > Date.parse(event.start),
    )
    .sort(
      (a, b) =>
        Date.parse(a.start) - Date.parse(b.start) ||
        String(a.id).localeCompare(String(b.id)),
    );
}
// Public discovery includes ongoing events and a 15-minute arrival window.
// Organizers can also see their own upcoming events in My events.
export function visibleAtTime(event, view, now = Date.now()) {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= now)
    return false;
  if (event.status === "cancelled") return false;
  return view === "Mine" ? Boolean(event.mine) : pinVisibleAt(event, now);
}

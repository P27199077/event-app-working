// Public discovery and interest lists contain live events only.
// Organizers can also see their own upcoming events in My events.
export function visibleAtTime(event, view, now = Date.now()) {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= now)
    return false;
  return view === "Mine" ? Boolean(event.mine) : start <= now;
}

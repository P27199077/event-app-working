export function countdown(event, now = Date.now()) {
  const start = Date.parse(event.start),
    end = Date.parse(event.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
  if (end <= now) return "Ended";
  const live = start <= now,
    minutes = Math.ceil(((live ? end : start) - now) / 60000);
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  const duration = hours
    ? `${hours}h${rest ? ` ${rest}m` : ""}`
    : `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return `${live ? "Ends" : "Starts"} in ${duration}`;
}
export function locationLabel(event) {
  const area = String(event.area || "").trim(),
    room = String(event.room || "").trim();
  if (!room) return area;
  if (area === "Custom pin" || room.toLowerCase() === area.toLowerCase())
    return room;
  return `${area} · ${room}`;
}

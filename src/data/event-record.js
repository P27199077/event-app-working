export function fromRow(row, userId) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    area: row.area,
    room: row.room,
    host: row.host,
    description: row.description,
    link: row.link,
    start: row.starts_at,
    end: row.ends_at,
    coords: [row.longitude, row.latitude],
    mine: row.organizer_id === userId,
    status: row.status || "published",
    revision: row.revision ?? 1,
  };
}
export function toRow(event) {
  return {
    title: event.title.trim(),
    category: event.category,
    area: event.area.trim(),
    room: event.room.trim(),
    host: event.host.trim(),
    description: event.description.trim(),
    link: event.link?.trim() || "",
    starts_at: event.start,
    ends_at: event.end,
    longitude: event.coords[0],
    latitude: event.coords[1],
  };
}
export function friendlyError(error) {
  if (error?.code === "40001")
    return "This event changed on another device. Refresh events and reopen it before trying again.";
  if (error?.code === "P0002")
    return "This event is no longer available. Refresh events and try again.";
  if (error?.code === "P0001")
    return "You have sent several requests. Please wait for review before submitting more.";
  if (error?.code === "PGRST202" || error?.code === "42883")
    return "Event requests are not available yet. Please try again later.";
  if (
    error?.code === "22023" ||
    error?.code === "23514" ||
    error?.code === "23502"
  )
    return "Check the event details, location, and start/end times, then try again.";
  if (error?.code === "23P01")
    return "This event is already posted or awaiting review at that venue for an overlapping time.";
  if (error?.code === "42501")
    return "Only approved organizers can publish. Editing all events requires an owner account.";
  if (error?.code === "PGRST205")
    return "Shared events are not set up yet. Please try again later.";
  return "Could not complete that request. Check your connection and try again.";
}

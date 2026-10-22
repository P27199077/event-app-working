// Group nearby pins in screen space while zoomed out. Real coordinates never change.
export const INDIVIDUAL_PIN_ZOOM = 18;
export function groupEventsAtPins(
  events,
  { zoom = INDIVIDUAL_PIN_ZOOM, project } = {},
) {
  const groups = [];
  for (const event of events) {
    const key = event.coords.map((value) => Number(value).toFixed(6)).join(",");
    const point = project?.(event.coords);
    let group = groups.find((candidate) => candidate.key === key);
    if (!group && zoom < INDIVIDUAL_PIN_ZOOM && point) {
      group = groups.find(
        (candidate) =>
          Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y) <
          42,
      );
    }
    if (group) group.events.push(event);
    else groups.push({ key, coords: event.coords, point, events: [event] });
  }
  return groups;
}
export function layoutPins(groups, zoom) {
  return groups.flatMap((group) => {
    if (zoom < INDIVIDUAL_PIN_ZOOM || group.events.length === 1)
      return [
        { group, events: group.events, coords: group.coords, offset: [0, 0] },
      ];
    // Different rooms/stalls can share a building coordinate. Fan them out visually.
    const columns = Math.ceil(Math.sqrt(group.events.length));
    const rows = Math.ceil(group.events.length / columns);
    return group.events.map((event, index) => ({
      group,
      events: [event],
      coords: event.coords,
      offset: [
        ((index % columns) - (columns - 1) / 2) * 42,
        (Math.floor(index / columns) - (rows - 1) / 2) * 48 - 22,
      ],
    }));
  });
}

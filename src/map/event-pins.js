import { groupEventsAtPins, layoutPins } from "./pin-layout.js";
export function renderEventPins(
  map,
  events,
  { previous = [], selected, selectedGroup, onSelect, onGroup },
) {
  previous.forEach((marker) => marker.remove());
  const zoom = map.getZoom();
  const groups = groupEventsAtPins(events, {
    zoom,
    project: (coords) => map.project(coords),
  });
  const markers = layoutPins(groups, zoom).map((pin) => {
    const event = pin.events[0],
      multiple = pin.events.length > 1;
    const button = document.createElement("button");
    const active =
      pin.events.some((event) => event.id === selected) ||
      pin.group.key === selectedGroup;
    button.className = "geo-pin " + (active ? "selected" : "");
    button.dataset.category = event.category;
    button.innerHTML =
      '<svg viewBox="0 0 32 42" aria-hidden="true" focusable="false"><path d="M16 1C7.72 1 1 7.72 1 16c0 10.9 15 25 15 25s15-14.1 15-25C31 7.72 24.28 1 16 1Z"/><circle cx="16" cy="16" r="5"/></svg>';
    if (multiple) {
      const count = document.createElement("span");
      count.className = "pin-count";
      count.textContent = String(pin.events.length);
      button.append(count);
    }
    const [dx, dy] = pin.offset;
    if (dx || dy) {
      const tether = document.createElement("span");
      tether.className = "pin-tether";
      tether.setAttribute("aria-hidden", "true");
      tether.style.width = Math.hypot(dx, dy) + "px";
      tether.style.transform = `rotate(${Math.atan2(-dy, -dx)}rad)`;
      button.prepend(tether);
    }
    button.title = multiple
      ? `${pin.events.length} nearby events · zoom in for individual pins`
      : event.title;
    button.setAttribute(
      "aria-label",
      multiple ? `${pin.events.length} nearby events` : event.title,
    );
    button.setAttribute("aria-pressed", String(active));
    button.onclick = (ev) => {
      ev.stopPropagation();
      multiple ? onGroup(pin.group) : onSelect(event.id);
    };
    return new maplibregl.Marker({
      element: button,
      anchor: "bottom",
      offset: pin.offset,
    })
      .setLngLat(pin.coords)
      .addTo(map);
  });
  return { markers, groups };
}

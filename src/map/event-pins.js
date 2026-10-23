import { groupEventsAtPins, layoutPins } from "./pin-layout.js";
import { placePinLabels, pinLabelTime } from "./pin-labels.js";
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
  const pins = layoutPins(groups, zoom);
  const container = map.getContainer(),
    bounds = container.getBoundingClientRect();
  const obstacles = [
    ...container.parentElement.querySelectorAll(
      ".map-heading,.map-tools,.place-legend,.event-legend,.detail,.maplibregl-ctrl-top-right",
    ),
  ]
    .filter((element) => element.offsetWidth && element.offsetHeight)
    .map((element) => {
      const box = element.getBoundingClientRect();
      return {
        x: box.left - bounds.left - 4,
        y: box.top - bounds.top - 4,
        width: box.width + 8,
        height: box.height + 8,
      };
    });
  const labels = placePinLabels(pins, {
    zoom,
    project: (coords) => map.project(coords),
    width: bounds.width,
    height: bounds.height,
    obstacles,
    selected,
  });
  const markers = pins.map((pin) => {
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
    } else {
      const label = document.createElement("span");
      label.className = "pin-label";
      label.setAttribute("aria-hidden", "true");
      for (const [className, text] of [
        ["pin-label-title", event.title],
        ["pin-label-room", event.room || event.area],
        ["pin-label-time", pinLabelTime(event)],
      ]) {
        const line = document.createElement("span");
        line.className = className;
        line.textContent = text;
        label.append(line);
      }
      const placement = labels.get(pin);
      if (placement) {
        button.classList.add("has-pin-label");
        label.style.left = placement.left + "px";
        label.style.top = placement.top + "px";
      }
      button.append(label);
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
      : `${event.title} · ${event.room || event.area} · ${pinLabelTime(event)}`;
    button.setAttribute(
      "aria-label",
      multiple ? `${pin.events.length} nearby events` : button.title,
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

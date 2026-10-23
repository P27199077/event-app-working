export const PIN_LABEL_ZOOM = 18;
export const PIN_LABEL_WIDTH = 176;
export const PIN_LABEL_HEIGHT = 64;
const overlap = (a, b) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

// Place labels in screen space. Marker anchors and real event coordinates stay intact.
export function placePinLabels(
  pins,
  { zoom, project, width, height, obstacles = [], selected },
) {
  if (zoom < PIN_LABEL_ZOOM) return new Map();
  const points = pins.map((pin) => {
    const p = project(pin.coords);
    return { pin, x: p.x + pin.offset[0], y: p.y + pin.offset[1] };
  });
  const pinBoxes = points.map(({ x, y }) => ({
    x: x - 16,
    y: y - 33,
    width: 32,
    height: 35,
  }));
  const placed = new Map(),
    occupied = [...obstacles];
  const order = points
    .filter(
      ({ pin, x, y }) =>
        pin.events.length === 1 &&
        x >= 0 &&
        x <= width &&
        y >= 0 &&
        y <= height,
    )
    .sort(
      (a, b) =>
        Number(b.pin.events[0].id === selected) -
          Number(a.pin.events[0].id === selected) ||
        a.y - b.y ||
        a.x - b.x ||
        String(a.pin.events[0].id).localeCompare(String(b.pin.events[0].id)),
    );
  for (const { pin, x, y } of order) {
    const w = PIN_LABEL_WIDTH,
      h = PIN_LABEL_HEIGHT;
    const candidates = [
      [19, -h + 8],
      [-w - 19, -h + 8],
      [-w / 2, -h - 38],
      [-w / 2, 8],
      [19, -22],
      [-w - 19, -22],
      [19, -h - 36],
      [-w - 19, -h - 36],
    ];
    for (const [dx, dy] of candidates) {
      const box = { x: x + dx, y: y + dy, width: w, height: h };
      if (
        box.x < 6 ||
        box.y < 6 ||
        box.x + w > width - 6 ||
        box.y + h > height - 6 ||
        occupied.some((other) => overlap(box, other)) ||
        pinBoxes.some((other) => overlap(box, other))
      )
        continue;
      placed.set(pin, { left: dx + 20, top: dy + 48 });
      occupied.push({
        ...box,
        x: box.x - 4,
        y: box.y - 4,
        width: w + 8,
        height: h + 8,
      });
      break;
    }
  }
  return placed;
}

export function pinLabelTime(event) {
  const format = (value) =>
    new Date(value).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
    });
  return `${format(event.start)} – ${format(event.end)} IST`;
}

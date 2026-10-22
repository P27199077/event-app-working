import { campusRing } from "./data/campus.js";
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const safeLink = (s) => {
  try {
    let u = new URL(s);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
};
export const inside = (c) => {
  if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1]))
    return false;
  const [x, y] = c;
  let hit = false;
  for (let i = 0, j = campusRing.length - 1; i < campusRing.length; j = i++) {
    const [xi, yi] = campusRing[i],
      [xj, yj] = campusRing[j];
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (
      Math.abs(cross) < 1e-12 &&
      x >= Math.min(xi, xj) &&
      x <= Math.max(xi, xj) &&
      y >= Math.min(yi, yj) &&
      y <= Math.max(yi, yj)
    )
      return true;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
};
export const ongoing = (e) =>
  new Date(e.start) <= new Date() && new Date(e.end) > new Date();
export const date = (s) =>
  new Date(s).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export const time = (e) => (ongoing(e) ? "Happening now" : date(e.start));

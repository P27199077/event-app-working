import { createSeedEvents, EVENT_TYPES } from "./events.js";
const KEY = "campus-pulse-v2";
export function loadState(storage) {
  let saved;
  try {
    saved = JSON.parse(storage?.getItem(KEY));
  } catch {}
  const seeds = createSeedEvents();
  const state = {
    events: Array.isArray(saved?.events)
      ? saved.events.filter((event) => event && typeof event === "object")
      : seeds,
    rsvps: Array.isArray(saved?.rsvps) ? saved.rsvps : [],
    reports: Array.isArray(saved?.reports)
      ? saved.reports.filter((report) => report && typeof report === "object")
      : [],
  };
  for (const event of state.events) {
    const seed = seeds.find((seed) => seed.id === event.id);
    if (!event.mine && seed && event.id <= 4) {
      for (const key of [
        "title",
        "category",
        "host",
        "description",
        "coords",
        "room",
      ])
        event[key] = seed[key];
    } else {
      event.category =
        { Tech: "Workshop", Social: "Fun", Sports: "Fun" }[event.category] ||
        event.category;
      if (!EVENT_TYPES.includes(event.category)) event.category = "Other";
    }
  }
  for (const seed of seeds.filter((event) => event.id >= 5)) {
    if (!state.events.some((event) => event.id === seed.id))
      state.events.push(seed);
  }
  return state;
}
export function persistState(state, storage) {
  storage.setItem(KEY, JSON.stringify(state));
}

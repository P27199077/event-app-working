import { inside } from "./utils.js";

export function classroomKey(value) {
  const key = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
  return /^[A-Z]{1,3}\d{2,4}[A-Z]?$/.test(key) ? key : null;
}
export function roomPinsFromEvents(events) {
  const pins = new Map();
  for (const event of events) {
    const key = classroomKey(event.room);
    if (!key || !inside(event.coords) || event.status === "cancelled") continue;
    const updated =
      Number(event.usedAt) || Date.parse(event.created || "") || 0;
    if (!pins.has(key) || updated > pins.get(key).usedAt)
      pins.set(key, {
        room: key,
        area: event.area || "Custom pin",
        coords: [...event.coords],
        usedAt: updated,
      });
  }
  return [...pins.values()];
}
export function createPrivateRoomPins({
  storage,
  accountIdentity,
  fetchHistory,
  onChange,
}) {
  let pins = [],
    generation = 0;
  const storageKey = (account) => `pinpoint-private-room-pins-v1-${account}`;
  const read = (account) => {
    try {
      const data = JSON.parse(storage?.getItem(storageKey(account)) || "[]");
      return Array.isArray(data) ? roomPinsFromEvents(data) : [];
    } catch {
      return [];
    }
  };
  function persist(account) {
    try {
      storage?.setItem(storageKey(account), JSON.stringify(pins));
    } catch {}
  }
  return {
    async load(account) {
      const request = ++generation;
      if (!account || accountIdentity() !== account) return;
      pins = read(account);
      onChange();
      try {
        const events = await fetchHistory(account);
        if (request !== generation || accountIdentity() !== account) return;
        pins = roomPinsFromEvents([...pins, ...events]);
        persist(account);
        onChange();
      } catch {
        /* Keep this account's browser cache when the history request fails. */
      }
    },
    find(room) {
      return accountIdentity()
        ? pins.find((pin) => pin.room === classroomKey(room))
        : null;
    },
    list: () => (accountIdentity() ? pins : []),
    remember(event, account) {
      if (!account || accountIdentity() !== account) return;
      pins = roomPinsFromEvents([...pins, { ...event, usedAt: Date.now() }]);
      persist(account);
      onChange();
    },
    clear() {
      generation++;
      pins = [];
      onChange();
    },
  };
}

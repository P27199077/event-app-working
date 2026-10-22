import { SAVED_VENUES } from "./data/venues.js";
import { FOOD_SPOTS } from "./data/food-spots.js";
const PLACES = [
  ...SAVED_VENUES.map((venue) => ({ ...venue, group: "venues" })),
  ...FOOD_SPOTS.map((spot) => ({ ...spot, group: "food_spots" })),
];
const placeById = (id) => PLACES.find((place) => place.id === id);
import { inside, esc } from "./utils.js";
const KEY = "pinpoint-venue-drafts-v1";

// This edits browser-local drafts only. Official locations remain in the deployed source.
export function createVenueSetup({
  getMap,
  isReviewer,
  beforePick,
  notify,
  storage,
}) {
  const $ = (selector) => document.querySelector(selector);
  const dialog = $("#venueSetupDialog");
  let drafts = {},
    active = null,
    point = null,
    marker = null;
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || "{}");
    for (const venue of PLACES)
      if (inside(saved?.[venue.id]?.coords)) drafts[venue.id] = saved[venue.id];
  } catch {}
  function allowed() {
    return Boolean(isReviewer());
  }
  function data() {
    return {
      version: 2,
      venues: SAVED_VENUES.filter((v) => drafts[v.id]).map((v) => ({
        id: v.id,
        label: v.label,
        area: v.area,
        room: v.room,
        coords: drafts[v.id].coords,
        accuracy: "confirmed",
      })),
      food_spots: FOOD_SPOTS.filter((v) => drafts[v.id]).map((v) => ({
        id: v.id,
        label: v.label,
        coords: drafts[v.id].coords,
        place_type: "food",
        accuracy: "confirmed",
      })),
    };
  }
  function redraw() {
    const group = placeById($("#setupVenueChoice").value)?.group || "venues";
    $("#venueDraftList").innerHTML = PLACES.filter(
      (place) => place.group === group,
    )
      .map(
        (venue) =>
          `<li><span>${esc(venue.label)}</span><strong>${drafts[venue.id] ? "Placed ✓" : "Not placed"}</strong></li>`,
      )
      .join("");
    $("#venueDraftData").value = JSON.stringify(data(), null, 2);
    $("#downloadVenueDrafts").disabled = !Object.keys(drafts).length;
  }
  function cancel() {
    active = null;
    point = null;
    marker?.remove();
    marker = null;
    $("#venuePlacement").hidden = true;
    $("#campusMap").classList.remove("picking");
    $(".map").classList.remove("venue-setup-active");
  }
  function open() {
    if (!allowed()) return;
    redraw();
    dialog.showModal();
  }
  $("#setupVenueChoice").innerHTML = [
    ["venues", "Event venues"],
    ["food_spots", "Food spots"],
  ]
    .map(
      ([group, label]) =>
        `<optgroup label="${label}">${PLACES.filter(
          (place) => place.group === group,
        )
          .map(
            (place) =>
              `<option value="${place.id}">${esc(place.label)}</option>`,
          )
          .join("")}</optgroup>`,
    )
    .join("");
  $("#setupVenueChoice").onchange = redraw;
  $("#placeVenue").onclick = () => {
    if (!allowed()) return;
    const map = getMap();
    if (!map) {
      notify("The map is not ready yet. Please try again.");
      return;
    }
    beforePick();
    active = $("#setupVenueChoice").value;
    const venue = placeById(active);
    point = null;
    marker?.remove();
    marker = null;
    dialog.close();
    $("#venuePlacementLabel").textContent =
      `Place ${venue.label}: zoom in and tap its location.`;
    $("#saveVenuePoint").disabled = true;
    $("#venuePlacement").hidden = false;
    $("#campusMap").classList.add("picking");
    $(".map").classList.add("venue-setup-active");
    map.easeTo({
      center: drafts[active]?.coords || venue.coords || venue.focus,
      zoom: Math.max(map.getZoom(), 18),
      duration: 450,
    });
    $("#campusMap").scrollIntoView({ behavior: "smooth", block: "center" });
  };
  $("#cancelVenuePoint").onclick = () => {
    cancel();
    if (allowed()) open();
  };
  $("#saveVenuePoint").onclick = () => {
    if (!allowed() || !active || !inside(point)) return;
    const venue = placeById(active);
    drafts[active] = { coords: [...point] };
    let persisted = false;
    try {
      if (storage) {
        storage.setItem(KEY, JSON.stringify(drafts));
        persisted = true;
      }
    } catch {}
    const next = PLACES.find((v) => v.group === venue.group && !drafts[v.id]);
    cancel();
    if (next) $("#setupVenueChoice").value = next.id;
    redraw();
    $("#venueSetupStatus").textContent = persisted
      ? `${venue.label} saved in this browser. Choose the next place, or download your locations.`
      : `${venue.label} saved for this session. Download the file before closing this page.`;
    dialog.showModal();
  };
  $("#downloadVenueDrafts").onclick = () => {
    if (!allowed() || !Object.keys(drafts).length) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data(), null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pinpoint-map-locations.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active) cancel();
  });
  return {
    open,
    cancel,
    handleMapClick(coords) {
      if (!active) return false;
      if (!allowed()) {
        cancel();
        return true;
      }
      if (!inside(coords)) {
        notify("Choose a point inside campus.");
        return true;
      }
      point = [...coords];
      marker?.remove();
      const el = document.createElement("div");
      el.className = "venue-calibration-pin";
      el.textContent = placeById(active).label;
      marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(point)
        .addTo(getMap());
      $("#venuePlacementLabel").textContent =
        `${placeById(active).label} selected. Tap again to adjust, then Save location.`;
      $("#saveVenuePoint").disabled = false;
      return true;
    },
  };
}

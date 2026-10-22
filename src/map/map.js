import { streetLayersForTheme, applyMapTheme } from "./theme.js?palette=11";
import { CAMPUS_BOUNDARY } from "../data/campus-boundary.js";
import { campusRing, bounds } from "../data/campus.js";
import { CAMPUS_STREET_STYLE } from "./street-style.js";
const $ = (selector) => document.querySelector(selector);
export function fit(map) {
  if (map)
    map.fitBounds(bounds, {
      padding:
        innerWidth <= 760
          ? { top: 145, bottom: 95, left: 25, right: 45 }
          : { top: 130, bottom: 90, left: 45, right: 70 },
      duration: 450,
      bearing: 0,
      pitch: 0,
    });
}
export function createCampusMap({ onLoad, onPick }) {
  let map;
  try {
    map = new maplibregl.Map({
      container: "campusMap",
      style: {
        version: 8,
        glyphs: CAMPUS_STREET_STYLE.glyphs,
        sources: {
          ...CAMPUS_STREET_STYLE.sources,
          satellite: {
            type: "raster",
            tiles: [
              "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution:
              "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
          },
        },
        layers: [
          ...streetLayersForTheme(document.documentElement.dataset.theme),
          {
            id: "satellite",
            type: "raster",
            source: "satellite",
            layout: { visibility: "none" },
          },
        ],
      },
      center: [78.5732, 17.5454],
      zoom: 16,
      minZoom: 12.5,
      maxZoom: 20,
      maxBounds: [
        [78.558, 17.533],
        [78.59, 17.558],
      ],
      bearing: 0,
      pitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 100 }),
      "bottom-left",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    map.on("load", () => {
      map.addSource("campus-perimeter", {
        type: "geojson",
        data: CAMPUS_BOUNDARY,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>',
      });
      map.addSource("outside-campus", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [78.4, 17.4],
                [78.8, 17.4],
                [78.8, 17.7],
                [78.4, 17.7],
                [78.4, 17.4],
              ],
              campusRing,
            ],
          },
        },
      });
      map.addLayer({
        id: "outside-campus",
        type: "fill",
        source: "outside-campus",
        paint: { "fill-color": "#fff3e4", "fill-opacity": 1 },
      });
      map.addLayer({
        id: "campus-perimeter",
        type: "line",
        source: "campus-perimeter",
        paint: {
          "line-color": "#c5a987",
          "line-width": 1.5,
          "line-opacity": 0.9,
        },
      });
      applyMapTheme(map, document.documentElement.dataset.theme);
      fit(map);
      onLoad();
    });
    const themeChanged = () => {
      if (map.isStyleLoaded())
        applyMapTheme(map, document.documentElement.dataset.theme);
    };
    document.addEventListener("pinpoint:themechange", themeChanged);
    map.on("remove", () =>
      document.removeEventListener("pinpoint:themechange", themeChanged),
    );
    map.on("error", () => {
      $("#mapStatus").textContent =
        "Map imagery unavailable? Try the other map layer.";
    });
    map.on("idle", () => {
      if (map.areTilesLoaded()) $("#mapStatus").textContent = "";
    });
    map.on("moveend", () => {
      $("#campusMap").setAttribute(
        "aria-label",
        `Zoomable campus map · zoom ${map.getZoom().toFixed(1)} · north up`,
      );
    });
    map.on("click", (e) => onPick([e.lngLat.lng, e.lngLat.lat]));
    new ResizeObserver(() => map.resize()).observe($("#campusMap"));
    return map;
  } catch (error) {
    console.error("Campus map initialization failed:", error);
    $("#mapStatus").textContent =
      "The map needs WebGL support. Activity cards are still available.";
    $("#pickLocation").disabled = true;
    $("#chooseMap").disabled = true;
  }
}

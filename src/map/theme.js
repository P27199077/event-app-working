import { CAMPUS_STREET_STYLE } from "./street-style.js?places=12";
const DARK_COLORS = {
  "#fff3e4": "#bfb3a7",
  "#cfe1af": "#8c9d7a",
  "#a6d3b2": "#77947a",
  "#8bb99a": "#5d775f",
  "#a3cedb": "#8fafbb",
  "#87b7c8": "#6c929f",
  "#e6a078": "#9c735f",
  "#cb8864": "#815e4d",
  "#bea4dc": "#84709b",
  "#a68bc4": "#6a5880",
  "#edc260": "#b29659",
  "#ccaa4d": "#917638",
  "#93bbc9": "#648793",
  "#789eae": "#4f6e79",
  "#e4dbce": "#d0c4b5",
  "#cfc5b8": "#a79a8f",
  "#b7aa99": "#998b81",
  "#96958f": "#cbbca9",
  "#b4b3ad": "#9a8d7d",
  "#5e5c56": "#29232b",
  "#f6efe3": "#e9ddcc",
  "#7d624f": "#29232b",
  "#fff7e9": "#e9ddcc",
  "#663b29": "#fff1df",
};
function recolor(value) {
  if (Array.isArray(value)) return value.map(recolor);
  return typeof value === "string" ? DARK_COLORS[value] || value : value;
}
export function streetLayersForTheme(theme) {
  return CAMPUS_STREET_STYLE.layers.map((layer) => {
    const paint =
      theme === "dark"
        ? Object.fromEntries(
            Object.entries(layer.paint || {}).map(([property, value]) => [
              property,
              property.endsWith("color") ? recolor(value) : value,
            ]),
          )
        : { ...layer.paint };
    const layout = layer.layout ? { ...layer.layout } : undefined;
    if (theme === "dark" && layer.type === "symbol") {
      paint["text-color"] = "#29232b";
      paint["text-halo-color"] = "#f0e5d5";
      const size = layout["text-size"];
      layout["text-size"] = Array.isArray(size)
        ? size.map((value, index) =>
            index >= 4 && index % 2 === 0 ? value + 2 : value,
          )
        : size + 2;
    }
    return { ...layer, ...(layout ? { layout } : {}), paint };
  });
}
export function applyMapTheme(map, theme) {
  for (const layer of streetLayersForTheme(theme)) {
    if (!map.getLayer(layer.id)) continue;
    for (const [property, value] of Object.entries(layer.paint || {}))
      if (property.endsWith("color"))
        map.setPaintProperty(layer.id, property, value);
    if (layer.layout?.["text-size"] !== undefined)
      map.setLayoutProperty(layer.id, "text-size", layer.layout["text-size"]);
  }
  if (map.getLayer("outside-campus"))
    map.setPaintProperty(
      "outside-campus",
      "fill-color",
      theme === "dark" ? "#2e2834" : "#fff3e4",
    );
  if (map.getLayer("campus-perimeter"))
    map.setPaintProperty(
      "campus-perimeter",
      "line-color",
      theme === "dark" ? "#ab988d" : "#c5a987",
    );
}

import test from "node:test";
import assert from "node:assert/strict";
import { streetLayersForTheme, applyMapTheme } from "../../src/map/theme.js";
import { CAMPUS_STREET_STYLE } from "../../src/map/street-style.js";
test("dark palette preserves every map layer, filter, label, and source", () => {
  const original = JSON.stringify(CAMPUS_STREET_STYLE);
  const dark = streetLayersForTheme("dark");
  assert.equal(dark.length, CAMPUS_STREET_STYLE.layers.length);
  for (let i = 0; i < dark.length; i++) {
    const { paint: darkPaint, ...darkStructure } = dark[i];
    const { paint: lightPaint, ...lightStructure } =
      CAMPUS_STREET_STYLE.layers[i];
    const { layout: darkLayout, ...darkRest } = darkStructure;
    const { layout: lightLayout, ...lightRest } = lightStructure;
    assert.deepEqual(darkRest, lightRest);
    if (lightLayout?.["text-size"] !== undefined) {
      const { "text-size": darkSize, ...darkLabelLayout } = darkLayout;
      const { "text-size": lightSize, ...lightLabelLayout } = lightLayout;
      assert.deepEqual(darkLabelLayout, lightLabelLayout);
      assert.notDeepEqual(darkSize, lightSize);
    } else assert.deepEqual(darkLayout, lightLayout);
    for (const key of Object.keys(lightPaint))
      if (!key.endsWith("color"))
        assert.deepEqual(darkPaint[key], lightPaint[key]);
  }
  assert.equal(JSON.stringify(CAMPUS_STREET_STYLE), original);
  assert.deepEqual(streetLayersForTheme("light"), CAMPUS_STREET_STYLE.layers);
});
test("switching map themes recolors without replacing layers or their visibility", () => {
  const changes = [];
  const map = {
    getLayer: () => true,
    setPaintProperty: (...args) => changes.push(args),
    setLayoutProperty: (...args) => changes.push(args),
  };
  applyMapTheme(map, "dark");
  assert.ok(
    changes.some(
      ([id, key, value]) =>
        id === "street-background" &&
        key === "background-color" &&
        value === "#bfb3a7",
    ),
  );
  assert.ok(
    changes.some(
      ([id, key]) => id === "street-buildings" && key === "fill-color",
    ),
  );
  assert.ok(!changes.some(([id]) => id === "satellite"));
  assert.ok(
    changes.some(
      ([id, key, value]) =>
        id === "street-road-names" && key === "text-size" && value === 13,
    ),
  );
  changes.length = 0;
  applyMapTheme(map, "light");
  assert.ok(
    changes.some(
      ([id, key, value]) =>
        id === "street-road-names" && key === "text-size" && value === 11,
    ),
  );
  assert.ok(
    changes.some(
      ([id, key, value]) => id === "street-background" && value === "#fff3e4",
    ),
  );
});

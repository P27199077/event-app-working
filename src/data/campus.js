import { CAMPUS_BOUNDARY } from "./campus-boundary.js";
export const areas = {
  "Academic block": [78.5716, 17.5445],
  Auditorium: [78.57043684664302, 17.545513458965132],
  "Rock Garden": [78.5732, 17.5447],
  "Sports area (illustrative)": [78.57448405, 17.5437066],
};
export const campusRing = CAMPUS_BOUNDARY.geometry.coordinates[0];
export const bounds = [
  [
    Math.min(...campusRing.map((c) => c[0])),
    Math.min(...campusRing.map((c) => c[1])),
  ],
  [
    Math.max(...campusRing.map((c) => c[0])),
    Math.max(...campusRing.map((c) => c[1])),
  ],
];

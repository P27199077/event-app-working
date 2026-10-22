# Campus Pulse

A warm, zoomable campus event map prototype for BITS Hyderabad. Includes academic block labels A–J, category-coloured event pins, event posting, filters, local RSVPs, and an optional empty-classroom layer.

## Run locally

```sh
python3 -m http.server 3017 --directory dist --bind 127.0.0.1
```

Open http://127.0.0.1:3017 in a browser with WebGL support. No build step or server backend is required.

Empty-classroom pins start hidden on each page load. Use the switch beside **Empty classrooms** in the map key to show or hide them. Selecting the Empty classrooms filter also enables that layer.

## Prototype limits

Posts, RSVPs, and reports are saved only in the current browser's localStorage. Classroom availability is reported by users; there is no timetable integration or live occupancy detection. Demo activities are illustrative.

## Map data and dependencies

The local campus basemap is derived from OpenStreetMap contributors under ODbL 1.0. See https://www.openstreetmap.org/copyright. MapLibre GL JS and its license are included in `dist/vendor/`; font attribution is in `dist/fonts/NOTICE.txt`. Optional satellite imagery uses Esri's online World Imagery service and requires an internet connection.

import { areas } from "./campus.js";
export const H = 3600000;
const templates = [
  [
    "Build your first web app",
    "Workshop",
    "Academic block",
    "Sample room: Block E · Floor 1 · E-101",
    "Sample coding group",
    "A guided, beginner-friendly workshop. Bring a laptop and leave with a small working web app.",
    -1,
    3,
  ],
  [
    "An evening of acoustic music",
    "Fun",
    "Rock Garden",
    "Garden entrance · approximate meeting point",
    "Sample music circle",
    "An unplugged jam. Bring an instrument, or just come listen.",
    2,
    4,
  ],
  [
    "Ideas worth sharing",
    "Speaker",
    "Auditorium",
    "Main foyer · illustrative meeting point",
    "Sample speaker series",
    "A visiting researcher shares their work, followed by an open Q&A. Everyone is welcome.",
    22,
    24,
  ],
  [
    "Anyone up for a quick game?",
    "Fun",
    "Sports area (illustrative)",
    "Approximate sports-area pin · confirm with host",
    "Sample student group",
    "A casual game meetup. The host will confirm the playing area.",
    -1,
    2,
  ],
];
export const EVENT_TYPES = [
  "Speaker",
  "Workshop",
  "Contest",
  "Fun",
  "Other",
  "Empty classroom",
];
const makeSeed = (t, i) => ({
  id: i + 1,
  title: t[0],
  category: t[1],
  area: t[2],
  room: t[3],
  host: t[4],
  description: t[5],
  start: new Date(Date.now() + t[6] * H).toISOString(),
  end: new Date(Date.now() + t[7] * H).toISOString(),
  coords: areas[t[2]],
  mine: false,
});
const extraSeeds = [
  {
    id: 5,
    title: "Campus coding sprint",
    category: "Contest",
    area: "Academic block",
    room: "New academic block · sample classroom",
    host: "Sample programming club",
    description: "A friendly team coding contest. Beginners can join too.",
    start: new Date(Date.now() + H).toISOString(),
    end: new Date(Date.now() + 4 * H).toISOString(),
    coords: [78.56971119, 17.54590356],
    mine: false,
  },
  {
    id: 6,
    title: "Books, notes & little things",
    category: "Other",
    area: "Custom pin",
    room: "Connaught Place · sample meetup spot",
    host: "Sample student collective",
    description:
      "An informal book and notes exchange. Drop by with something to share.",
    start: new Date(Date.now() - H).toISOString(),
    end: new Date(Date.now() + 3 * H).toISOString(),
    coords: [78.5756, 17.542],
    mine: false,
  },
];
export const createSeedEvents = () => [
  ...templates.map(makeSeed),
  ...extraSeeds.map((event) => ({ ...event })),
];

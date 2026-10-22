import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const output = new URL("site/", root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ["index.html", "src", "public"]) {
  await cp(new URL(name, root), new URL(name, output), { recursive: true });
}
console.log(`PinPoint site ready: ${fileURLToPath(output)}`);

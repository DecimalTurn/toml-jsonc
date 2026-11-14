import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// The converters live at the repository root so the browser utility, server.js,
// the GitHub Pages workflow and this package all share one copy. Copy them into
// the package at pack time instead of duplicating them in version control.
const names = ["toml_to_jsonc.py", "jsonc_to_toml.py"];

await mkdir(fileURLToPath(new URL("../lib/", import.meta.url)), { recursive: true });
for (const name of names) {
  await copyFile(
    fileURLToPath(new URL(`../../${name}`, import.meta.url)),
    fileURLToPath(new URL(`../lib/${name}`, import.meta.url)),
  );
}

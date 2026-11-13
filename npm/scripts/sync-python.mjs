import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The converter lives at the repository root so the browser demo, server.js,
// the GitHub Pages workflow and this package all share one copy. Copy it into
// the package at pack time instead of duplicating it in version control.
const source = fileURLToPath(new URL("../../toml_to_jsonc.py", import.meta.url));
const target = fileURLToPath(new URL("../lib/toml_to_jsonc.py", import.meta.url));

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);

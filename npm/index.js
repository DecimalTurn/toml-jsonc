import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadPyodide } from "pyodide";

const PYTHON_SOURCE = fileURLToPath(new URL("./lib/toml_to_jsonc.py", import.meta.url));
const TOMLKIT_WHEEL = fileURLToPath(new URL("./vendor/tomlkit-0.13.3-py3-none-any.whl", import.meta.url));

/** Thrown when the TOML input cannot be converted. */
export class TomlJsoncError extends Error {
  constructor(message, { cause, type } = {}) {
    super(message, { cause });
    this.name = "TomlJsoncError";
    if (type) this.type = type;
  }
}

async function createConverter() {
  const pyodide = await loadPyodide();

  // tomlkit is a pure-Python wheel, so unpack it inside the Pyodide filesystem.
  // Handing a Windows path to loadPackage() mangles the wheel name it derives.
  const wheel = await readFile(TOMLKIT_WHEEL);
  pyodide.FS.writeFile("/tmp/tomlkit.whl", new Uint8Array(wheel));
  await pyodide.runPythonAsync(`
import sys, zipfile

zipfile.ZipFile("/tmp/tomlkit.whl").extractall("/pkgs")
sys.path.insert(0, "/pkgs")
`);

  // The converter ends with a sample conversion that prints on execution.
  // Keep it from leaking into the host's stdout.
  pyodide.globals.set("__toml_jsonc_source__", await readFile(PYTHON_SOURCE, "utf8"));
  pyodide.runPython(`
import contextlib, io

__toml_jsonc_stdout__ = io.StringIO()
with contextlib.redirect_stdout(__toml_jsonc_stdout__):
    exec(compile(__toml_jsonc_source__, "toml_to_jsonc.py", "exec"), globals())
`);

  return pyodide.globals.get("toml_to_jsonc");
}

let converter;

/** Load the Python runtime ahead of the first conversion. */
export async function warmup() {
  await getConverter();
}

function getConverter() {
  converter ??= createConverter().catch((error) => {
    converter = undefined;
    throw error;
  });
  return converter;
}

function toTomlJsoncError(error) {
  const traceback = typeof error?.message === "string" ? error.message : String(error);
  const lastLine = traceback.trimEnd().split("\n").pop() ?? "";
  const match = /^([\w.]+(?:Error|Exception)):\s*([\s\S]*)$/.exec(lastLine);
  const detail = (match ? match[2] : lastLine).trim();
  return new TomlJsoncError(`Could not convert TOML: ${detail}`, {
    cause: error,
    type: match ? match[1] : undefined,
  });
}

/**
 * Convert a TOML document to JSONC, preserving comments and key order.
 * @param {string} toml
 * @returns {Promise<string>}
 */
export async function tomlToJsonc(toml) {
  if (typeof toml !== "string") {
    throw new TypeError(`Expected the TOML input to be a string, received ${toml === null ? "null" : typeof toml}`);
  }

  const convert = await getConverter();

  try {
    return convert(toml);
  } catch (error) {
    throw toTomlJsoncError(error);
  }
}

export default tomlToJsonc;

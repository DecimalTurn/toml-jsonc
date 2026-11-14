import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadPyodide } from "pyodide";

const PYTHON_SOURCES = [
  ["toml_to_jsonc.py", "toml_to_jsonc"],
  ["jsonc_to_toml.py", "jsonc_to_toml"],
];
const TOMLKIT_WHEEL = fileURLToPath(new URL("./vendor/tomlkit-0.13.3-py3-none-any.whl", import.meta.url));

/** Thrown when the input cannot be converted. */
export class ConversionError extends Error {
  constructor(message, { cause, type } = {}) {
    super(message, { cause });
    this.name = "ConversionError";
    if (type) this.type = type;
  }
}

/** Backwards-compatible alias for {@link ConversionError}. */
export const TomlJsoncError = ConversionError;

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

  for (const [file, name] of PYTHON_SOURCES) {
    // toml_to_jsonc.py ends with a sample conversion that prints on execution.
    // Keep it from leaking into the host's stdout.
    pyodide.globals.set("__source__", await readFile(new URL(`./lib/${file}`, import.meta.url), "utf8"));
    pyodide.globals.set("__filename__", file);
    pyodide.runPython(`
import contextlib, io

__stdout__ = io.StringIO()
with contextlib.redirect_stdout(__stdout__):
    exec(compile(__source__, __filename__, "exec"), globals())
`);
    if (!pyodide.globals.has(name)) {
      throw new Error(`Python module ${file} did not define ${name}()`);
    }
  }

  return {
    tomlToJsonc: pyodide.globals.get("toml_to_jsonc"),
    jsoncToToml: pyodide.globals.get("jsonc_to_toml"),
  };
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

function toConversionError(error, target) {
  const traceback = typeof error?.message === "string" ? error.message : String(error);
  const lastLine = traceback.trimEnd().split("\n").pop() ?? "";
  const match = /^([\w.]+(?:Error|Exception)):\s*([\s\S]*)$/.exec(lastLine);
  const detail = (match ? match[2] : lastLine).trim();
  return new ConversionError(`Could not convert to ${target}: ${detail}`, {
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

  const { tomlToJsonc: convert } = await getConverter();

  try {
    return convert(toml);
  } catch (error) {
    throw toConversionError(error, "JSONC");
  }
}

/**
 * Convert a JSONC document to TOML, preserving comments.
 * @param {string} jsonc
 * @returns {Promise<string>}
 */
export async function jsoncToToml(jsonc) {
  if (typeof jsonc !== "string") {
    throw new TypeError(`Expected the JSONC input to be a string, received ${jsonc === null ? "null" : typeof jsonc}`);
  }

  const { jsoncToToml: convert } = await getConverter();

  try {
    return convert(jsonc);
  } catch (error) {
    throw toConversionError(error, "TOML");
  }
}

export default tomlToJsonc;

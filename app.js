const input = document.getElementById("toml");
const output = document.getElementById("jsonc");
const convert = document.getElementById("convert");
const status = document.getElementById("status");
const copyButton = document.getElementById("copy");
const copyLabel = copyButton.querySelector(".copy-label");
const swapButton = document.getElementById("swap");
const inputLabel = document.getElementById("input-label");
const outputLabel = document.getElementById("output-label");
const themeToggle = document.querySelector(".theme-toggle");

let direction = "toml-to-jsonc";
let converters = null;

let copyResetTimer;

const root = document.documentElement;
const themeStorageKey = "toml-jsonc-theme";
const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");

function activeTheme() {
  return root.dataset.theme || (darkScheme.matches ? "dark" : "light");
}

function updateThemeToggle() {
  const isDark = activeTheme() === "dark";
  const nextTheme = isDark ? "light" : "dark";
  themeToggle.dataset.action = nextTheme;
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
  themeToggle.title = `Switch to ${nextTheme} mode`;
}

themeToggle.addEventListener("click", () => {
  const nextTheme = activeTheme() === "dark" ? "light" : "dark";
  root.dataset.theme = nextTheme;
  try {
    localStorage.setItem(themeStorageKey, nextTheme);
  } catch {
    // The toggle still works when storage is unavailable.
  }
  updateThemeToggle();
});

darkScheme.addEventListener("change", () => {
  if (!root.dataset.theme) {
    updateThemeToggle();
  }
});

updateThemeToggle();

function setStatus(message, state) {
  status.textContent = message;
  status.dataset.state = state;
}

function describeError(error) {
  const text = typeof error?.message === "string" ? error.message : String(error);
  const lastLine = text.trimEnd().split("\n").pop() ?? "";
  return lastLine.replace(/^[\w.]+(?:Error|Exception):\s*/, "");
}

const INDENT = "  ";

// Tab indents instead of leaving the field. Press Escape first to move focus.
let tabMovesFocus = false;

function indentSelection() {
  const { selectionStart: start, selectionEnd: end, value } = input;

  if (start === end) {
    input.setRangeText(INDENT, start, end, "end");
    return;
  }

  const blockStart = value.lastIndexOf("\n", start - 1) + 1;
  const lines = value.slice(blockStart, end).split("\n");
  const indented = lines
    .map((line, index) => (index === lines.length - 1 && line === "" ? line : INDENT + line))
    .join("\n");
  input.setRangeText(indented, blockStart, end, "preserve");
}

input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    tabMovesFocus = true;
    return;
  }

  if (event.key !== "Tab") {
    tabMovesFocus = false;
    return;
  }

  if (tabMovesFocus) {
    tabMovesFocus = false;
    return;
  }

  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }

  event.preventDefault();
  indentSelection();
});

function showCopied() {
  clearTimeout(copyResetTimer);
  copyButton.dataset.copied = "true";
  copyLabel.textContent = "Copied";
  copyResetTimer = setTimeout(() => {
    delete copyButton.dataset.copied;
    copyLabel.textContent = "Copy";
  }, 1600);
}

function resetCopyState() {
  clearTimeout(copyResetTimer);
  delete copyButton.dataset.copied;
  copyLabel.textContent = "Copy";
}

function selectOutput() {
  output.focus();
  output.select();
}

function syncDirection() {
  const tomlFirst = direction === "toml-to-jsonc";
  inputLabel.textContent = tomlFirst ? "TOML" : "JSONC";
  outputLabel.textContent = tomlFirst ? "JSONC" : "TOML";
  input.placeholder = tomlFirst ? "Paste TOML here" : "Paste JSONC here";
  swapButton.title = "Swap input and output";
}

function runConversion() {
  resetCopyState();
  try {
    output.value = converters[direction](input.value);
    copyButton.disabled = false;
    setStatus("Conversion complete.", "ready");
  } catch (error) {
    output.value = "";
    copyButton.disabled = true;
    setStatus(`Conversion failed: ${describeError(error)}`, "error");
  }
}

swapButton.addEventListener("click", () => {
  const previousInput = input.value;
  input.value = output.value;
  output.value = previousInput;
  direction = direction === "toml-to-jsonc" ? "jsonc-to-toml" : "toml-to-jsonc";
  syncDirection();
  resetCopyState();
  copyButton.disabled = true;
  if (input.value.trim()) {
    runConversion();
  } else {
    setStatus("Ready.", "ready");
  }
});

copyButton.addEventListener("click", async () => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(output.value);
    } else {
      selectOutput();
      if (!document.execCommand("copy")) {
        throw new Error("The copy command was rejected");
      }
      output.setSelectionRange(0, 0);
    }
    showCopied();
  } catch (error) {
    selectOutput();
    setStatus("Could not copy automatically; the output is selected so you can copy it manually.", "error");
    console.error(error);
  }
});

async function initialize() {
  try {
    const pyodide = await loadPyodide();
    await pyodide.loadPackage("micropip");
    await pyodide.runPythonAsync(`
import micropip
await micropip.install("tomlkit==0.13.3")
`);

    const [tomlSource, jsoncSource] = await Promise.all(
      ["toml_to_jsonc.py", "jsonc_to_toml.py"].map(async (name) => {
        const response = await fetch(`./${name}`);
        if (!response.ok) {
          throw new Error(`Could not load ${name} (HTTP ${response.status})`);
        }
        return response.text();
      }),
    );
    pyodide.runPython(tomlSource);
    pyodide.runPython(jsoncSource);
    converters = {
      "toml-to-jsonc": pyodide.globals.get("toml_to_jsonc"),
      "jsonc-to-toml": pyodide.globals.get("jsonc_to_toml"),
    };

    convert.addEventListener("click", runConversion);
    convert.disabled = false;
    swapButton.disabled = false;
    syncDirection();
    setStatus("Ready.", "ready");
  } catch (error) {
    setStatus(`Could not initialize the tool: ${describeError(error)}`, "error");
    console.error(error);
  }
}

initialize();

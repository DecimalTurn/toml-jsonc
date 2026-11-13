const input = document.getElementById("toml");
const output = document.getElementById("jsonc");
const convert = document.getElementById("convert");
const status = document.getElementById("status");
const copyButton = document.getElementById("copy");
const copyLabel = copyButton.querySelector(".copy-label");
const themeToggle = document.querySelector(".theme-toggle");

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

    const response = await fetch("./toml_to_jsonc.py");
    if (!response.ok) {
      throw new Error(`Could not load toml_to_jsonc.py (HTTP ${response.status})`);
    }
    pyodide.runPython(await response.text());
    const tomlToJsonc = pyodide.globals.get("toml_to_jsonc");

    convert.addEventListener("click", () => {
      resetCopyState();
      try {
        output.value = tomlToJsonc(input.value);
        copyButton.disabled = false;
        setStatus("Conversion complete.", "ready");
      } catch (error) {
        output.value = "";
        copyButton.disabled = true;
        setStatus(`Conversion failed: ${error.message}`, "error");
      }
    });
    convert.disabled = false;
    setStatus("Ready.", "ready");
  } catch (error) {
    setStatus(`Could not initialize the tool: ${error.message}`, "error");
    console.error(error);
  }
}

initialize();

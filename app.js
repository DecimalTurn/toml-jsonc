const input = document.getElementById("toml");
const output = document.getElementById("jsonc");
const convert = document.getElementById("convert");
const status = document.getElementById("status");

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
      try {
        output.value = tomlToJsonc(input.value);
        status.textContent = "Conversion complete.";
      } catch (error) {
        output.value = "";
        status.textContent = `Conversion failed: ${error.message}`;
      }
    });
    convert.disabled = false;
    status.textContent = "Ready.";
  } catch (error) {
    status.textContent = `Could not initialize the demo: ${error.message}`;
    console.error(error);
  }
}

initialize();

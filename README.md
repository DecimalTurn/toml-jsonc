# TOML-to-JSONC

## Browser demo

With Node.js 18 or newer installed, run:

```sh
npm start
```

Open http://127.0.0.1:3000, edit the TOML input, and select **Convert**.
Set the `PORT` environment variable to use another port.

Node serves the demo files; conversion runs in the browser using Pyodide
(Python compiled to WebAssembly) and the existing `demo.py` script. The first
load needs an internet connection to download Pyodide and `tomlkit`. Input is
processed locally in the browser and is not sent to the Node server.
The demo inherits the converter's limitations: for example, a top-level key
written as `message = "hello"` is currently output as `"message "` with a
trailing space.

## GitHub Pages

To publish the demo, enable **Settings → Pages → Build and deployment →
Source: GitHub Actions** in the repository. Push these files to `main` or run
the **Deploy demo to GitHub Pages** workflow manually. Once deployment
completes, the site is available at
https://decimalturn.github.io/TOML-to-JSONC/.

GitHub Pages serves the static files directly; Node is only needed for the
local demo.

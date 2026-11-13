# Convert TOML to JSONC with comments preserved

Convert TOML files to JSONC format while preserving comments. This project provides both a browser utility and an npm package for Node.js.

https://toml-jsonc.decimalturn.dev

## npm package

`npm/` contains a Node wrapper, `toml-to-jsonc`, that runs the same
`toml_to_jsonc.py` through Pyodide. Build it, test it or pack it from that
folder:

```sh
cd npm
npm install
npm test
npm pack
```

Can also be used from another Node.js project by installing the `toml-to-jsonc` package and importing it from the GitHub URL.

```sh
npm install github:decimalturn/toml-jsonc
```

-----

The converter file is not duplicated in version control: `npm/lib/toml_to_jsonc.py`
is copied from the repository root by `npm/scripts/sync-python.mjs` before
`test` and `pack`, so the utility and the package always share one source.


## Development

With Node.js 18 or newer installed, run:

```sh
npm start
```

Open http://127.0.0.1:3000, edit the TOML input, and select **Convert**.
Set the `PORT` environment variable to use another port.

Node serves the html files; conversion runs in the browser using Pyodide
(Python compiled to WebAssembly) and the existing `toml_to_jsonc.py` script. The first
load needs an internet connection to download Pyodide and `tomlkit`. Input is
processed locally in the browser and is not sent to the Node server.

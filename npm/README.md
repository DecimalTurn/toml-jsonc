# toml-to-jsonc

Convert between TOML and JSONC in Node.js, with comments preserved.

This is a thin wrapper around the exact Python converters used by the
[TOML ⇄ JSONC browser utility](https://toml-jsonc.decimalturn.dev). It runs
that same `toml_to_jsonc.py` and `jsonc_to_toml.py` through
[Pyodide](https://pyodide.org), so the output is byte-for-byte what the browser
produces.

## Install

```sh
npm install toml-to-jsonc
```

Requires Node.js 18 or newer. Everything needed to run offline is bundled:
the Pyodide runtime (WebAssembly, ~14 MB installed) and the `tomlkit` wheel.

## Usage

### TOML to JSONC

```js
import { tomlToJsonc } from "toml-to-jsonc";

const jsonc = await tomlToJsonc(`
# Server settings
[server]
port = 8080 # Default HTTP port
`);

console.log(jsonc);
// {
//   // Server settings
//   "server": {
//     "port": 8080 // Default HTTP port
//   }
// }
```

### JSONC to TOML

```js
import { jsoncToToml } from "toml-to-jsonc";

const toml = await jsoncToToml(`{
  // Server settings
  "server": {
    "port": 8080 // Default HTTP port
  }
}`);

console.log(toml);
// # Server settings
// [server]
// port = 8080 # Default HTTP port
```

Because TOML cannot express a key after a table header, keys are regrouped so
scalars come before sub-tables within each scope. JSONC key order is therefore
not preserved exactly. A JSONC root that is not an object, or any `null` value,
throws an error rather than silently changing the data.

Because the Python runtime has to boot, the first call is slow (~1.8 s) and every
call returns a promise. Later calls take about 1 ms. Use `warmup()` to pay the
boot cost up front:

```js
import { warmup, tomlToJsonc } from "toml-to-jsonc";

await warmup();          // optional, e.g. at server startup
const jsonc = await tomlToJsonc("key = 'value'");
```

## Errors

Invalid TOML throws `ConversionError`. The `type` property carries the Python
exception class, and `cause` holds the original error:

```js
import { tomlToJsonc, ConversionError } from "toml-to-jsonc";

try {
  await tomlToJsonc("[server\nport = 8080");
} catch (error) {
  if (error instanceof ConversionError) {
    console.error(error.message); // Could not convert to JSONC: Unexpected character: '\n' at line 1 col 7
    console.error(error.type);    // tomlkit.exceptions.UnexpectedCharError
  }
}
```

Both directions throw `ConversionError`. `TomlJsoncError` remains exported as an
alias. Passing a non-string throws a `TypeError`.

## License

Not yet declared for this package. The bundled `tomlkit` wheel is MIT licensed;
see [vendor/tomlkit-LICENSE.txt](./vendor/tomlkit-LICENSE.txt).

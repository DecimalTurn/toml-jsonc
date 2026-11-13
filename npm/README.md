# toml-to-jsonc

Convert TOML to JSONC in Node.js, with comments and key order preserved.

This is a thin wrapper around the exact Python converter used by the
[TOML-to-JSONC browser utility](https://toml-jsonc.decimalturn.dev). It runs
that same `toml_to_jsonc.py` through [Pyodide](https://pyodide.org), so the output
is byte-for-byte what the browser produces — including its known quirks.

## Install

```sh
npm install toml-to-jsonc
```

Requires Node.js 18 or newer. Everything needed to run offline is bundled:
the Pyodide runtime (WebAssembly, ~14 MB installed) and the `tomlkit` wheel.

## Usage

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

Because the Python runtime has to boot, the first call is slow (~1.8 s) and every
call returns a promise. Later calls take about 1 ms. Use `warmup()` to pay the
boot cost up front:

```js
import { warmup, tomlToJsonc } from "toml-to-jsonc";

await warmup();          // optional, e.g. at server startup
const jsonc = await tomlToJsonc("key = 'value'");
```

## Errors

Invalid TOML throws `TomlJsoncError`. The `type` property carries the Python
exception class, and `cause` holds the original error:

```js
import { tomlToJsonc, TomlJsoncError } from "toml-to-jsonc";

try {
  await tomlToJsonc("[server\nport = 8080");
} catch (error) {
  if (error instanceof TomlJsoncError) {
    console.error(error.message); // Could not convert TOML: Unexpected character: '\n' at line 1 col 7
    console.error(error.type);    // tomlkit.exceptions.UnexpectedCharError
  }
}
```

Passing a non-string throws a `TypeError`.

## Known limitations

Output is inherited unchanged from the browser utility, quirks included. For
example, a top-level key written as `message = "hello"` is currently emitted as
`"message "` with a trailing space.

## License

Not yet declared for this package. The bundled `tomlkit` wheel is MIT licensed;
see [vendor/tomlkit-LICENSE.txt](./vendor/tomlkit-LICENSE.txt).

import test from "node:test";
import assert from "node:assert/strict";

import { tomlToJsonc, jsoncToToml, ConversionError, TomlJsoncError, warmup } from "../index.js";

test("converts a basic document and keeps inline comments", async () => {
  const jsonc = await tomlToJsonc(`# Server settings
[server]
port = 8080 # Default HTTP port
`);

  assert.equal(
    jsonc,
    `{
  // Server settings
  "server": {
    "port": 8080 // Default HTTP port
  }
}`,
  );
});

test("converts an array of tables", async () => {
  const jsonc = await tomlToJsonc(`[[fruit]]
name = "apple"

[[fruit]]
name = "banana"
`);

  assert.deepEqual(JSON.parse(jsonc), {
    fruit: [{ name: "apple" }, { name: "banana" }],
  });
});

test("converts scalar types", async () => {
  const jsonc = await tomlToJsonc(`[a.b]
n = 1_000
f = 1.5
b = true
arr = [1, 2, 3]
`);

  assert.deepEqual(JSON.parse(jsonc), { a: { b: { n: 1000, f: 1.5, b: true, arr: [1, 2, 3] } } });
});

test("does not leak whitespace from root-level keys", async () => {
  const jsonc = await tomlToJsonc('message = "hello"\nother = 1\n');

  assert.equal(jsonc, `{
  "message": "hello",
  "other": 1
}`);
});

test("unwraps quoted root-level keys", async () => {
  assert.equal(await tomlToJsonc('"my key" = 2\n'), `{
  "my key": 2
}`);
  assert.equal(await tomlToJsonc("'lit key' = 3\n"), `{
  "lit key": 3
}`);
});

test("throws ConversionError with the Python message on invalid TOML", async () => {
  await assert.rejects(
    () => tomlToJsonc("[server\nport = 8080"),
    (error) => {
      assert.ok(error instanceof ConversionError);
      assert.match(error.message, /Unexpected character/);
      assert.match(error.type, /UnexpectedCharError$/);
      return true;
    },
  );
});

test("TomlJsoncError remains an alias of ConversionError", () => {
  assert.equal(TomlJsoncError, ConversionError);
});

test("rejects non-string input", async () => {
  await assert.rejects(() => tomlToJsonc(42), TypeError);
});

test("warmup resolves without throwing", async () => {
  await warmup();
});

test("reuses the runtime across calls", async () => {
  const [a, b] = await Promise.all([tomlToJsonc("[x]\ny = 1"), tomlToJsonc("[x]\ny = 2")]);
  assert.notEqual(a, b);
  assert.match(a, /1/);
});

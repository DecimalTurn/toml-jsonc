import test from "node:test";
import assert from "node:assert/strict";

import { tomlToJsonc, jsoncToToml, ConversionError } from "../index.js";

test("converts JSONC to TOML and keeps comments", async () => {
  const toml = await jsoncToToml(`{
  // leading comment
  "title": "demo", // inline comment
  "count": 3
}`);

  assert.equal(
    toml,
    `# leading comment
title = "demo" # inline comment
count = 3
`,
  );
});

test("emits nested tables and arrays of tables", async () => {
  assert.equal(
    await jsoncToToml('{"server": {"port": 8080, "tls": {"enabled": true}}}'),
    `[server]
port = 8080

[server.tls]
enabled = true
`,
  );
  assert.equal(
    await jsoncToToml('{"people": [{"name": "a"}, {"name": "b"}]}'),
    `[[people]]
name = "a"

[[people]]
name = "b"
`,
  );
});

test("accepts trailing commas and block comments", async () => {
  assert.equal(await jsoncToToml('{"a": 1, "b": {"c": 2,},}'), `a = 1

[b]
c = 2
`);
  assert.equal(await jsoncToToml('{/* block\n * note */"a": 1}'), `# block
# note
a = 1
`);
});

test("preserves number types and quotes keys needing it", async () => {
  const toml = await jsoncToToml('{"i": 1, "f": 1.0, "big": 123456789012345678901, "my key": 2}');
  assert.match(toml, /^i = 1$/m);
  assert.match(toml, /^f = 1\.0$/m);
  assert.match(toml, /^big = 123456789012345678901$/m);
  assert.match(toml, /^"my key" = 2$/m);
});

test("keeps comments inside arrays", async () => {
  const toml = await jsoncToToml('{"a": [\n  // first\n  1,\n  2 // second\n]}');
  assert.match(toml, /# first/);
  assert.match(toml, /# second/);
});

test("rejects null with the JSON path", async () => {
  await assert.rejects(
    () => jsoncToToml('{"a": {"b": null}}'),
    (error) => {
      assert.ok(error instanceof ConversionError);
      assert.match(error.message, /cannot represent null/);
      assert.match(error.message, /a\.b/);
      return true;
    },
  );
});

test("rejects a non-object root", async () => {
  await assert.rejects(() => jsoncToToml("[1, 2]"), /must start with an object/);
});

test("reports JSONC syntax errors with a location", async () => {
  await assert.rejects(() => jsoncToToml('{"a": }'), /line 1, column \d+/);
});

test("rejects non-string input", async () => {
  await assert.rejects(() => jsoncToToml(42), TypeError);
});

test("round-trips TOML through JSONC and back", async () => {
  const toml = `# Server settings
[server]
port = 8080 # Default HTTP port

[[fruit]]
name = "apple"
`;

  const roundTripped = await jsoncToToml(await tomlToJsonc(toml));
  assert.equal(await tomlToJsonc(roundTripped), await tomlToJsonc(toml));
});

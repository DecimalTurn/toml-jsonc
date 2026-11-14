"""Convert JSONC (JSON with comments) to TOML, preserving comments."""

import math
import re

_BARE_KEY = re.compile(r"^[A-Za-z0-9_-]+$")
_NUMBER = re.compile(r"-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?")


class JsoncError(ValueError):
    """Raised when the JSONC input cannot be parsed or represented as TOML."""

    def __init__(self, message, line, column):
        super().__init__(f"{message} (line {line}, column {column})")
        self.line = line
        self.column = column


class Node:
    __slots__ = ("kind", "value", "line", "column")

    def __init__(self, kind, value, line, column):
        self.kind = kind
        self.value = value
        self.line = line
        self.column = column


class Member:
    __slots__ = ("key", "value", "leading", "trailing_inline", "after")

    def __init__(self, key, value, leading, trailing_inline):
        self.key = key
        self.value = value
        self.leading = leading
        self.trailing_inline = trailing_inline
        self.after = []


class _Parser:
    def __init__(self, text):
        self.text = text
        self.pos = 0
        self.length = len(text)

    def _locate(self, pos):
        line = self.text.count("\n", 0, pos) + 1
        column = pos - (self.text.rfind("\n", 0, pos) + 1) + 1
        return line, column

    def error(self, message, pos=None):
        line, column = self._locate(self.pos if pos is None else pos)
        raise JsoncError(message, line, column)

    def skip_ws(self):
        while self.pos < self.length and self.text[self.pos] in " \t\r\n":
            self.pos += 1

    def skip(self):
        """Skip whitespace and collect any comments as leading comment text."""
        comments = []
        while True:
            self.skip_ws()
            if self.text.startswith("//", self.pos):
                end = self.text.find("\n", self.pos)
                if end == -1:
                    end = self.length
                comments.append(self.text[self.pos + 2:end].strip())
                self.pos = end
            elif self.text.startswith("/*", self.pos):
                start = self.pos
                end = self.text.find("*/", self.pos + 2)
                if end == -1:
                    self.error("Unterminated block comment", start)
                for raw in self.text[start + 2:end].splitlines():
                    comments.append(raw.strip().lstrip("*").strip())
                self.pos = end + 2
            else:
                return comments

    def skip_inline_comment(self):
        """Collect a comment that sits on the same line as the value just read."""
        probe = self.pos
        while probe < self.length and self.text[probe] in " \t":
            probe += 1
        if self.text.startswith("//", probe):
            end = self.text.find("\n", probe)
            if end == -1:
                end = self.length
            self.pos = end
            return self.text[probe + 2:end].strip()
        if self.text.startswith("/*", probe):
            end = self.text.find("*/", probe + 2)
            if end == -1:
                self.error("Unterminated block comment", probe)
            self.pos = end + 2
            return self.text[probe + 2:end].strip()
        return None

    def consume_separator(self, closer):
        """Read an optional same-line comment plus the separator; report if closed."""
        trailing = self.skip_inline_comment()
        self.skip_ws()
        if self.pos < self.length and self.text[self.pos] == ",":
            self.pos += 1
            extra = self.skip_inline_comment()
            if extra and not trailing:
                trailing = extra
            return trailing, False
        if self.pos < self.length and self.text[self.pos] == closer:
            self.pos += 1
            return trailing, True
        self.error(f"Expected ',' or '{closer}'")

    def parse(self):
        node = self.parse_value([])
        self.skip()
        if self.pos < self.length:
            self.error("Unexpected trailing content")
        if node.kind != "object":
            self.error("TOML documents must start with an object", 0)
        _reject_nulls(node, [])
        return node

    def parse_value(self, path):
        self.skip()
        if self.pos >= self.length:
            self.error("Unexpected end of input")
        ch = self.text[self.pos]
        if ch == "{":
            return self.parse_object(path)
        if ch == "[":
            return self.parse_array(path)
        if ch == '"':
            line, column = self._locate(self.pos)
            return Node("string", self.parse_string(), line, column)
        if ch == "-" or ch.isdigit():
            return self.parse_number()
        for literal, value, kind in (("true", True, "bool"), ("false", False, "bool"), ("null", None, "null")):
            if self.text.startswith(literal, self.pos):
                end = self.pos + len(literal)
                if end < self.length and (self.text[end].isalnum() or self.text[end] == "_"):
                    self.error(f"Invalid literal starting with {literal!r}")
                line, column = self._locate(self.pos)
                self.pos = end
                return Node(kind, value, line, column)
        self.error(f"Unexpected character {ch!r}")

    def parse_number(self):
        line, column = self._locate(self.pos)
        match = _NUMBER.match(self.text, self.pos)
        if not match or not match.group(0):
            self.error("Invalid number")
        raw = match.group(0)
        self.pos = match.end()
        value = float(raw) if ("." in raw or "e" in raw or "E" in raw) else int(raw)
        return Node("number", value, line, column)

    def parse_string(self):
        start = self.pos
        self.pos += 1
        out = []
        escapes = {'"': '"', "\\": "\\", "/": "/", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t"}
        while True:
            if self.pos >= self.length:
                self.error("Unterminated string", start)
            ch = self.text[self.pos]
            if ch == '"':
                self.pos += 1
                return "".join(out)
            if ch == "\\":
                escape = self.text[self.pos + 1:self.pos + 2]
                if escape in escapes:
                    out.append(escapes[escape])
                    self.pos += 2
                elif escape == "u":
                    out.append(self._parse_unicode_escape())
                else:
                    self.error(f"Invalid escape sequence \\{escape}")
            elif ch == "\n":
                self.error("Unescaped newline in string")
            else:
                out.append(ch)
                self.pos += 1

    def _parse_unicode_escape(self):
        code = self._read_hex4()
        if 0xD800 <= code <= 0xDBFF and self.text.startswith("\\u", self.pos):
            low = self._read_hex4()
            if 0xDC00 <= low <= 0xDFFF:
                return chr(0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00))
            self.error("Invalid low surrogate")
        if 0xD800 <= code <= 0xDFFF:
            self.error("Lone surrogate in \\u escape")
        return chr(code)

    def _read_hex4(self):
        digits = self.text[self.pos + 2:self.pos + 6]
        if len(digits) != 4 or not all(c in "0123456789abcdefABCDEF" for c in digits):
            self.error("Invalid \\u escape")
        self.pos += 6
        return int(digits, 16)

    def parse_object(self, path):
        line, column = self._locate(self.pos)
        self.pos += 1
        members = []
        while True:
            leading = self.skip()
            if self.pos < self.length and self.text[self.pos] == "}":
                self.pos += 1
                if leading and members:
                    members[-1].after.extend(leading)
                break
            if self.pos >= self.length:
                self.error("Unterminated object")
            if self.text[self.pos] != '"':
                self.error("Expected a property name in double quotes")
            key = self.parse_string()
            self.skip_ws()
            if self.pos >= self.length or self.text[self.pos] != ":":
                self.error("Expected ':' after property name")
            self.pos += 1
            value = self.parse_value(path + [key])
            trailing, closed = self.consume_separator("}")
            members.append(Member(key, value, leading, trailing))
            if closed:
                break
        return Node("object", members, line, column)

    def parse_array(self, path):
        line, column = self._locate(self.pos)
        self.pos += 1
        items = []
        while True:
            leading = self.skip()
            if self.pos < self.length and self.text[self.pos] == "]":
                self.pos += 1
                if leading and items:
                    items[-1]["leading"].extend(leading)
                break
            if self.pos >= self.length:
                self.error("Unterminated array")
            item = {"value": self.parse_value(path + [str(len(items))]), "leading": leading, "trailing": None}
            items.append(item)
            item["trailing"], closed = self.consume_separator("]")
            if closed:
                break
        return Node("array", items, line, column)


def _reject_nulls(node, path):
    if node.kind == "null":
        where = ".".join(path) if path else "<root>"
        raise JsoncError(f"TOML cannot represent null (at {where})", node.line, node.column)
    if node.kind == "object":
        for member in node.value:
            _reject_nulls(member.value, path + [member.key])
    elif node.kind == "array":
        for index, item in enumerate(node.value):
            _reject_nulls(item["value"], path + [str(index)])


def _basic_string(text):
    out = ['"']
    for ch in text:
        code = ord(ch)
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif ch == "\n":
            out.append("\\n")
        elif ch == "\t":
            out.append("\\t")
        elif ch == "\r":
            out.append("\\r")
        elif ch == "\b":
            out.append("\\b")
        elif ch == "\f":
            out.append("\\f")
        elif code < 0x20 or code == 0x7F or 0xD800 <= code <= 0xDFFF:
            out.append(f"\\u{code:04X}")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _format_key(key):
    return key if _BARE_KEY.match(key) else _basic_string(key)


def _format_number(value):
    if isinstance(value, int):
        return str(value)
    if math.isnan(value):
        return "nan"
    if math.isinf(value):
        return "inf" if value > 0 else "-inf"
    text = repr(value)
    if "." not in text and "e" not in text and "E" not in text:
        text += ".0"
    return text


def _format_value(node):
    if node.kind == "string":
        return _basic_string(node.value)
    if node.kind == "number":
        return _format_number(node.value)
    if node.kind == "bool":
        return "true" if node.value else "false"
    if node.kind == "array":
        return "[" + ", ".join(_format_value(item["value"]) for item in node.value) + "]"
    if node.kind == "object":
        if not node.value:
            return "{}"
        inner = ", ".join(f"{_format_key(m.key)} = {_format_value(m.value)}" for m in node.value)
        return "{ " + inner + " }"
    raise AssertionError(f"unexpected node kind {node.kind}")


def _is_array_of_tables(node):
    return node.kind == "array" and bool(node.value) and all(item["value"].kind == "object" for item in node.value)


def _array_has_comments(node):
    return any(item["leading"] or item["trailing"] for item in node.value)


def _comment_lines(texts, indent=""):
    return [f"{indent}# {text}" if text else f"{indent}#" for text in texts]


def _header(path):
    return ".".join(_format_key(segment) for segment in path)


class _Emitter:
    def __init__(self):
        self.lines = []

    def blank(self):
        if self.lines and self.lines[-1] != "":
            self.lines.append("")

    def emit_document(self, root):
        self.emit_scope(root.value, [])
        while self.lines and self.lines[-1] == "":
            self.lines.pop()
        return "\n".join(self.lines) + "\n"

    def emit_scope(self, members, path):
        values = [m for m in members if m.value.kind != "object" and not _is_array_of_tables(m.value)]
        tables = [m for m in members if m.value.kind == "object" or _is_array_of_tables(m.value)]

        for member in values:
            self.lines.extend(_comment_lines(member.leading))
            self.emit_value(member)
            self.lines.extend(_comment_lines(member.after))

        for member in tables:
            self.blank()
            self.lines.extend(_comment_lines(member.leading))
            child = path + [member.key]
            if member.value.kind == "object":
                self.lines.append(f"[{_header(child)}]")
                self.emit_scope(member.value.value, child)
                self.lines.extend(_comment_lines(member.after))
            else:
                for index, item in enumerate(member.value.value):
                    if index:
                        self.blank()
                    self.lines.extend(_comment_lines(item["leading"]))
                    self.lines.append(f"[[{_header(child)}]]")
                    self.emit_scope(item["value"].value, child)
                    if item["trailing"]:
                        self.lines.append(f"# {item['trailing']}")

    def emit_value(self, member):
        node = member.value
        if node.kind == "array" and _array_has_comments(node):
            # Multi-line arrays give item comments a place to live.
            self.lines.append(f"{_format_key(member.key)} = [")
            for item in node.value:
                self.lines.extend(_comment_lines(item["leading"], "  "))
                entry = f"  {_format_value(item['value'])},"
                if item["trailing"]:
                    entry += f" # {item['trailing']}"
                self.lines.append(entry)
            closing = "]"
            if member.trailing_inline:
                closing += f" # {member.trailing_inline}"
            self.lines.append(closing)
            return

        line = f"{_format_key(member.key)} = {_format_value(node)}"
        if member.trailing_inline:
            line += f" # {member.trailing_inline}"
        self.lines.append(line)


def jsonc_to_toml(jsonc_str):
    """Convert JSONC text to TOML text, preserving comments."""
    root = _Parser(jsonc_str).parse()
    return _Emitter().emit_document(root)

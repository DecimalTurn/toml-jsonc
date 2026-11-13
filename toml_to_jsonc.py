import json
import tomlkit
from tomlkit.items import Comment, Whitespace, Table, AoT

def toml_to_jsonc(toml_str):
    doc = tomlkit.parse(toml_str)
    
    def render(obj, indent=0):
        sp = "  " * indent
        inner_sp = "  " * (indent + 1)
        if isinstance(obj, dict):
            lines = ["{"]
            items = list(obj.body) if hasattr(obj, "body") else list(obj.items())
            entries = []
            pending_comments = []
            
            for k, v in items:
                if isinstance(v, Comment):
                    pending_comments.append(f"{inner_sp}// {v.trivia.comment.lstrip('#').strip()}")
                elif isinstance(v, Whitespace):
                    continue
                elif k is not None:
                    val_str = render(v, indent + 1)
                    inline_comment = ""
                    if hasattr(v, "trivia") and v.trivia.comment:
                        inline_comment = f" // {v.trivia.comment.lstrip('#').strip()}"
                    # A tomlkit key stringifies to its source text, quotes and
                    # trailing whitespace included; .key holds the bare key.
                    key_name = getattr(k, "key", str(k).strip())
                    block = "\n".join(pending_comments + [f'{inner_sp}{json.dumps(key_name)}: {val_str}'])
                    entries.append((block, inline_comment))
                    pending_comments = []
            
            for i, (block, comment) in enumerate(entries):
                comma = "," if i < len(entries) - 1 else ""
                lines.append(f"{block}{comma}{comment}")
            for c in pending_comments:
                lines.append(c)
            lines.append(f"{sp}}}")
            return "\n".join(lines)
        elif isinstance(obj, list):
            if not obj:
                return "[]"
            vals = [f"{inner_sp}{render(x, indent + 1)}" for x in obj]
            return "[\n" + ",\n".join(vals) + f"\n{sp}]"
        else:
            return json.dumps(obj.unwrap() if hasattr(obj, "unwrap") else obj, default=str)

    return render(doc)

# Example usage:
sample = """
# Server settings
[server]
port = 8080 # Default HTTP port
"""
print(toml_to_jsonc(sample))

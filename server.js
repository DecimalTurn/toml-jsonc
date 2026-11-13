const http = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const files = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/demo.py": ["demo.py", "text/plain; charset=utf-8"],
};

const server = http.createServer(async (req, res) => {
  const file = Object.hasOwn(files, req.url) ? files[req.url] : undefined;
  if (!file) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  try {
    const contents = await readFile(path.join(__dirname, file[0]));
    res.writeHead(200, { "Content-Type": file[1] });
    res.end(contents);
  } catch (error) {
    console.error(`Could not serve ${file[0]}:`, error);
    res.writeHead(500);
    res.end("Internal server error");
  }
});

server.listen(process.env.PORT || 3000, "127.0.0.1", () => {
  console.log(`Demo running at http://127.0.0.1:${server.address().port}`);
});

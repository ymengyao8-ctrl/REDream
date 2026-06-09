import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(".");
const port = Number(process.env.PORT || 4173);

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function getFilePath(url) {
  const pathname = new URL(url, `http://127.0.0.1:${port}`).pathname;
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, clean === "/" ? "index.html" : clean);
  if (!filePath.startsWith(root)) return null;
  if (!existsSync(filePath)) return null;
  if (statSync(filePath).isDirectory()) return join(filePath, "index.html");
  return filePath;
}

createServer((request, response) => {
  const filePath = getFilePath(request.url || "/");

  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": types[extname(filePath)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Dream Walkback is running at http://127.0.0.1:${port}`);
});

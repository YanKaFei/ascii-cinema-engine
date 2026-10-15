#!/usr/bin/env node
/**
 * Static HTTP server for the GPU renderer page.
 *
 * WHY A SERVER AND NOT A `file://` URL: the GPU renderer is an ES module that imports Three.js
 * from `node_modules` through an import map. Browsers refuse module and import-map resolution
 * over `file://`, so the page must be served. This is a plain static file server — it does no
 * computation, and in particular it never touches pixels. Rendering happens entirely in the
 * browser's WebGL2 context.
 *
 * It also accepts frames POSTed back by the page, so a headless Chrome instance can stream
 * rendered PNGs to disk without one process spawn per frame.
 */

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".bin": "application/octet-stream",
  ".ts": "text/plain; charset=utf-8",
};

/** Serve a file from the workspace, refusing to escape ROOT. */
async function serveFile(res, rel) {
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const buf = await readFile(full);
    res.writeHead(200, {
      "content-type": MIME[path.extname(full)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(buf);
  } catch {
    res.writeHead(404).end(`not found: ${rel}`);
  }
}

export async function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "POST" && url.pathname === "/frame") {
      const name = url.searchParams.get("name") ?? "frame.png";
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const outDir = url.searchParams.get("dir") ?? path.join(ROOT, ".gpu-out");
      const safe = path.basename(name);
      const dir = path.resolve(outDir);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, safe), Buffer.concat(chunks));
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }

    if (req.method === "GET" && url.pathname === "/__alive") {
      res.writeHead(200, { "content-type": "text/plain" }).end("alive");
      return;
    }

    // `/node_modules/...` and `/src/...` and `/public/...` all resolve from ROOT
    const rel = url.pathname === "/" ? "src/render/gpu/web/index.html" : url.pathname.slice(1);
    await serveFile(res, decodeURIComponent(rel));
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const addr = server.address();
  return { server, port: addr.port, url: `http://127.0.0.1:${addr.port}` };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]).endsWith("gpu-serve.mjs");
if (invokedDirectly) {
  const port = Number(process.env.GPU_PORT ?? 0);
  const { url } = await startServer(port);
  process.stdout.write(`gpu server ${url}\n`);
  process.stdout.write(`  page: ${url}/src/render/gpu/web/index.html\n`);
}

import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const excluded = new Set([".git", ".imd", ".github", ".playwright-mcp"]);
const forbidden = new Set([
  "node_modules",
  ".npm",
  ".pnpm-store",
  ".yarn",
  ".cache",
]);
let bytes = 0;
let count = 0;
async function walk(dir = ".") {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (
      (dir === "." && excluded.has(entry.name)) ||
      file === path.join("test", "scratch")
    )
      continue;
    assert(
      !forbidden.has(entry.name),
      `Dependency/cache directory must stay outside submission: ${file}`,
    );
    assert(!entry.isSymbolicLink(), `No symlinks or submodules: ${file}`);
    assert(!/\.tgz$/.test(file), `Unnecessary package archive: ${file}`);
    if (entry.isDirectory()) await walk(file);
    else {
      bytes += (await fs.stat(file)).size;
      count++;
    }
  }
}
await walk();
assert(bytes < 8388608, `${bytes} bytes exceeds 8 MiB`);
for (const name of [
  "dist/index.html",
  "package-lock.json",
  "README.md",
  "DESIGN.md",
])
  await fs.access(name);
const html = await fs.readFile("dist/index.html", "utf8");
assert(
  !/(?:src|href)="\/(?!\/)/.test(html),
  "Root-relative asset URL in production HTML",
);
assert(!html.includes("http://localhost"), "Local preview URL in shipped HTML");
const assets = await fs.readdir("dist/assets");
assert(
  assets.some((a) => a.endsWith(".js")) &&
    assets.some((a) => a.endsWith(".css")),
);
assert.equal(
  (await fs.readdir("dist/memes")).filter((n) => n.endsWith(".webp")).length,
  8,
);
console.log(
  `PASS: ${count} deliverable files (including supplementary artifacts); ${bytes.toLocaleString()} uncompressed bytes (${(bytes / 1048576).toFixed(2)} MiB); limit 8 MiB. Relative export, source, lockfile, docs and eight local memes present.`,
);

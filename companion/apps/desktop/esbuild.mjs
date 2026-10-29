import { build } from "esbuild";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(appDir, "dist");

await rm(distDir, { recursive: true, force: true });

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  external: ["electron", "better-sqlite3-multiple-ciphers", "@github/keytar"],
  logLevel: "info"
};

await build({
  ...shared,
  entryPoints: [resolve(appDir, "src/main/index.ts")],
  outfile: resolve(distDir, "main/index.js")
});

await build({
  ...shared,
  entryPoints: [resolve(appDir, "src/main/supervisor.ts")],
  outfile: resolve(distDir, "main/supervisor.js")
});

await build({
  ...shared,
  entryPoints: [resolve(appDir, "src/preload/index.ts")],
  outfile: resolve(distDir, "preload/index.js")
});

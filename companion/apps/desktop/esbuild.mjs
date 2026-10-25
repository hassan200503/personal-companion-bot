import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

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
  entryPoints: ["src/main/index.ts"],
  outfile: "dist/main/index.js"
});

await build({
  ...shared,
  entryPoints: ["src/preload/index.ts"],
  outfile: "dist/preload/index.js"
});

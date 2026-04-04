import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Step 1: Type-check with tsc (noEmit)
execSync("npx tsc -p web/tsconfig.json", {
  cwd: rootDir,
  stdio: "inherit",
});

// Step 2: Bundle with esbuild
execSync(
  "npx esbuild web/src/app.ts --bundle --format=esm --outfile=web/dist/app.js --sourcemap --target=es2022",
  {
    cwd: rootDir,
    stdio: "inherit",
  },
);

console.log("web build complete: web/dist/app.js");

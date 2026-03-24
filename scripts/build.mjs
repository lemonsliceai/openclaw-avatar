import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distAvatarDir = path.join(rootDir, "dist", "avatar");

const runtimeFiles = [
  "avatar/avatar-agent-bridge.mjs",
  "avatar/avatar-agent-runner-wrapper.mjs",
  "avatar/avatar-agent-runner.js",
  "avatar/avatar-aspect-ratio.js",
  "avatar/gateway-auth.js",
];

function runTsc() {
  const tscEntrypoint = path.join(rootDir, "node_modules", "typescript", "bin", "tsc");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tscEntrypoint, "-p", "tsconfig.build.json"], {
      cwd: rootDir,
      stdio: "inherit",
    });
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`tsc exited with code ${code ?? "unknown"}`));
    });
    child.once("error", reject);
  });
}

async function main() {
  await rm(path.join(rootDir, "dist"), { recursive: true, force: true });
  await runTsc();
  await mkdir(distAvatarDir, { recursive: true });

  await Promise.all(
    runtimeFiles.map(async (relativePath) => {
      const destination = path.join(distAvatarDir, path.basename(relativePath));
      await copyFile(path.join(rootDir, relativePath), destination);
    }),
  );
}

await main();

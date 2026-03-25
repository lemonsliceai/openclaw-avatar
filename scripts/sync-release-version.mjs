import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  const content = await readFile(filePath, "utf8");
  return { filePath, value: JSON.parse(content) };
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const [{ filePath: pluginManifestPath, value: pluginManifest }, { filePath: packageLockPath, value: packageLock }, { value: packageJson }] =
    await Promise.all([
      readJson("openclaw.plugin.json"),
      readJson("package-lock.json"),
      readJson("package.json"),
    ]);

  const version = packageJson.version;

  if (typeof version !== "string" || version.length === 0) {
    throw new Error("package.json is missing a valid version.");
  }

  pluginManifest.version = version;
  packageLock.version = version;

  if (packageLock.packages?.[""]) {
    packageLock.packages[""].version = version;
  }

  await Promise.all([writeJson(pluginManifestPath, pluginManifest), writeJson(packageLockPath, packageLock)]);

  console.log(`Synced release metadata to version ${version}.`);
}

await main();

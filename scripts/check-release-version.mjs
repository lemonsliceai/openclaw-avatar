import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function normalizeTag(tag) {
  if (!tag) {
    return null;
  }

  const withoutRef = tag.startsWith("refs/tags/") ? tag.slice("refs/tags/".length) : tag;
  return withoutRef.startsWith("v") ? withoutRef.slice(1) : withoutRef;
}

async function readJson(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function main() {
  const releaseTag = normalizeTag(process.argv[2]);
  const [packageJson, pluginManifest, packageLock] = await Promise.all([
    readJson("package.json"),
    readJson("openclaw.plugin.json"),
    readJson("package-lock.json"),
  ]);

  const checks = [
    ["openclaw.plugin.json", pluginManifest.version],
    ["package-lock.json", packageLock.version],
    ['package-lock.json packages[""]', packageLock.packages?.[""]?.version],
  ];

  for (const [label, value] of checks) {
    if (value !== packageJson.version) {
      throw new Error(
        `${label} version ${JSON.stringify(value)} does not match package.json version ${packageJson.version}.`,
      );
    }
  }

  const openClawPeerRange = packageJson.peerDependencies?.openclaw;
  const pluginApiRange = packageJson.openclaw?.compat?.pluginApi;
  const minHostVersion = packageJson.openclaw?.install?.minHostVersion;

  if (typeof openClawPeerRange !== "string" || openClawPeerRange.length === 0) {
    throw new Error("package.json peerDependencies.openclaw is missing a valid range.");
  }

  if (pluginApiRange !== openClawPeerRange) {
    throw new Error(
      `package.json openclaw.compat.pluginApi ${JSON.stringify(pluginApiRange)} does not match peerDependencies.openclaw ${JSON.stringify(openClawPeerRange)}.`,
    );
  }

  if (minHostVersion !== openClawPeerRange) {
    throw new Error(
      `package.json openclaw.install.minHostVersion ${JSON.stringify(minHostVersion)} does not match peerDependencies.openclaw ${JSON.stringify(openClawPeerRange)}.`,
    );
  }

  if (releaseTag && releaseTag !== packageJson.version) {
    throw new Error(
      `Release tag ${releaseTag} does not match package.json version ${packageJson.version}.`,
    );
  }

  console.log(`Release metadata is in sync at version ${packageJson.version}.`);
}

await main();

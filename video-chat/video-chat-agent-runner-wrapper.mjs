import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

function requireBaseRunnerPath() {
  const value =
    process.env.OPENCLAW_VIDEO_CHAT_DEPS_BASE_RUNNER?.trim() ||
    process.env.OPENCLAW_VIDEO_CHAT_RUNNER_PATH?.trim();
  if (!value) {
    throw new Error("Missing OPENCLAW_VIDEO_CHAT_DEPS_BASE_RUNNER");
  }
  return path.resolve(value);
}

function requireRunnerPath() {
  const value =
    process.env.OPENCLAW_VIDEO_CHAT_RUNNER_PATH?.trim() ||
    process.env.OPENCLAW_VIDEO_CHAT_DEPS_BASE_RUNNER?.trim();
  if (!value) {
    throw new Error("Missing OPENCLAW_VIDEO_CHAT_RUNNER_PATH");
  }
  return path.resolve(value);
}

async function importFromBase(baseRunnerPath, specifier) {
  const resolver = createRequire(path.join(path.dirname(baseRunnerPath), "__openclaw_runner__.js"));
  const resolved = resolver.resolve(specifier);
  return import(pathToFileURL(resolved).href);
}

function resolveFromBase(baseRunnerPath, specifier) {
  const resolver = createRequire(path.join(path.dirname(baseRunnerPath), "__openclaw_runner__.js"));
  return resolver.resolve(specifier);
}

function resolvePackageRootFromResolvedMain(mainPath) {
  let current = path.dirname(mainPath);
  while (current !== path.dirname(current)) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) {
      return current;
    }
    current = path.dirname(current);
  }
  return null;
}

async function patchLemonSliceLogging(baseRunnerPath) {
  const lemonSliceMainPath = resolveFromBase(baseRunnerPath, "@livekit/agents-plugin-lemonslice");
  const lemonSlicePackageRoot = resolvePackageRootFromResolvedMain(lemonSliceMainPath);
  const avatarModulePath = lemonSlicePackageRoot
    ? path.join(lemonSlicePackageRoot, "dist", "avatar.js")
    : null;
  const lemonSliceModule = avatarModulePath
    ? await import(pathToFileURL(avatarModulePath).href)
    : await importFromBase(baseRunnerPath, "@livekit/agents-plugin-lemonslice");
  const AvatarSession = lemonSliceModule?.AvatarSession;
  if (!AvatarSession || !AvatarSession.prototype) {
    throw new Error("Unable to load LemonSlice AvatarSession");
  }

  const originalStart = AvatarSession.prototype.start;
  if (typeof originalStart === "function" && !originalStart.__openclawWrapped) {
    const wrappedStart = async function wrappedAvatarStart(...args) {
      const startedAt = Date.now();
      const maxAttempts = 20;
      const retryDelayMs = 250;
      console.log("[video-chat-agent] avatar.start begin");

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const result = await originalStart.apply(this, args);
          const elapsedMs = Date.now() - startedAt;
          const suffix = attempt > 1 ? ` after retry ${attempt}/${maxAttempts}` : "";
          console.log(`[video-chat-agent] avatar.start success (${elapsedMs}ms)${suffix}`);
          return result;
        } catch (error) {
          const elapsedMs = Date.now() - startedAt;
          const message = error instanceof Error ? error.stack ?? error.message : String(error);
          const retryable = message.includes("failed to get local participant identity");
          if (!retryable || attempt >= maxAttempts) {
            console.error(`[video-chat-agent] avatar.start failed (${elapsedMs}ms): ${message}`);
            throw error;
          }
          console.warn(
            `[video-chat-agent] avatar.start retry ${attempt}/${maxAttempts} waiting for local participant identity`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    };
    wrappedStart.__openclawWrapped = true;
    AvatarSession.prototype.start = wrappedStart;
  }

  const originalStartAgent = AvatarSession.prototype.startAgent;
  if (typeof originalStartAgent === "function" && !originalStartAgent.__openclawWrapped) {
    const wrappedStartAgent = async function wrappedStartAgent(...args) {
      const startedAt = Date.now();
      console.log("[video-chat-agent] lemonslice API session start begin");
      try {
        const result = await originalStartAgent.apply(this, args);
        const elapsedMs = Date.now() - startedAt;
        console.log(`[video-chat-agent] lemonslice API session start success (${elapsedMs}ms)`);
        return result;
      } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error(
          `[video-chat-agent] lemonslice API session start failed (${elapsedMs}ms): ${message}`,
        );
        throw error;
      }
    };
    wrappedStartAgent.__openclawWrapped = true;
    AvatarSession.prototype.startAgent = wrappedStartAgent;
  }
}

const baseRunnerPath = requireBaseRunnerPath();
const runnerPath = requireRunnerPath();
await patchLemonSliceLogging(baseRunnerPath);

const baseRunnerModule = await import(pathToFileURL(runnerPath).href);
const baseEntry =
  baseRunnerModule?.default?.entry ??
  baseRunnerModule?.videoChatAgent?.entry ??
  baseRunnerModule?.entry;
if (typeof baseEntry !== "function") {
  throw new Error("Base Claw Cast runner entry function not found");
}

const wrappedRunner = {
  async entry(ctx) {
    console.log("[video-chat-agent] wrapper entry begin");
    try {
      const result = await baseEntry(ctx);
      console.log("[video-chat-agent] wrapper entry completed");
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error(`[video-chat-agent] wrapper entry failed: ${message}`);
      throw error;
    }
  },
};

export default wrappedRunner;

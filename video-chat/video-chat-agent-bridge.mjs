import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function resolveRunnerPath(argv) {
  const candidate = argv[2]?.trim();
  if (!candidate) {
    throw new Error("Missing Claw Cast agent runner path");
  }
  return path.resolve(candidate);
}

function resolveDepsBaseRunnerPath(argv, runnerPath) {
  const candidate = argv[3]?.trim();
  return candidate ? path.resolve(candidate) : runnerPath;
}

function createResolver(basePath, suffix = "__openclaw_sidecar__.js") {
  return createRequire(path.join(path.dirname(basePath), suffix));
}

function resolveFromCandidates(paths, specifier) {
  let lastError = null;
  for (const basePath of paths) {
    try {
      return createResolver(basePath).resolve(specifier);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Unable to resolve ${specifier} from runner paths ${paths.join(", ")}. Ensure LiveKit deps are installed alongside the plugin or OpenClaw. ${String(lastError)}`,
    { cause: lastError ?? undefined },
  );
}

async function loadAgentsModule(paths) {
  const agentsEntryPath = resolveFromCandidates(paths, "@livekit/agents");
  return import(pathToFileURL(agentsEntryPath).href);
}

function getExport(mod, name) {
  const direct = mod?.[name];
  if (direct) {
    return direct;
  }
  const fallback = mod?.default?.[name];
  if (fallback) {
    return fallback;
  }
  throw new Error(`@livekit/agents export ${name} is unavailable`);
}

function startParentWatchdog(onOrphaned, intervalMs = 1000) {
  const initialParentPid = process.ppid;
  if (!Number.isFinite(initialParentPid) || initialParentPid <= 1) {
    return () => {};
  }

  let stopping = false;
  const timer = setInterval(() => {
    if (stopping) {
      return;
    }
    const currentParentPid = process.ppid;
    if (currentParentPid === initialParentPid) {
      return;
    }
    stopping = true;
    void onOrphaned(currentParentPid, initialParentPid);
  }, intervalMs);
  timer.unref();

  return () => {
    stopping = true;
    clearInterval(timer);
  };
}

async function main() {
  const runnerPath = resolveRunnerPath(process.argv);
  const depsBaseRunnerPath = resolveDepsBaseRunnerPath(process.argv, runnerPath);
  const wrapperPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "video-chat-agent-runner-wrapper.mjs",
  );
  const depResolutionPaths = Array.from(new Set([runnerPath, depsBaseRunnerPath]));
  const agentsModule = await loadAgentsModule(depResolutionPaths);
  const AgentServer = getExport(agentsModule, "AgentServer");
  const ServerOptions = getExport(agentsModule, "ServerOptions");
  const initializeLogger = getExport(agentsModule, "initializeLogger");

  const logLevel = process.env.LOG_LEVEL?.trim() || "info";
  initializeLogger({ pretty: true, level: logLevel });
  process.env.OPENCLAW_VIDEO_CHAT_RUNNER_PATH = runnerPath;
  process.env.OPENCLAW_VIDEO_CHAT_DEPS_BASE_RUNNER = depsBaseRunnerPath;
  const worker = new AgentServer(
    new ServerOptions({
      agent: wrapperPath,
      agentName: "openclaw-video-chat",
      wsURL: requireEnv("LIVEKIT_URL"),
      apiKey: requireEnv("LIVEKIT_API_KEY"),
      apiSecret: requireEnv("LIVEKIT_API_SECRET"),
      production: false,
      logLevel,
    }),
  );

  let shuttingDown = false;
  const shutdownWorker = async ({ drain, exitCode, reason }) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.warn(`[video-chat-agent] ${reason}`);
    try {
      if (drain) {
        await worker.drain();
      }
      await worker.close();
    } finally {
      process.exit(exitCode);
    }
  };

  process.once("SIGINT", async () => {
    await shutdownWorker({
      drain: false,
      exitCode: 130,
      reason: "received SIGINT; shutting down worker",
    });
  });
  process.once("SIGTERM", async () => {
    await shutdownWorker({
      drain: true,
      exitCode: 143,
      reason: "received SIGTERM; draining worker",
    });
  });
  if (process.platform !== "win32") {
    process.on("SIGUSR2", () => {
      console.warn(
        "[video-chat-agent] received SIGUSR2; preserving bridge while sidecar child jobs reset",
      );
    });
  }

  const stopParentWatchdog = startParentWatchdog(async (currentParentPid, initialParentPid) => {
    await shutdownWorker({
      drain: true,
      exitCode: 0,
      reason: `detected parent gateway exit/reparent (ppid ${initialParentPid} -> ${currentParentPid}); draining worker`,
    });
  });

  console.log("[video-chat-agent] starting LiveKit agent server");
  try {
    await worker.run();
  } finally {
    stopParentWatchdog();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[video-chat-agent] ${message}`);
  process.exit(1);
});

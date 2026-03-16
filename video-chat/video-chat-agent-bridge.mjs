import path from "node:path";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const INSTANCE_ARG_PREFIX = "--openclaw-video-chat-instance=";
const DEFAULT_AGENT_NAME = "openclaw-video-chat";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function resolveAgentName() {
  return process.env.OPENCLAW_VIDEO_CHAT_AGENT_NAME?.trim() || DEFAULT_AGENT_NAME;
}

function resolveInstanceArg(argv) {
  return (
    argv
      .map((value) => value?.trim() || "")
      .find((value) => value.startsWith(INSTANCE_ARG_PREFIX)) || ""
  );
}

function filterInstanceArgs(argv) {
  return argv.filter((value) => {
    const trimmed = value?.trim() || "";
    return !trimmed.startsWith(INSTANCE_ARG_PREFIX);
  });
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

function attachChildLineLogger(stream, logger) {
  if (!stream || typeof stream.on !== "function") {
    return;
  }
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        logger(line);
      }
    }
  });
  stream.on("end", () => {
    const tail = buffer.trim();
    buffer = "";
    if (tail) {
      logger(tail);
    }
  });
}

function patchJobProcessForkLogging() {
  const require = createRequire(import.meta.url);
  const childProcess = require("node:child_process");
  if (childProcess.__openclawVideoChatForkLoggingPatched) {
    return;
  }
  const originalFork = childProcess.fork.bind(childProcess);
  childProcess.fork = function patchedFork(modulePath, args, options) {
    const modulePathString =
      typeof modulePath === "string"
        ? modulePath
        : modulePath && typeof modulePath === "object" && typeof modulePath.href === "string"
          ? modulePath.href
          : String(modulePath ?? "");
    const normalizedModulePath = modulePathString.replace(/^file:\/\//, "");
    const isJobProcess = normalizedModulePath.includes("job_proc_lazy_main");
    const nextOptions =
      isJobProcess
        ? {
            ...(options || {}),
            silent: true,
            stdio: ["pipe", "pipe", "pipe", "ipc"],
          }
        : options;
    const child = originalFork(modulePath, args, nextOptions);
    if (isJobProcess) {
      const label = `[video-chat-agent/job pid=${child.pid ?? "unknown"}]`;
      attachChildLineLogger(child.stdout, (line) => {
        console.log(`${label} ${line}`);
      });
      attachChildLineLogger(child.stderr, (line) => {
        console.error(`${label} ${line}`);
      });
      child.on("message", (message) => {
        if (!message || typeof message !== "object") {
          return;
        }
        const caseName = message.case;
        if (caseName !== "openclawVideoChatDebug") {
          return;
        }
        const value = message.value && typeof message.value === "object" ? message.value : {};
        const event =
          typeof value.event === "string" && value.event.trim() ? value.event.trim() : "unknown";
        const fields = value.fields && typeof value.fields === "object" ? value.fields : {};
        const fieldEntries = Object.entries(fields)
          .filter(([, fieldValue]) => fieldValue !== undefined)
          .map(([key, fieldValue]) => `${key}=${JSON.stringify(fieldValue)}`)
          .join(" ");
        console.log(`${label} ${event}${fieldEntries ? ` ${fieldEntries}` : ""}`);
      });
      console.log(`${label} spawned module=${normalizedModulePath}`);
    }
    return child;
  };
  childProcess.__openclawVideoChatForkLoggingPatched = true;
  syncBuiltinESMExports();
}

async function main() {
  const instanceArg = resolveInstanceArg(process.argv);
  if (instanceArg) {
    process.env.OPENCLAW_VIDEO_CHAT_INSTANCE_ARG = instanceArg;
    process.title = `${fileURLToPath(import.meta.url)} ${instanceArg}`;
  }
  const positionalArgv = filterInstanceArgs(process.argv);
  const runnerPath = resolveRunnerPath(positionalArgv);
  const depsBaseRunnerPath = resolveDepsBaseRunnerPath(positionalArgv, runnerPath);
  const wrapperPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "video-chat-agent-runner-wrapper.mjs",
  );
  const agentName = resolveAgentName();
  const depResolutionPaths = Array.from(new Set([runnerPath, depsBaseRunnerPath]));
  patchJobProcessForkLogging();
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
      agentName,
      requestFunc: async (jobRequest) => {
        const roomName = typeof jobRequest?.room?.name === "string" ? jobRequest.room.name : "";
        const jobId = typeof jobRequest?.id === "string" ? jobRequest.id : "";
        console.log(
          `[video-chat-agent] request func accepting job jobId=${jobId} roomName=${roomName} agentName=${agentName}`,
        );
        await jobRequest.accept();
        console.log(
          `[video-chat-agent] request func accepted job jobId=${jobId} roomName=${roomName} agentName=${agentName}`,
        );
      },
      wsURL: requireEnv("LIVEKIT_URL"),
      apiKey: requireEnv("LIVEKIT_API_KEY"),
      apiSecret: requireEnv("LIVEKIT_API_SECRET"),
      production: false,
      logLevel,
    }),
  );
  worker.event.once("worker_registered", (workerId) => {
    console.log(`[video-chat-agent] worker registered and ready id=${workerId} agentName=${agentName}`);
  });

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

  console.log(`[video-chat-agent] starting LiveKit agent server agentName=${agentName}`);
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

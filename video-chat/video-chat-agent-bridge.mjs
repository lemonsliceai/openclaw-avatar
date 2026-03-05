import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

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
    throw new Error("Missing video chat agent runner path");
  }
  return path.resolve(candidate);
}

async function loadAgentsModule(runnerPath) {
  const resolver = createRequire(path.join(path.dirname(runnerPath), "__openclaw_sidecar__.js"));
  let agentsEntryPath;
  try {
    agentsEntryPath = resolver.resolve("@livekit/agents");
  } catch (error) {
    throw new Error(
      `Unable to resolve @livekit/agents from runner path ${runnerPath}. Ensure LiveKit deps are installed alongside OpenClaw. ${String(error)}`,
      { cause: error },
    );
  }
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

async function main() {
  const runnerPath = resolveRunnerPath(process.argv);
  const agentsModule = await loadAgentsModule(runnerPath);
  const AgentServer = getExport(agentsModule, "AgentServer");
  const ServerOptions = getExport(agentsModule, "ServerOptions");
  const initializeLogger = getExport(agentsModule, "initializeLogger");

  const logLevel = process.env.LOG_LEVEL?.trim() || "info";
  initializeLogger({ pretty: true, level: logLevel });
  const worker = new AgentServer(
    new ServerOptions({
      agent: runnerPath,
      agentName: "openclaw-video-chat",
      wsURL: requireEnv("LIVEKIT_URL"),
      apiKey: requireEnv("LIVEKIT_API_KEY"),
      apiSecret: requireEnv("LIVEKIT_API_SECRET"),
      production: false,
      logLevel,
    }),
  );

  process.once("SIGINT", async () => {
    await worker.close();
    process.exit(130);
  });
  process.once("SIGTERM", async () => {
    await worker.drain();
    await worker.close();
    process.exit(143);
  });

  console.log("[video-chat-agent] starting LiveKit agent server");
  await worker.run();
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[video-chat-agent] ${message}`);
  process.exit(1);
});

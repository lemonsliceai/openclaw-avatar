import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { Room, dispose } from "@livekit/rtc-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPluginRuntimeMock } from "../test-utils/plugin-runtime-mock.ts";
import plugin from "./index.js";

type RespondCall = [boolean, unknown?, { code: string; message: string }?];
type RegisteredService = {
  id: string;
  start?: (ctx: { config: unknown; gateway?: unknown }) => Promise<void>;
  stop?: () => Promise<void>;
};

const runtimeEnv = {
  livekitUrl: process.env.OPENCLAW_AVATAR_RUNTIME_LIVEKIT_URL?.trim() || process.env.LIVEKIT_URL?.trim() || "",
  livekitApiKey:
    process.env.OPENCLAW_AVATAR_RUNTIME_LIVEKIT_API_KEY?.trim() || process.env.LIVEKIT_API_KEY?.trim() || "",
  livekitApiSecret:
    process.env.OPENCLAW_AVATAR_RUNTIME_LIVEKIT_API_SECRET?.trim() ||
    process.env.LIVEKIT_API_SECRET?.trim() ||
    "",
};

const describeRuntime = runtimeEnv.livekitUrl && runtimeEnv.livekitApiKey && runtimeEnv.livekitApiSecret ? describe : describe.skip;

function setupIntegrationPlugin(config: unknown) {
  const runtime = createPluginRuntimeMock();
  const methods = new Map<string, unknown>();
  const services: RegisteredService[] = [];
  vi.mocked(runtime.config.loadConfig).mockReturnValue(config as never);

  plugin.register({
    id: "avatar",
    name: "Avatar",
    source: "integration-test",
    config,
    pluginConfig: {},
    runtime,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    registerGatewayMethod: (method: string, handler: unknown) => methods.set(method, handler),
    registerService: (service: unknown) => services.push(service as RegisteredService),
    registerTool: () => {},
    registerHook: () => {},
    registerHttpRoute: () => {},
    registerChannel: () => {},
    registerProvider: () => {},
    registerCli: () => {},
    registerCommand: () => {},
    resolvePath: (input: string) => `/tmp/${input}`,
    on: () => {},
    description: "integration-test",
    version: "0",
  } as Parameters<typeof plugin.register>[0]);

  return { methods, services };
}

async function invokeGatewayMethod(
  methods: Map<string, unknown>,
  method: "avatar.session.create" | "avatar.session.stop",
  params: Record<string, unknown>,
) {
  const handler = methods.get(method) as
    | ((ctx: { params: Record<string, unknown>; respond: ReturnType<typeof vi.fn> }) => Promise<void>)
    | undefined;
  if (!handler) {
    throw new Error(`missing gateway method ${method}`);
  }
  const respond = vi.fn();
  await handler({ params, respond });
  return respond;
}

async function readSignalEvents(signalFile: string) {
  try {
    const contents = await readFile(signalFile, "utf8");
    return contents
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function waitForCondition<T>(
  label: string,
  fn: () => Promise<T | null>,
  timeoutMs = 45_000,
  pollMs = 1_000,
): Promise<T> {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const result = await fn();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(lastError ? `${label}: ${lastError}` : `${label}: timed out after ${timeoutMs}ms`);
}

describeRuntime("avatar LiveKit runtime integration", () => {
  const originalCustomRunner = process.env.OPENCLAW_AVATAR_AGENT_RUNNER;
  const originalSignalFile = process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE;
  const originalTestMode = process.env.OPENCLAW_AVATAR_TEST_MODE;
  let tmpDir = "";
  let signalFile = "";

  afterEach(async () => {
    if (originalCustomRunner === undefined) {
      delete process.env.OPENCLAW_AVATAR_AGENT_RUNNER;
    } else {
      process.env.OPENCLAW_AVATAR_AGENT_RUNNER = originalCustomRunner;
    }
    if (originalSignalFile === undefined) {
      delete process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE;
    } else {
      process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE = originalSignalFile;
    }
    if (originalTestMode === undefined) {
      delete process.env.OPENCLAW_AVATAR_TEST_MODE;
    } else {
      process.env.OPENCLAW_AVATAR_TEST_MODE = originalTestMode;
    }
    try {
      dispose();
    } catch {}
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDir = "";
    signalFile = "";
  });

  it(
    "dispatches the sidecar worker across repeated real room joins",
    async () => {
      tmpDir = await mkdtemp(path.join(os.tmpdir(), "avatar-livekit-runtime-"));
      signalFile = path.join(tmpDir, "runner-signals.ndjson");
      delete process.env.OPENCLAW_AVATAR_AGENT_RUNNER;
      process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE = signalFile;
      process.env.OPENCLAW_AVATAR_TEST_MODE = "connect-only";

      const config = {
        gateway: {
          port: 18789,
          auth: {
            mode: "token",
            token: "integration-test-token",
          },
        },
        session: { mainKey: "main" },
        avatar: {
          provider: "lemonslice" as const,
          lemonSlice: {
            apiKey: "lemonslice-test-key",
            imageUrl: "https://example.com/avatar.png",
          },
          livekit: {
            url: runtimeEnv.livekitUrl,
            apiKey: runtimeEnv.livekitApiKey,
            apiSecret: runtimeEnv.livekitApiSecret,
          },
        },
      };

      const { methods, services } = setupIntegrationPlugin(config);
      const sidecarService = services.find((service) => service?.id === "avatar-agent");
      const roomServiceClient = new RoomServiceClient(
        runtimeEnv.livekitUrl,
        runtimeEnv.livekitApiKey,
        runtimeEnv.livekitApiSecret,
      );
      const dispatchClient = new AgentDispatchClient(
        runtimeEnv.livekitUrl,
        runtimeEnv.livekitApiKey,
        runtimeEnv.livekitApiSecret,
      );

      try {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          let room: Room | null = null;
          let roomName = "";
          try {
            const createRespond = await invokeGatewayMethod(methods, "avatar.session.create", {
              sessionKey: `runtime-${attempt}`,
              avatarImageUrl: "https://example.com/runtime-avatar.png",
            });
            const createCall = createRespond.mock.calls[0] as RespondCall | undefined;
            expect(createCall?.[0]).toBe(true);
            const session = createCall?.[1] as
              | {
                  roomName?: string;
                  livekitUrl?: string;
                  participantToken?: string;
                  participantIdentity?: string;
                  agentName?: string;
                  avatarImageUrl?: string;
                }
              | undefined;
            roomName = session?.roomName ?? "";
            expect(roomName).toContain(`openclaw-runtime-${attempt}-`);
            expect(session?.participantToken).toBeTruthy();
            expect(session?.avatarImageUrl).toBe("https://example.com/runtime-avatar.png");

            room = new Room();
            await room.connect(session?.livekitUrl ?? runtimeEnv.livekitUrl, session?.participantToken ?? "");

            const readySnapshot = await waitForCondition(
              `room dispatch did not become ready for ${roomName}`,
              async () => {
                const [participants, dispatches, events] = await Promise.all([
                  roomServiceClient.listParticipants(roomName).catch(() => []),
                  dispatchClient.listDispatch(roomName).catch(() => []),
                  readSignalEvents(signalFile),
                ]);
                const participantIdentities = participants
                  .map((participant) => (typeof participant?.identity === "string" ? participant.identity : ""))
                  .filter(Boolean);
                const browserParticipantJoined = participantIdentities.includes(
                  session?.participantIdentity ?? "",
                );
                const dispatch = dispatches.find(
                  (candidate) =>
                    candidate?.room === roomName &&
                    candidate?.agentName === (session?.agentName ?? "openclaw-avatar"),
                );
                const dispatchJobs = Array.isArray(dispatch?.state?.jobs) ? dispatch.state.jobs : [];
                const dispatchJobCount = dispatchJobs.length;
                const dispatchRunning = dispatchJobs.some((job) => job?.state?.status === 1);
                const jobEntryStarted = events.some(
                  (event) =>
                    event.type === "job-entry-begin" &&
                    event.roomName === roomName,
                );
                const runnerConnected = events.some(
                  (event) =>
                    event.type === "ctx-connect-succeeded" &&
                    event.roomName === roomName,
                );
                if (
                  !browserParticipantJoined ||
                  dispatchJobCount === 0 ||
                  !dispatchRunning ||
                  !jobEntryStarted ||
                  !runnerConnected
                ) {
                  return null;
                }
                return {
                  browserParticipantJoined,
                  dispatchJobCount,
                  dispatchRunning,
                  jobEntryStarted,
                  runnerConnected,
                };
              },
            );

            expect(readySnapshot.browserParticipantJoined).toBe(true);
            expect(readySnapshot.dispatchJobCount).toBeGreaterThan(0);
            expect(readySnapshot.dispatchRunning).toBe(true);
            expect(readySnapshot.jobEntryStarted).toBe(true);
            expect(readySnapshot.runnerConnected).toBe(true);
          } finally {
            if (room) {
              await room.disconnect().catch(() => {});
            }
            if (roomName) {
              await invokeGatewayMethod(methods, "avatar.session.stop", { roomName });
              await waitForCondition(
                `room ${roomName} was not deleted`,
                async () => {
                  const rooms = await roomServiceClient.listRooms([roomName]).catch(() => []);
                  return rooms.length === 0 ? { deleted: true } : null;
                },
                15_000,
                500,
              );
            }
          }
        }
      } finally {
        if (sidecarService?.stop) {
          await sidecarService.stop().catch(() => {});
        }
      }
    },
    180_000,
  );
});

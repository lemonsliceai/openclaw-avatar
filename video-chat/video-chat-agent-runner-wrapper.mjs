import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

function requireBaseRunnerPath() {
  const value = process.env.OPENCLAW_VIDEO_CHAT_BASE_RUNNER?.trim();
  if (!value) {
    throw new Error("Missing OPENCLAW_VIDEO_CHAT_BASE_RUNNER");
  }
  return path.resolve(value);
}

async function importFromBase(baseRunnerPath, specifier) {
  const resolver = createRequire(path.join(path.dirname(baseRunnerPath), "__openclaw_runner__.js"));
  const resolved = resolver.resolve(specifier);
  return import(pathToFileURL(resolved).href);
}

async function patchLemonSliceLogging(baseRunnerPath) {
  const agentsModule = await importFromBase(baseRunnerPath, "@livekit/agents");
  const rtcNodeModule = await importFromBase(baseRunnerPath, "@livekit/rtc-node");
  const livekitServerSdkModule = await importFromBase(baseRunnerPath, "livekit-server-sdk");
  const lemonSliceModule = await importFromBase(baseRunnerPath, "@livekit/agents-plugin-lemonslice");
  const AvatarSession = lemonSliceModule?.AvatarSession;
  if (!AvatarSession || !AvatarSession.prototype) {
    throw new Error("Unable to load LemonSlice AvatarSession");
  }
  const AccessToken = livekitServerSdkModule?.AccessToken;
  const voice = agentsModule?.voice;
  const TrackKind = rtcNodeModule?.TrackKind;
  if (!AccessToken || !voice?.DataStreamAudioOutput || !TrackKind) {
    throw new Error("Unable to load LiveKit runtime modules needed for avatar fallback start");
  }

  const waitForLocalParticipantIdentity = async (room, timeoutMs = 4_000) => {
    const startMs = Date.now();
    while (Date.now() - startMs < timeoutMs) {
      const identity =
        typeof room?.localParticipant?.identity === "string"
          ? room.localParticipant.identity.trim()
          : "";
      if (identity) {
        return identity;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return "";
  };

  const fallbackAvatarStart = async (instance, agentSession, room, options = {}) => {
    const livekitUrl = options.livekitUrl || process.env.LIVEKIT_URL;
    const livekitApiKey = options.livekitApiKey || process.env.LIVEKIT_API_KEY;
    const livekitApiSecret = options.livekitApiSecret || process.env.LIVEKIT_API_SECRET;
    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
      throw new Error(
        "livekitUrl, livekitApiKey, and livekitApiSecret must be set by arguments or environment variables",
      );
    }

    const localParticipantIdentity = await waitForLocalParticipantIdentity(room);
    if (!localParticipantIdentity) {
      throw new Error("failed to get local participant identity");
    }

    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: instance.avatarParticipantIdentity,
      name: instance.avatarParticipantName,
    });
    accessToken.kind = "agent";
    accessToken.addGrant({
      roomJoin: true,
      room: room.name,
    });
    accessToken.attributes = {
      "lk.publish_on_behalf": localParticipantIdentity,
    };
    const livekitToken = await accessToken.toJwt();
    await instance.startAgent(livekitUrl, livekitToken);
    agentSession.output.audio = new voice.DataStreamAudioOutput({
      room,
      destinationIdentity: instance.avatarParticipantIdentity,
      sampleRate: 16_000,
      waitRemoteTrack: TrackKind.KIND_VIDEO,
    });
  };

  const originalStart = AvatarSession.prototype.start;
  if (typeof originalStart === "function" && !originalStart.__openclawWrapped) {
    const wrappedStart = async function wrappedAvatarStart(...args) {
      const startedAt = Date.now();
      console.log("[video-chat-agent] avatar.start begin");
      try {
        const result = await originalStart.apply(this, args);
        const elapsedMs = Date.now() - startedAt;
        console.log(`[video-chat-agent] avatar.start success (${elapsedMs}ms)`);
        return result;
      } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        const fallbackEligible =
          typeof message === "string" && message.includes("failed to get local participant identity");
        if (!fallbackEligible) {
          console.error(`[video-chat-agent] avatar.start failed (${elapsedMs}ms): ${message}`);
          throw error;
        }

        console.warn(
          `[video-chat-agent] avatar.start missing local participant identity (${elapsedMs}ms); attempting fallback`,
        );
        const [agentSession, room, options] = args;
        try {
          await fallbackAvatarStart(this, agentSession, room, options);
          const totalElapsedMs = Date.now() - startedAt;
          console.log(`[video-chat-agent] avatar.start fallback success (${totalElapsedMs}ms)`);
        } catch (fallbackError) {
          const totalElapsedMs = Date.now() - startedAt;
          const fallbackMessage =
            fallbackError instanceof Error
              ? fallbackError.stack ?? fallbackError.message
              : String(fallbackError);
          console.error(
            `[video-chat-agent] avatar.start fallback failed (${totalElapsedMs}ms): ${fallbackMessage}`,
          );
          throw fallbackError;
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
await patchLemonSliceLogging(baseRunnerPath);

const baseRunnerModule = await import(pathToFileURL(baseRunnerPath).href);
const baseEntry =
  baseRunnerModule?.default?.entry ??
  baseRunnerModule?.videoChatAgent?.entry ??
  baseRunnerModule?.entry;
if (typeof baseEntry !== "function") {
  throw new Error("Base video chat runner entry function not found");
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

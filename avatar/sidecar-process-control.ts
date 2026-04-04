import type { ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import path from "node:path";

type ProcessEntry = {
  pid: number;
  command: string;
};

async function delayMs(timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    timer.unref();
  });
}

function isProcessRunning(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, 0);
      return true;
    } catch {
      // Fall through to a direct pid check below.
    }
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalProcessId(pid: number, signal: NodeJS.Signals): void {
  if (!Number.isFinite(pid) || pid <= 0) {
    return;
  }
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
    } catch {
      // Process group may already be gone.
    }
  }
  try {
    process.kill(pid, signal);
  } catch {
    // Process may already be gone.
  }
}

async function captureCommandOutput(file: string, args: string[]): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    execFile(file, args, { encoding: "utf8", maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function parseProcessEntries(output: string): ProcessEntry[] {
  const entries: ProcessEntry[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const pid = Number.parseInt(match[1] ?? "", 10);
    const command = (match[2] ?? "").trim();
    if (!Number.isFinite(pid) || pid <= 0 || !command) {
      continue;
    }
    entries.push({ pid, command });
  }
  return entries;
}

async function listProcesses(): Promise<ProcessEntry[]> {
  if (process.platform === "win32") {
    return [];
  }
  const output = await captureCommandOutput("ps", ["-axo", "pid=,command="]);
  return parseProcessEntries(output);
}

async function stopProcessIds(params: {
  pids: number[];
  termTimeoutMs?: number;
  postKillDelayMs?: number;
}): Promise<number[]> {
  const uniquePids = Array.from(
    new Set(params.pids.filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid)),
  );
  if (uniquePids.length === 0) {
    return [];
  }

  for (const pid of uniquePids) {
    signalProcessId(pid, "SIGTERM");
  }
  await delayMs(params.termTimeoutMs ?? 300);

  const stubbornPids = uniquePids.filter((pid) => isProcessRunning(pid));
  for (const pid of stubbornPids) {
    signalProcessId(pid, "SIGKILL");
  }
  await delayMs(params.postKillDelayMs ?? 150);
  return uniquePids;
}

export async function stopChildProcess(params: {
  child: ChildProcess | null;
  processGroupId?: number | null;
  termTimeoutMs?: number;
  postGroupKillDelayMs?: number;
}): Promise<void> {
  const child = params.child;
  const termTimeoutMs = params.termTimeoutMs ?? 2_000;
  const postGroupKillDelayMs = params.postGroupKillDelayMs ?? 200;
  const childPid = typeof child?.pid === "number" ? child.pid : 0;
  const processGroupId = typeof params.processGroupId === "number" ? params.processGroupId : 0;
  const signalPid = processGroupId > 0 ? processGroupId : childPid;
  if (signalPid <= 0 && (!child || child.exitCode !== null || child.signalCode !== null)) {
    return;
  }

  const canSignalProcessGroup = process.platform !== "win32" && signalPid > 0;
  const sendSignal = (signal: NodeJS.Signals): void => {
    if (canSignalProcessGroup) {
      try {
        // When spawned detached, -PID targets the entire process group
        // (bridge + LiveKit worker descendants).
        process.kill(-signalPid, signal);
        return;
      } catch {
        // Fall back to direct child signaling below.
      }
    }
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    try {
      child.kill(signal);
    } catch {
      // Child may already be gone.
    }
  };

  sendSignal("SIGTERM");
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    await delayMs(postGroupKillDelayMs);
    sendSignal("SIGKILL");
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        sendSignal("SIGKILL");
      }
    }, termTimeoutMs);
    timer.unref();
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function resetProcessGroupChildren(params: {
  processGroupId?: number | null;
  settleMs?: number;
}): Promise<void> {
  const processGroupId = typeof params.processGroupId === "number" ? params.processGroupId : 0;
  if (process.platform === "win32" || processGroupId <= 0) {
    return;
  }
  try {
    // Bridge handles SIGUSR2, while child job processes terminate by default.
    process.kill(-processGroupId, "SIGUSR2");
    await delayMs(params.settleMs ?? 300);
  } catch {
    // Best effort cleanup; caller can retry later.
  }
}

export async function stopMatchingProcesses(params: {
  scriptPaths?: string[];
  commandPatterns?: string[][];
  keepPids?: number[];
  matchBasenames?: boolean;
  termTimeoutMs?: number;
  postKillDelayMs?: number;
  listProcesses?: () => Promise<ProcessEntry[]>;
}): Promise<number[]> {
  if (process.platform === "win32") {
    return [];
  }

  const pathTargets = Array.from(
    new Set(
      (params.scriptPaths ?? []).map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  );
  const basenameTargets = params.matchBasenames
    ? Array.from(
        new Set(
          pathTargets.map((value) => path.basename(value)).filter((value) => value.length > 0),
        ),
      )
    : [];
  const commandPatterns = (params.commandPatterns ?? [])
    .map((pattern) => pattern.map((value) => value.trim()).filter((value) => value.length > 0))
    .filter((pattern) => pattern.length > 0);
  if (pathTargets.length === 0 && basenameTargets.length === 0 && commandPatterns.length === 0) {
    return [];
  }

  const keepPids = new Set([process.pid, ...(params.keepPids ?? [])]);
  const enumerateProcesses = params.listProcesses ?? listProcesses;
  const processes = await enumerateProcesses();
  const matchingPids = processes
    .filter(
      (entry) =>
        !keepPids.has(entry.pid) &&
        (pathTargets.some((target) => entry.command.includes(target)) ||
          basenameTargets.some((target) => entry.command.includes(target)) ||
          commandPatterns.some((pattern) =>
            pattern.every((token) => entry.command.includes(token)),
          )),
    )
    .map((entry) => entry.pid);

  await stopProcessIds({
    pids: matchingPids,
    termTimeoutMs: params.termTimeoutMs ?? 300,
    postKillDelayMs: params.postKillDelayMs ?? 150,
  });
  return Array.from(new Set(matchingPids));
}

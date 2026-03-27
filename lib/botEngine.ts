import { extractSpreadsheetId, isValidRange, warmAuth, pingSheet, writeRange } from '@/lib/googleSheets';
import { logEntry, nowIso } from '@/lib/logger';
import { BotConfig, BotState, LogEntry } from '@/types/bot';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

// Keep run state across hot-reloads/dev and serverless invocations where the same
// process is reused. Serverless cold starts will still lose state; for production,
// consider external storage if you need durability beyond the process lifetime.
const globalRuns = (globalThis as any).__BOT_RUNS as Map<string, BotState> | undefined;
const runs: Map<string, BotState> = globalRuns || new Map();
(globalThis as any).__BOT_RUNS = runs;

export function computeTargetTimestampWIB(targetDate: string, targetTime: string): number {
  const [h, m, s] = targetTime.split(':').map(Number);
  if ([h, m, s].some((n) => Number.isNaN(n))) {
    throw new Error('Invalid targetTime format, use HH:mm:ss');
  }
  const [year, month, day] = targetDate.split('-').map(Number);
  if ([year, month, day].some((n) => Number.isNaN(n))) {
    throw new Error('Invalid targetDate format, use YYYY-MM-DD');
  }
  const targetUtcTs = Date.UTC(year, month - 1, day, h, m, s);
  return targetUtcTs - WIB_OFFSET_MS;
}

function todayWibDateString(): string {
  const now = Date.now();
  const wibNow = new Date(now + WIB_OFFSET_MS);
  const y = wibNow.getUTCFullYear();
  const m = wibNow.getUTCMonth() + 1;
  const d = wibNow.getUTCDate();
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${y}-${pad(m)}-${pad(d)}`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptWrite(spreadsheetId: string, range: string, value: string, attempt: number): Promise<LogEntry> {
  try {
    return await writeRange(spreadsheetId, range, value);
  } catch (error) {
    if (attempt >= 3) {
      throw error;
    }
    const jitter = 50 + Math.floor(Math.random() * 50);
    await wait(jitter);
    return attemptWrite(spreadsheetId, range, value, attempt + 1);
  }
}

export function getRun(id: string): BotState | undefined {
  return runs.get(id);
}

export function listRuns(): BotState[] {
  return Array.from(runs.values());
}

function validateConfig(config: BotConfig): { spreadsheetId: string; targetDate: string } {
  if (!config.sheetUrl || !config.range || !config.targetTime) {
    throw new Error('Missing required fields');
  }
  if (!isValidRange(config.range)) {
    throw new Error('Range must be like A1 or A1:B2');
  }
  const targetDate = config.targetDate || todayWibDateString();
  const spreadsheetId = extractSpreadsheetId(config.sheetUrl);
  if (!spreadsheetId) {
    throw new Error('Cannot extract spreadsheetId from URL');
  }
  return { spreadsheetId, targetDate };
}

export async function startRun(config: BotConfig): Promise<BotState> {
  const { spreadsheetId, targetDate } = validateConfig(config);

  const id = crypto.randomUUID();
  const state: BotState = {
    id,
    status: 'scheduled',
    logs: [logEntry('info', 'Run scheduled')],
    startedAt: nowIso(),
    targetDate,
    targetTime: config.targetTime,
    config: { ...config, targetDate }
  };
  runs.set(id, state);

  const targetTs = computeTargetTimestampWIB(targetDate, config.targetTime);
  const prewarmTs = targetTs - 2000;
  const warmTs = targetTs - 1000;

  const schedulePhase = (at: number, fn: () => Promise<void>) => {
    const delay = Math.max(at - Date.now(), 0);
    setTimeout(async () => {
      try {
        await fn();
      } catch (error) {
        state.status = 'failed';
        state.error = (error as Error).message;
        state.logs.push(logEntry('error', state.error));
      }
    }, delay);
  };

  schedulePhase(prewarmTs, async () => {
    state.status = 'prewarm';
    state.logs.push(await warmAuth());
  });

  schedulePhase(warmTs, async () => {
    state.status = 'warm';
    state.logs.push(await pingSheet(spreadsheetId));
  });

  schedulePhase(targetTs, async () => {
    state.status = 'burst';
    const burst = Math.max(3, Math.min(config.burstCount || 5, 5));
    const writes = Array.from({ length: burst }, () => attemptWrite(spreadsheetId, config.range, config.value, 1));
    const results = await Promise.all(writes);
    results.forEach((r) => state.logs.push(r));
    state.status = 'success';
    state.logs.push(logEntry('info', 'Burst completed'));
  });

  return state;
}

export async function runBurstNow(config: BotConfig): Promise<BotState> {
  const { spreadsheetId, targetDate } = validateConfig(config);
  const id = crypto.randomUUID();
  const state: BotState = {
    id,
    status: 'scheduled',
    logs: [logEntry('info', 'Run scheduled (QStash immediate)')],
    startedAt: nowIso(),
    targetDate,
    targetTime: config.targetTime,
    config: { ...config, targetDate }
  };

  try {
    const targetTs = computeTargetTimestampWIB(targetDate, config.targetTime);
    const windowStart = targetTs - 60_000; // 1 menit sebelum
    const windowEnd = targetTs + 5_000; // 5 detik setelah
    const maxIterations = Number(process.env.BURST_MAX_ITERATIONS || '1000');
    const burstConcurrency = Math.max(1, Number(process.env.BURST_CONCURRENCY || '8'));
    const targetRate = Math.max(1, Number(process.env.BURST_TARGET_RATE || '5')); // launches per second
    const minInterval = Math.floor(1000 / targetRate);

    state.status = 'prewarm';
    state.logs.push(await warmAuth());

    state.status = 'warm';
    state.logs.push(await pingSheet(spreadsheetId));

    const now = Date.now();
    if (now < windowStart) {
      await wait(windowStart - now);
    }

    state.status = 'burst';
    let iterations = 0;
    const inFlight: Promise<void>[] = [];
    let lastLaunch = 0;
    while (Date.now() <= windowEnd && iterations < maxIterations) {
      if (inFlight.length >= burstConcurrency) {
        await Promise.race(inFlight);
        continue;
      }

      const sinceLast = Date.now() - lastLaunch;
      if (sinceLast < minInterval) {
        await wait(minInterval - sinceLast);
        continue;
      }

      iterations += 1;
      lastLaunch = Date.now();
      const p = attemptWrite(spreadsheetId, config.range, config.value, 1)
        .then((entry) => {
          state.logs.push(entry);
        })
        .catch((err) => {
          state.logs.push(logEntry('error', (err as Error).message));
        })
        .finally(() => {
          const idx = inFlight.indexOf(p);
          if (idx !== -1) inFlight.splice(idx, 1);
        });

      inFlight.push(p);
    }

    await Promise.allSettled(inFlight);

    state.status = 'success';
    state.logs.push(logEntry('info', 'Burst completed'));
  } catch (error) {
    state.status = 'failed';
    state.error = (error as Error).message;
    state.logs.push(logEntry('error', state.error));
  }

  return state;
}

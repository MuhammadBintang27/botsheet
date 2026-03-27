export type BotPhase = 'idle' | 'scheduled' | 'prewarm' | 'warm' | 'burst' | 'success' | 'failed';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  at: string; // ISO string timestamp
  level: LogLevel;
  message: string;
}

export interface BotConfig {
  sheetUrl: string;
  range: string;
  targetDate: string; // YYYY-MM-DD in WIB
  targetTime: string; // HH:mm:ss in WIB
  value: string;
  burstCount: number;
}

export interface BotState {
  id: string;
  status: BotPhase;
  logs: LogEntry[];
  startedAt: string;
  targetDate: string;
  targetTime: string;
  config: BotConfig;
  error?: string;
}

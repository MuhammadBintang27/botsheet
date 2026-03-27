import { LogEntry, LogLevel } from '@/types/bot';

export function nowIso(): string {
  return new Date().toISOString();
}

export function logEntry(level: LogLevel, message: string): LogEntry {
  return { at: nowIso(), level, message };
}

export function formatLog(entry: LogEntry): string {
  return `[${entry.at}] [${entry.level.toUpperCase()}] ${entry.message}`;
}

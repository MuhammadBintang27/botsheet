'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BotState, LogEntry } from '@/types/bot';

interface FormState {
  sheetUrl: string;
  range: string;
  targetDate: string;
  targetTime: string;
  value: string;
  burstCount: number;
}

const defaultForm: FormState = {
  sheetUrl: '',
  range: 'A1',
  targetDate: new Date().toISOString().slice(0, 10),
  targetTime: '12:00:00',
  value: 'BOOKED',
  burstCount: 4
};

function isValidUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('docs.google.com');
  } catch (error) {
    return false;
  }
}

function isValidRange(range: string) {
  return /^(?:[A-Za-z0-9_ ]+!)?[A-Z]+\d+(?::[A-Z]+\d+)?$/.test(range.trim());
}

function isValidDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date.trim());
}

export default function HomePage() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [runId, setRunId] = useState<string | null>(null);
  const [botState, setBotState] = useState<BotState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusUrl, setStatusUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const statusTone = useMemo(() => {
    switch (botState?.status) {
      case 'success':
        return 'text-accent';
      case 'failed':
        return 'text-danger';
      case 'burst':
      case 'warm':
      case 'prewarm':
      case 'scheduled':
        return 'text-blue-600';
      default:
        return 'text-slate-600';
    }
  }, [botState?.status]);

  useEffect(() => {
    // If page opened with ?id=..., resume that run
    const paramId = searchParams.get('id');
    if (paramId) {
      setRunId(paramId);
      setStatusUrl(`/api/bot/status/${paramId}`);
      if (typeof window !== 'undefined') {
        setShareUrl(`${window.location.origin}/?id=${paramId}`);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!runId) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/bot/status/${runId}`);
      if (res.ok) {
        const data: BotState = await res.json();
        setBotState(data);
        if (data.status === 'success' || data.status === 'failed') {
          clearInterval(interval);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [runId]);

  const logs: LogEntry[] = botState?.logs || [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidUrl(form.sheetUrl)) {
      setError('Masukkan link Google Sheets yang valid');
      return;
    }
    if (!isValidRange(form.range)) {
      setError('Range harus seperti A1 atau A1:B2');
      return;
    }
    if (!isValidDate(form.targetDate)) {
      setError('Tanggal harus format YYYY-MM-DD');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal memulai bot');
        return;
      }
      setRunId(data.id);
      setStatusUrl(data.statusUrl || `/api/bot/status/${data.id}`);
      if (typeof window !== 'undefined') {
        setShareUrl(`${window.location.origin}/?id=${data.id}`);
      }
      setBotState({
        id: data.id,
        status: data.status,
        logs: data.logs,
        startedAt: new Date().toISOString(),
        targetDate: data.targetDate ?? form.targetDate,
        targetTime: data.targetTime,
        config: { ...form }
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto py-10 px-6 space-y-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">WIB Scheduler</p>
        <h1 className="text-3xl font-semibold text-ink">Slot Bot Control Panel</h1>
        <p className="text-slate-600">Pre-warm → warm → burst untuk rebut slot Google Sheets secara kompetitif.</p>
      </header>

      <form onSubmit={handleSubmit} className="bg-white/80 shadow-sm rounded-xl p-6 space-y-4 border border-slate-200">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="space-y-2">
            <span className="text-sm text-slate-600">Link Google Sheets</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-accent focus:outline-none"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={form.sheetUrl}
              onChange={(e) => setForm({ ...form, sheetUrl: e.target.value })}
              required
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-slate-600">Range / Cell (boleh cantumkan sheet: Sheet2!B4)</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-accent focus:outline-none"
              placeholder="Sheet2!B4 atau B4"
              value={form.range}
              onChange={(e) => setForm({ ...form, range: e.target.value })}
              required
            />
          </label>
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          <label className="space-y-2">
            <span className="text-sm text-slate-600">Tanggal (WIB, YYYY-MM-DD)</span>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-accent focus:outline-none"
              value={form.targetDate}
              onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
              required
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-slate-600">Jam target (WIB, HH:mm:ss)</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-accent focus:outline-none"
              placeholder="12:00:00"
              value={form.targetTime}
              onChange={(e) => setForm({ ...form, targetTime: e.target.value })}
              required
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-slate-600">Nilai yang ditulis</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-accent focus:outline-none"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              required
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-slate-600">Burst request</span>
            <input
              type="number"
              min={3}
              max={5}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-accent focus:outline-none"
              value={form.burstCount}
              onChange={(e) => setForm({ ...form, burstCount: Number(e.target.value) })}
              required
            />
          </label>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-ink text-white hover:bg-black transition disabled:opacity-60"
        >
          {submitting ? 'Starting…' : 'Start Bot'}
        </button>
      </form>

      <section className="bg-white/80 shadow-sm rounded-xl p-6 border border-slate-200 space-y-3">
        <div className="flex items-center gap-3">
          <div className={`text-sm font-medium ${statusTone}`}>
            Status: {botState?.status || 'idle'}
          </div>
          {botState?.targetTime && (
            <div className="text-xs text-slate-500">Target: {botState.targetDate || form.targetDate} {botState.targetTime} WIB</div>
          )}
        </div>
        {statusUrl && (
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span className="font-medium text-slate-700">Status URL:</span>
            <a href={statusUrl} className="text-accent underline" target="_blank" rel="noreferrer">
              {statusUrl}
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(statusUrl)}
              className="ml-auto px-2 py-1 rounded bg-ink text-white text-[11px] hover:bg-black"
            >
              Copy
            </button>
          </div>
        )}
        {(statusUrl || shareUrl) && (
          <div className="grid md:grid-cols-2 gap-2 text-xs text-slate-600">
            {statusUrl && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="font-medium text-slate-700">Status API:</span>
                <a href={statusUrl} className="text-accent underline" target="_blank" rel="noreferrer">
                  {statusUrl}
                </a>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(statusUrl)}
                  className="ml-auto px-2 py-1 rounded bg-ink text-white text-[11px] hover:bg-black"
                >
                  Copy
                </button>
              </div>
            )}
            {shareUrl && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="font-medium text-slate-700">Link Halaman:</span>
                <a href={shareUrl} className="text-accent underline" target="_blank" rel="noreferrer">
                  {shareUrl}
                </a>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(shareUrl)}
                  className="ml-auto px-2 py-1 rounded bg-ink text-white text-[11px] hover:bg-black"
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        )}
        <div className="space-y-2">
          <div className="text-sm text-slate-600">Log realtime</div>
          <div className="log-area h-60 overflow-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {logs.length === 0 && <div className="text-slate-400">Belum ada log.</div>}
            {logs.map((log, idx) => (
              <div key={idx}>
                [{log.at}] [{log.level.toUpperCase()}] {log.message}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

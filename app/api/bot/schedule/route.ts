import { NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';
import { computeTargetTimestampWIB } from '@/lib/botEngine';

export const runtime = 'nodejs';

const client = process.env.QSTASH_TOKEN
  ? new Client({ token: process.env.QSTASH_TOKEN })
  : null;

interface ScheduleBody {
  sheetUrl: string;
  range: string;
  targetDate: string;
  targetTime: string;
  value?: string;
  burstCount?: number;
  // ISO string or epoch ms
  notBefore?: string | number;
}

function resolveCallback(): string {
  const base = process.env.SITE_URL || process.env.VERCEL_URL;
  if (!base) {
    throw new Error('SITE_URL or VERCEL_URL is required to build callback URL');
  }
  const absolute = base.startsWith('http') ? base : `https://${base}`;
  return `${absolute}/api/qstash/run`;
}

function toNotBeforeSeconds(notBefore?: string | number): number | undefined {
  if (notBefore === undefined) return undefined;
  if (typeof notBefore === 'number') {
    // Heuristic: if it's a large number, assume ms; if in seconds-range, keep as-is.
    if (notBefore > 1e12) return Math.floor(notBefore / 1000); // ms -> s
    if (notBefore > 1e9) return Math.floor(notBefore); // already seconds (near-future timestamps)
    return undefined;
  }
  const ts = Date.parse(notBefore);
  if (Number.isNaN(ts)) return undefined;
  return Math.floor(ts / 1000);
}

export async function POST(request: Request) {
  try {
    if (!client) {
      throw new Error('QSTASH_TOKEN is not set');
    }
    const body = (await request.json()) as ScheduleBody;
    const callback = resolveCallback();
    const leadMs = Number(process.env.BURST_LEAD_MS || '60000');
    const targetTs = body.targetDate && body.targetTime ? computeTargetTimestampWIB(body.targetDate, body.targetTime) : undefined;
    const launchTs = body.notBefore ?? (targetTs !== undefined ? targetTs - leadMs : undefined);
    const notBefore = toNotBeforeSeconds(launchTs);

    const publishResult = await client.publishJSON({
      url: callback,
      body,
      notBefore
    });

    return NextResponse.json({
      messageId: publishResult.messageId,
      callback,
      notBefore
    });
  } catch (error) {
    console.error('[bot/schedule] failed', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

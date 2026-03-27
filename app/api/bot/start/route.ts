import { NextResponse } from 'next/server';
import { startRun } from '@/lib/botEngine';
import { BotConfig } from '@/types/bot';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const config: BotConfig = {
      sheetUrl: String(body.sheetUrl || ''),
      range: String(body.range || ''),
      targetDate: String(body.targetDate || ''),
      targetTime: String(body.targetTime || ''),
      value: body.value ? String(body.value) : 'BOOKED',
      burstCount: body.burstCount ? Number(body.burstCount) : 5
    };

    console.info('[bot/start] incoming config', {
      sheetUrl: config.sheetUrl,
      range: config.range,
      targetDate: config.targetDate,
      targetTime: config.targetTime,
      burstCount: config.burstCount
    });

    const state = await startRun(config);

    const statusUrl = `/api/bot/status/${state.id}`;

    return NextResponse.json({
      id: state.id,
      status: state.status,
      logs: state.logs,
      targetDate: state.targetDate,
      targetTime: state.targetTime,
      statusUrl
    });
  } catch (error) {
    console.error('[bot/start] failed to start run', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

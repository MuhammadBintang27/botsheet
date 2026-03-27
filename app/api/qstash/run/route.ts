import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { runBurstNow } from '@/lib/botEngine';
import { BotConfig } from '@/types/bot';

export const runtime = 'nodejs';

function getReceiver(): Receiver {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY || current;
  if (!current) {
    throw new Error('QSTASH_CURRENT_SIGNING_KEY is required');
  }
  return new Receiver({ currentSigningKey: current, nextSigningKey: next });
}

export async function POST(request: Request) {
  try {
    const receiver = getReceiver();
    const signature = request.headers.get('Upstash-Signature') || '';
    const bodyText = await request.text();

    const isValid = receiver.verify({ signature, body: bodyText });
    if (!isValid) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(bodyText) as Partial<BotConfig>;
    const config: BotConfig = {
      sheetUrl: String(payload.sheetUrl || ''),
      range: String(payload.range || ''),
      targetDate: String(payload.targetDate || ''),
      targetTime: String(payload.targetTime || ''),
      value: payload.value ? String(payload.value) : 'BOOKED',
      burstCount: payload.burstCount ? Number(payload.burstCount) : 5
    };

    console.info('[qstash/run] verified payload', {
      sheetUrl: config.sheetUrl,
      range: config.range,
      targetDate: config.targetDate,
      targetTime: config.targetTime,
      burstCount: config.burstCount
    });

    const state = await runBurstNow(config);

    return NextResponse.json({
      id: state.id,
      status: state.status,
      logs: state.logs,
      targetDate: state.targetDate,
      targetTime: state.targetTime
    });
  } catch (error) {
    console.error('[qstash/run] failed', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

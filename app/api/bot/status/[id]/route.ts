import { NextResponse } from 'next/server';
import { getRun } from '@/lib/botEngine';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: { id: string } }) {
  const run = getRun(context.params.id);
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  return NextResponse.json(run);
}

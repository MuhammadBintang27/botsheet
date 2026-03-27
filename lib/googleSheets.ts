import { createPrivateKey } from 'crypto';
import { JWT } from 'google-auth-library';
import { logEntry } from '@/lib/logger';
import { LogEntry } from '@/types/bot';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function describeKey(key: string) {
  return {
    length: key.length,
    startsWith: key.slice(0, 30),
    endsWith: key.slice(-30),
    hasBegin: key.includes('-----BEGIN'),
    hasEnd: key.includes('END PRIVATE KEY-----'),
    looksBase64: /^[A-Za-z0-9+/=\r\n]+$/.test(key) && !key.includes('BEGIN')
  };
}

function normalizePrivateKey(rawKey: string): string {
  const cleaned = (rawKey || '').replace(/\r/g, '');
  const hasEscaped = cleaned.includes('\\n');
  const withNewlines = hasEscaped ? cleaned.replace(/\\n/g, '\n') : cleaned;
  // Ensure trailing newline for PEM parsing
  const trimmed = withNewlines.trimEnd() + (withNewlines.endsWith('\n') ? '' : '\n');
  const looksBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && !trimmed.includes('BEGIN');
  if (looksBase64) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
      return normalizePrivateKey(decoded); // re-run to verify markers
    } catch (_e) {
      throw new Error('Invalid private key format (base64 decode failed)');
    }
  }
  const hasPemMarkers =
    trimmed.includes('-----BEGIN PRIVATE KEY-----') && trimmed.includes('-----END PRIVATE KEY-----');
  if (!hasPemMarkers) {
    throw new Error('Invalid private key format');
  }
  // Validate with Node crypto to surface precise errors early
  try {
    createPrivateKey({ key: trimmed, format: 'pem' });
  } catch (e) {
    console.error('[auth] createPrivateKey failed', e);
    throw new Error('Invalid private key format (createPrivateKey)');
  }
  return trimmed;
}

let authClient: JWT | null = null;

function parseServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const envEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const envKey = process.env.GOOGLE_PRIVATE_KEY?.trim();

  if (!raw && !(envEmail && envKey)) {
    console.error('[auth] missing credentials: provide GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY');
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY');
  }

  try {
    let parsed: ServiceAccount;
    if (raw) {
      // Allow users to wrap the JSON in quotes in .env files.
      const normalizedRaw = raw.startsWith('{') ? raw : raw.slice(1, -1);
      parsed = JSON.parse(normalizedRaw) as ServiceAccount;
    } else {
      parsed = {
        client_email: envEmail || '',
        private_key: envKey || ''
      };
    }
    if (!parsed.client_email || !parsed.private_key) {
      console.error('[auth] missing fields', {
        hasEmail: Boolean(parsed.client_email),
        hasKey: Boolean(parsed.private_key)
      });
      throw new Error('Invalid service account credentials (missing fields)');
    }
    const privateKey = normalizePrivateKey(parsed.private_key);
    console.info('[auth] parsed credentials', {
      emailSet: Boolean(parsed.client_email),
      keyMeta: describeKey(privateKey)
    });
    return {
      client_email: parsed.client_email,
      private_key: privateKey
    };
  } catch (error) {
    console.error('[auth] failed to parse credentials', error);
    throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON');
  }
}

function getAuthClient(): JWT {
  if (authClient) return authClient;
  const serviceAccount = parseServiceAccount();
  authClient = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: SCOPES
  });
  return authClient;
}

export function extractSpreadsheetId(sheetUrl: string): string | null {
  // Typical formats: https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit#gid=0
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Supports "Sheet2!B4" or just "B4"; allows optional Sheet name (alnum/space/_).
export function isValidRange(range: string): boolean {
  return /^(?:[A-Za-z0-9_ ]+!)?[A-Z]+\d+(?::[A-Z]+\d+)?$/.test(range.trim());
}

async function fetchWithAuth(url: string, init?: RequestInit) {
  const client = getAuthClient();
  const tokenResponse = await client.authorize().catch((err) => {
    console.error('[auth] authorize failed', err);
    throw err;
  });
  const token = tokenResponse?.access_token;
  if (!token) throw new Error('Failed to obtain access token');

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API error ${res.status}: ${text}`);
  }

  return res;
}

export async function warmAuth(): Promise<LogEntry> {
  const client = getAuthClient();
  await client.authorize();
  return logEntry('info', 'Auth pre-warmed');
}

export async function pingSheet(spreadsheetId: string): Promise<LogEntry> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  await fetchWithAuth(url, { method: 'GET' });
  return logEntry('info', 'Warm ping success');
}

export async function writeRange(spreadsheetId: string, range: string, value: string): Promise<LogEntry> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const body = {
    range,
    majorDimension: 'ROWS',
    values: [[value]]
  };
  await fetchWithAuth(url, { method: 'PUT', body: JSON.stringify(body) });
  return logEntry('info', `Write success to ${range}`);
}

# Slot Bot (Next.js, WIB scheduler)

Fullstack Next.js App Router bot to pre-warm auth and burst-write to Google Sheets at a precise WIB time window (designed for competitive slot grabbing).

## Prasyarat
- Node.js 18+
- Akun Service Account Google Cloud dengan akses Google Sheets API
- Spreadsheet dibagikan ke email service account

### Variabel lingkungan
Buat `.env.local` berisi:
```
GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"}
```

## Menjalankan secara lokal
```
npm install
npm run dev
```
Buka http://localhost:3000

## Deploy (Vercel)
- Set `GOOGLE_SERVICE_ACCOUNT_JSON` sebagai env secret di Vercel
- Tambah cron Vercel (opsional) untuk memanggil `/api/bot/start` sekitar 11:59:55 WIB

## Alur bot
- Input sheet URL, range (sertakan nama sheet jika perlu, mis. `Sheet2!B4`), target date (YYYY-MM-DD) + time (HH:mm:ss WIB), value, burst count
- 11:59:58: pre-warm (auth)
- 11:59:59: warm ping (GET sheet)
- 12:00:00: burst `3-5` parallel writes + retry 50–100ms jitter
- Status dan log dipolling via `/api/bot/status/{id}`

## Struktur
- `app/page.tsx` UI form + log viewer
- `app/api/bot/start` memulai run dan menjadwalkan timers
- `app/api/bot/status/[id]` status/log polling
- `lib/googleSheets.ts` auth + write helper
- `lib/botEngine.ts` scheduler, burst, retry
- `lib/logger.ts` timestamped log
- `types/bot.ts` tipe data

## Catatan performa
- Menggunakan Node timers; untuk serverless, trigger via cron lalu biarkan timers bekerja hingga burst.
- Burst menggunakan `Promise.all` untuk paralel; retry cepat jika ada error.
- Pastikan instance tidak tidur saat window 11:59:55–12:00:01.

# Unbookin

**Unbookin** (unbookin.com) — "Unbook anything. Master everything." Platform belajar berbasis AI yang mengubah buku, jurnal, dan tautan menjadi modul **Pahami · Terapkan · Buktikan** dengan kuis, review terjadwal, dan gamifikasi.

## Prasyarat

- Node.js 24
- pnpm 12
- Docker (Postgres + pgvector untuk pengembangan lokal)

## Mulai

```bash
pnpm install
cp .env.example .env.local   # isi kunci sesuai kebutuhan
pnpm dev
```

## Perintah

```bash
pnpm dev            # server lokal
pnpm build          # build produksi
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest (unit)
pnpm e2e            # Playwright (viewport ponsel)
pnpm format         # Prettier (tulis)
pnpm format:check   # Prettier (cek saja)
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate     # jalankan migrasi
pnpm db:seed        # seed data awal
pnpm eval:engine    # uji kualitas Unbook Engine pada fixture
npx inngest-cli dev # Inngest lokal
```

## Dokumen

- [`docs/M3-SETUP.md`](./docs/M3-SETUP.md) — konfigurasi unggah dan ingest sumber
- [`docs/M3-INGEST.md`](./docs/M3-INGEST.md) — kontrak privat dan bukti pengujian pipeline

- [`PRD.md`](./PRD.md) — spesifikasi produk lengkap
- [`CLAUDE.md`](./CLAUDE.md) — aturan cara bekerja di repo ini
- [`docs/`](./docs) — keputusan teknis dan rencana orkestrasi

# PRD — Unbookin Platform (MVP v1.0)

> **Unbook anything. Master everything.**
> Product Requirements Document untuk dibangun dengan Claude Code.
> Versi: 1.0 · Tanggal: 24 Oktober 2026 · Pemilik produk: Abu Sena (Founder)

---

## 0. Cara memakai dokumen ini (untuk Claude Code)

1. Baca `CLAUDE.md` lebih dulu untuk aturan kerja, lalu dokumen ini.
2. Bangun **berurutan per milestone** di §15. Jangan memulai milestone berikutnya sebelum kriteria selesai milestone sekarang terpenuhi.
3. Setiap fitur punya **ID** (mis. `E3-02`) dan **kriteria penerimaan** (AC). Sebut ID di pesan commit dan di komentar kode yang relevan.
4. Jika ada yang ambigu atau bertentangan, **tanya founder** sebelum memutuskan sendiri. Catat keputusan di `docs/decisions.md`.
5. Bahasa antarmuka: **Bahasa Indonesia** (default). Kode, nama variabel, nama tabel, dan komentar teknis: **Bahasa Inggris**.
6. Setiap layar dirancang **mobile-first** dan diperiksa di lebar 375px sebelum dianggap selesai.

---

## 1. Ringkasan produk

**Unbookin** adalah platform belajar berbasis AI yang mengubah buku, jurnal, dan artikel menjadi **jalur penguasaan yang bisa diterapkan**. Pengguna mengunggah bacaan sesuai minatnya; Unbookin mengubahnya menjadi modul berlapis, aksi nyata, kuis, dan kartu review, dibungkus gamifikasi.

Tiga janji inti, yang menjadi struktur setiap modul:

| Pilar | Artinya bagi pengguna | Bentuk di produk |
| --- | --- | --- |
| **Pahami** | "Saya mengerti isinya, bukan sekadar tahu" | Inti satu kalimat, penjelasan 3 lapis, peta konsep |
| **Terapkan** | "Saya tahu apa yang harus dilakukan Senin depan" | Studi kasus sesuai peran, templat, Aksi Minggu Ini |
| **Buktikan** | "Saya bisa membuktikan sudah menguasainya" | Kuis Bloom, kartu review terjadwal, Jurnal Penerapan |

**Pembeda utama** dari pesaing (NotebookLM, Blinkist, Headway, AI umum): lapisan **penerapan**. Level hanya naik jika pengguna lulus kuis **dan** melaporkan penerapan nyata.

---

## 2. Tujuan, metrik, dan batasan

### 2.1 Tujuan MVP
Membuktikan bahwa pembelajar individu di Indonesia **mau membayar** karena benar-benar menerapkan apa yang dibacanya.

### 2.2 Metrik keberhasilan (bulan 6 setelah peluncuran publik)

| Metrik | Target | Cara mengukur |
| --- | --- | --- |
| Bintang utara: aksi penerapan dilaporkan per minggu | 300 | `action_reports` per minggu |
| Pengguna terdaftar | 3.000 | `users` |
| Pelanggan berbayar | 50 | `subscriptions` aktif |
| Retensi hari ke-30 | 20% | kohort PostHog |
| Skor kuis ulang hari ke-7 | ≥ 70% | `quiz_attempts` ulang |
| Waktu sumber → modul siap (buku 200 halaman) | ≤ 5 menit (p75) | `unbooks.completed_at - created_at` |
| Biaya AI per pelanggan Pro | ≤ Rp 12.000/bulan | `ai_calls` |

### 2.3 Di luar cakupan MVP (jangan dibangun)
- Aplikasi native iOS/Android (MVP = web + PWA).
- Unbookin Teams (B2B), Campus (institusi), Unbook Studio (penulis/penerbit).
- Boss Battle (ujian domain) dan bot pendamping Telegram/WhatsApp → bulan 7–9.
- Fitur sosial: berbagi modul publik, leaderboard publik, komentar antarpengguna.
- Perpustakaan ringkasan buku berhak cipta milik pihak lain.
- Integrasi langsung ke tiap penyedia AI (MVP hanya lewat OpenRouter).
- Bahasa selain Indonesia (siapkan i18n, tetapi hanya isi `id`).

---

## 3. Persona dan jobs-to-be-done

| Persona | Pekerjaan yang ingin diselesaikan | Momen pemicu |
| --- | --- | --- |
| **Pemimpin baru** (manajer/kepala divisi tanpa latar belakang formal) | "Bantu saya cepat kompeten agar percaya diri di depan tim." | Baru naik jabatan, punya tumpukan buku manajemen |
| **Profesional pembelajar** (HR, konsultan, pemasar, pengusaha) | "Ubah buku yang saya baca jadi tindakan di pekerjaan." | Selesai membaca tapi tidak ada yang berubah |
| **Mahasiswa pascasarjana** | "Bantu saya memahami jurnal berbahasa Inggris dengan cepat dan benar." | Tenggat tugas, tumpukan paper |

Persona utama untuk keputusan desain: **Pemimpin baru**. Jika ragu, rancang untuknya.

---

## 4. Ruang lingkup MVP

| Epic | Nama | Prioritas |
| --- | --- | --- |
| E0 | Landing page dan daftar tunggu | P0 (dibangun pertama) |
| E1 | Autentikasi dan onboarding | P0 |
| E2 | Pustaka dan unggah sumber | P0 |
| E3 | Unbook Engine (pipeline AI) | P0 |
| E4 | Pembaca modul | P0 |
| E5 | Kuis | P0 |
| E6 | Review terjadwal | P0 |
| E7 | Aksi dan Jurnal Penerapan | P0 |
| E8 | Gamifikasi | P0 |
| E9 | Minat dan pohon keahlian | P1 |
| E10 | Mentor AI | P1 |
| E11 | Langganan dan pembayaran | P0 |
| E12 | BYOK (OpenRouter) | P1 |
| E13 | Katalog Originals | P1 |
| E14 | Notifikasi | P1 |
| E15 | Profil, privasi, dan akun | P0 |
| E16 | Panel admin | P1 |

P0 = wajib ada saat peluncuran. P1 = wajib ada, boleh versi sederhana.

---

## 5. Tech stack dan arsitektur

### 5.1 Stack (sudah diputuskan)

| Lapisan | Pilihan | Catatan |
| --- | --- | --- |
| Framework | **Next.js** (App Router, versi stabil terbaru) + **TypeScript** (strict) | Server Components default; Server Actions untuk mutasi |
| Styling | **Tailwind CSS** + **shadcn/ui** (Radix) | Design token di §12 |
| Animasi | **Motion** (framer-motion) | Halus, singkat, hormati `prefers-reduced-motion` |
| Ikon | **lucide-react** | |
| Database | **PostgreSQL** dengan ekstensi **pgvector** | Managed di region Singapura (mis. Neon) |
| ORM | **Drizzle ORM** + drizzle-kit (migrasi) | Mendukung kolom `vector` |
| Auth | **Auth.js (NextAuth v5)** | Google OAuth + email magic link |
| Penyimpanan file | **S3-compatible** (Cloudflare R2 direkomendasikan) | Unggah langsung dengan presigned URL |
| Background job | **Inngest** | Pipeline Unbook bisa berjalan beberapa menit |
| AI gateway | **OpenRouter** (API kompatibel OpenAI) | Chat, structured output, embeddings, OAuth PKCE untuk BYOK |
| Validasi | **Zod** | Semua input form, API, dan output AI |
| Pembayaran | **Midtrans Snap** + webhook | Kartu, VA bank, e-wallet, QRIS |
| Email | **Resend** + React Email | Magic link, notifikasi |
| i18n | **next-intl** | Hanya `id` di MVP |
| Analitik | **PostHog** | Event di §14 |
| Error tracking | **Sentry** | |
| Hosting | **Vercel** (region Singapura) | |
| PWA | Web manifest + service worker | Bisa dipasang di layar utama ponsel |
| Test | **Vitest** (unit), **Playwright** (E2E, viewport mobile) | |

### 5.2 Arsitektur tingkat tinggi

```
[Browser / PWA]
   │  Next.js App Router (RSC + Server Actions)
   ▼
[Next.js on Vercel] ──── Auth.js ──── Google / Resend (magic link)
   │        │
   │        ├── Drizzle ──► [PostgreSQL + pgvector]
   │        ├── Presigned URL ──► [R2 / S3: file sumber]
   │        ├── Midtrans Snap  ◄── webhook /api/webhooks/midtrans
   │        └── inngest.send("source/uploaded")
   ▼
[Inngest functions]
   ├── ingest-source     : ekstrak teks → chunk → embed
   ├── generate-unbook   : outline → modul → kuis → kartu → tagging domain
   ├── daily-review-digest, streak-guard, weekly-missions
   ▼
[AI Router (lib/ai)] ──► OpenRouter API
   ├── kunci platform (default)
   └── kunci BYOK milik pengguna (terenkripsi)
```

### 5.3 Struktur folder

```
unbookin/
├── CLAUDE.md
├── PRD.md
├── docs/decisions.md
├── drizzle/                     # migrasi
├── public/                      # ikon PWA, ilustrasi
├── src/
│   ├── app/
│   │   ├── (marketing)/         # landing, harga, legal, originals publik
│   │   ├── (auth)/              # masuk, verifikasi
│   │   ├── (app)/               # area login: beranda, pustaka, review, progres, profil
│   │   │   ├── home/
│   │   │   ├── library/
│   │   │   ├── unbook/[unbookId]/
│   │   │   │   └── module/[moduleId]/
│   │   │   ├── review/
│   │   │   ├── progress/
│   │   │   ├── journal/
│   │   │   ├── originals/
│   │   │   └── settings/
│   │   ├── (admin)/admin/
│   │   ├── onboarding/
│   │   └── api/
│   │       ├── auth/[...nextauth]/
│   │       ├── inngest/
│   │       ├── upload/presign/
│   │       ├── mentor/[threadId]/   # streaming chat
│   │       ├── byok/callback/
│   │       └── webhooks/midtrans/
│   ├── components/
│   │   ├── ui/                  # shadcn
│   │   ├── game/                # XPToast, StreakFlame, LevelRing, BadgeCard, Confetti
│   │   ├── module/              # LayerToggle, ConceptMap, ActionCard, QuizCard
│   │   └── layout/              # BottomNav, TopBar, Sheet
│   ├── db/
│   │   ├── schema/              # satu file per domain
│   │   └── index.ts
│   ├── lib/
│   │   ├── ai/                  # router, prompts, schemas, cost
│   │   ├── engine/              # extract, chunk, generate
│   │   ├── game/                # xp, levels, streak, badges, missions
│   │   ├── billing/             # plans, quota, midtrans
│   │   ├── crypto/              # enkripsi kunci BYOK
│   │   └── auth.ts
│   ├── inngest/                 # fungsi background
│   ├── messages/id.json         # semua teks UI
│   └── styles/
└── tests/
```

---

## 6. Model data

Semua tabel memakai `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, dan `updated_at` bila datanya bisa berubah. Kolom di bawah adalah yang wajib; tambahkan indeks untuk setiap foreign key dan kolom yang sering difilter.

### 6.1 Pengguna dan profil
- **users** — tabel Auth.js (`id`, `name`, `email`, `email_verified`, `image`) + `role` (`user` | `admin`), `deleted_at`.
- **accounts**, **sessions**, **verification_tokens** — standar Auth.js Drizzle adapter.
- **profiles** — `user_id` (unik), `display_name`, `job_role` (teks bebas), `goal` (teks), `experience_level` (`novice` | `intermediate` | `advanced`), `daily_goal_minutes` (5/10/20), `timezone` (default `Asia/Jakarta`), `locale` (default `id`), `onboarded_at`.

### 6.2 Minat dan pohon keahlian
- **interests** — `slug`, `name`, `description`, `icon`, `color_token`, `is_active`, `sort_order`.
- **domains** — `interest_id`, `slug`, `name`, `description`, `sort_order`.
- **user_interests** — `user_id`, `interest_id`, `is_primary`.

### 6.3 Sumber dan Unbook
- **sources** — `user_id`, `type` (`pdf` | `epub` | `url` | `text`), `title`, `author`, `year`, `file_key`, `url`, `mime_type`, `size_bytes`, `page_count`, `word_count`, `language`, `status` (`uploaded` | `extracting` | `ready` | `failed`), `error_code`, `rights_confirmed_at` (wajib terisi), `file_deleted_at`.
- **source_chunks** — `source_id`, `idx`, `chapter_title`, `page_from`, `page_to`, `text`, `token_count`, `embedding vector(1536)`, indeks HNSW pada `embedding`, indeks GIN full-text pada `text`.
- **unbooks** — `user_id` (null untuk Originals), `source_id` (nullable), `original_id` (nullable), `title`, `big_idea`, `interest_id`, `status` (`queued` | `outlining` | `generating` | `ready` | `failed`), `progress_pct`, `current_stage`, `module_count`, `used_byok` (bool), `cost_usd`, `completed_at`.
- **modules** — `unbook_id`, `sort_order`, `title`, `summary`, `content jsonb` (skema §7.4), `estimated_minutes`, `source_page_from`, `source_page_to`.
- **module_domains** — `module_id`, `domain_id`, `confidence`.
- **module_progress** — `user_id`, `module_id`, `status` (`not_started` | `reading` | `read`), `deepest_layer` (`eli5` | `practitioner` | `expert`), `read_at`.

### 6.4 Kuis dan review
- **quizzes** — `module_id`, `version`, `is_active`.
- **quiz_questions** — `quiz_id`, `sort_order`, `bloom_level` (`remember` | `understand` | `apply` | `analyze` | `evaluate` | `create`), `type` (`mcq` | `multi_select` | `case_mcq` | `short_answer`), `prompt`, `options jsonb`, `correct jsonb`, `explanation`, `rubric jsonb` (untuk `short_answer`), `chunk_refs uuid[]`.
- **quiz_attempts** — `user_id`, `quiz_id`, `answers jsonb`, `score_pct`, `passed`, `started_at`, `finished_at`.
- **review_cards** — `module_id`, `front`, `back`, `chunk_ref`.
- **card_states** — `user_id`, `card_id` (unik bersama), `box` (0–5), `due_at`, `last_result` (`again` | `hard` | `good`), `reviewed_count`.

### 6.5 Aksi dan penerapan
- **actions** — `user_id`, `module_id`, `title`, `description`, `due_at`, `status` (`planned` | `done` | `skipped`).
- **action_reports** — `action_id`, `what_i_did`, `result`, `reflection`, `evidence_url`, `ai_feedback`, `quality_score` (1–4), `verified` (bool, `quality_score >= 3`).

### 6.6 Gamifikasi
- **xp_events** — `user_id`, `type`, `amount`, `domain_id` (nullable), `ref_type`, `ref_id`, unik pada (`user_id`, `type`, `ref_type`, `ref_id`) agar XP tidak dobel.
- **user_stats** — `user_id` (unik), `total_xp`, `level`, `current_streak`, `longest_streak`, `streak_freezes`, `last_active_date` (tanggal lokal pengguna).
- **domain_progress** — `user_id`, `domain_id`, `xp`, `level` (`novice` | `advanced_beginner` | `competent` | `proficient` | `expert`), `verified_actions`.
- **badges** — `slug`, `name`, `description`, `icon`, `rule jsonb`, `tier` (`bronze` | `silver` | `gold`).
- **user_badges** — `user_id`, `badge_id`, `earned_at`.
- **mission_templates** — `slug`, `title`, `type` (`learn` | `review` | `apply`), `target`, `xp_reward`.
- **user_missions** — `user_id`, `template_id`, `week_start`, `progress`, `completed_at`.

### 6.7 Mentor AI
- **mentor_threads** — `user_id`, `unbook_id`, `title`.
- **mentor_messages** — `thread_id`, `role` (`user` | `assistant`), `content`, `citations jsonb` (chunk id + halaman), `input_tokens`, `output_tokens`.

### 6.8 Originals dan billing
- **originals** — `slug`, `title`, `author_name`, `cover_key`, `description`, `interest_id`, `price_idr`, `is_published`, `unbook_id` (konten disimpan sebagai Unbook dengan `user_id` null), `sample_module_count` (default 1).
- **original_purchases** — `user_id`, `original_id`, `payment_id`.
- **plans** — `code` (`free` | `pro_monthly` | `pro_yearly` | `byok_monthly` | `byok_yearly`), `name`, `price_idr`, `interval`, `limits jsonb`, `is_active`.
- **subscriptions** — `user_id`, `plan_code`, `status` (`active` | `past_due` | `canceled` | `expired`), `current_period_start`, `current_period_end`, `cancel_at_period_end`.
- **payments** — `user_id`, `kind` (`subscription` | `original`), `ref_id`, `amount_idr`, `midtrans_order_id` (unik), `midtrans_status`, `payment_type`, `paid_at`, `raw jsonb`.
- **usage_counters** — `user_id`, `period` (`YYYY-MM`), `unbooks_used`, `mentor_messages_used`, `pages_processed`.

### 6.9 AI dan sistem
- **byok_keys** — `user_id` (unik), `provider` (`openrouter`), `encrypted_key`, `iv`, `auth_tag`, `last4`, `connected_via` (`oauth` | `manual`), `verified_at`, `revoked_at`.
- **ai_task_configs** — `task` (unik), `model`, `fallback_model`, `temperature`, `max_output_tokens`, `is_active`. Diisi lewat seed, bisa diubah di admin tanpa deploy.
- **ai_calls** — `user_id`, `task`, `model`, `byok` (bool), `input_tokens`, `output_tokens`, `cost_usd`, `latency_ms`, `status`, `error`.
- **waitlist** — `email` (unik), `interest_slug`, `price_variant`, `referral_code` (unik), `referred_by`, `source_utm`.
- **takedown_requests** — `reporter_name`, `reporter_email`, `work_title`, `description`, `target_ref`, `status`.
- **notification_prefs** — `user_id`, `email_review_due`, `email_streak_risk`, `email_weekly_summary`, `push_enabled`.
- **audit_logs** — `actor_id`, `action`, `target_type`, `target_id`, `meta jsonb`.

---

## 7. Unbook Engine

### 7.1 Alur pipeline

```
Unggah selesai
  └─► ingest-source (Inngest)
        1. Ekstrak teks per halaman (PDF: unpdf/pdf.js · EPUB: parser EPUB · URL: Mozilla Readability)
        2. Deteksi bab dari daftar isi / heading; fallback potongan ~2.500 token
        3. Bersihkan (header/footer berulang, nomor halaman)
        4. Chunk 600–900 token dengan overlap 80, simpan page_from/page_to
        5. Embed batch via OpenRouter /embeddings → source_chunks.embedding
        6. sources.status = ready → kirim "unbook/requested"
  └─► generate-unbook (Inngest, langkah-langkah bisa diulang sendiri-sendiri)
        A. outline      : judul, big idea, 3–12 modul (per bab atau gabungan bab pendek)
        B. module ×N    : konten modul (skema §7.4), paralel maks 3
        C. quiz ×N      : 6–8 soal per modul
        D. cards ×N     : 5–8 kartu review per modul
        E. tagging      : petakan modul ke domain minat pengguna
        F. selesai      : unbooks.status = ready, kirim notifikasi
```

- Status dan `current_stage` diperbarui di setiap langkah agar UI bisa menampilkan progres nyata (§12.6, layar Proses).
- Setiap langkah idempoten dan bisa diulang dari langkah yang gagal saja.
- Gagal 3 kali → `status = failed`, kuota tidak dipotong, pengguna diberi pesan yang jelas dan tombol coba lagi.

### 7.2 Router AI (`lib/ai`)

- Satu fungsi `runTask(task, input, { userId })` yang:
  1. Membaca model dari `ai_task_configs` (cache 5 menit).
  2. Memilih kunci: BYOK milik pengguna jika paketnya BYOK dan kuncinya valid; selain itu kunci platform.
  3. Memanggil OpenRouter (`https://openrouter.ai/api/v1`), memakai structured output (JSON Schema) bila model mendukung.
  4. Memvalidasi hasil dengan Zod; jika gagal, satu kali percobaan perbaikan dengan pesan error validasi; jika tetap gagal, pakai `fallback_model`.
  5. Mencatat `ai_calls` (token, biaya, latensi, BYOK atau tidak).
- **Jangan menulis ID model di kode.** Semua lewat `ai_task_configs`. Seed awal diisi founder; sediakan placeholder di `.env.example`.
- Header OpenRouter `HTTP-Referer: https://unbookin.com` dan `X-Title: Unbookin`.

| Task | Kebutuhan model | Catatan biaya |
| --- | --- | --- |
| `outline` | Konteks panjang, murah | Membaca ringkasan per bab, bukan seluruh buku |
| `module` | Kualitas menulis tinggi, bahasa Indonesia baik | Biaya terbesar; input = chunk bab terkait |
| `quiz` | Penalaran baik, structured output | |
| `cards` | Murah | |
| `tagging` | Murah | |
| `mentor_chat` | Kualitas tinggi, streaming | Input = 6–8 chunk teratas (RAG) |
| `grade_short_answer` | Murah-menengah | Rubrik 1–4 |
| `action_feedback` | Murah-menengah | |
| `embedding` | Model embedding 1536 dimensi | Selalu pakai kunci platform |

### 7.3 Prinsip prompt (berlaku untuk semua task)

1. **Hanya dari sumber.** Semua klaim isi harus berasal dari chunk yang diberikan. Sertakan `chunk_refs`. Jika sumber tidak membahas sesuatu, katakan tidak dibahas.
2. **Pisahkan tiga hal:** isi sumber, bukti pendukung, dan tafsiran atau contoh dari Unbookin. Tafsiran ditandai.
3. **Personalisasi lewat profil:** `job_role`, `goal`, `experience_level`, minat. Studi kasus dan Aksi Minggu Ini memakai konteks peran pengguna.
4. **Bahasa Indonesia yang jernih**, istilah teknis tetap dalam bahasa asli lalu dijelaskan saat pertama muncul.
5. **Hormati hak cipta:** jangan menyalin paragraf panjang; kutipan langsung maksimal satu kalimat pendek per modul dengan nomor halaman.
6. **Ringkas berlapis:** inti dulu, detail kemudian.
7. Simpan prompt di `lib/ai/prompts/*.ts` sebagai fungsi bertipe, dengan versi (`PROMPT_VERSION`) yang ikut dicatat di `ai_calls`.

### 7.4 Skema konten modul (`modules.content`)

```ts
const ModuleContent = z.object({
  bigIdea: z.string().max(220),                 // satu kalimat inti
  whyItMatters: z.string().max(400),            // relevansi untuk peran pengguna
  layers: z.object({
    eli5: z.string(),                           // analogi sederhana, 80–150 kata
    practitioner: z.array(z.object({            // 3–7 konsep kunci
      concept: z.string(),
      explanation: z.string(),
      chunkRefs: z.array(z.string().uuid()),
    })),
    expert: z.object({
      assumptions: z.array(z.string()),
      evidence: z.array(z.string()),
      critiques: z.array(z.string()),
      compareWith: z.array(z.string()),         // kerangka/teori lain
    }),
  }),
  conceptMap: z.object({                        // dirender di klien, bukan Mermaid
    nodes: z.array(z.object({ id: z.string(), label: z.string(), kind: z.enum(['core','concept','example']) })),
    edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
  }),
  application: z.object({
    caseStudy: z.object({ title: z.string(), situation: z.string(), howToApply: z.array(z.string()) }),
    tools: z.array(z.object({ name: z.string(), type: z.enum(['checklist','template','questions','canvas']), items: z.array(z.string()) })),
    actionThisWeek: z.object({ title: z.string().max(90), steps: z.array(z.string()).max(4), doneWhen: z.string() }),
    commonMistakes: z.array(z.string()).max(5),
  }),
  keyQuote: z.object({ text: z.string().max(200), page: z.number().int() }).optional(),
  estimatedMinutes: z.number().int().min(3).max(25),
});
```

### 7.5 Batas dan kuota

| Batas | Gratis | Pro | Pro BYOK |
| --- | --- | --- | --- |
| Unbook per bulan | 2 | 8 | Tanpa batas (fair use 50) |
| Halaman maksimal per sumber | 60 | 500 | 800 |
| Ukuran file maksimal | 20 MB | 100 MB | 100 MB |
| Pesan mentor per bulan | 20 | 300 | Tanpa batas (kunci sendiri) |
| Akses Originals | Modul contoh saja | Penuh | Penuh |
| Model | Kelas hemat | Kelas utama | Pilihan pengguna dari daftar yang diizinkan |

- Kuota dihitung di `usage_counters` per bulan kalender (zona waktu pengguna) dan dipotong **saat Unbook selesai**, bukan saat diunggah.
- Halaman EPUB/URL dihitung sebagai `word_count / 300`.
- Sumber melebihi batas halaman: tawarkan memilih rentang bab, atau tingkatkan paket.

---

## 8. Fitur, user story, dan kriteria penerimaan

Format: **ID — Nama.** *Sebagai pengguna, saya ingin …* lalu kriteria penerimaan (AC).

### E0 — Landing page dan daftar tunggu (dibangun pertama)

**E0-01 — Landing page.** *Sebagai pengunjung, saya ingin langsung paham apa itu Unbookin dan mendaftar.*
- AC1: Hero dengan tagline, satu kalimat penjelas, dan tombol "Gabung daftar tunggu" terlihat tanpa scroll di 375×667.
- AC2: Bagian: cara kerja (Pahami, Terapkan, Buktikan), contoh modul interaktif statis, gamifikasi, harga, FAQ, footer legal.
- AC3: Lighthouse mobile ≥ 90 untuk Performance, Accessibility, SEO.
- AC4: Metadata Open Graph dan gambar pratinjau untuk dibagikan di WhatsApp dan LinkedIn.

**E0-02 — Formulir daftar tunggu dengan uji harga.**
- AC1: Kolom email (wajib) dan minat utama (pilihan 3 minat pembuka).
- AC2: Pengunjung secara acak melihat varian harga A atau B (disimpan di cookie dan `waitlist.price_variant`).
- AC3: Setelah mendaftar, tampil posisi antrean dan tautan rujukan unik. Setiap teman yang mendaftar lewat tautan itu menaikkan posisi 10 tingkat.
- AC4: Email konfirmasi terkirim lewat Resend. Email ganda ditolak dengan pesan ramah.

### E1 — Autentikasi dan onboarding

**E1-01 — Masuk.** *Sebagai pengguna, saya ingin masuk dengan Google atau tautan email tanpa kata sandi.*
- AC1: Google OAuth dan magic link email. Tidak ada kata sandi.
- AC2: Sesi bertahan 30 hari; keluar dari menu Profil.
- AC3: Pengguna yang belum `onboarded_at` selalu diarahkan ke `/onboarding`.

**E1-02 — Onboarding 5 langkah.** *Sebagai pengguna baru, saya ingin Unbookin memahami saya agar contohnya relevan.*
- Langkah: (1) nama panggilan, (2) peran/pekerjaan (teks bebas + saran cepat), (3) minat utama dan tambahan, (4) tujuan belajar dalam satu kalimat, (5) target harian 5/10/20 menit.
- AC1: Satu langkah per layar dengan bilah progres; bisa kembali; selesai dalam ≤ 90 detik.
- AC2: Di akhir, animasi singkat "Profil belajar siap" lalu masuk Beranda dengan ajakan unggah sumber pertama.
- AC3: Semua jawaban bisa diubah di Pengaturan.

### E2 — Pustaka dan unggah sumber

**E2-01 — Unggah sumber.** *Sebagai pengguna, saya ingin mengunggah buku atau tautan dengan cepat dari ponsel.*
- AC1: Tombol utama "Unbook" (FAB di tengah navigasi bawah) membuka lembar bawah dengan tiga pilihan: Unggah file (PDF/EPUB), Tempel tautan, Tempel teks.
- AC2: Kotak centang wajib: "Saya memiliki atau berhak mengakses file ini dan hanya memakainya untuk belajar pribadi." Tanpa centang, tombol lanjut nonaktif.
- AC3: Unggah langsung ke R2 dengan presigned URL dan bilah progres; bisa dibatalkan.
- AC4: Validasi tipe, ukuran, dan batas halaman sesuai paket (§7.5) **sebelum** memotong kuota, dengan pesan dan tawaran upgrade.
- AC5: PDF hasil pindai tanpa teks: tampilkan pesan "File ini berupa gambar; versi ini belum mendukung OCR."

**E2-02 — Layar proses.** *Sebagai pengguna, saya ingin melihat bahwa bacaan saya sedang diolah.*
- AC1: Menampilkan tahap nyata dari `unbooks.current_stage` (Membaca → Memetakan bab → Menulis modul 3/8 → Menyusun kuis → Selesai), diperbarui tiap ≤ 3 detik (polling atau SSE).
- AC2: Pengguna boleh menutup layar; notifikasi in-app (dan email jika diaktifkan) saat selesai.
- AC3: Saat gagal: pesan manusiawi, alasan singkat, tombol "Coba lagi". Kuota tidak terpotong.

**E2-03 — Pustaka.** *Sebagai pengguna, saya ingin melihat semua Unbook saya dan progresnya.*
- AC1: Kartu per Unbook: sampul (otomatis dari judul jika tidak ada), judul, penulis, minat, progres modul (mis. 3/8), status.
- AC2: Filter per minat dan status; pencarian judul.
- AC3: Hapus Unbook (konfirmasi) menghapus sumber, file, chunk, modul, dan progres terkait.

### E3 — Unbook Engine
Spesifikasi teknis di §7. Kriteria penerimaan tambahan:
- **E3-01:** Buku PDF 200 halaman selesai ≤ 5 menit p75 dengan kunci platform.
- **E3-02:** Setiap konsep di lapisan Praktisi punya minimal satu `chunkRefs` yang valid dan bisa ditampilkan sebagai "Lihat di sumber, hlm. X".
- **E3-03:** 100% output tervalidasi Zod sebelum disimpan; tidak ada modul setengah jadi yang tampil.
- **E3-04:** Biaya per Unbook tercatat di `unbooks.cost_usd`.
- **E3-05:** Evaluasi kualitas: skrip `pnpm eval:engine` menjalankan pipeline pada 5 sumber contoh berlisensi terbuka di `tests/fixtures` dan memeriksa skema, panjang, dan keberadaan referensi.

### E4 — Pembaca modul

**E4-01 — Halaman Unbook.** Daftar modul berurutan sebagai jalur vertikal (node bulat terhubung garis), node berikutnya terkunci lembut sampai modul sebelumnya dibaca. Atas: judul, big idea, progres total, tombol "Lanjutkan".

**E4-02 — Halaman modul.** *Sebagai pengguna, saya ingin memahami satu modul dalam 5–15 menit di ponsel.*
- AC1: Tiga tab tetap di atas: **Pahami · Terapkan · Buktikan**, bisa digeser (swipe).
- AC2: Tab Pahami: kartu Big Idea, "Kenapa penting untukmu", lalu **Layer Toggle** (Sederhana · Praktisi · Ahli) yang mengganti isi tanpa reload. Lapisan terdalam yang dibuka dicatat di `module_progress.deepest_layer`.
- AC3: Peta konsep dirender sebagai diagram interaktif yang bisa di-zoom dan digeser dengan jari; ketuk node menampilkan penjelasan singkat.
- AC4: Referensi "hlm. X" membuka lembar bawah berisi potongan pendek dari chunk sumber (maks 2–3 kalimat).
- AC5: Tab Terapkan: studi kasus, alat (checklist bisa dicentang dan tersimpan), kesalahan umum, dan **Kartu Aksi Minggu Ini** dengan tombol "Jadikan aksi saya" (membuat baris `actions`, `due_at` = +7 hari).
- AC6: Tab Buktikan: tombol mulai kuis dan jumlah kartu review modul ini.
- AC7: Modul ditandai "dibaca" saat pengguna menggulir sampai akhir tab Pahami dan membuka tab Terapkan → +20 XP (sekali).
- AC8: Mode baca: ukuran huruf bisa diatur (3 tingkat), tema terang/gelap, posisi baca terakhir diingat.

### E5 — Kuis

**E5-01 — Mengerjakan kuis.**
- AC1: Satu soal per layar, bilah progres, tombol jawaban besar (tinggi ≥ 48px).
- AC2: Umpan balik langsung setelah tiap jawaban: benar/salah, pembahasan, tautan "Lihat di sumber".
- AC3: `short_answer` dinilai AI dengan rubrik 1–4 (task `grade_short_answer`) dan umpan balik spesifik; skor 3–4 dihitung benar.
- AC4: Komposisi soal per kuis: ±30% mengingat/memahami, ±40% menerapkan/menganalisis, ±30% mengevaluasi/mencipta.
- AC5: Lulus ≥ 80% → animasi perayaan, +30 XP, +10 bonus jika 100%. XP lulus hanya sekali per kuis.
- AC6: Tidak lulus → layar "Hampir!" berisi konsep yang lemah, tombol "Pelajari ulang" (lompat ke konsep di lapisan Praktisi) dan "Coba lagi" yang memakai soal baru (generate versi kuis berikutnya, maks 3 versi).

### E6 — Review terjadwal

**E6-01 — Antrean review harian.**
- AC1: Kartu dari modul yang sudah dibaca masuk ke `card_states` dengan `box = 0`, `due_at = besok`.
- AC2: Layar Review: kartu satu per satu, ketuk untuk membalik (animasi flip), tiga tombol: **Lupa · Ragu · Ingat**.
- AC3: Interval kotak: 1, 3, 7, 14, 30, 60 hari. Ingat → naik satu kotak. Ragu → tetap di kotak, jadwal ulang setengah interval. Lupa → kembali ke kotak 0.
- AC4: Sesi harian maks 20 kartu; selesai sesi → +10 XP (sekali per hari) dan ringkasan.
- AC5: Badge jumlah kartu jatuh tempo tampil di tab Review pada navigasi bawah.

### E7 — Aksi dan Jurnal Penerapan

**E7-01 — Daftar aksi.** Halaman Jurnal menampilkan aksi aktif (urut tenggat), selesai, dan dilewati. Aksi yang lewat tenggat tidak dihukum; ditawarkan "perpanjang 7 hari" atau "lewati".

**E7-02 — Laporan penerapan.** *Sebagai pengguna, saya ingin mencatat apa yang saya lakukan dan hasilnya.*
- AC1: Formulir: Apa yang saya lakukan (min 80 karakter), Hasilnya, Refleksi (apa yang akan saya ubah), bukti opsional (tautan atau foto).
- AC2: AI memberi umpan balik singkat dan `quality_score` 1–4 berdasarkan kekhususan dan keterkaitan dengan modul (task `action_feedback`).
- AC3: Skor ≥ 3 → `verified = true`, +50 XP, +40 XP tambahan bila refleksi diisi; dihitung ke `domain_progress.verified_actions`.
- AC4: Skor < 3 → umpan balik ramah tentang apa yang perlu diperjelas, boleh direvisi sekali untuk penilaian ulang.

### E8 — Gamifikasi

**E8-01 — Aturan XP** (di `lib/game/xp.ts`, satu sumber kebenaran):

| Kejadian | XP | Batas |
| --- | --- | --- |
| Modul dibaca | 20 | Sekali per modul |
| Lulus kuis (≥ 80%) | 30 (+10 jika 100%) | Sekali per kuis |
| Sesi review harian selesai | 10 | Sekali per hari |
| Aksi dilaporkan dan terverifikasi | 50 | Sekali per aksi |
| Refleksi pada laporan terverifikasi | 40 | Sekali per aksi |
| Misi mingguan selesai | Sesuai misi (30–60) | Sekali per misi per minggu |
| Unbook pertama selesai | 50 | Sekali seumur akun |

Semua XP dicatat sebagai `xp_events` (idempoten); `user_stats` dan `domain_progress` dihitung ulang dalam transaksi yang sama.

**E8-02 — Level pengguna.** Level 1–30 dengan ambang `xpForLevel(n) = round(50 × n^1.6)` kumulatif. Naik level → modal perayaan dengan konfeti halus dan ringkasan pencapaian.

**E8-03 — Level domain (Dreyfus).**

| Level | Syarat XP domain | Syarat tambahan |
| --- | --- | --- |
| Novice | 0 | — |
| Advanced Beginner | 150 | Lulus ≥ 2 kuis di domain |
| Competent | 500 | ≥ 1 aksi terverifikasi di domain |
| Proficient | 1.200 | ≥ 3 aksi terverifikasi di domain |
| Expert | 2.500 | ≥ 6 aksi terverifikasi; (setelah MVP: lulus Boss Battle) |

XP sebuah modul dibagi ke domain-domainnya sesuai `module_domains.confidence`.

**E8-04 — Streak.**
- AC1: Hari aktif = minimal satu kejadian ber-XP di tanggal lokal pengguna.
- AC2: Satu **streak freeze** otomatis diberikan tiap Senin (maks simpan 2); dipakai otomatis jika sehari terlewat.
- AC3: Ikon api di bilah atas dengan angka streak; animasi saat streak bertambah pertama kali hari itu.

**E8-05 — Lencana.** Minimal 12 lencana awal, contoh: Langkah Pertama (Unbook pertama), Pembaca Tekun (10 modul), Sempurna (kuis 100%), Praktisi (aksi terverifikasi pertama), Konsisten 7 / 30 (streak), Pengingat Ulung (100 kartu review), Penjelajah (3 minat), Murabbi Diri (10 aksi terverifikasi). Aturan dievaluasi oleh `lib/game/badges.ts` setiap ada `xp_events` baru.

**E8-06 — Misi mingguan.** Setiap Senin 00:00 waktu lokal, 3 misi: 1 belajar (mis. baca 3 modul), 1 review (mis. 4 sesi review), 1 penerapan (mis. laporkan 1 aksi). Ditampilkan di Beranda dengan cincin progres.

**E8-07 — Umpan balik instan.** Setiap XP memunculkan toast kecil "+30 XP" yang naik dan memudar (≤ 1,2 detik), tidak menghalangi isi.

### E9 — Minat dan pohon keahlian

**E9-01 — Seed tiga minat pembuka** beserta 5–8 domain masing-masing:
- **Kepemimpinan dan Manajemen:** Berpikir Strategis, Eksekusi dan Kinerja, Memimpin Tim, Manajemen Perubahan, Budaya Organisasi, Pengambilan Keputusan, Komunikasi Pemimpin.
- **Pengembangan Diri dan Produktivitas:** Kebiasaan, Fokus dan Waktu, Cara Belajar, Kesejahteraan, Kreativitas.
- **Studi Islam:** Akidah, Fikih, Akhlak dan Adab, Sirah dan Sejarah, Tafsir dan Ulumul Quran, Hadis.

**E9-02 — Halaman Progres.** Pohon keahlian per minat: tiap domain sebagai node dengan cincin level, warna mengikuti level Dreyfus. Ketuk domain → XP, syarat naik level berikutnya, modul terkait, aksi terverifikasi.

**E9-03 — Tagging otomatis.** Modul baru dipetakan ke 1–3 domain (task `tagging`) dengan `confidence`. Jika minat sumber tidak cocok dengan minat mana pun, masukkan ke minat "Umum" tanpa pohon keahlian.

### E10 — Mentor AI

**E10-01 — Chat per Unbook.** *Sebagai pengguna, saya ingin bertanya tentang bacaan saya dan mendapat jawaban yang berpijak pada sumber.*
- AC1: Dibuka dari tombol "Tanya Mentor" di halaman Unbook dan modul (lembar bawah layar penuh di ponsel).
- AC2: RAG: embed pertanyaan → ambil 8 chunk teratas (pgvector cosine, campur full-text) dari sumber Unbook itu → jawab dengan sitasi "hlm. X" yang bisa diketuk.
- AC3: Jika jawaban tidak ada di sumber, mentor mengatakannya dan boleh memberi pengetahuan umum yang **ditandai jelas** sebagai di luar sumber.
- AC4: Persona mentor per minat (nama, nada) dari file `lib/ai/personas/*.md` berpola SOUL.md. Mentor mengakhiri jawaban dengan satu pertanyaan reflektif bila relevan.
- AC5: Streaming token; tombol hentikan; saran pertanyaan cepat (3 chip) di awal percakapan.
- AC6: Kuota pesan sesuai paket; sisa kuota terlihat; pengguna BYOK tidak dibatasi.

### E11 — Langganan dan pembayaran

**E11-01 — Halaman harga** (di aplikasi dan landing):

| Paket | Harga |
| --- | --- |
| Gratis | Rp 0 |
| Pro | Rp 59.000/bulan · Rp 449.000/tahun |
| Pro BYOK | Rp 29.000/bulan · Rp 249.000/tahun |

Harga dibaca dari tabel `plans`, bukan ditulis di kode. Label hemat dihitung otomatis dari harga (saat ini Pro tahunan hemat 37%, Pro BYOK tahunan hemat 28%).

**E11-02 — Checkout Midtrans Snap.**
- AC1: Pilih paket → buat `payments` (status pending, `midtrans_order_id` unik) → buka Snap (popup di desktop, redirect di ponsel).
- AC2: Webhook `/api/webhooks/midtrans` memverifikasi signature key, idempoten per `order_id`, lalu mengaktifkan/memperpanjang `subscriptions`.
- AC3: MVP memakai pembayaran per periode (bukan auto-debit): 7 dan 1 hari sebelum berakhir, kirim pengingat perpanjangan; setelah berakhir, turun ke Gratis tanpa menghapus data.
- AC4: Riwayat pembayaran dan status paket di Pengaturan → Langganan.

**E11-03 — Penegakan kuota.** Satu fungsi `assertQuota(userId, kind)` di server dipanggil sebelum setiap aksi berbayar; pesan kuota habis selalu menyertakan tombol upgrade.

### E12 — BYOK (OpenRouter)

**E12-01 — Hubungkan OpenRouter satu klik.**
- AC1: Di Pengaturan → Model AI, tombol "Hubungkan OpenRouter" menjalankan OAuth PKCE (S256): arahkan ke `https://openrouter.ai/auth?callback_url=…&code_challenge=…&code_challenge_method=S256`, lalu `/api/byok/callback` menukar `code` ke `https://openrouter.ai/api/v1/auth/keys` untuk mendapat kunci.
- AC2: Alternatif: tempel API key manual.
- AC3: Kunci dienkripsi AES-256-GCM (kunci induk di `BYOK_ENCRYPTION_KEY`), hanya `last4` yang pernah dikirim ke klien. Kunci tidak pernah dicatat di log.
- AC4: Uji koneksi otomatis setelah tersambung; status "Terhubung · ••••abcd".
- AC5: Pengguna memilih model dari daftar yang diizinkan admin (mis. kelompok "Claude", "GPT", "Gemini", "GLM") per kategori: menulis modul dan mentor.
- AC6: Jika kunci BYOK gagal (kredit habis, dicabut), proses berhenti dengan pesan jelas; **tidak** diam-diam memakai kunci platform.
- AC7: Putuskan koneksi → kunci dihapus.

### E13 — Katalog Originals

**E13-01 — Jelajah Originals.** Halaman katalog (juga publik dan bisa diindeks mesin pencari): sampul, judul, penulis, minat, durasi, harga. Detail menampilkan deskripsi, daftar modul, dan modul contoh gratis.

**E13-02 — Akses.** Pro dan Pro BYOK: semua Originals terbuka. Pengguna Gratis: beli satuan lewat Midtrans (`original_purchases`) atau upgrade.

**E13-03 — Pengelolaan.** Admin membuat Originals dengan mengunggah naskah yang diproses Unbook Engine, lalu menyunting setiap modul di editor JSON berformulir sebelum diterbitkan.

### E14 — Notifikasi

- **E14-01:** Email: Unbook selesai, kartu jatuh tempo (pagi 07.00 lokal, hanya jika ada ≥ 5 kartu), streak terancam (19.00 lokal jika belum aktif hari itu), ringkasan mingguan (Minggu malam), pengingat perpanjangan paket.
- **E14-02:** Notifikasi in-app (ikon lonceng) untuk semua kejadian di atas plus lencana dan naik level.
- **E14-03:** Web push opsional untuk PWA yang dipasang (izin diminta setelah Unbook pertama selesai, bukan saat pertama membuka).
- **E14-04:** Semua bisa diatur di Pengaturan → Notifikasi; email memuat tautan berhenti berlangganan satu klik.

### E15 — Profil, privasi, dan akun

- **E15-01:** Halaman Profil: avatar, nama, level, total XP, streak terpanjang, lencana, statistik (modul dibaca, kuis lulus, aksi terverifikasi).
- **E15-02:** Pengaturan: profil belajar (data onboarding), Model AI (BYOK), Langganan, Notifikasi, Tampilan (terang/gelap/sistem, ukuran huruf), Privasi.
- **E15-03:** Ekspor data (JSON + file sumber) dan hapus akun permanen dengan konfirmasi ketik "HAPUS"; penghapusan berjalan sebagai job dan menghapus file di R2.
- **E15-04:** Opsi per sumber: "Hapus file asli setelah diproses" (modul tetap ada, `file_deleted_at` terisi).
- **E15-05:** Halaman legal: Syarat Layanan, Kebijakan Privasi, Kebijakan Hak Cipta dan formulir laporan pelanggaran (`takedown_requests`). Isi teks hukum disediakan founder setelah ditinjau konsultan; bangun halamannya dengan placeholder yang ditandai jelas.

### E16 — Panel admin (`/admin`, hanya `role = admin`)

- **E16-01:** Dasbor: pengguna baru, pengguna aktif harian/mingguan, Unbook dibuat, pelanggan aktif, pendapatan bulan ini, biaya AI hari ini dan bulan ini, rata-rata biaya per Unbook.
- **E16-02:** Kelola pengguna: cari, lihat paket dan pemakaian, beri paket gratis sementara, nonaktifkan.
- **E16-03:** Kelola `ai_task_configs` dan daftar model yang diizinkan untuk BYOK.
- **E16-04:** Kelola Originals, minat, domain, lencana, misi, dan paket.
- **E16-05:** Antrean laporan hak cipta dengan aksi "turunkan konten" yang menonaktifkan Unbook terkait dan mencatat `audit_logs`.
- **E16-06:** Daftar Unbook gagal beserta error untuk debugging.

---

## 9. Alur pengguna utama

**Alur A — Pengguna baru sampai aksi pertama (target ≤ 15 menit):**
Landing → Masuk Google → Onboarding 5 langkah → Beranda kosong dengan ajakan "Unbook bacaan pertamamu" → Unggah PDF → Layar Proses (boleh ditinggal) → Notifikasi selesai → Halaman Unbook → Modul 1: Pahami → Terapkan → "Jadikan aksi saya" → Kuis → Lulus (+XP, lencana Langkah Pertama) → Beranda menampilkan aksi aktif dan review besok.

**Alur B — Kebiasaan harian (target 5–10 menit):**
Notifikasi pagi → Beranda → kartu "Hari ini": review jatuh tempo, modul berikutnya, aksi yang tenggatnya dekat → Review 10 kartu → +10 XP, streak bertambah → lanjut satu modul jika sempat.

**Alur C — Membuktikan penerapan:**
Jurnal → aksi aktif → "Laporkan" → isi formulir → umpan balik AI → terverifikasi → +XP → progres domain naik → mungkin naik level domain (perayaan).

**Alur D — Upgrade:**
Kuota habis saat unggah / Originals terkunci / batas pesan mentor → Paywall lembar bawah berisi perbandingan paket singkat → Midtrans Snap → kembali ke aksi yang tadi tertunda secara otomatis.

---

## 10. Persyaratan non-fungsional

| Area | Persyaratan |
| --- | --- |
| Performa | LCP ≤ 2,5 detik dan INP ≤ 200 ms di ponsel kelas menengah lewat 4G; JS awal per rute ≤ 200 KB gzip; gambar via `next/image` |
| Ketersediaan | Target 99,5% per bulan; pipeline tahan restart karena berbasis Inngest |
| Skalabilitas | Siap 10.000 pengguna terdaftar dan 100 Unbook bersamaan tanpa ubah arsitektur |
| Responsif | Mobile-first; breakpoint 375, 768, 1024, 1280; tidak ada scroll horizontal |
| Offline ringan | PWA: shell aplikasi dan modul yang terakhir dibuka bisa dibaca tanpa sinyal; aksi ditunda sampai online |
| Aksesibilitas | WCAG 2.2 AA: kontras ≥ 4,5:1, target sentuh ≥ 44×44px, navigasi keyboard, label ARIA, hormati `prefers-reduced-motion` |
| SEO | Landing, harga, dan halaman Originals dirender di server dengan metadata lengkap dan sitemap |
| Observabilitas | Sentry untuk error klien dan server; log terstruktur di Inngest; dasbor biaya AI di admin |
| Pengujian | Unit test untuk `lib/game`, `lib/billing`, `lib/crypto`; E2E Playwright di viewport iPhone untuk alur A–D |
| Lokalisasi | Semua teks UI di `messages/id.json`; format angka dan tanggal `id-ID`; mata uang IDR tanpa desimal |

---

## 11. Keamanan dan privasi

- **Otorisasi di setiap query:** setiap akses data milik pengguna difilter `user_id` dari sesi di server. Buat helper `requireUser()` dan jangan pernah menerima `userId` dari klien.
- **File:** bucket privat; unduh hanya lewat signed URL berumur ≤ 5 menit; nama file acak (UUID).
- **BYOK:** AES-256-GCM, kunci induk dari env, rotasi didukung lewat kolom versi; kunci tidak pernah dikirim ke klien atau log.
- **Rate limit** (mis. Upstash Ratelimit atau tabel Postgres): unggah 10/jam, mentor 30/menit, magic link 5/jam per email, webhook tanpa limit tapi wajib verifikasi signature.
- **Validasi input** dengan Zod di setiap Server Action dan route.
- **Prompt injection dari isi buku:** teks sumber selalu dibungkus sebagai data (`<source>…</source>`), dengan instruksi sistem bahwa isinya bukan perintah.
- **Header keamanan:** CSP, HSTS, X-Frame-Options, Referrer-Policy.
- **Pelindungan data pribadi:** persetujuan eksplisit saat daftar, ekspor dan hapus akun mandiri (E15-03), retensi log AI 90 hari tanpa isi sumber.
- **Hak cipta:** modul unggahan hanya bisa diakses pemiliknya; tidak ada URL publik untuk konten unggahan.

---

## 12. UI/UX dan design system

### 12.1 Prinsip desain

1. **Premium bersih, sentuhan game halus.** Tampilan tenang seperti aplikasi produktivitas kelas atas; elemen game (XP, api streak, cincin level, lencana) muncul sebagai aksen yang memberi rasa maju, bukan hiasan yang ramai.
2. **Mobile-first, satu tangan.** Aksi utama di sepertiga bawah layar; navigasi bawah; lembar bawah (bottom sheet) menggantikan modal di ponsel.
3. **Satu hal per layar.** Setiap layar punya satu tindakan utama yang jelas.
4. **Progres selalu terlihat.** Pengguna selalu tahu di mana dirinya, berapa lagi, dan apa berikutnya.
5. **Konten adalah pahlawannya.** Tipografi bacaan yang nyaman lebih penting daripada dekorasi.
6. **Perayaan yang layak.** Animasi besar hanya untuk momen besar (lulus kuis, naik level, aksi terverifikasi). Sisanya mikro-interaksi kecil.

### 12.2 Token warna (CSS variables, didefinisikan di `globals.css`, dipetakan ke Tailwind)

| Token | Terang | Gelap | Pemakaian |
| --- | --- | --- | --- |
| `--background` | `#FAFAF9` | `#0C0A09` | Latar halaman |
| `--surface` | `#FFFFFF` | `#1C1917` | Kartu, lembar |
| `--surface-2` | `#F5F5F4` | `#292524` | Latar sekunder, input |
| `--border` | `#E7E5E4` | `#44403C` | Garis, pemisah |
| `--text` | `#1C1917` | `#FAFAF9` | Teks utama |
| `--text-muted` | `#78716C` | `#A8A29E` | Teks sekunder |
| `--primary` | `#4338CA` | `#818CF8` | Tombol utama, tautan, fokus |
| `--primary-fg` | `#FFFFFF` | `#0C0A09` | Teks di atas primary |
| `--primary-soft` | `#EEF2FF` | `#1E1B4B` | Latar sorotan, chip aktif |
| `--xp` | `#F59E0B` | `#FBBF24` | XP, api streak, lencana emas |
| `--success` | `#059669` | `#34D399` | Benar, selesai, terverifikasi |
| `--warning` | `#D97706` | `#FBBF24` | Tenggat dekat |
| `--danger` | `#E11D48` | `#FB7185` | Salah, hapus |

Warna level Dreyfus (cincin dan node pohon keahlian): Novice `#94A3B8` · Advanced Beginner `#0EA5E9` · Competent `#10B981` · Proficient `#8B5CF6` · Expert `#F59E0B`.

Aturan: satu warna primary per layar untuk tindakan utama; `--xp` hanya untuk elemen gamifikasi; warna status tidak dipakai untuk dekorasi. Semua pasangan teks–latar lolos kontras AA di kedua tema.

### 12.3 Tipografi

- Font: **Plus Jakarta Sans** (via `next/font`, subset latin) untuk seluruh UI; angka memakai `font-variant-numeric: tabular-nums` di statistik dan XP.

| Gaya | Ukuran/tinggi baris (mobile) | Berat | Pemakaian |
| --- | --- | --- | --- |
| Display | 32/38 | 700 | Judul landing, angka perayaan |
| H1 | 26/32 | 700 | Judul halaman |
| H2 | 21/28 | 650 | Judul bagian |
| H3 | 18/26 | 600 | Judul kartu |
| Body | 16/24 | 400 | Teks UI |
| Reading | 17/29 (bisa 15/26 atau 19/32) | 400 | Isi modul, maks 68 karakter per baris |
| Small | 14/20 | 500 | Label, metadata |
| Caption | 12/16 | 500 | Badge, keterangan |

### 12.4 Ruang, sudut, bayangan, gerak

- **Spasi:** kelipatan 4px; padding halaman 16px (ponsel), 24px (tablet), 32px (desktop).
- **Radius:** 8px (input, chip) · 12px (tombol) · 16px (kartu) · 24px (lembar bawah) · penuh (avatar, FAB).
- **Bayangan:** sangat halus; kartu `0 1px 2px rgb(0 0 0 / 0.04)`; lembar bawah dan FAB sedikit lebih tegas. Di tema gelap, pakai border alih-alih bayangan.
- **Gerak:** durasi 120 ms (hover, tekan), 200 ms (transisi elemen), 320 ms (pindah layar, lembar bawah). Easing `cubic-bezier(0.2, 0.8, 0.2, 1)`. Spring untuk perayaan. Semua animasi mati jika `prefers-reduced-motion`.
- **Umpan balik sentuh:** tombol mengecil 0,97 saat ditekan; getaran ringan (`navigator.vibrate`) saat jawaban benar dan naik level di perangkat yang mendukung.

### 12.5 Navigasi dan tata letak

- **Ponsel (< 768px):** bilah atas ringkas (logo/judul halaman kiri; api streak, lonceng, avatar kanan) + **navigasi bawah 5 posisi**: Beranda · Pustaka · **[ + Unbook ]** (FAB menonjol di tengah) · Review (badge jumlah) · Progres. Profil dan Pengaturan dari avatar. Jurnal dari Beranda dan Progres.
- **Tablet (768–1023px):** sama seperti ponsel dengan konten terpusat maks 640px.
- **Desktop (≥ 1024px):** sidebar kiri 240px berisi menu yang sama; area konten maks 720px untuk bacaan, 1120px untuk dasbor; panel kanan opsional untuk Mentor AI saat membaca modul.
- Area aman iOS (`env(safe-area-inset-*)`) dihormati untuk navigasi bawah dan lembar bawah.

### 12.6 Layar kunci (wireframe ponsel)

**Beranda**
```
┌───────────────────────────────┐
│ Unbookin        🔥12  🔔  (A) │
├───────────────────────────────┤
│ Selamat pagi, Sena            │
│ Level 7 ◔ 340/500 XP          │
│ ┌───────────────────────────┐ │
│ │ HARI INI                  │ │
│ │ ▸ 14 kartu review   [Mulai]│ │
│ │ ▸ Lanjut: Modul 4/8        │ │
│ │ ▸ Aksi tenggat 2 hari lagi │ │
│ └───────────────────────────┘ │
│ Misi minggu ini   ◐ ◔ ○       │
│ Lanjutkan membaca  →          │
│ [kartu Unbook] [kartu Unbook] │
├───────────────────────────────┤
│  ⌂     ▤     (+)     ↻14   ◎  │
└───────────────────────────────┘
```

**Proses Unbook**
```
┌───────────────────────────────┐
│ ←                             │
│      [ilustrasi buku terbuka  │
│       yang "terurai" halus]   │
│  Meng-unbook "Good to Great"  │
│  ✓ Membaca 312 halaman        │
│  ✓ Memetakan 9 bab            │
│  ● Menulis modul 3 dari 8     │
│  ○ Menyusun kuis              │
│  ━━━━━━━━━━░░░░░░  46%        │
│  Kamu boleh menutup layar ini.│
│  Kami kabari saat selesai.    │
└───────────────────────────────┘
```

**Halaman modul**
```
┌───────────────────────────────┐
│ ←  Modul 3 dari 8   ⋯        │
│ [ Pahami ] Terapkan  Buktikan │
├───────────────────────────────┤
│ ┌ BIG IDEA ─────────────────┐ │
│ │ Pemimpin terbaik membangun │ │
│ │ sistem, bukan panggung.    │ │
│ └────────────────────────────┘│
│ Kenapa penting untukmu …      │
│ ( Sederhana | Praktisi | Ahli)│
│ Teks bacaan 17px …  hlm. 42 ↗ │
│ [ Peta konsep — ketuk & zoom ]│
├───────────────────────────────┤
│ 💬 Tanya Mentor     Lanjut →  │
└───────────────────────────────┘
```

**Kuis**
```
┌───────────────────────────────┐
│ ✕   ━━━━━━░░░░  4/7           │
│ MENERAPKAN                    │
│ Tim kamu menolak perubahan…   │
│ Langkah pertama yang paling   │
│ tepat menurut modul ini?      │
│ ┌───────────────────────────┐ │
│ │ A  …                      │ │
│ ├───────────────────────────┤ │
│ │ B  …                      │ │
│ └───────────────────────────┘ │
│        [ Periksa jawaban ]    │
└───────────────────────────────┘
```

**Progres (pohon keahlian)**
```
┌───────────────────────────────┐
│ Progres   [Kepemimpinan ▾]    │
│ Level 7 · 2.340 XP · 🔥 12    │
│        (Berpikir Strategis)   │
│          ◉ Competent          │
│       ╱        ╲              │
│ (Eksekusi)    (Memimpin Tim)  │
│  ◔ Adv.Beg.     ◕ Proficient  │
│       ╲        ╱              │
│     (Manajemen Perubahan)     │
│        ○ Novice               │
│ Lencana  🏅🏅🏅 ▸ lihat semua │
└───────────────────────────────┘
```

Layar lain (Pustaka, Review, Jurnal, Paywall, Pengaturan, Profil) mengikuti pola yang sama: judul H1, satu tindakan utama di bawah, kartu bertepi halus, lembar bawah untuk detail.

### 12.7 Komponen khas Unbookin (`components/game`, `components/module`)

| Komponen | Perilaku |
| --- | --- |
| `XPToast` | "+30 XP" naik 16px dan memudar dalam 1,2 detik, warna `--xp` |
| `StreakFlame` | Ikon api + angka; berdenyut sekali saat streak bertambah; abu-abu bila hari ini belum aktif |
| `LevelRing` | Cincin progres SVG di sekitar avatar atau domain, warna sesuai level |
| `BadgeCard` | Lencana terkunci tampil siluet; terbuka dengan animasi kilau singkat |
| `Celebration` | Layar penuh untuk naik level dan aksi terverifikasi: konfeti halus 1,5 detik + ringkasan + tombol lanjut |
| `LayerToggle` | Segmented control 3 posisi; transisi isi crossfade 200 ms |
| `ConceptMap` | Diagram node–edge dari `content.conceptMap`; layout otomatis (mis. dagre/elkjs); pinch-zoom dan pan |
| `ActionCard` | Kartu Aksi Minggu Ini dengan langkah, kriteria selesai, dan tombol "Jadikan aksi saya" |
| `FlipCard` | Kartu review membalik 3D 320 ms |
| `SourceRef` | Chip "hlm. 42" yang membuka lembar bawah kutipan pendek |
| `PathNode` | Node jalur modul: terkunci, tersedia, sedang, selesai (centang) |
| `MissionRing` | Cincin kecil progres misi mingguan |

### 12.8 State kosong, memuat, dan error

- **Kosong:** ilustrasi garis sederhana + satu kalimat + satu tombol (mis. Pustaka kosong → "Unbook bacaan pertamamu").
- **Memuat:** skeleton sesuai bentuk konten (bukan spinner) untuk semua daftar dan kartu; Suspense di Server Components.
- **Error:** bahasa manusiawi, tanpa kode teknis, dengan tindakan pemulihan ("Coba lagi", "Hubungi kami"). Error boundary per rute.
- **Offline:** banner tipis "Kamu sedang offline. Modul yang tersimpan tetap bisa dibaca."

### 12.9 Nada dan teks

- Sapaan "kamu", hangat, lugas, menyemangati tanpa berlebihan.
- Kalimat pendek. Tombol memakai kata kerja ("Mulai review", "Jadikan aksi saya").
- Salah jawab tidak pernah memalukan: "Belum tepat. Ini alasannya…"
- Semua teks di `messages/id.json` agar mudah diedit founder tanpa menyentuh komponen.

---

## 13. Server Actions dan API

| Jenis | Nama | Fungsi |
| --- | --- | --- |
| Action | `joinWaitlist` | E0-02 |
| Action | `saveOnboarding` | E1-02 |
| Route | `POST /api/upload/presign` | Presigned URL R2 setelah cek kuota dan tipe |
| Action | `createSource` | Simpan metadata, kirim event `source/uploaded` |
| Route | `GET /api/unbooks/[id]/status` | Status dan tahap untuk layar Proses (atau SSE) |
| Action | `markModuleRead`, `saveChecklistState` | E4 |
| Action | `startQuiz`, `submitAnswer`, `finishQuiz` | E5 |
| Action | `getReviewQueue`, `gradeCard` | E6 |
| Action | `createAction`, `reportAction`, `updateActionStatus` | E7 |
| Route | `POST /api/mentor/[threadId]` | Chat streaming E10 |
| Action | `createCheckout` | E11-02 |
| Route | `POST /api/webhooks/midtrans` | Notifikasi pembayaran |
| Route | `GET /api/byok/callback` | Tukar kode OAuth PKCE |
| Action | `saveByokKey`, `revokeByokKey`, `setByokModels` | E12 |
| Action | `exportData`, `deleteAccount` | E15-03 |
| Route | `/api/inngest` | Endpoint Inngest |

Inngest functions: `ingest-source`, `generate-unbook`, `regenerate-quiz`, `daily-review-digest` (cron per jam, kirim yang jam lokalnya 07.00), `streak-guard` (cron per jam, 19.00 lokal), `weekly-missions` (cron per jam, Senin 00.00 lokal), `renewal-reminder` (harian), `delete-account`.

---

## 14. Event analitik (PostHog)

`waitlist_joined` · `signed_up` · `onboarding_completed` · `source_upload_started` · `source_upload_failed` · `unbook_completed` (pages, modules, duration_s, byok) · `module_opened` · `layer_viewed` (layer) · `module_read` · `action_created` · `quiz_started` · `quiz_finished` (score, passed, attempt) · `review_session_completed` (cards) · `action_reported` (quality_score, verified) · `xp_earned` (type, amount) · `level_up` · `domain_level_up` · `badge_earned` · `streak_extended` · `mentor_message_sent` · `paywall_viewed` (trigger) · `checkout_started` (plan) · `subscription_activated` (plan) · `byok_connected` (method).

Jangan pernah mengirim isi sumber, isi laporan, atau pesan mentor ke analitik.

---

## 15. Milestone pembangunan

Bangun berurutan. Setiap milestone diakhiri: semua AC terkait lolos, tes lulus, dicek di 375px, di-deploy ke preview Vercel.

| # | Milestone | Isi | Selesai jika |
| --- | --- | --- | --- |
| M0 | Fondasi | Repo, TypeScript strict, ESLint/Prettier, Tailwind + token §12, shadcn, Drizzle + skema awal, Auth.js, layout dengan navigasi bawah, `messages/id.json`, Sentry, PostHog, halaman `/dev/ui` berisi semua komponen dasar | Halaman `/dev/ui` tampil benar di terang dan gelap, login Google berhasil |
| M1 | Landing + daftar tunggu | E0 | Production bisa menerima pendaftar dan email konfirmasi terkirim |
| M2 | Akun + onboarding | E1, E15-01/02 dasar | Pengguna baru selesai onboarding ≤ 90 detik |
| M3 | Unggah + ingest | E2, `ingest-source`, R2, chunk + embedding | PDF 200 halaman tersimpan sebagai chunk ber-embedding |
| M4 | Mesin generasi | Router AI, `ai_task_configs`, `generate-unbook`, `ai_calls`, `pnpm eval:engine` | 5 sumber contoh menghasilkan Unbook valid; biaya tercatat |
| M5 | Belajar | E4, E5, E6 | Alur A berjalan sampai lulus kuis; review harian berfungsi |
| M6 | Penerapan + game | E7, E8, E9 | XP, level, streak, lencana, misi, pohon keahlian berjalan dengan unit test |
| M7 | Mentor | E10 | Jawaban bersitasi; kuota pesan bekerja |
| M8 | Monetisasi | E11, E12 | Pembayaran sandbox Midtrans mengaktifkan paket; BYOK OAuth berhasil |
| M9 | Originals + notifikasi + admin | E13, E14, E16 | Admin bisa menerbitkan Originals; email terjadwal terkirim |
| M10 | Siap beta | PWA, audit aksesibilitas, performa §10, halaman legal, E2E alur A–D | Lighthouse mobile ≥ 90; E2E hijau; checklist peluncuran beta tuntas |

---

## 16. Environment variables (`.env.example`)

```
# App
NEXT_PUBLIC_APP_URL=https://unbookin.com
# Database
DATABASE_URL=
# Auth
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
RESEND_API_KEY=
EMAIL_FROM="Unbookin <halo@unbookin.com>"
# Storage (S3-compatible)
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=unbookin-sources
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
# AI
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
EMBEDDING_MODEL=            # diisi founder, 1536 dimensi
BYOK_ENCRYPTION_KEY=        # 32 byte base64
# Jobs
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
# Payments
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_IS_PRODUCTION=false
# Observability
SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
# Admin
ADMIN_EMAILS=               # dipisah koma, otomatis role admin saat login
```

---

## 17. Pertanyaan terbuka (diputuskan founder)

1. Model awal untuk setiap task di `ai_task_configs` dan daftar model yang diizinkan untuk BYOK.
2. Teks hukum final (Syarat Layanan, Kebijakan Privasi, Kebijakan Hak Cipta) setelah ditinjau konsultan.
3. Akun Midtrans produksi (biasanya butuh badan usaha) dan domain pengirim email.
4. Logo, ilustrasi, dan nama persona mentor untuk tiap minat.
5. Daftar 10–15 judul Originals awal dan naskahnya.
6. Harga final setelah uji varian di daftar tunggu.
7. Perlu OCR untuk PDF hasil pindai di versi berikutnya atau tidak.

---

*Akhir dokumen. Perubahan pada PRD dicatat di bagian bawah `docs/decisions.md` dengan tanggal dan alasan.*

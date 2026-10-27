# Konfigurasi mesin generasi M4

Panduan ini menyiapkan model dan evaluasi untuk M4. M4 mengubah sumber yang
sudah `ready` menjadi Unbook lengkap: outline 3–12 modul, isi modul sesuai
`ModuleContent`, 6–8 soal dan 5–8 kartu review per modul, lalu pemetaan domain.
Fungsi Inngest `generate-unbook` menjalankan langkah yang sama seperti skrip
evaluasi, dengan batas `maxDuration = 300` pada route `/api/inngest`.

Semua kunci tetap di `.env.local` atau environment deployment. Jangan menaruh
kunci, ID model asli, isi sumber, atau hasil model di chat, Git, laporan, atau
variabel `NEXT_PUBLIC_*`.

## 1. Variabel lingkungan

| Variabel | Kegunaan |
| --- | --- |
| `DATABASE_URL` | Database PostgreSQL. Untuk evaluasi gunakan database uji lokal, bukan production |
| `OPENROUTER_API_KEY` | Kunci platform untuk panggilan model pada mode nyata |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` untuk layanan biasa; mode `--fake` mengisinya sendiri |
| `EMBEDDING_MODEL` | Hanya membantu seed baris embedding; tidak dipakai generasi konten |

Model generasi **tidak** ditulis di kode. Runtime membaca baris aktif dari tabel
`ai_task_configs` melalui `src/lib/ai/task-config.ts`. Mengubah environment saja
tidak mengganti model.

## 2. Baris `ai_task_configs` yang wajib

Isi satu baris aktif untuk setiap task. Nilai model di bawah adalah placeholder;
ganti dengan pilihan founder dari daftar OpenCode yang disetujui.

| Task | Model | Fallback model | Temperature | max_output_tokens |
| --- | --- | --- | --- | --- |
| `outline` | `<MODEL_ID_OUTLINE>` | `<MODEL_ID_CADANGAN_OUTLINE>` atau `NULL` | 0.3 | 4000 |
| `module` | `<MODEL_ID_MODULE>` | `<MODEL_ID_CADANGAN_MODULE>` atau `NULL` | 0.5 | 8000 |
| `quiz` | `<MODEL_ID_QUIZ>` | `<MODEL_ID_CADANGAN_QUIZ>` atau `NULL` | 0.3 | 4000 |
| `cards` | `<MODEL_ID_CARDS>` | `<MODEL_ID_CADANGAN_CARDS>` atau `NULL` | 0.3 | 2000 |
| `tagging` | `<MODEL_ID_TAGGING>` | `<MODEL_ID_CADANGAN_TAGGING>` atau `NULL` | 0 | 1000 |

Saran tersebut bukan patokan kualitas. Task `module` biasanya biaya terbesar,
jadi pilih model yang baik menulis bahasa Indonesia dan hemat untuk percobaan
awal. Fallback dipakai setelah satu perbaikan validasi gagal; kosongkan bila
belum ada pilihan cadangan.

### SQL upsert

Jalankan di SQL Editor database yang benar. Ganti setiap placeholder; jangan
menyalin ID model asli ke dokumen atau commit.

```sql
INSERT INTO ai_task_configs
  (task, model, fallback_model, temperature, max_output_tokens, is_active)
VALUES
  ('outline',  '<MODEL_ID_OUTLINE>',  '<MODEL_ID_CADANGAN_OUTLINE>',  0.3, 4000, true),
  ('module',   '<MODEL_ID_MODULE>',   '<MODEL_ID_CADANGAN_MODULE>',   0.5, 8000, true),
  ('quiz',     '<MODEL_ID_QUIZ>',     '<MODEL_ID_CADANGAN_QUIZ>',     0.3, 4000, true),
  ('cards',    '<MODEL_ID_CARDS>',    '<MODEL_ID_CADANGAN_CARDS>',    0.3, 2000, true),
  ('tagging',  '<MODEL_ID_TAGGING>',  '<MODEL_ID_CADANGAN_TAGGING>',  0,   1000, true)
ON CONFLICT (task) DO UPDATE SET
  model = EXCLUDED.model,
  fallback_model = EXCLUDED.fallback_model,
  temperature = EXCLUDED.temperature,
  max_output_tokens = EXCLUDED.max_output_tokens,
  is_active = true,
  updated_at = now();
```

Gunakan `NULL` tanpa tanda kutip untuk fallback yang belum diisi. Perubahan
konfigurasi dapat tertahan di cache hingga lima menit; tunggu atau restart
proses sebelum mengulang evaluasi.

## 3. Menjalankan `pnpm eval:engine`

Skrip memakai lima sumber contoh CC0 di `tests/fixtures/engine/`. Daftar dan
asalnya ada di `tests/fixtures/engine/README.md`. Skrip membuat pengguna,
profil, minat, sumber, chunk, dan Unbook sementara, lalu menghapus semuanya
setelah selesai, termasuk saat ada kegagalan.

### Mode tiruan (tanpa jaringan)

Gunakan database uji lokal yang sudah dimigrasi sampai M4. Contoh database uji
terisolasi:

```powershell
$env:DATABASE_URL = 'postgres://unbookin:unbookin@127.0.0.1:5432/unbookin_m3_test_20261027'
pnpm db:migrate
pnpm eval:engine --fake
```

Mode ini menyalakan server HTTP lokal yang meniru balasan OpenRouter. Server
mengembalikan JSON yang valid menurut skema dan `usage.cost` untuk setiap task,
tanpa memanggil penyedia. Skrip juga memasang sementara baris
`ai_task_configs` dengan model `fake/model` untuk lima task, lalu mengembalikan
baris sebelumnya. Tidak ada kunci OpenRouter yang dibutuhkan.

Pilih satu fixture saja:

```powershell
pnpm eval:engine --fake --only=pdf
```

Skrip menolak `DATABASE_URL` yang mengandung `neon.tech` atau `vercel`. Jangan
memaksa skrip ini ke database production.

### Mode nyata (butuh kunci)

Isi `OPENROUTER_API_KEY` dan baris `ai_task_configs` di atas, lalu:

```powershell
pnpm eval:engine
```

Jika kunci atau salah satu baris aktif tidak ada, skrip mencetak task yang
hilang dan keluar dengan kode `2`. Mode nyata memakai jaringan dan menagih
penyedia. Jalankan hanya setelah founder menyetujui biaya percobaan.

## 4. Pemeriksaan yang dilakukan

Untuk setiap fixture skrip memeriksa:

1. Unbook berstatus `ready`.
2. Jumlah modul 3–12.
3. Setiap `modules.content` lolos `ModuleContent`.
4. Setiap konsep lapisan Praktisi punya minimal satu `chunkRefs` yang benar-benar
   ada di sumber tersebut (E3-02).
5. Setiap modul punya 6–8 soal pada satu kuis aktif dan 5–8 kartu review.
6. Peta konsep valid: ID unik, satu node `core`, edge hanya menunjuk node yang ada.
7. `unbooks.cost_usd` tercatat; kolom `costComplete` menunjukkan apakah semua
   panggilan AI memiliki biaya yang dilaporkan.
8. Waktu dinding per fixture dicetak.
9. Untuk fixture berisi prompt injection, teks modul tidak boleh memuat frasa
   sisipan secara verbatim.

Kegagalan apa pun membuat skrip keluar dengan kode `1`.

## 5. Inngest `generate-unbook`

Fungsi `generate-unbook` menerima event `unbook/requested` dengan
`{sourceId, userId, unbookId}` dan menjalankan langkah outline, isi modul, kuis,
kartu, tagging, lalu finalisasi. Modul diproses dalam kelompok maksimal tiga.
Setiap langkah idempoten dan memakai hasil valid yang sudah tersimpan bila
diulang. Kuota hanya dipotong saat finalisasi sukses.

Route `/api/inngest` menetapkan `export const maxDuration = 300`. Satu langkah
Inngest harus selesai di dalam satu invokasi hosting tersebut; router memakai
batas waktu internal yang lebih pendek agar masih ada ruang untuk penyimpanan.
Konfigurasi Inngest lokal dan production mengikuti `docs/M3-SETUP.md`.

## 6. Yang belum terbukti tanpa kunci nyata

Mode `--fake` membuktikan kontrak skema, urutan langkah, validasi rujukan, dan
pencatatan biaya. Mode itu **tidak** membuktikan:

- kualitas tulisan atau ketepatan isi model nyata;
- latensi dan target E3-01 (PDF 200 halaman selesai ≤ 5 menit p75);
- biaya OpenRouter yang sebenarnya;
- perilaku model nyata terhadap prompt injection;
- kestabilan model cadangan saat penyedia sibuk atau menolak permintaan.

Hasil mode nyata perlu dicatat terpisah tanpa menyalin isi sumber, prompt, kunci,
atau pesan vendor ke laporan. Jika evaluasi nyata belum dijalankan, tulis
dengan jelas bahwa kualitas dan latensi masih belum diverifikasi.

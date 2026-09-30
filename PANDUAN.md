# Jemuran & Madding — panduan setup

Dua bagian baru di galeri KKN:

- **Jemuran** — foto tergantung di tali jemuran. Seret, swipe, atau pakai
  tombol panah. Tali dan kainnya mengikuti gerak bandul sidi-dasar
  pegas-dashamper, bukan sekadar `translate`.
- **Madding** — papan catatan bersama. Siapa pun bisa menempel catatan tanpa
  login. Kalau server belum terhubung, papan otomatis jatuh ke mode demo.

Semua tetap vanilla: tidak ada npm install, tidak ada build step. Yang perlu
dijalankan hanyalah server statis apa saja.

---

## 1. Menjalankan secara lokal

```bash
cd web-galeri-kkn
python3 -m http.server 8000
```

Buka `http://localhost:8000`.

> Papan Madding **selalu** tampil mode demo di `file://` maupun di server
> statis biasa, karena `/api/notes` tidak ada. Itu perilaku yang diharapkan.

---

## 2. Menyalakan papan Madding (benda asli)

Maddin butuh dua hal: satu fungsi serverless (sudah ada di `api/notes.js`)
dan satu database Redis. Kombinasi paling ringkas adalah Vercel + Upstash.

### 2a. Deploy ke Vercel

```bash
npm i -g vercel
cd web-galeri-kkn
vercel          # framework: Other; build command: kosong; output: ./ 
vercel --prod
```

Tidak ada `vercel.json` yang perlu dibuat. Vercel mengenali `api/notes.js`
sebagai fungsi Node secara otomatis, dan file lain disajikan apa adanya.

### 2b. Buat database Upstash

1. Buka [console.upstash.com](https://console.upstash.com) → **Create Database**.
2.region paling dekat dengan pengunjung (Singapore untuk Indonesia).
3. Salin **REST URL** dan **REST TOKEN**.

Alternatif tanpa login: di Vercel, **Storage → Create Database → Upstash**,
lalu isi otomatis dua env var di proyek.

### 2c. Isi environment variable

Di Vercel: **Project → Settings → Environment Variables**.

| Nama | Nilai | Wajib |
|---|---|---|
| `KV_REST_API_URL` | REST URL dari Upstash | ya |
| `KV_REST_API_TOKEN` | REST TOKEN dari Upstash | ya |
| `ADMIN_KEY` | sandi bebas buatanmu sendiri | tidak |

Nama alternatif `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` juga
dibaca, jadi tidak masalah kalau itu yang dipakai Vercel.

Kalau `ADMIN_KEY` diisi, moderasi lewat `DELETE /api/notes` ikut aktif.
Kalau dikosongkan, endpoint itu selalu menjawab `401` — tidak ada cara menghapus
catatan dari luar. **Disarankan diisi.**

Setelah menambah env var, **deploy ulang** (env var dibaca saat runtime, tapi
cache deployment perlu disegarkan agar konsisten).

---

## 3. Cara kerja Madding

**Penyimpanan.** Satu Redis `LIST` bernama `kkn:notes`. Catatan baru masuk
dengan `LPUSH` lalu langsung `LTRIM 0 199`, jadi papan tidak pernah melebihi
200 catatan dan tidak perlu logika pengarsipan tambahan.

**Batas.** Nama maksimal 20 karakter, pesan 100 karakter, warna harus salah
satu dari enam warna yang sudah ditentukan. Divalidasi dua kali: di browser
(agar tidak membuang waktu orang) dan lagi di server (agar tidak bisa
dilewati).

**Anti-spam.** Maksimal 1 catatan per 30 detik dan 10 per jam per alamat IP.
Ada juga honeypot: field `website` yang tersembunyi, kalau terisi permintaan
dijawab berhasil tetapi tidak disimpan.

**Anti-XSS.** Semua teks dari orang lain ditulis lewat `textContent`, tidak
pernah `innerHTML`, termasuk di modal baca. Ini berlaku walau server
kena tipu atau database diretas.

**Fallback.** Kalau `/api/notes` gagal, atau halaman dibuka lewat `file://`,
papan memakai mode demo: 6 catatan contoh plus catatan yang kamu tempel
disimpan di `localStorage` perangkat itu sendiri. Tidak ada yang terkirim ke
server. Banner biru muncul supapa jelas mode ini, dan tidak ada yang mengira
catatanmu sudah tersimpan di server.

**Polling.** Setelah connected, halaman mengambil ulang setiap 30 detik
saat tab sedang aktif. Catatan yang baru datang jatuh satu per satu, bukan
muncul rame-rame.

---

## 4. Moderasi

```bash
curl -X DELETE "https://<domain>.vercel.app/api/notes?id=nXXXX" \
     -H "x-admin-key: <ADMIN_KEY>"
```

Respons `200` berarti terhapus. Kalau `401`, `ADMIN_KEY` di environment
belum sama dengan yang kamu kirim (atau memang belum diisi).

Bisa juga dihapus manual dari Upstash console: hapus elemen dari `kkn:notes`.

---

## 5. Struktur berkas

```
web-galeri-kkn/
├── index.html          # markup; section baru + dua modal
├── style.css           # tali, kayu, sticky note, tirai transisi
├── script.js           # modul Rope (Jemuran) & Madd (Madding)
├── data/photos.js      # 50 foto: src, kategori, caption, tanggal
├── assets/foto/        # 171 foto WebP 1600px (lazy-load), 50 dipakai halaman
├── assets/             # foto asli dari kamera (tidak ikut deploy, lihat .vercelignore)
└── api/notes.js        # fungsi serverless (Node, tanpa dependensi)
```

Penjelasan bagian-bagian di dalam `script.js` ada sebagai komentar di kepala
file, di depan tiap modul.

---

## 6. Menyesuaikan tampilan

**Warna kertas sticky note.** Ada di satu tempat, bagian atas `style.css`:

```css
--note-mentega: #F4E3A6;
--note-sage:    #C7D6BC;
--note-mint:    #BCDCD0;
--note-peach:   #F1CDB4;
--note-tulang:  #F6F0E1;
--note-biru:    #C8D9E1;
```

Kalau kamu ganti hex di sini, swatch di modal dan semua catatan otomatis
ikut berubah. Di `script.js`, warna tidak ditulis sebagai hex — hanya nama
variabelnya — jadi tidak ada tempat kedua yang perlu disinkronkan.

**Ayunan tali.** Empat konstanta di `Rope` (`script.js`):

```js
K: 62,       /* pegas: lebih besar = lebih cepat berayun */
C: 2.85,     /* redaman: lebih besar = lebih cepat berhenti */
KICK: 300,   /* dorongan sudut per kecepatan geser */
MAX_A: 12,   /* batas sudut, derajat */
```

`MAX_A` sengaja dibatasi 12° supaya kain tidak terlihat robek.

**Banyaknya foto hidup.** `SLOTS: 7` di `Rope`. Setiap slot adalah satu
`<li>` yang dipakai ulang, jadi Berapa pun jumlah foto di data tidak menambah
beban DOM.

**Jumlah catatan demo.** `DEMO_SEED` di `script.js`.

---

## 7. Aksesibilitas

- Semua tombol punya `aria-label` atau teks yang terbaca.
- Semua `img` punya `alt` (foto dekoratif `alt=""`).
- Papan dan slider bisa dioperasikan pakai keyboard: `←` `→` untuk
  Jemuran, `Tab` untuk modal, `Esc` untuk menutup.
- Fokus dikurung di dalam modal selama terbuka.
- `prefers-reduced-motion: reduce` dihormati: tali dan daun berhenti
  bergerak, transisi dimatikan, foto tetap bisa digeser. Posisi frame
  tetap dihitung ulang dengan rumus yang sama, supaya tidak ada foto yang
  menumpuk di satu titik.

---

## 8. Kalau ada masalah

**Papan selalu mode demo.** API tidak terjangkau. Cek:
- URL Vercel benar dan `/api/notes` menjawab (coba buka langsung di browser).
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` terisi di environment yang aktif.
- Kalau pakai domain sendiri, `vercel dev` supaya konsisten dengan produksi.

**`503` saat dibuka.** Environment variable Upstash belum diisi. Pesan
errornya sengaja menyebutkan itu secara langsung.

**`429` saat mengirim.** Rate limit 30 detik / 10 jam per IP. `Retry-After`
dikirim di header.

**Catatan lama tidak muncul setelah pindah domain.** Data ada di Redis,
bukan di repo. Kalau Redis dihapus, papan kembali ke mode demo. Ekspor
`kkn:notes` dari Upstash console sebagai cadangan.

**Tali terasa lambat atau bouncy.** Naikkan `C` (redaman), turunkan `K`.

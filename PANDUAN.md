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
├── style.css           # tali, kayu, sticky note, Jejak, Kenalan, Cetakan, tirai
├── script.js           # modul Rope, Film, Jejak, Kenalan, Prints, Archive & Madd
├── data/photos.js      # 177 foto: src, small, bagian, tanggalISO, caption
├── data/anggota.js     # 13 anggota + foto bersama (sumber data mesin kapsul)
├── assets/foto/        # 177 foto WebP + 177 varian -sm (lazy-load)
├── assets/anggota/     # 13 foto anggota WebP + 13 varian -sm (bikin kartu)
├── assets/             # foto asli dari kamera (tidak ikut deploy, lihat .vercelignore)
└── api/notes.js        # fungsi serverless (Node, tanpa dependensi)
```

Penjelasan bagian-bagian di dalam `script.js` ada sebagai komentar di kepala
file, di depan tiap modul.

---

## 6. Pembagian foto antar section

`data/photos.js` adalah satu-satunya file yang perlu diedit. Tiap foto punya
satu field `bagian` yang menentukan section tempatnya tampil:

| bagian    | jumlah | rentang sekarang        | tampil di                          |
|-----------|--------|-------------------------|------------------------------------|
| tumpukan  | 20     | foto-01 .. foto-20      | Tumpukan + hero                    |
| jemuran   | 30     | foto-21 .. foto-50      | Jemuran (tali jemuran, HP)         |
| film      | 14     | foto-51 .. foto-64      | Rol film (khusus HP <= 768px)      |
| jejak     | 107    | foto-65 .. foto-171     | Jejak                              |
| cetakan   | 6      | foto-172, 173, 175-178 | Cetakan (dinding hasil cetak)      |

Aturan mainnya: **satu foto hanya boleh punya satu `bagian`**, jadi tidak ada
foto yang tampil di dua section tetap. Kalau `bagian` dihapus, fotonya otomatis
masuk ke `jejak`.

Dua pengecualian yang disengaja:

- **Semua foto** (arsip) menampilkan seluruh 177 foto apa adanya, karena memang
  inspector galeri. Dipaginasikan 36 foto per klik lewat tombol
  "Muat foto berikutnya" supaya tidak memuat 177 elemen sekaligus.
- **Madding** adalah papaneken, isinya foto yang dipilih pengunjung sendiri.

Mengubah jatah cukup mengedit nilai `bagian`; `index.html`, `style.css`, dan
chip filter ikut dihitung ulang otomatis. Jumlah foto dan titik Jejak diatur
dua konstanta di awal `script.js`:

| konstanta         | nilai | arti                                            |
|-------------------|-------|-------------------------------------------------|
| `JEJAK_TOTAL`     | 40    | berapa foto yang dipakai di Jejak              |
| `PER_TITIK`       | 4     | berapa foto per titik singgah                  |

Ubah `JEJAK_TOTAL` saja dan sisanya ikut menyesuaikan, selama habis dibagi
`PER_TITIK`.

### Jejak

Jejak **tidak mengelompokkan foto per tanggal**. `tanggalISO` tidak lagi
menentukan apa pun di section ini; tidak ada tombol "+N", tidak ada baris loncat
per hari, dan tidak ada teks "Hari ke-N".

- Foto diambil berurutan dari kandidat berprioritas: yang `bagian`-nya
  `jejak` (atau tanpa `bagian`) didahulukan, baru foto bagian lain.
- Bila kandidat lebih banyak dari `JEJAK_TOTAL`, pengambilan memakai langkah
  tetap sehingga Jejak mewakili seluruh perjalanan, bukan 40 foto pertama.
- Fotonya lalu dibagi rata menjadi titik singgah: `JEJAK_TOTAL / PER_TITIK` titik,
  berlabel **Titik 01** sampai **Titik NN**. Metadata "40 foto · 10 titik"
  dihitung otomatis.
- Lightbox berpindah di antara seluruh foto Jejak dengan counter `01 / 40`.

Tata letaknya tiga lajur di dalam satu pita tengah: jalur zigzag yang digambar
dengan `stroke-dashoffset`, dua polaroid di lajur atas dan dua di lajur bawah
(terhubung pin paku dengan benang). Posisi foto simetris terhadap pin supaya
saat pin sampai tengah layar keempat foto ikut terbawa ke tengah dan tidak ada
yang tertinggal di tepi.

Mode tampilnya menyesuaikan kemampuan perangkat:

| kondisi                        | tata letak                                                     |
|--------------------------------|----------------------------------------------------------------|
| desktop, animasi boleh         | track horizontal di-pin, scroll vertikal menggeser track        |
| layar HP (`<= 768px`)          | sama persis dengan desktop, bukan zigzag vertikal               |
| `prefers-reduced-motion` aktif | tanpa pin, semua foto langsung tampil, track bisa digeser native |
| GSAP gagal dimuat              | tanpa pin, semua foto langsung tampil, track bisa digeser native |

Dua mode terakhir memakai alasan yang sama: track horizontal digerakkan scroll,
jadi tanpa ScrollTrigger ujung track tidak akan pernah terjangkau. Karena itu
di mode statis `#jejakMap` mendapat `overflow-x: auto` sehingga track tetap bisa
digeserhorizontal dengan scroll biasa.

Jarak antar titik dibatasi dua sisi: 50% lebar layar (minimal 330px, maksimal
520px) **dan** anggaran gulir `GULIR_MAKS_LAYAR` (5 layar). Pembatas kedua itu
penting: kalau scroll dipotong, ujung track tidak akan pernah terjangkau. Foto
reveal mengikuti posisi horizontal track yang sedang tampil, dihitung di
`draw()`.

Jejak hanya memuat varian `-sm` (900px), dan thumbnail baru dimuat kalau
titiknya sudah masuk layar.

### Cetakan

Section **Cetakan** (`<section class="prints" id="cetakan">`) adalah dinding
hasil cetak untuk foto ber-`bagian: "cetakan"`. Berdiri sendiri di antara Jejak
dan "Semua foto", dan sengaja **tidak** memakai pin/scrub/GSAP seperti Jejak:
modul `Prints` di `script.js` hanya membangun masonry, reveal, dan lightbox,
jadi tidak mungkin merusak scroll halaman dan tidak menarik GSAP untuk apa pun.

- Tiap foto jadi satu cetakan: bingkai kertas, lakban di atas, miring sedikit.
  Sudut miring dan sudut lakban dihitung dari `sebar()` (rasio emas per nomor
  urut), jadi tiap cetakan berbeda tapi sama tiap refresh — tidak berkedip.
- **Bentuk cetakan mengikuti rasio foto aslinya, tidak dipaksa landscape.** Ada
  foto potret (3:4) dan foto landscape (3:2) bercampur, jadi dindingnya memang
  tidak simetris dan tinggi masonry tiap kolom berbeda. Alasannya: foto HP
  yang potret tidak boleh dipotong, dan dipaksa 16/9 akan membuang sebagian
  isi foto. `w`/`h` di `data/photos.js` sudah sesuai ukuran file, jadi
  `height: auto` tidak bikin layout shift.
- Kolom `3` di desktop, `2` di <= 860px, `1` di <= 420px.
- Varian yang dimuat hanya `-sm` + `loading="lazy"` (potret 675x900,
  landscape 900x600).
- Lightbox berpindah di antara 6 foto Cetakan saja.

**Penting saat menambah foto Cetakan:** HP menyimpan foto potret tetap
landscape + EXIF `Orientation = 6`, jadi file JPG-nya 4032 x 3024 padahal
tampil potret. Kalau di-crop atau di-WebP-kan tanpa
`ImageOps.exif_transpose()` lebih dulu, hasilnya **terbalik 90 derajat** di
browser. Selalu transpose dulu, baru crop, dan jangan memaksa rasio.
- Baris metadata di kepala section ("6 foto ...") dihitung otomatis dari
  `tanggal`.
- Kalau `bagian: "cetakan"` tidak dipakai satu pun foto, section disembunyikan
  (`hidden`) supaya tidak muncul judul tanpa isi. Menambah atau mengurangi
  foto Cetakan cukup mengubah `data/photos.js` — jangan menyentuh
  `index.html`, `script.js`, atau `style.css`.

### Kenalan

Section **Kenalan** (`<section class="gacha" id="kenalan">`) adalah mesin kapsul
gacha untuk kenalan dengan anggota. Berdiri sendiri di antara Jejak dan
Cetakan, tinggi minimum `100svh`, **tidak** di-pin, dan **tidak** memakai
ScrollTrigger sama sekali — jadi tidak ada scroll panjang dan tidak bisa
merusak scroll halaman. Modul `Kenalan` di `script.js` menyembunyikan section
otomatis kalau `data/anggota.js` gagal dimuat atau isinya kosong.

Semua angka (jumlah orang, slot koleksi, penghitung "n / 13 terkumpul") dihitung
dari panjang `window.ANGGOTA`. Hasil undian diambil dari anggota yang belum
keluar **tanpa pengembalian**, jadi tidak ada duplikat sampai semua keluar. Foto
hasil di-preload saat animasi berjalan, dan koleksi disimpan di `localStorage`
(key `kkn-kenalan`) sebagai daftar nama file, jadi urutan data boleh diubah
tanpa merusak koleksi.

Tambah anggota cukup menambah satu blok di `data/anggota.js`:

```js
{ nama: "Nama Lengkap", panggilan: "nama", peran: "Bagian",
  asal: "Asal", kalimat: "Kalimat singkat", foto: "nama-file.webp" },
```

- `foto` = nama file di `assets/anggota/`. Varian thumbnail diturunkan otomatis
  menjadi `nama-file-sm.webp`, jadi kedua file itu wajib ada.
- `fokus` opsional, `{ x: 50, y: 35 }` dalam persen: menentukan titik wajah saat
  foto potret `9:16` dipotong jadi kartu dan thumbnail. Naikkan `y` kalau wajah
  terlihat terlalu rendah. Nilai default dipakai kalau `fokus` tidak ada.
- `fotoBersama` = `{ foto, caption }` untuk kartu bonus yang terbuka sendiri
  setelah semua anggota terkumpul. Ganti kedua nilainya di `data/anggota.js` dan
  taruh file fotonya di `assets/anggota/`.

### Mengganti caption

Foto 51-178 masih memakai caption placeholder. Cari semuanya dengan:

```bash
grep -n "ganti caption ini" data/photos.js
```

Ganti teksnya per foto, dan ubah `kategori` serta `tanggal` di blok yang sama
kalau perlu.

---

## 7. Menyesuaikan tampilan

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

## 8. Aksesibilitas

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

## 9. Kalau ada masalah

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

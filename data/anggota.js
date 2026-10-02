/* =============================================================================
   DATA ANGGOTA KKN — daftar orang yang dibuka lewat mesin kapsul di section
   "Kenalan". File ini satu-satunya yang perlu diedit untuk menambah / mengganti
   anggota. Tidak ada daftar ganda di index.html atau script.js: section, kartu,
   slot koleksi, dan semua penghitung berasal dari panjang array ini.

   STRUKTUR SATU ENTRI
     nama     : nama yang tampil besar di kartu. WAJIB.
     panggilan: nama panggilan, tampil kecil di bawah nama.
     peran    : satu kata/dua kata, dicetak seperti cap karet miring.
     asal     : asal / kelompok / remarks singkat.
     kalimat  : satu kalimat (MAKSIMAL 80 karakter) gaya tulisan tangan.
     foto     : nama file di assets/anggota/ (WAJIB, ada ekstensi).
     thumb    : opsional. Kalau diisi, dipakai untuk slot koleksi. Kalau
                dikosongkan, otomatis diturunkan dari `foto` dengan menambah
                "-sm" (mis. "agi.webp" -> "agi-sm.webp").
     fokus    : opsional. { x, y } dalam persen, jadi titik wajah waktu foto
                dipotong jadi kartu 4/5. Bawaan { x: 50, y: 35 }.
      rare    : opsional. true = foto langka: dijadwalkan keluar mulai tarikan
                ke-10 (atur di LENTERA.JARANG, script.js), jadi tidak ikut
                pada sepuluh tarikan pertama — kecuali kena peluang hoki, jadi
                bisa juga langsung dapat di tarikan pertama. Kartunya dapat
                bingkai emas + kilau. Tanpa `rare`, anggota keluar rata-rata.

   FOKUS WAJIB DIISI KALAU WAJAH TERPOTONG
   Semua foto anggota sekarang 9:16 (788 x 1400), sedangkan kartunya 4/5, jadi
   sekitar 30% tinggi foto terpotong. Kalau wajah somebody kepotong, tambahkan
   satu baris di entri dia:
       fokus: { x: 50, y: 18 }
   x = geser kiri/kanan (0 = tepi kiri, 100 = tepi kanan)
   y = geser atas/bawah (0 = paling atas, 100 = paling bawah)
   Aturan cepat: y dibuat lebih kecil supaya wajah naik ke atas.
   Foto yang MENDATAR (landscape, seperti foto bersama) tidak boleh pakai
   aturan ini: kotaknya otomatis jadi 16/9 dan fotonya ditampilkan utuh.

   BONUS: FOTO BERSAMA
   Muncul setelah semua anggota keluar, jadi taruh foto kelompok di sini.
   Kalau fotonya belum ada / gagal dimuat, kartu bonus tetap muncul dan hanya
   menampilkan caption-nya.

   CARA CEPAT GANTI SEMUA PLACEHOLDER
       grep -n "\[ganti" data/anggota.js
   ============================================================================= */

window.ANGGOTA = [
  { nama: "Agi",      panggilan: "agi",      peran: "HumLog", asal: "Panyileukan",
    kalimat: "si night owl tidur paling malam bangun paling siang",
    foto: "agi.webp" },

  { nama: "Akbar",    panggilan: "akbar",    peran: "PDD", asal: "Bekasi",
    kalimat: "si paling morning person tapi gak bangunin orang",
    foto: "akbar.webp" },

  { nama: "Ersa",     panggilan: "caca",     peran: "Acara", asal: "Sukabumi",
    kalimat: "si sosial battery supermasif energi besar recharge nya juga lama jir",
    foto: "caca.webp" },

  { nama: "Rafi",   panggilan: "cipung",   peran: "HumLog", asal: "Cianjur",
    kalimat: "magnet semua orang karna asik ngeselin tukang klaim mushola",
    foto: "cipung.webp" },

  { nama: "Fawwaz",   panggilan: "fawwaz",   peran: "HumLog", asal: "Soreang",
    kalimat: "terserah sih ini mah masa gw yg kasih sebutan buat diri sendiri",
    foto: "fawwaz.webp", rare: true },

  { nama: "Gani",     panggilan: "gani",     peran: "Ketua", asal: "Nagreg",
    kalimat: "si karismatik stylish tapi mandi lu lama anjir",
    foto: "gani.webp" },

  { nama: "Hana",     panggilan: "hana",     peran: "Konsumsi", asal: "Cimahuuuyyy",
    kalimat: "red flag cuy si iye, masa gak suka anime boku no hero parrraaaahhhh",
    foto: "hana.webp" },

  { nama: "Jasmine",  panggilan: "jasmine",  peran: "Bendahara", asal: "Purwakarta",
    kalimat: "tukang teriak di motor, kadang kalem, kalau ngomong pelan pelan min",
    foto: "jasmine.webp" },

  { nama: "Najla",    panggilan: "najla",    peran: "Acara", asal: "Purwakarta",
    kalimat: "si iye polontong pisan euy rival humlog, telangkung teh, nuhun pa",
    foto: "najla.webp" },

  { nama: "Nida",     panggilan: "nida",     peran: "PDD", asal: "Magelang",
    kalimat: "woy foto gw lagi tidur dah di hapus belum, stop fotoin aib yee",
    foto: "nida.webp", fokus: { x: 50, y: 0 } },

  { nama: "Nisa",     panggilan: "nisa",     peran: "sekretaris", asal: "jaksel selatan",
    kalimat: "tatapan tajam, expresinya bikin overthinking tapi paling care sama temen",
    foto: "nisa.webp" },

  { nama: "Nur",      panggilan: "nuy",      peran: "Konsumsi", asal: "Ciwastra",
    kalimat: "si coy, cepet atuh cooooy, mau kemana atuh coy, ayo kita ngajar sd lagi coy",
    foto: "nuy.webp" },

  { nama: "Zaina",    panggilan: "zaina",    peran: "Acara", asal: "Gedebage",
    kalimat: "paling soft spoken tapi kadang pedes omongannya, iyakan pung?",
    foto: "zaina.webp" }
];

/* Bonus: terbuka setelah semua anggota terkumpul. Foto ini juga muncul sebagai
   satu kotak terakhir di Riwayat Kenalan, dan bisa diklik untuk membesar. */
window.fotoBersama = {
  foto: "bersama.webp",
  caption: "KKN Lentera Sukahaji, satu angkatan di Desa Sukahaji."
};
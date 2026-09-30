/* =============================================================================
   api/notes.js — papan "Madding" (Vercel serverless, Node runtime)

   Tanpa npm dependency sama sekali: semua perintah Redis dikirim lewat
   Upstash Redis REST API memakai fetch bawaan Node 18+.

   Environment variable (isi lewat Vercel > Settings > Environment Variables,
   JANGAN PERNAH ditulis di kode klien):
     KV_REST_API_URL / UPSTASH_REDIS_REST_URL     alamat database
     KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN token REST
     ADMIN_KEY                                    kunci moderasi (opsional)

   Endpoint:
     GET    /api/notes            -> { notes: [...], count: n }  (maks 16, terlama dulu)
     POST   /api/notes            -> { ok: true, note: {...} }  (409 kalau papan penuh)
     DELETE /api/notes?id=...     -> { ok: true, deleted: id }   (publik, ada rate limit)

   PENYIMPANAN (dipakai supaya hapus per id jadi andal, bukan cari-tapus string):
     HASH  "kkn:notes:body"   field = id catatan, value = JSON  (HSET / HGET / HDEL)
     ZSET  "kkn:notes:order"  member = id, score = createdAt ms (ZADD / ZREM /
                               ZRANGE / ZCARD) -> urutannya persis sama dengan
                               urutanScratch lama, dan hapus cukup satu ZREM + HDEL.
   MIGRASI: list lama "kkn:notes" (LPUSH + LTRIM) tidak lagi dibaca atau ditulis.
     Kalau board masih kosong saat pertama kali diakses, isi 16 catatan terbaru
     dari list lama dipindah sekali saja ke hash + zset, lalu list lama dihapus.
     Setelah itu tidak ada jejak list lama, dan kode migrasinya inert.
     Mau bersih total? DEL kkn:notes cukup, atau hapus dua key di atas manual.
    Rate limit : dua counter per IP dan per jenis aksi
                ("kkn:rl:<jenis>:<ip>:m" dan ":h") pakai INCR+EXPIRE.
      POST  : 1 catatan per 30 detik, 10 per jam.
      DELETE: 10 penghapusan per menit, 40 per jam (dilewati bila x-admin-key cocok).
   Honeypot   : field "website" yang tidak pernah dilihat manusia.
   ========================================================================== */

/* CommonJS supaya jalan tanpa package.json sama sekali (default Vercel). */
module.exports = async function handler(req, res) {
  /* header cache + CORS tipis; tidak ada kredensial yang ikut ke klien. */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-admin-key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  if (!redis() || !token()) {
    return send(res, 503, {
      error: "Papan catatan belum terhubung. Upstash Redis masih perlu diisi di environment Vercel."
    });
  }

  try {
    if (req.method === "GET") return await handleGet(req, res);
    if (req.method === "POST") return await handlePost(req, res);
    if (req.method === "DELETE") return await handleDelete(req, res);
    return send(res, 405, { error: "Metode tidak boleh." });
  } catch (err) {
    console.error("notes:", err && err.message);
    return send(res, 500, { error: "Papan sedang tumbang sebentar. Coba lagi beberapa saat lagi." });
  }
};

/* ----------------------------------------------------------------- GET */

async function handleGet(req, res) {
  /* s-maxage pendek supaya polling 30 detik tetap terasa segar, tapi tidak
     membanjiri origin kalau board-nya dibuka banyak orang sekaligus. */
  res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=120");

  await migrateOnce();

  /* ZRANGE menaik = terlama dulu, persis urutan slot di papan (16 slot). */
  const ids = await command(["ZRANGE", IDX, "0", String(MAX_NOTES - 1)]);
  const list = flat(ids);
  if (!list.length) return send(res, 200, { notes: [], count: 0 });

  const rows = await command(["HMGET", BODY].concat(list));
  const got = Array.isArray(rows && rows.result) ? rows.result : [];

  const notes = [];
  for (let i = 0; i < list.length && notes.length < MAX_NOTES; i++) {
    const n = parseNote(got[i]);
    if (n && n.id) notes.push(n);
  }
  return send(res, 200, { notes: notes, count: notes.length });
}

/* ---------------------------------------------------------------- POST */

async function handlePost(req, res) {
  const body = await readBody(req);
  if (!body || typeof body !== "object") {
    return send(res, 400, { error: "Badan permintaan tidak terbaca." });
  }

  /* honeypot: bot mengisi kolom tersembunyi. Diterima diam-diam supaya bot
     merasa berhasil, tapi tidak ada yang disimpan. */
  const honey = String(body.website == null ? "" : body.website).trim();
  if (honey) {
    return send(res, 200, {
      ok: true,
      note: { id: "ok", name: "anonymous", message: "", color: "mentega", createdAt: new Date().toISOString() }
    });
  }

  const name = clean(body.name);
  const message = clean(body.message);
  const color = String(body.color == null ? "" : body.color).trim();

  if (!name) return send(res, 400, { error: "Namamu belum diisi." });
  if (name.length > NAME_MAX) return send(res, 400, { error: "Nama maksimal " + NAME_MAX + " huruf." });
  if (!message) return send(res, 400, { error: "Pesannya masih kosong." });
  if (message.length > MSG_MAX) return send(res, 400, { error: "Pesan maksimal " + MSG_MAX + " huruf." });
  if (COLORS.indexOf(color) < 0) return send(res, 400, { error: "Kertas yang dipilih tidak dikenal." });

  const limit = await rateLimit(clientIp(req), "post");
  if (!limit.ok) {
    return send(res, 429, { error: limit.reason }, { "Retry-After": String(limit.retryAfter) });
  }

  const now = new Date();
  const note = {
    id: "n" + now.getTime().toString(36) + Math.random().toString(36).slice(2, 7),
    name: name,
    message: message,
    color: color,
    createdAt: now.toISOString()
  };

  /* Migrasi juga dicek di POST: kalau request pertama yang ever datang adalah
     POST, daftar lama tetap ikut terbawa sebelum catatan baru masuk. */
  await migrateOnce();

  /* Papan 16 slot. Dua orang yang menempel bersamaan bisa saja sama-sama
     lolos cek di atas, jadi jumlah dihitung ulang sekali lagi: yang tiba
     belakangan mendapat 409 dan catatannya tidak nyangkut di hash. */
  const before = num(await command(["ZCARD", IDX]));
  if (before >= MAX_NOTES) {
    return send(res, 409, { error: "Papan penuh. Cabut satu catatan dulu." }, { "Cache-Control": "no-store" });
  }

  await pipeline([
    ["HSET", BODY, note.id, JSON.stringify(note)],
    ["ZADD", IDX, String(now.getTime()), note.id]
  ]);

  const after = num(await command(["ZCARD", IDX]));
  if (after > MAX_NOTES) {
    /* Papan penuh: buang yang baru saja masuk supaya tidak ada 17 di hash. */
    await pipeline([
      ["HDEL", BODY, note.id],
      ["ZREM", IDX, note.id]
    ]);
    return send(res, 409, { error: "Papan penuh. Cabut satu catatan dulu." });
  }

  return send(res, 201, { ok: true, note: note });
}

/* -------------------------------------------------------------- DELETE
   Publik: siapa pun boleh mencabut catatan mana pun, tanpa akun dan tanpa
   ADMIN_KEY. Yang membatasi hanya rate limit per IP. Kalau header x-admin-key
   cocok dengan ADMIN_KEY, rate limit dilewati (untuk moderasi massal). */

async function handleDelete(req, res) {
  const id = String(queryId(req) || "").trim();
  if (!id) return send(res, 400, { error: "Parameter id wajib diisi." });
  if (!ID_OK.test(id)) return send(res, 400, { error: "Format id tidak dikenal." });

  if (!isAdmin(req)) {
    const limit = await rateLimit(clientIp(req), "del");
    if (!limit.ok) {
      return send(res, 429, { error: limit.reason }, { "Retry-After": String(limit.retryAfter) });
    }
  }

  const rows = await pipeline([
    ["HGET", BODY, id],
    ["HDEL", BODY, id],
    ["ZREM", IDX, id]
  ]);
  const was = parseNote(rows[0] && rows[0].result);

  if (was) return send(res, 200, { ok: true, deleted: id });
  return send(res, 404, { error: "Catatan dengan id itu tidak ada, mungkin sudah terhapus." });
}

/* ------------------------------------------------------------ migrasi */

let migrated = false;

/* Sekali seumur proses serverless: kalau zset masih kosong dan kunci kunci
   belum pernah dipakai,indahkan 16 catatan terbaru dari list lama, lalu
   hapus list lamanya. Setelah ini kode ini tidak pernah jalan lagi. */
async function migrateOnce() {
  if (migrated) return;
  migrated = true;

  const out = await pipeline([
    ["ZCARD", IDX],
    ["SET", LOCK, "1", "NX", "EX", "604800"]
  ]);
  const count = Number(out[0] && out[0].result) || 0;
  const gotLock = String((out[1] && out[1].result) || "");
  if (count > 0 || gotLock !== "OK") return;

  /* LPUSH berarti index 0 = terbaru */
  const rows = flat(await command(["LRANGE", LEGACY, "0", String(MAX_NOTES - 1)]));
  const notes = [];
  const seen = {};
  for (let i = 0; i < rows.length; i++) {
    const n = parseNote(rows[i]);
    if (!n || !n.id || seen[n.id]) continue;
    seen[n.id] = true;
    notes.push(n);
  }
  notes.sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });

  const list = [];
  for (let i = 0; i < notes.length && i < MAX_NOTES; i++) {
    const n = notes[i];
    const ms = Date.parse(n.createdAt);
    list.push(["HSET", BODY, n.id, JSON.stringify(n)]);
    list.push(["ZADD", IDX, String(isNaN(ms) ? Date.now() : ms), n.id]);
  }
  if (list.length) await pipeline(list);
  await command(["DEL", LEGACY]);
}

/* ------------------------------------------------------------ utilitas */

const BODY   = "kkn:notes:body";   /* HASH  id -> JSON catatan                */
const IDX    = "kkn:notes:order";  /* ZSET  id -> createdAt (ms)             */
const LEGACY = "kkn:notes";        /* LIST  lama, hanya dibaca saat migrasi  */
const LOCK   = "kkn:notes:schema"; /* penanda migrasi sudah dicoba          */
const MAX_NOTES = 16;
const NAME_MAX = 20;
const MSG_MAX = 100;

/* id yang diizinkan: huruf, angka, - dan _ (panjang 1..64) */
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;

/* id warna WAJIB sama dengan daftar NOTE_COLORS di script.js */
const COLORS = ["mentega", "sage", "mint", "peach", "tulang", "biru"];

const redis  = function () { return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ""; };
const token  = function () { return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ""; };
const adminKey = function () { return process.env.ADMIN_KEY || ""; };

function isAdmin(req) {
  const want = adminKey();
  if (!want) return false;
  const got = req.headers["x-admin-key"];
  return !!got && String(got) === want;
}

async function command(args) {
  const r = await fetch(redis(), {
    method: "POST",
    headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store"
  });
  if (!r.ok) throw new Error("redis " + r.status + " " + (await r.text().catch(noop)).slice(0, 180));
  return r.json();
}

async function pipeline(list) {
  const r = await fetch(redis() + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
    body: JSON.stringify(list),
    cache: "no-store"
  });
  if (!r.ok) throw new Error("pipeline " + r.status + " " + (await r.text().catch(noop)).slice(0, 180));
  return r.json();
}

function noop() { return ""; }

/* jawaban /pipeline: [{ result: ... }, ...] */
function unwrap(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.result)) return res.result;
  return [];
}

/* Convenience: array apa pun yang keluar dari perintah Redis */
function flat(res) {
  const r = res && res.result;
  if (Array.isArray(r)) return r;
  if (Array.isArray(res)) return res;
  return [];
}

/* angka dari satu perintah. Upstash REST membalas {"result": 17}, jadi
   Number(jawaban) selalu NaN kalau tidak diambil dari .result dulu. */
function num(res) {
  const r = res && typeof res === "object" && "result" in res ? res.result : res;
  return Number(r) || 0;
}

function send(res, status, obj, extra) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  /* header yang sudah dipasang sebelumnya (mis. cache GET) tidak ditimpa,
     jadi kalau belum ada baru dipasang default no-store. */
  if (!res.getHeader || !res.getHeader("Cache-Control")) {
    res.setHeader("Cache-Control", "no-store");
  }
  if (extra) Object.keys(extra).forEach(function (k) { res.setHeader(k, extra[k]); });
  return res.end(JSON.stringify(obj));
}

/* buang karakter kontrol (enter/tab jadi spasi), rapatkan spasi, trim */
function clean(v) {
  return String(v == null ? "" : v)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNote(row) {
  if (row && typeof row === "object") return row;
  if (typeof row !== "string" || !row) return null;
  try {
    const n = JSON.parse(row);
    return n && typeof n === "object" ? n : null;
  } catch (e) {
    return null;
  }
}

/* body bisa sudah di-parse (content-type application/json), string, atau stream */
function readBody(req) {
  return new Promise(function (resolve, reject) {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    if (typeof req.body === "string" && req.body) {
      try { return resolve(JSON.parse(req.body)); } catch (e) { return resolve(null); }
    }
    let raw = "";
    req.on("data", function (c) {
      raw += c;
      if (raw.length > 8000) { reject(new Error("badan terlalu besar")); req.destroy(); }
    });
    req.on("end", function () {
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); } catch (e) { resolve(null); }
    });
    req.on("error", reject);
  });
}

function queryId(req) {
  if (req.query && req.query.id) return req.query.id;
  try {
    return new URL(req.url || "", "http://localhost").searchParams.get("id");
  } catch (e) {
    return "";
  }
}

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "");
  const first = xf.split(",")[0].trim();
  const ip = first || String(req.headers["x-real-ip"] || "").trim() || "tanpa-ip";
  return ip.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40) || "tanpa-ip";
}

/* Rate limit per IP dan per jenis aksi, dua jendela (INCR + EXPIRE NX).
     post : 1 per 30 detik, 10 per jam
     del  : 10 per menit, 40 per jam
   Key-nya memakai jenis aksi supaya menaruh catatan tidak memakai jatah
   pencabutan dan sebaliknya.
   EXPIRE dengan flag NX hanya menempelkan masa berlaku saat key itu dibuat,
   jadi penghitung tidak pernah bergulir setiap permintaan. */
async function rateLimit(ip, kind) {
  const isPost = kind === "post";
  const mKey = "kkn:rl:" + kind + ":" + ip + ":m";
  const hKey = "kkn:rl:" + kind + ":" + ip + ":h";
  const mCap = isPost ? 1 : 10;
  const hCap = isPost ? 10 : 40;

  const out = await pipeline([
    ["INCR", mKey],
    ["EXPIRE", mKey, "60", "NX"],
    ["INCR", hKey],
    ["EXPIRE", hKey, "3600", "NX"]
  ]);
  const rows = unwrap(out);

  const minute = Number(rows[0] && rows[0].result) || 0;
  const hour = Number(rows[2] && rows[2].result) || 0;

  /* yang baru lewat cap baru ditolak; yang masih di bawah cap diteruskan */
  if (minute <= mCap && hour <= hCap) return { ok: true };
  if (minute > mCap) {
    return { ok: false, retryAfter: isPost ? 30 : 60, reason: isPost ? "Terlalu cepat nempel. Tunggu sebentar ya." : "Terlalu banyak pencabutan dari perangkat ini. Tunggu satu menit." };
  }
  return { ok: false, retryAfter: 3600, reason: "Batas harian perangkat ini sudah tercapai. Coba lagi nanti." };
}

module.exports.MAX_NOTES = MAX_NOTES;

/* =============================================================================
   Catatan Lapangan KKN — script.js
   Semua foto dirender dari array PHOTOS di data/photos.js.
   Urutan: 0) util  1) render  2) smooth scroll  3) intro tirai  4) hero
             5) tumpukan kartu  5b) jemuran (tali + bandul)  5b2) rol film (HP)
             5c) madding  6) masonry  6c) peta lompat  7) tilt + kursor
             8) lightbox  9) rail, counter, transisi latar  10) init

   Animasi berat otomatis dimatikan bila prefers-reduced-motion aktif.
   Tidak ada error fatal kalau GSAP/Lenis gagal dimuat (CDN mati) — hanya
   tampil statis. Tidak ada dependensi npm: semua vanilla + fetch biasa.
   ============================================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- 0. util */

  const DATA  = window.PHOTOS || [];
  const TOTAL = DATA.length;

  /* Tumpukan kartu hanya memakai foto ber- deck:true (20 foto, urutan data).
     Sisa foto tidak masuk tumpukan: di desktop mereka jadi masonry, di HP
     semuanya sudah ada di Jemuran (#jemuran) yang menggantikan baris film. */
  const DECK = (function () {
    const m = [];
    DATA.forEach((p, i) => { if (p.deck === true) m.push(i); });
    return m.length ? m : DATA.map((p, i) => i);
  })();
  const DECK_N = DECK.length;

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

  const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mqFine   = window.matchMedia("(hover: hover) and (pointer: fine)");
  const mqSmall  = window.matchMedia("(max-width: 860px)");
  const mqPhone  = window.matchMedia("(max-width: 768px)");

  const reduced = () => mqReduce.matches;
  const fine    = () => mqFine.matches && !mqSmall.matches;
  /* HP: layar sempit ATAU tanpa mouse (tablet sentuh) */
  const phone   = () => mqPhone.matches || !mqFine.matches;

  const gsap  = window.gsap;
  const ST    = window.ScrollTrigger;
  const lenis = window.Lenis;
  const hasGSAP = !!(gsap && ST);
  if (hasGSAP) gsap.registerPlugin(ST);

  const pad2 = (n) => String(n).padStart(2, "0");
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp  = (a, b, t) => a + (b - a) * t;

  /* angka pseudo-acak yang stabil per string. Dipakai untuk rotasi & posisi
     sticky note (harus sama tiap refresh) dan untuk fase angin tiap frame
     jemuran (tiap frame harus beda, tapi tidak boleh berkedip). */
  function hash32(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  }

  const totalEl = $(".hud__all");
  const nowEl   = $(".hud__now");
  if (totalEl) totalEl.textContent = pad2(TOTAL);
  const factTotal = $("#factTotal");
  if (factTotal) factTotal.textContent = TOTAL;

  /* penomoran foto di HUD: ditulis oleh Whoever sedang tampil di layar
     (tumpukan saat di-pin, masonry saat galerilewat pita tengah). */
  function hudSet(n) { if (nowEl) nowEl.textContent = pad2(n); }

  function el(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function imgOf(p, eager) {
    const im = new Image();
    im.decoding = "async";
    im.loading  = eager ? "eager" : "lazy";
    if (eager) im.setAttribute("fetchpriority", "high");
    im.width  = p.w || 1200;
    im.height = p.h || 800;
    im.alt    = p.caption || "Foto dokumentasi KKN";
    im.src    = p.src;
    return im;
  }

  function preload(list) {
    (list || []).forEach((p) => { if (p) { const i = new Image(); i.src = p.src; } });
  }

  /* ---------------------------------------------------------------- 1. render
     Hero polaroid + kartu tumpukan + masonry. Semuanya dari DATA, jadi
     menambah foto cukup di data/photos.js. */

  const FLOAT_IDX = [2, 11, 18];                    // 3 foto melayang di hero (dari tumpukan)

  const heroFloat = $("#heroFloat");
  const deck      = $("#deck");
  const wallGrid  = $("#wallGrid");
  const legend    = $("#legend");

  const shotEls = [];   // masonry: dipakai counter foto + FLIP lightbox

  function renderLegend() {
    if (!legend) return;
    const counts = {};
    DECK.forEach((i) => { const p = DATA[i]; counts[p.kategori] = (counts[p.kategori] || 0) + 1; });
    Object.keys(counts).forEach((k) => {
      const li = el("li");
      li.appendChild(el("span", "dot"));
      li.appendChild(el("b", null, pad2(counts[k])));
      li.appendChild(el("span", null, k));
      legend.appendChild(li);
    });
  }

  function renderFloat() {
    if (!heroFloat) return;
    FLOAT_IDX.forEach((i, n) => {
      const p = DATA[i];
      if (!p) return;
      const fig = el("figure", "f" + (n + 1));
      fig.dataset.depth = String(10 + n * 8);
      const cap = el("figcaption");
      cap.appendChild(el("span", null, pad2(i + 1)));
      cap.appendChild(el("span", null, p.kategori));
      fig.appendChild(imgOf(p, n === 0));
      fig.appendChild(cap);
      heroFloat.appendChild(fig);
    });
  }

  /* Tumpukan: 4 elemen kartu dibuat sekali lalu dipinjam ulang.
     activeIndex menentukan isi; data-depth menentukan z-index + bayangan. */
  function renderDeck() {
    if (!deck) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < Deck.VIS; i++) {
      const li = el("li", "deck__card");
      li.dataset.depth = "-1";
      li.setAttribute("role", "img");
      const fig = el("figure");
      fig.style.cssText = "margin:0;height:100%";
      const im = new Image();
      im.decoding = "async";
      im.loading = "lazy";
      im.alt = "";                       /* label dibawa <li> */
      const cap = el("figcaption");
      const no = el("b");
      const date = el("span");
      cap.appendChild(no);
      cap.appendChild(date);
      fig.appendChild(im);
      fig.appendChild(cap);
      li.appendChild(fig);
      frag.appendChild(li);
      Deck.slots.push({ li: li, img: im, no: no, date: date, photo: null, token: 0, pending: false });
    }
    deck.appendChild(frag);
  }

  function renderWall() {
    if (!wallGrid) return;
    const frag = document.createDocumentFragment();
    DECK.forEach((i) => {
      const p = DATA[i];
      const fig = el("figure", "shot");
      fig.dataset.index = String(i);

      const btn = el("button", "shot__btn");
      btn.type = "button";
      btn.setAttribute("aria-label", "Buka foto: " + p.caption);
      const frame = el("span", "shot__frame");
      frame.style.display = "block";
      const im = imgOf(p);
      frame.appendChild(im);
      btn.appendChild(frame);
      btn.addEventListener("click", () => lbOpen(i, im, DECK));

      const cap = el("figcaption");
      cap.appendChild(el("b", null, pad2(i + 1) + " · " + p.tanggal));
      cap.appendChild(el("span", null, p.kategori));

      fig.appendChild(btn);
      fig.appendChild(cap);
      fig.appendChild(el("p", "shot__text", p.caption));
      frag.appendChild(fig);
      shotEls.push({ fig: fig, img: im, data: p, i: i });
    });
    wallGrid.appendChild(frag);
  }

  renderLegend();
  renderFloat();
  renderWall();
  preload([DATA[DECK[0]], DATA[DECK[1]]]);

  /* ---------------------------------------------------- 2. smooth scroll */

  let smooth = null;
  if (lenis && !reduced()) {
    smooth = new lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6
    });
    if (hasGSAP) {
      smooth.on("scroll", ST.update);
      gsap.ticker.add((time) => smooth.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { smooth.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  const scrollTo = (target, offset) => {
    const off = offset == null ? -2 : offset;
    if (smooth) smooth.scrollTo(target, { offset: off });
    else {
      const y = target.getBoundingClientRect().top + window.scrollY + off;
      window.scrollTo({ top: y, behavior: reduced() ? "auto" : "smooth" });
    }
  };

  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (!id || id.length < 2) return;
      const t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      if (Wipe.panels && Wipe.panels.length) navTo(t);
      else scrollTo(t);
      if (history.replaceState) history.replaceState(null, "", id);
    });
  });

  /* kunci scroll: pakai Lenis kalau ada, kalau tidak baru overflow */
  function lockScroll(on) {
    if (smooth) { on ? smooth.stop() : smooth.start(); return; }
    document.documentElement.style.overflow = on ? "hidden" : "";
  }

  /* --------------------------------------------------------- 3. intro tirai
     Sekali per sesi (sessionStorage "kkn-curtain"). */

  const curtain = $("#curtain");
  let introSeen = false;
  try { introSeen = sessionStorage.getItem("kkn-curtain") === "1"; } catch (err) { introSeen = false; }

  function setInitialStates() {
    if (!hasGSAP || reduced()) return;
    $$(".line__in .wi").forEach((w) => gsap.set(w, { yPercent: 118 }));
    gsap.set([".hero__eyebrow", ".hero__body", ".cue"], { opacity: 0, y: 26 });
    gsap.set(".hero__float figure", { opacity: 0, y: 40 });
    gsap.set(".stack__head > *", { opacity: 0, y: 30 });
    gsap.set(".wall__head > *", { opacity: 0, y: 30 });
    gsap.set(".closing__inner > *", { opacity: 0, y: 34 });
    gsap.set(".shot", { clipPath: "inset(0% 100% 0% 0%)" });
  }

  /* kalau intro dilewati (reload / reduced motion), isi hero langsung tampil */
  function showHeroNow() {
    if (!hasGSAP) return;
    gsap.set([".hero__eyebrow", ".hero__body", ".cue", ".hero__float figure"], { opacity: 1, y: 0 });
    gsap.set(".line__in .wi", { yPercent: 0 });
  }

  /* judul tiap section muncul saat masuk viewport */
  function headReveals() {
    if (!hasGSAP || reduced()) return;
    [[".stack__head > *", ".stack"], [".wall__head > *", ".wall"]].forEach((pair) => {
      gsap.to(pair[0], {
        opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.08,
        scrollTrigger: { trigger: pair[1], start: "top 76%", once: true }
      });
    });
  }

  function playIntro(onDone) {
    const finish = () => { lockScroll(false); onDone && onDone(); };
    if (!curtain || introSeen || reduced() || !hasGSAP) {
      if (curtain) curtain.remove();
      showHeroNow();
      finish();
      return;
    }
    try { sessionStorage.setItem("kkn-curtain", "1"); } catch (err) {}
    lockScroll(true);

    /* halangi scroll manual selama tirai masih menutup */
    const block = (e) => e.preventDefault();
    window.addEventListener("wheel", block, { passive: false });
    window.addEventListener("touchmove", block, { passive: false });

    const panels = $$(".curtain__panel");
    const tl = gsap.timeline({
      onComplete: () => {
        curtain.remove();
        window.removeEventListener("wheel", block);
        window.removeEventListener("touchmove", block);
        finish();
      }
    });

    tl.to(".curtain__mid", { opacity: 0, y: -18, duration: 0.5, ease: "power2.in" }, 0.35)
      .to(panels[0], { xPercent: -101, duration: 1.35, ease: "expo.inOut" }, 0.55)
      .to(panels[1], { xPercent:  101, duration: 1.35, ease: "expo.inOut" }, 0.55)
      .to(".hero__eyebrow", { opacity: 1, y: 0, duration: 0.85, ease: "power3.out" }, 1.0)
      .to(".line__in .wi", { yPercent: 0, duration: 1.05, ease: "expo.out", stagger: 0.05 }, 1.0)
      .to(".hero__body", { opacity: 1, y: 0, duration: 0.95, ease: "power3.out" }, 1.32)
      .to(".hero__float figure", { opacity: 1, y: 0, duration: 1.05, ease: "expo.out", stagger: 0.09 }, 1.4)
      .to(".cue", { opacity: 1, y: 0, duration: 0.9, ease: "power3.out" }, 1.55);
  }

  /* pecah judul hero jadi kata supaya bisa reveal per kata (masking) */
  function splitHero() {
    $$(".line__in").forEach((line) => {
      const text = line.textContent.trim();
      line.textContent = "";
      text.split(/\s+/).forEach((word, wi, arr) => {
        const w = el("span", "w");
        w.appendChild(el("span", "wi", word));
        line.appendChild(w);
        if (wi < arr.length - 1) line.appendChild(document.createTextNode(" "));
      });
    });
  }

  /* --------------------------------------------------------------- 4. hero
     Parallax foto kecil: scroll (scrub) + kursor (desktop). */

  function heroParallax() {
    const figs = $$("#heroFloat figure");
    if (!figs.length) return;

    if (hasGSAP && !reduced()) {
      figs.forEach((f) => {
        const depth = parseFloat(f.dataset.depth) || 10;
        gsap.to(f, {
          yPercent: -depth, ease: "none",
          scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
        });
      });
    }

    if (!(fine() && hasGSAP && !reduced())) return;

    const movers = figs.map((f) => {
      const base = parseFloat(getComputedStyle(f).getPropertyValue("rotate")) || 0;
      gsap.set(f, { rotate: base });
      return {
        setX: gsap.quickTo(f, "x", { duration: 1, ease: "power3" }),
        setY: gsap.quickTo(f, "y", { duration: 1, ease: "power3" }),
        setR: gsap.quickTo(f, "rotate", { duration: 1.2, ease: "power3" }),
        base: base,
        depth: (parseFloat(f.dataset.depth) || 10) * 0.5
      };
    });

    window.addEventListener("pointermove", (e) => {
      const cx = e.clientX / window.innerWidth - 0.5;
      const cy = e.clientY / window.innerHeight - 0.5;
      for (let i = 0; i < movers.length; i++) {
        const m = movers[i], d = m.depth;
        m.setX(cx * -d * 2.4);
        m.setY(cy * -d * 1.1);
        m.setR(m.base + cx * 3.2);
      }
    }, { passive: true });
  }

  /* --------------------------------------------------- 5. tumpukan kartu

     BUG YANG DIPERBAIKI
     Semua kartu lama berposition:absolute tanpa z-index, jadi urutan cat
     ditentukan DOM: kartu PERTAMA justru paling bawah. Timeline lama
     berangkat dari kartu pertama, sehingga yang terlihat di layar (kartu
     terakhir) tidak pernah berubah — yang bergerak hanya kartu di
     belakangnya.

     SEKARANG
     Satu state tunggal `active`. Kartu pada `active` selalu data-depth="0"
     (z-index 40 + bayangan terkuat) dan satu-satunya yang keluar. Kartu di
     bawahnya naik satu tingkat. Hanya VIS=4 kartu yang hidup; sisanya tidak
     ada di DOM. Seluruh gambar hanya fungsi dari `active` + `f` (0..1), jadi
     maju dan mundur sama-sama mulus.

     Desktop: section di-pin, progress scroll -> kartu (1 kartu = 50vh scroll).
     HP: tanpa scroll panjang, cukup drag kartu ke samping + tombol.        */

  const Deck = {
    VIS: 4,                                  // kartu yang hidup sekaligus
    active: -1,
    mode: "scroll",
    busy: false,
    suppressClick: false,
    slots: [],
    st: null,
    mm: null,
    viewport: null,
    now: null,
    all: null,
    prevBtn: null,
    nextBtn: null,

    /* keadaan tiap kedalaman (transform saja) */
    DEPTH: [
      { y: 0,  s: 1,     r: 0    },
      { y: 14, s: 0.955, r: -2.4 },
      { y: 27, s: 0.912, r: 2.2  },
      { y: 39, s: 0.874, r: -1.6 }
    ],
    OUT: { xp: 132, y: -34, r: 17, s: 0.86, fade: 1.45 },

    thresh() { return Math.max(56, Math.min(120, window.innerWidth * 0.22)); },
    perCard() { return Math.max(180, Math.round(window.innerHeight * 0.5)); },

    /* tulis transform; jalur tanpa GSAP tetap bisa menggambar kartu diam */
    setT(el2, t) {
      if (!el2) return;
      if (hasGSAP) {
        gsap.set(el2, {
          x: t.x || 0, xPercent: t.xp || 0, y: t.y || 0,
          rotate: t.r || 0, scale: t.s == null ? 1 : t.s,
          opacity: t.o == null ? 1 : t.o
        });
        return;
      }
      const w = el2.offsetWidth || 1;
      el2.style.transform = "translate3d(" + ((t.x || 0) + (t.xp || 0) / 100 * w) +
        "px," + (t.y || 0) + "px,0) rotate(" + (t.r || 0) + "deg) scale(" +
        (t.s == null ? 1 : t.s) + ")";
      el2.style.opacity = (t.o == null ? 1 : t.o);
    },

    slotFor(photo) {
      for (let i = 0; i < this.slots.length; i++) {
        if (this.slots[i].photo === photo) return this.slots[i];
      }
      return null;
    },

    /* slot bebas: yang belum terpakai, atau yang baru disembunyikan sync().
       Dicek lewat data-depth (bukan perbandingan nomor) supaya mundur dari
       49 ke 0 pun tidak menimpa slot yang masih di jendela. */
    spare() {
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i];
        if (s.photo == null || s.li.dataset.depth === "-1") return s;
      }
      return null;
    },

    fill(slot, photo) {
      const p = DATA[DECK[photo]];
      slot.photo = photo;
      slot.li.dataset.photo = String(photo);
      slot.li.setAttribute("aria-label",
        "Foto " + (photo + 1) + " dari " + DECK_N + ", " + p.kategori + ", " + p.tanggal);
      slot.no.textContent = pad2(photo + 1) + " — " + p.kategori;
      slot.date.textContent = p.tanggal;
      slot.img.width = p.w || 1200;
      slot.img.height = p.h || 800;
      if (slot.img.getAttribute("src") === p.src) return;

      if (slot.img.complete && slot.img.naturalWidth > 0) { slot.img.src = p.src; return; }
      if (!hasGSAP) { slot.img.src = p.src; return; }

      /* belum tersimpan di cache: tampilkan setelah selesai, jangan kedip */
      slot.token++;
      const my = slot.token;
      slot.pending = true;
      slot.img.addEventListener("load", () => {
        if (slot.token !== my) return;
        slot.pending = false;
        gsap.to(slot.li, { opacity: 1, duration: 0.4, ease: "power2.out", overwrite: "auto" });
      }, { once: true });
      slot.img.src = p.src;
    },

    /* susun isi + data-depth; z-index & bayangan ikut pindah di sini.
       Kedalaman ditulis langsung saat mengisi supaya spare() tidak mengambil
       slot yang barusan dipakai lagi (dulu ini menimpa isi kartu). */
    sync(active) {
      if (active === this.active) return;
      this.active = active;
      const hi = active + this.VIS - 1;

      /* 1) yang keluar dari jendela disembunyikan (kartu yang tadi keluar) */
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i];
        if (s.photo == null) continue;
        if (s.photo < active || s.photo > hi) {
          s.li.dataset.depth = "-1";
          s.pending = false;
          this.setT(s.li, { o: 0 });
        }
      }
      /* 2) foto yang masuk jendela memakai slot yang baru saja kosong */
      for (let d = 0; d < this.VIS; d++) {
        const photo = active + d;
        if (photo >= DECK_N) break;
        let s = this.slotFor(photo);
        if (!s) { s = this.spare(); if (!s) break; this.fill(s, photo); }
        s.li.dataset.depth = String(d);
      }

      hudSet(active + 1);
      if (this.now) this.now.textContent = pad2(active + 1);
      if (this.prevBtn) {
        this.prevBtn.disabled = active <= 0;
        this.prevBtn.setAttribute("aria-label", "Foto sebelumnya, sekarang " + (active + 1) + " dari " + DECK_N);
      }
      if (this.nextBtn) {
        this.nextBtn.disabled = active >= DECK_N - 1;
        this.nextBtn.setAttribute("aria-label", "Foto berikutnya, sekarang " + (active + 1) + " dari " + DECK_N);
      }
      preload([DATA[DECK[active + this.VIS]], DATA[DECK[active + this.VIS + 1]]]);
    },

    /* f = 0..1 : sejauh apa kartu teratas sudah keluar (scrub scroll) */
    paint(f) {
      for (let i = 0; i < this.slots.length; i++) {
        const sl = this.slots[i];
        const d = parseInt(sl.li.dataset.depth, 10);
        if (!(d >= 0)) continue;
        if (d === 0) {
          const sg = this.outSign(sl.photo);       /* ganjil/genap -> kiri/kanan */
          const e = f * f;                 /* meredup lebih cepat */
          this.setT(sl.li, {
            x: 0, xp: this.OUT.xp * f * sg,
            y: lerp(this.DEPTH[0].y, this.OUT.y, e),
            r: lerp(this.DEPTH[0].r, this.OUT.r * sg, f),
            s: lerp(this.DEPTH[0].s, this.OUT.s, f),
            o: 1 - Math.min(1, f * this.OUT.fade)
          });
        } else {
          this.setT(sl.li, {
            x: 0, xp: 0,
            y: lerp(this.DEPTH[d].y, this.DEPTH[d - 1].y, f),
            r: lerp(this.DEPTH[d].r, this.DEPTH[d - 1].r, f),
            s: lerp(this.DEPTH[d].s, this.DEPTH[d - 1].s, f),
            o: sl.pending ? 0 : 1
          });
        }
      }
    },

    /* p = -1.4..1.4 : kartu teratas mengikuti jari (HP) */
    dragPaint(p, th) {
      const dx = p * th;
      const k = Math.min(1, Math.abs(p));
      for (let i = 0; i < this.slots.length; i++) {
        const sl = this.slots[i];
        const d = parseInt(sl.li.dataset.depth, 10);
        if (!(d >= 0)) continue;
        if (d === 0) {
          this.setT(sl.li, {
            x: dx, xp: 0,
            y: this.DEPTH[0].y + this.OUT.y * 0.22 * k,
            r: clamp(dx * 0.055, -22, 22),
            s: lerp(this.DEPTH[0].s, this.OUT.s, k * 0.7),
            o: 1 - Math.min(1, k * this.OUT.fade)
          });
        } else {
          this.setT(sl.li, {
            x: 0, xp: 0,
            y: lerp(this.DEPTH[d].y, this.DEPTH[d - 1].y, k),
            r: lerp(this.DEPTH[d].r, this.DEPTH[d - 1].r, k),
            s: lerp(this.DEPTH[d].s, this.DEPTH[d - 1].s, k),
            o: sl.pending ? 0 : 1
          });
        }
      }
    },

    top() { return this.slotFor(this.active); },

    /* arah keluar kartu: bergantian kiri-kanan supaya tumpukan zigzag */
    outSign(photo) { return photo % 2 === 0 ? 1 : -1; },

    /* pindah satu langkah (dipakai tombol / keyboard / akhir lemparan) */
    step(dir, animate, done) {
      const n = this.active + dir;
      if (n < 0 || n > DECK_N - 1) { this.paint(0); if (done) done(); return; }
      if (this.mode === "scroll" && this.st) { this.goto(n); if (done) done(); return; }
      if (animate && hasGSAP && !reduced()) {
        if (dir < 0) {
          /* mundur: tarik kartu sebelumnya MASUK dari sisinya (kebalikan dari maju) */
          this.sync(n);
          this.paint(1);
          const back = { f: 1 };
          gsap.to(back, {
            f: 0, duration: 0.5, ease: "power2.inOut",
            onUpdate: () => this.paint(back.f),
            onComplete: () => { this.paint(0); if (done) done(); }
          });
          return;
        }
        const proxy = { f: 0 };
        gsap.to(proxy, {
          f: 1, duration: 0.42, ease: "power2.inOut",
          onUpdate: () => this.paint(proxy.f),
          onComplete: () => { this.sync(n); this.paint(0); if (done) done(); }
        });
        return;
      }
      this.sync(n);
      this.paint(0);
      if (done) done();
    },

    /* --- desktop: scroll di-pin jadi penggerak kartu --- */
    mountScroll() {
      this.mode = "scroll";
      const hint = $(".stack__hint-t");
      if (hint) hint.textContent = "gulir untuk membalik tumpukan";
      this.sync(0);
      this.paint(0);
      if (!hasGSAP || !this.viewport) return function () {};

      const apply = (prog) => {
        const span = Math.max(1, DECK_N - 1);
        const af = clamp(prog * span, 0, span);
        const a = Math.floor(af);
        this.sync(a);
        this.paint(af - a);
      };

      this.st = ST.create({
        trigger: this.viewport,
        start: "top top",
        end: () => "+=" + (this.perCard() * (DECK_N - 1)),
        pin: ".stack__pin",
        pinSpacing: true,
        anticipatePin: 1,
        scrub: 0.55,
        invalidateOnRefresh: true,
        onUpdate: (self) => apply(self.progress),
        onRefresh: (self) => apply(self.progress)
      });
      apply(this.st.progress);

      const hintEl = $(".stack__hint");
      if (hintEl) {
        gsap.to(hintEl, {
          opacity: 0, ease: "none",
          scrollTrigger: { trigger: this.viewport, start: "top top", end: "+=10%", scrub: true }
        });
      }
      return () => { if (this.st) { this.st.kill(); this.st = null; } };
    },

    /* --- HP: drag / lempar, tanpa pin dan tanpa scroll panjang --- */
    mountDrag() {
      this.mode = "drag";
      const hint = $(".stack__hint-t");
      if (hint) hint.textContent = "seret foto ke samping";
      this.sync(0);
      this.paint(0);
      if (!this.viewport) return function () {};

      const self = this;
      let drag = null;

      const onDown = (e) => {
        if (self.busy || LB.open) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (e.target && e.target.closest && e.target.closest(".deckctl")) return;
        if (!self.top()) return;
        const now = performance.now();
        drag = { id: e.pointerId, x0: e.clientX, t0: now, lx: e.clientX, lt: now, v: 0, p: 0 };
        try { self.viewport.setPointerCapture(e.pointerId); } catch (err) {}
        self.busy = true;
      };
      const onMove = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const now = performance.now();
        drag.v = (e.clientX - drag.lx) / Math.max(8, now - drag.lt);
        drag.lx = e.clientX; drag.lt = now;
        drag.p = clamp((e.clientX - drag.x0) / self.thresh(), -1.4, 1.4);
        self.dragPaint(drag.p, self.thresh());
      };
      const onUp = (e, cancelled) => {
        if (!drag) return;
        if (e && e.pointerId != null && e.pointerId !== drag.id) return;
        try { self.viewport.releasePointerCapture(drag.id); } catch (err) {}
        const d = drag;
        drag = null;
        const th = self.thresh();
        const dt = Math.max(1, performance.now() - d.t0);
        const flung = Math.abs(d.v) > 0.42 && Math.abs(d.v) * dt > 24;
        const pass = !cancelled && d.p !== 0 && (Math.abs(d.p) * th > th * 0.9 || flung);
        const dir = d.p < 0 ? 1 : -1;

        /* sentuhan yang benar-benar menggeser jangan ikut jadi "tap maju" */
        if (Math.abs(d.p) * th > 8) {
          self.suppressClick = true;
          setTimeout(() => { self.suppressClick = false; }, 60);
        }

        if (!hasGSAP || d.p === 0) {
          self.busy = false;
          if (pass) self.step(dir); else self.paint(0);
          return;
        }
        if (pass && dir < 0) {
          /* geser balik: luncurkan kartu ke tengah dulu, lalu tarik yang sebelumnya masuk */
          const proxy = { p: d.p };
          gsap.to(proxy, {
            p: 0, duration: 0.16, ease: "power2.out",
            onUpdate: () => self.dragPaint(proxy.p, th),
            onComplete: () => self.step(-1, true, () => { self.busy = false; })
          });
          return;
        }
        const proxy = { p: d.p };
        if (pass) {
          gsap.to(proxy, {
            p: self.outSign(self.active) * 1.15, duration: 0.3, ease: "power2.in",
            onUpdate: () => self.dragPaint(proxy.p, th),
            onComplete: () => { self.busy = false; self.step(dir); }
          });
        } else {
          gsap.to(proxy, {
            p: 0, duration: 0.8, ease: "elastic.out(1, 0.55)",
            onUpdate: () => self.dragPaint(proxy.p, th),
            onComplete: () => { self.busy = false; self.paint(0); }
          });
        }
      };

      const down = (e) => onDown(e);
      const move = (e) => onMove(e);
      const up = (e) => onUp(e, false);
      const cancel = (e) => onUp(e, true);
      this.viewport.addEventListener("pointerdown", down);
      this.viewport.addEventListener("pointermove", move);
      this.viewport.addEventListener("pointerup", up);
      this.viewport.addEventListener("pointercancel", cancel);
      return () => {
        this.viewport.removeEventListener("pointerdown", down);
        this.viewport.removeEventListener("pointermove", move);
        this.viewport.removeEventListener("pointerup", up);
        this.viewport.removeEventListener("pointercancel", cancel);
      };
    },

    /* klik: kartu teratas maju, kartu terkubur langsung dipromosikan */
    bind() {
      const vp = this.viewport;
      if (vp) {
        vp.addEventListener("click", (e) => {
          if (LB.open) return;
          if (this.suppressClick) { this.suppressClick = false; return; }
          const t = e.target;
          const card = t && t.closest ? t.closest(".deck__card") : null;
          if (!card) return;
          if (this.mode === "drag") { this.step(1, true); return; }
          const d = parseInt(card.dataset.depth, 10);
          this.goto(d === 0 ? this.active + 1 : parseInt(card.dataset.photo, 10));
        });
      }
      if (this.prevBtn) this.prevBtn.addEventListener("click", () => this.step(-1, true));
      if (this.nextBtn) this.nextBtn.addEventListener("click", () => this.step(1, true));

      document.addEventListener("keydown", (e) => {
        if (LB.open || e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const r = this.viewport ? this.viewport.getBoundingClientRect() : null;
        if (!r || r.bottom < window.innerHeight * 0.5 || r.top > window.innerHeight * 0.6) return;
        e.preventDefault();
        this.step(e.key === "ArrowRight" ? 1 : -1, this.mode === "drag");
      });
    },

    /* scroll halus ke kartu tertentu (hanya mode scroll) */
    goto(photo) {
      const n = clamp(photo, 0, DECK_N - 1);
      if (this.mode === "drag") { this.sync(n); this.paint(0); return; }
      if (!this.st) { this.sync(n); this.paint(0); return; }
      /* +2px: berhenti tepat di batas kartu bikin floor() ragu, jadi lewati sedikit */
      const y = this.st.start + n * this.perCard() + 2;
      if (smooth) smooth.scrollTo(y, { duration: 0.85 });
      else window.scrollTo({ top: y, behavior: reduced() ? "auto" : "smooth" });
    }
  };

  function stackCards() {
    Deck.viewport = $("#stackViewport");
    Deck.now   = $("#deckNow");
    Deck.all   = $("#deckAll");
    Deck.prevBtn = $("#deckPrev");
    Deck.nextBtn = $("#deckNext");
    if (Deck.all) Deck.all.textContent = pad2(DECK_N);
    Deck.active = -1;
    if (!Deck.slots.length) renderDeck();
    Deck.bind();
    if (!hasGSAP) {
      Deck.sync(0);
      Deck.paint(0);
      return;
    }
    /* mode berganti sendiri saat layar melintasi 768px / perangkat berubah input */
    Deck.mm = gsap.matchMedia();
    Deck.mm.add("(min-width: 769px)", () => (phone() ? Deck.mountDrag() : Deck.mountScroll()));
    Deck.mm.add("(max-width: 768px)", () => Deck.mountDrag());
  }

  /* ------------------------------------------------------------ 6. masonry
     Reveal clip-path (tirai kecil dari kanan) + stagger saat masuk viewport.
     Hanya desktop; di HP digantikan baris film. */

  function wallReveal() {
    const grid = $("#wallGrid");
    if (!grid) return;
    const items = $$(".shot", grid);
    if (!items.length || mqPhone.matches) return;

    if (!hasGSAP || reduced()) {
      items.forEach((it) => it.classList.add("is-seen"));
      return;
    }

    items.forEach((it) => {
      ST.create({
        trigger: it,
        start: "top 88%",
        once: true,
        onEnter: (self) => {
          gsap.to(it, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.15, ease: "expo.out" });
          it.classList.add("is-seen");
          self.kill();   /* sudah beres, jangan dibiarkan aktif */
        }
      });
    });
  }

  /* masonry dipaksakan tampil penuh kalau jendela dilebihkan ke mode desktop */
  function wallFallback() {
    if (mqPhone.matches || !wallGrid) return;
    $$(".shot", wallGrid).forEach((s) => {
      s.classList.add("is-seen");
      if (hasGSAP) gsap.set(s, { clipPath: "inset(0% 0% 0% 0%)" });
      else s.style.clipPath = "none";
    });
  }

  /* ------------------------------------------------- 5b. jemuran (tali)

     Tali lurus membentang, foto sebagai frame landscape digantung di dua
     jepitan kayu. Setiap frame adalah bandul dengan titik putar di jepitannya.

     FISIKA (bukan keyframes)
     Satu integrator spring-damper per frame, dijalankan di requestAnimationFrame:

         a'' = -K·a - C·a' + angin(t)

     Sudut a dalam derajat, K konstanta pegas, C redaman. Karena gaya bergantung
     pada kecepatan geser, melepas drag akan membuat frame berayun balik
     beberapa kali lalu meredam sendiri. Angin idle ditambahkan sebagai gaya
     luar dengan fase berbeda per frame supaya tidak serempak.

     Gelombang angin: setiap dorongan masuk antrean per frame dengan delay
     sebanding jaraknya dari titik tengah, jadi efeknya menyapu dari tengah ke
     luar — persis seperti angin yang lewat di tali.

     Performa: hanya 7 frame yang ada di DOM (pool yang dipinjam ulang), sisanya
     tidak pernah dibuat. Loop RAF hanya hidup saat section terlihat.        */

  const ROPE_Y = 34;   /* letak garis tali, px dari atas panggung        */
  const PEG    = 18;   /* jarak tali ke atas bingkai foto                 */
  const ROPE_SAG = 22; /* setengah kedalaman lengkungan tali (px)          */

  const Rope = {
    K: 62,         /* konstanta pegas  -> periode ayunan ~0,8 detik     */
    C: 2.85,       /* redaman: rasio redaman ~0,18 => ±4 ayunan meredam  */
    KICK: 300,     /* dorongan sudut (derajat/detik) per kecepatan geser */
    MAX_A: 12,     /* batas sudut bandul (derajat)                      */
    SLOTS: 7,      /* jumlah frame yang hidup di DOM                    */

    section: null, stage: null, track: null,
    strand: null, shade: null, twist: null,
    chips: null, chipList: [], now: null, all: null,
    prevBtn: null, nextBtn: null, hint: null,

    idxs: [],      /* indeks DATA yang sedang dijemur                  */
    cat: "",
    pos: 0,        /* posisi desimal: 0 = frame pertama di tengah       */
    vel: 0,        /* kecepatan, frame/detik                           */
    target: null,  /* tujuan eksplisit dari tombol (null = inersia bebas) */
    step: 1, half: 1, w: 1, cw: 200,
    slots: [],
    last: 0, raf: 0, running: false, seen: false,
    dragging: false, suppressClick: false, moved: 0,
    rope: { off: 0, vo: 0, sag: ROPE_SAG, vs: 0, target: 0 },
    swap: null,
    io: null,

    /* ---------------------------------------------------------- kerangka */

    build() {
      this.section = $("#jemuran");
      this.stage   = $("#ropeStage");
      this.track   = $("#ropeTrack");
      this.strand  = $("#ropeStrand");
      this.shade   = $("#ropeShade");
      this.twist   = $("#ropeTwist");
      this.chips   = $("#ropeChips");
      this.now     = $("#ropeNow");
      this.all     = $("#ropeAll");
      this.prevBtn = $("#ropePrev");
      this.nextBtn = $("#ropeNext");
      this.hint    = $("#ropeHint");
      if (!this.stage || !this.track) return;

      this.makeSlots();
      this.makeChips();
      this.measure();
      this.setList("", true);
      this.bind();

      /* loop hanya hidup saat section terlihat di layar */
      if ("IntersectionObserver" in window) {
        this.io = new IntersectionObserver((es) => {
          this.seen = es[0].isIntersecting;
          if (this.seen && !reduced()) this.start(); else this.stop();
        }, { rootMargin: "120px 0px" });
        this.io.observe(this.stage);
      } else {
        this.seen = true;
        this.start();
      }
    },

    makeSlots() {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < this.SLOTS; i++) {
        const li = el("li", "cloth");
        li.hidden = true;

        const clips = el("span", "cloth__clips");
        clips.setAttribute("aria-hidden", "true");
        clips.appendChild(el("i", "clip clip--l"));
        clips.appendChild(el("i", "clip clip--r"));

        const swing = el("div", "cloth__swing");
        const print = el("figure", "cloth__print");
        print.style.margin = "0";
        const im = new Image();
        im.className = "cloth__shot";
        im.decoding = "async";
        im.loading = "lazy";
        im.alt = "";
        const cap = el("figcaption", "cloth__cap");
        const no = el("b");
        const date = el("span");
        cap.appendChild(no);
        cap.appendChild(date);
        const txt = el("p", "cloth__note");
        print.appendChild(im);
        print.appendChild(cap);
        print.appendChild(txt);
        swing.appendChild(print);
        li.appendChild(clips);
        li.appendChild(swing);
        li.dataset.photo = "-1";
        frag.appendChild(li);
        this.slots.push({
          li: li, swing: swing, print: print, img: im,
          no: no, date: date, txt: txt,
          idx: null, a: 0, v: 0, q: [], ph: 0, wind: 0, w1: 0, w2: 0
        });
      }
      this.track.appendChild(frag);
    },

    /* chip kategori diambil dari data, jadi tidak perlu diubah manual */
    makeChips() {
      if (!this.chips) return;
      const cats = [];
      DATA.forEach((p) => { if (cats.indexOf(p.kategori) < 0) cats.push(p.kategori); });
      const self = this;
      const add = (label, n, cat) => {
        const b = el("button", "chip");
        b.type = "button";
        b.appendChild(el("span", null, label));
        b.appendChild(el("b", null, String(n)));
        b.setAttribute("aria-pressed", cat === "" ? "true" : "false");
        b.addEventListener("click", () => {
          if (self.cat === cat) return;
          self.chipList.forEach((c) => c.setAttribute("aria-pressed", "false"));
          b.setAttribute("aria-pressed", "true");
          self.setList(cat);
        });
        self.chips.appendChild(b);
        self.chipList.push(b);
      };
      add("Semua", DATA.length, "");
      cats.forEach((c) => {
        let n = 0;
        DATA.forEach((p) => { if (p.kategori === c) n++; });
        add(c, n, c);
      });
    },

    /* Lebar frame + tinggi panggung ditulis lewat custom property supaya CSS
       tidak punya angka yang berbeda dengan perhitungan JS. */
    measure() {
      const w = this.stage.clientWidth || window.innerWidth;
      const small = phone();
      let cw = small
        ? Math.min(Math.round(w * 0.66), 268)
        : Math.min(Math.round(w * 0.21), 236);
      cw = Math.max(cw, small ? 132 : 150);
      const photo = Math.round(cw * 0.75);
      this.w = w;
      this.cw = cw;
      this.half = cw / 2;
      this.step = Math.round(cw * (small ? 1.14 : 1.34));
      this.stage.style.setProperty("--cloth-w", cw + "px");
      this.stage.style.setProperty("--cloth-photo", photo + "px");
      this.stage.style.height = (ROPE_Y + PEG + photo + 72 + 26) + "px";
      this.paintRope(0.016, 0);
    },

    /* ------------------------------------------------------------ isi frame */

    slotFor(n) {
      for (let i = 0; i < this.slots.length; i++) if (this.slots[i].idx === n) return this.slots[i];
      return null;
    },

    fill(s, n, drop) {
      const i = this.idxs[n];
      const p = DATA[i];
      if (!p) return;
      s.idx = n;
      /* fase angin & kemiringan awal tetap per foto, bukan per slot */
      s.ph   = hash32("p" + i) * 6.2832;
      s.wind = 15 + hash32("w" + i) * 12;
      s.w1   = 0.72 + hash32("f" + i) * 0.55;
      s.w2   = 0.28 + hash32("g" + i) * 0.24;
      s.q.length = 0;

      s.li.dataset.photo = String(i);
      s.li.dataset.pos = String(n);
      s.li.setAttribute("aria-label",
        "Foto " + (i + 1) + " — " + p.kategori + ", " + p.tanggal + ". Buka foto.");
      s.img.width = p.w || 1200;
      s.img.height = p.h || 800;
      if (s.img.getAttribute("src") !== p.src) s.img.src = p.src;
      s.no.textContent = pad2(i + 1) + " · " + p.kategori;
      s.date.textContent = p.tanggal;
      s.txt.textContent = p.caption;
      s.li.hidden = false;

      if (drop && !reduced()) {
        s.print.classList.remove("is-in");
        void s.print.offsetWidth;          /* paksa mulai ulang animasi */
        s.print.classList.add("is-in");
      } else {
        s.print.classList.add("is-in");
      }
    },

    /* hanya 7 frame hidup: isi slot kosong di sekitar titik tengah, sisanya
       dilepas dari DOM (hidden). Dipanggil tiap kali pos berubah. */
    sync() {
      if (!this.idxs.length) return;
      const c = Math.round(this.pos);
      const want = [];
      for (let k = -3; k <= 3; k++) {
        const n = c + k;
        if (n >= 0 && n < this.idxs.length) want.push(n);
      }
      const held = new Set();
      want.forEach((n) => { const s = this.slotFor(n); if (s) held.add(s); });
      const pool = this.slots.filter((s) => !held.has(s));
      want.forEach((n) => {
        if (this.slotFor(n)) return;
        const s = pool.shift();
        if (s) this.fill(s, n, true);
      });
      this.slots.forEach((s) => {
        if (s.idx != null && want.indexOf(s.idx) < 0) { s.idx = null; s.li.hidden = true; }
      });
      this.count();
      /* loop rAF sengaja tidak hidup saat reduced-motion, jadi posisi frame
         harus dihitung sekali di sini; kalau tidak, semua foto menumpuk. */
      if (reduced()) this.layout();
    },

    /* Tata letak tanpa animasi: pakai rumus yang sama dengan paintFrames
       supaya angka tidak berbeda antara mode gerak dan mode diam. */
    layout() {
      const cx = this.w / 2;
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i];
        if (s.idx == null) continue;
        s.a = 0;
        s.v = 0;
        s.q.length = 0;
        const x = cx + (s.idx - this.pos) * this.step - this.half;
        s.li.style.transform = "translate3d(" + x.toFixed(1) + "px,0,0)";
        s.li.style.opacity = "1";
        s.li.style.zIndex = String(40 - Math.min(39, Math.round(Math.abs(s.idx - this.pos) * 6)));
      }
      this.paintRope(0.016, 0);
    },

    count() {
      const n = clamp(Math.round(this.pos), 0, Math.max(0, this.idxs.length - 1));
      if (this.now) this.now.textContent = pad2(n + 1);
      if (this.all) this.all.textContent = String(this.idxs.length);
      if (this.prevBtn) this.prevBtn.disabled = n <= 0;
      if (this.nextBtn) this.nextBtn.disabled = n >= this.idxs.length - 1;
    },

    /* --------------------------------------------------------------- gerak */

    /* dorongan sudut dari kecepatan geser;.delay per frame = jarak dari
       titik tengah -> gelombang angin menyapu dari tengah ke luar */
    kick(vPxPerMs) {
      const dir = clamp(vPxPerMs / 1.1, -1.5, 1.5);
      if (Math.abs(dir) < 0.06) return;
      const now = performance.now() / 1000;
      this.slots.forEach((s) => {
        if (s.idx == null) return;
        const d = Math.abs(s.idx - this.pos);
        s.q.push({ t: now + 0.014 * d + hash32("k" + s.idx) * 0.03,
                   a: dir * this.KICK * (1 - 0.07 * d) });
      });
      this.rope.vo += dir * 2.2;
      this.rope.vs += dir * 9;
    },

    setPos(p) {
      const max = Math.max(0, this.idxs.length - 1);
      this.pos = clamp(p, 0, max);
      this.sync();
    },

    /* tombol / keyboard: lompat satu langkah lalu berayun.
       Inersia murni tidak bisa diandalkan untuk ini: kecepatan yang cukup
       untuk terlihat berayun akan memudar sebelum jarak satu langkah, lalu
       snap balik ke frame yang sama. Jadi tombol memakai target eksplisit
       yang dikejar di drift(), sementara seretan tetap pakai inersia. */
    goTo(n) {
      const target = clamp(Math.round(n), 0, Math.max(0, this.idxs.length - 1));
      const d = target - this.pos;
      if (Math.abs(d) < 0.002) return;
      this.target = target;
      this.vel = clamp(d * 1.5, -9, 9);
      this.kick(this.vel * this.step / 1000 * 0.6);
    },

    /* dasar untuk langkah berikutnya: kalau animasi masih berjalan, pakai
       tujuan yang sedang dikejar. Tanpa ini, tiga klik cepat akan menghitung
       dari posisi yang sama dan hanya menghasilkan satu langkah. */
    stepBase() { return this.target != null ? this.target : Math.round(this.pos); },

    stepDir(dir) { this.goTo(this.stepBase() + dir); },

    /* ---------------------------------------------------------- loop utama */

    start() {
      if (this.running) return;
      this.running = true;
      const self = this;
      const frame = function (t) {
        if (!self.running) return;
        self.raf = requestAnimationFrame(frame);
        self.tick(t);
      };
      this.raf = requestAnimationFrame(frame);
    },

    stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    },

    tick(ms) {
      const now = ms / 1000;
      let dt = this.last ? now - this.last : 1 / 60;
      this.last = now;
      if (dt > 0.05) dt = 0.05;
      if (dt <= 0) return;

      if (!this.dragging) this.drift(dt);
      this.paintFrames(dt, now);
      this.paintRope(dt, now);
    },

    /* lepas drag: meluncur, melambat, lalu menempel ke frame terdekat */
    drift(dt) {
      /* target eksplisit dari tombol/keyboard: dikejar dengan ease-out
         lalu berhenti tepat di sana, tanpa snap balik seperti inersia. */
      if (this.target != null) {
        const k = 1 - Math.exp(-11 * dt);
        this.pos += (this.target - this.pos) * k;
        this.vel *= Math.exp(-9 * dt);
        if (Math.abs(this.target - this.pos) < 0.002) {
          this.pos = this.target;
          this.vel = 0;
          this.target = null;
        }
        this.sync();
        return;
      }
      if (Math.abs(this.vel) > 0.00002) {
        this.pos += this.vel * dt;
        this.vel *= Math.exp(-5.4 * dt);
      }
      const near = Math.round(this.pos);
      if (Math.abs(this.vel) < 0.9) {
        const k = 1 - Math.exp(-9 * dt);
        this.pos += (near - this.pos) * k;
      }
      const max = Math.max(0, this.idxs.length - 1);
      if (this.pos <= 0) { this.pos = 0; this.vel = 0; }
      if (this.pos >= max) { this.pos = max; this.vel = 0; }
      const done = Math.abs(this.pos - near) < 0.0015 && Math.abs(this.vel) < 0.02;
      if (done) { this.pos = near; this.vel = 0; }
      this.sync();
    },

    paintFrames(dt, now) {
      const cx = this.w / 2;
      const sw = this.swap;
      let swapK = -1;
      if (sw) {
        swapK = clamp((now - sw.t0) / 0.4, 0, 1);
        if (swapK >= 1 && !sw.done) { sw.done = true; this.reload(sw.cat); }
      }
      const ease = 1 - Math.pow(1 - swapK, 3);

      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i];
        if (s.idx == null) continue;

        /* antrean dorongan: yang jatuh tempo Adds ke kecepatan sudut */
        while (s.q.length && s.q[0].t <= now) s.v += s.q.shift().a;

        /* integrator: sub-step kecil supaya tetap stabil saat frame jatuh */
        let left = dt;
        while (left > 0) {
          const h = Math.min(left, 1 / 120);
          left -= h;
          const breeze = reduced() ? 0
            : s.wind * (Math.sin(now * s.w1 + s.ph) + 0.45 * Math.sin(now * s.w2 + s.ph * 1.7));
          const acc = -this.K * s.a - this.C * s.v + breeze;
          s.v += acc * h;
          s.a += s.v * h;
          if (s.a > this.MAX_A) { s.a = this.MAX_A; if (s.v > 0) s.v *= -0.22; }
          else if (s.a < -this.MAX_A) { s.a = -this.MAX_A; if (s.v < 0) s.v *= -0.22; }
        }

        /* bandul: sudut ikut menggeser sedikit badan bingkai ke bawah */
        const swing = Math.sin(s.a * 0.0174533) * 22;
        let x = cx + (s.idx - this.pos) * this.step - this.half + swing;
        let op = 1;
        if (swapK >= 0) {
          x += sw.dir * ease * this.step * 1.7;
          op = 1 - swapK;
        }
        s.li.style.transform = "translate3d(" + x.toFixed(1) + "px,0,0)";
        s.swing.style.transform = "rotate(" + s.a.toFixed(3) + "deg)";
        s.li.style.opacity = op.toFixed(3);
        s.li.style.zIndex = String(40 - Math.min(39, Math.round(Math.abs(s.idx - this.pos) * 6)));
      }
    },

    /* tali ikut bereaksi: titik terendah bergeser searah drag, lalu berayun
       kembali ke tengah; kelonjongan membesar sebentar saat ada dorongan. */
    paintRope(dt, now) {
      const r = this.rope;
      r.vo += (-34 * r.off - 7.2 * r.vo) * dt;
      r.off += r.vo * dt;
      const target = ROPE_SAG + Math.abs(r.vo) * 2.6 + Math.abs(this.vel) * 18 + Math.abs(r.off) * 0.22;
      r.vs += (46 * (target - r.sag) - 8 * r.vs) * dt;
      r.sag += r.vs * dt;
      if (r.sag < 4) { r.sag = 4; r.vs = 0; }
      const cx = 500 + r.off * 1000 / Math.max(1, this.w);
      const d = "M0 " + ROPE_Y + " Q " + cx.toFixed(1) + " " + (ROPE_Y + r.sag * 2).toFixed(1) +
                " 1000 " + ROPE_Y;
      if (this.strand) this.strand.setAttribute("d", d);
      if (this.shade) this.shade.setAttribute("d", d);
      if (this.twist) this.twist.setAttribute("d", d);
    },

    /* ------------------------------------------------- daftar & pergantian */

    pool(cat) {
      const out = [];
      DATA.forEach((p, i) => { if (!cat || p.kategori === cat) out.push(i); });
      return out;
    },

    setList(cat, silent) {
      this.cat = cat;
      if (silent || reduced()) { this.reload(cat); return; }
      /* frame lama tertiup ke samping, baru masuk satu per satu */
      const self = this;
      this.vel = 0;
      this.swap = { t0: performance.now() / 1000, dir: cat === "" ? 1 : (this.rope.target > 0 ? -1 : 1), cat: cat, done: false };
      if (!this.running) {
        /* loop mati (section di luar layar): jangan tunggu animasi */
        this.slots.forEach((s) => { s.idx = null; s.li.hidden = true; });
        this.reload(cat);
      }
      this.kick(this.rope.target > 0 ? -1.2 : 1.2);
    },

    reload(cat) {
      this.swap = null;
      this.slots.forEach((s) => { s.idx = null; s.li.hidden = true; });
      this.idxs = this.pool(cat);
      this.pos = 0;
      this.vel = 0;
      this.target = null;
      this.rope.target = 0;
      if (this.all) this.all.textContent = String(this.idxs.length);
      const self = this;
      this.sync();
      /* masuknya bertahap: frame tengah tiba sedikit demi sedikit */
      for (let k = 1; k <= 3; k++) {
        if (k >= this.idxs.length) break;
        setTimeout(function () { self.sync(); }, k * 65);
      }
    },

    /* ------------------------------------------------------------- kendali */

    bind() {
      const self = this;
      const stage = this.stage;

      if (this.hint) {
        this.hint.textContent = phone()
          ? "swipe foto ke samping"
          : "seret ke samping, atau pakai tombol panah";
      }

      /* --- drag / swipe: posisi mengikuti jari, kecepatan dicatat --------- */
      let drag = null;
      const down = function (e) {
        if (LB.open) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const t = e.target;
        if (t && t.closest && t.closest(".ropebtn, .chip")) return;
        const now = performance.now();
        drag = { id: e.pointerId, x0: e.clientX, p0: self.pos,
                 lx: e.clientX, lt: now, v: 0 };
        self.dragging = true;
        self.target = null;
        self.moved = 0;
        self.vel = 0;
        try { stage.setPointerCapture(e.pointerId); } catch (err) {}
        stage.classList.add("is-drag");
      };
      const move = function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        const now = performance.now();
        const inst = (e.clientX - drag.lx) / Math.max(8, now - drag.lt);
        drag.v = drag.v * 0.62 + inst * 0.38;
        drag.lx = e.clientX; drag.lt = now;
        const dx = e.clientX - drag.x0;
        self.moved = Math.max(self.moved, Math.abs(dx));
        self.rope.target = clamp(-dx * 0.06, -70, 70);
        /* dorongan kecil tiap gerak, bukan hanya saat dilepas: begitu juga
           kain di tangan, tertinggal sebentar lalu tertusuk ke depan */
        self.kick(-inst * 0.34);
        self.setPos(drag.p0 - dx / self.step);
      };
      const end = function (e) {
        if (!drag || (e && e.pointerId != null && e.pointerId !== drag.id)) return;
        try { stage.releasePointerCapture(drag.id); } catch (err) {}
        const v = drag.v;
        drag = null;
        self.dragging = false;
        stage.classList.remove("is-drag");
        self.rope.target = 0;
        self.vel = clamp(v * 1000 / self.step, -15, 15);
        self.kick(v);
        if (self.moved > 6) {
          self.suppressClick = true;
          setTimeout(function () { self.suppressClick = false; }, 80);
        }
      };
      stage.addEventListener("pointerdown", down);
      stage.addEventListener("pointermove", move);
      stage.addEventListener("pointerup", end);
      stage.addEventListener("pointercancel", end);

      /* --- scroll horizontal (desktop): hanya kalau jelas mendatar ------- */
      stage.addEventListener("wheel", function (e) {
        const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX
                 : (e.shiftKey ? e.deltaY : 0);
        if (!dx) return;
        if (e.cancelable) { e.preventDefault(); e.stopPropagation(); }
        self.vel = 0;
        self.setPos(self.pos + dx / self.step * 1.15);
        self.kick(dx / 42);
      }, { passive: false });

      /* --- klik frame tengah -> lightbox yang sudah ada ------------------- */
      stage.addEventListener("click", function (e) {
        if (LB.open) return;
        if (self.suppressClick) { self.suppressClick = false; return; }
        const li = e.target && e.target.closest ? e.target.closest(".cloth") : null;
        if (!li || li.hidden) return;
        /* yang dibandingkan harus nomor urut di daftar hasil filter, bukan
           index data asli, supaya "klik tengah" tetap kena saat kategori aktif. */
        const n = parseInt(li.dataset.pos, 10);
        if (isNaN(n)) return;
        const d = Math.abs(n - self.pos);
        if (d > 0.6) { self.goTo(n); return; }
        const i = clamp(Math.round(self.pos), 0, self.idxs.length - 1);
        const s = self.slotFor(i);
        if (s) lbOpen(self.idxs[i], s.img, self.idxs);
      });

      if (this.prevBtn) this.prevBtn.addEventListener("click", function () { self.stepDir(-1); });
      if (this.nextBtn) this.nextBtn.addEventListener("click", function () { self.stepDir(1); });

      document.addEventListener("keydown", function (e) {
        if (LB.open || Madd.modalOpen()) return;
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        if (document.activeElement && document.activeElement.closest &&
            document.activeElement.closest("input, textarea")) return;
        const r = self.section ? self.section.getBoundingClientRect() : null;
        if (!r || r.bottom < window.innerHeight * 0.4 || r.top > window.innerHeight * 0.6) return;
        e.preventDefault();
        self.stepDir(e.key === "ArrowRight" ? 1 : -1);
      });

      let rz = 0;
      window.addEventListener("resize", function () {
        clearTimeout(rz);
        rz = setTimeout(function () {
          self.measure();
          self.sync();
        }, 160);
      }, { passive: true });
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { self.measure(); self.sync(); });
      }
    }
  };


  /* ------------------------------------------------- 5b-2. rol film (HP)

     Dua strip negatif film yang masuk bergantian: rol 1 dari kiri ke kanan,
     rol 2 dari kanan ke kiri. Semuanya digerakkan scroll, tidak ada timer,
     tidak ada klik, tidak ada kursor kustom.

     RENCANA PROGRESS (0 sampai 1):
        0,00 - 0,15   area kosong cream, hanya baris petunjuk "gulir pelan"
        0,15 - 0,50   rol 1 bergerak, ujung kirinya menempel di tepi kiri
        0,50 - 0,58   jeda
        0,58 - 0,90   rol 2 bergerak, ujung kanannya menempel di tepi kanan
        0,90 - 1,00   tahan, lalu pin dilepas

     Timeline scrubbed sepanjang 1 unit, jadi tiap tahap cukup ditulis sebagai
     durasi relatif terhadap 1. scrub 0,6 membuat gerakan mengikuti jari dan
     otomatis mundur lagi kalau scroll naik. Sisa panjang scroll 350vh.

     SKEW DARI KECEPATAN: ScrollTrigger.getVelocity() memberi px/detik; nilainya
     dijepit maksimum 4 derajat. Tick GSAP merapikan/menurunkan nilainya lagi
     supaya kembali nol begitu scroll berhenti.

     PARALLAX FOTO: tiap gambar digeser 8px berlawanan arah gerak strip
     (hanya transform). Bingkainya tetap rapat karena gambar dibuat 18px lebih
     lebar dari frame.

     Desktop (> 768px): build() langsung berhenti sebelum membuat satu pun
     elemen gambar, jadi tidak ada request gambar di layar lebar.                */

  const FILM_FRAMES = 14;      /* total foto: 7 di rol 1 + 7 di rol 2        */
  const FILM_TILT   = [-1.5, 1.2];
  const FILM_SKEW   = 4;       /* derajat, batas atas miring saat cepat      */
  const FILM_DRIFT  = 8;       /* px pergeseran foto di dalam frame          */

  /* tulisan tepi film, isi dekoratif: nomor seri, tipe film, nomor frame */
  const FILM_EDGE = [
    ["KKN 400", "12A", "PAN 400", "KKN 400", "12B", "400"],
    ["KKN 400", "24A", "PAN 400", "KKN 400", "24B", "400"]
  ];

  /* tulis transform langsung, dipakai kalau GSAP gagal dimuat */
  function still(node, x, tilt) {
    node.style.transform = "translate3d(" + Math.round(x) + "px,0,0) rotate(" + tilt + "deg)";
  }

  const Film = {
    section: null, pin: null, cue: null,
    r1: null, r2: null,
    tl: null, st: null, tick: null, io: null,
    sk: 0, live: false, done: false, wasPhone: null,

    /* -------------------------------------------------------------- kerangka */

    build() {
      this.section = $("#rolfilm");
      this.pin  = $("#filmPin");
      this.cue  = $("#filmCue");
      if (!this.section || !this.pin || this.live) return;
      this.wasPhone = mqPhone.matches;
      if (!this.wasPhone) return;   /* di desktop bagian ini tidak ada */
      this.live = true;
      this.mount();
    },

    /* 14 foto: yang bertanda film:true (urutan file), atau 14 pertama.
       Kalau yang ditandai kurang, sisanya diisi dari foto yang belum dipakai. */
    picks() {
      const marked = [], rest = [];
      DATA.forEach(function (p, i) { (p.film === true ? marked : rest).push(i); });
      return marked.concat(rest).slice(0, FILM_FRAMES).map(function (i) { return DATA[i]; });
    },

    /* satu roll: dua baris perforasi, dua baris tulisan tepi, 7 frame foto */
    strip(no, photos, first) {
      const host = no === 1 ? $("#filmRoll1") : $("#filmRoll2");
      const node = host || el("div", "film__roll film__roll--" + no);
      node.textContent = "";
      node.setAttribute("aria-hidden", "true");

      const perfTop = el("span", "film__perf film__perf--t");
      const perfBot = el("span", "film__perf film__perf--b");
      perfTop.setAttribute("aria-hidden", "true");
      perfBot.setAttribute("aria-hidden", "true");
      node.appendChild(perfTop);
      node.appendChild(perfBot);

      const edge = el("span", "film__edge film__edge--t");
      const edgeB = el("span", "film__edge film__edge--b");
      FILM_EDGE[no - 1].forEach(function (t) {
        edge.appendChild(el("span", null, t));
        edgeB.appendChild(el("span", null, t));
      });
      edge.setAttribute("aria-hidden", "true");
      edgeB.setAttribute("aria-hidden", "true");
      node.appendChild(edge);
      node.appendChild(edgeB);

      const frames = el("div", "film__frames");
      const imgs = [];
      photos.forEach(function (p, k) {
        const no2 = first + k;
        const fr = el("figure", "film__fr");
        fr.style.margin = "0";
        const im = new Image();
        im.decoding = "async";
        im.loading = "lazy";
        im.alt = "";                              /* label dibawa aria-hidden */
        im.width = 480;                           /* frame tampil sekitar 190px */
        im.height = 320;
        im.src = (p && p.small) || p.src;         /* small: versi 480px,kalau ada */
        fr.appendChild(im);
        fr.appendChild(el("figcaption", "film__no", pad2(no2)));
        frames.appendChild(fr);
        imgs.push(im);
      });
      node.appendChild(frames);

      return { node: node, imgs: imgs, dir: no === 1 ? 1 : -1, tilt: FILM_TILT[no - 1] };
    },

    mount() {
      const self = this;
      const photos = this.picks();
      const half = Math.ceil(photos.length / 2);
      this.r1 = this.strip(1, photos.slice(0, half), 1);
      this.r2 = this.strip(2, photos.slice(half, photos.length), half + 1);

      if (this.r1.imgs.length && this.r1.imgs[0].addEventListener) {
        this.r1.imgs[0].addEventListener("load", once);
        this.r2.imgs[0].addEventListener("load", once);
      }
      function once() {
        self.r1.imgs[0].removeEventListener("load", once);
        self.r2.imgs[0].removeEventListener("load", once);
        if (ST) ST.refresh();
      }

      /* Foto dimuat malas sesuai permintaan, tapi section ini baru bisa dicapai
         setelah Jemuran jauh di atas. Diamkan dulu dari rootMargin 200vh supaya
         semua frame sudah ada di cache saat roll mulai jalan, tanpa menarik 14
         gambar sejak halaman dibuka. */
      if ("IntersectionObserver" in window) {
        this.io = new IntersectionObserver(function (es) {
          if (!es[0].isIntersecting) return;
          preload(self.picks());
          self.io.disconnect();
          self.io = null;
        }, { rootMargin: "200% 0px" });
        this.io.observe(this.section);
      }

      if (!hasGSAP || reduced()) { this.rest(); return; }
      this.play();
    },

    /* tanpa GSAP, atau untuk prefers-reduced-motion: dua roll ditumpuk diam,
       roll 1 menempel tepi kiri, roll 2 tepi kanan. Tidak ada pin sama sekali. */
    rest() {
      const a = this.r1.node, b = this.r2.node;
      const x2 = window.innerWidth - b.offsetWidth;
      this.sk = 0;
      if (this.cue) this.cue.style.opacity = "0";
      if (hasGSAP) {
        gsap.set(a, { x: 0, rotation: this.r1.tilt, skewX: 0 });
        gsap.set(b, { x: x2, rotation: this.r2.tilt, skewX: 0 });
      } else {
        still(a, 0, this.r1.tilt);
        still(b, x2, this.r2.tilt);
      }
    },

    play() {
      const self = this;
      const vw = () => window.innerWidth;

      /* keadaan awal: kedua strip benar-benar di luar layar */
      gsap.set(this.r1.node, { rotation: this.r1.tilt, skewX: 0 });
      gsap.set(this.r2.node, { rotation: this.r2.tilt, skewX: 0 });
      gsap.set(this.r1.node, { x: () => -this.r1.node.offsetWidth });
      gsap.set(this.r2.node, { x: vw });

      const move1 = (k) => { this.drift(this.r1, k); };
      const move2 = (k) => { this.drift(this.r2, k); };

      const tl = this.tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: this.pin,
          start: "top top",
          end: function () { return "+=" + Math.round(window.innerHeight * 3.5); },
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
          scrub: 0.6,
          invalidateOnRefresh: true,
          onUpdate: function (s) { self.sk = clamp(s.getVelocity() / 900, -FILM_SKEW, FILM_SKEW); self.paintSkew(); }
        }
      });

      tl.to({}, { duration: 0.15 })                                  /* 0,00 - 0,15 */
        .to(this.r1.node, {                                          /* 0,15 - 0,50 */
          x: 0, duration: 0.35,
          onUpdate: function () { move1(this.progress()); }
        })
        .to({}, { duration: 0.08 })                                  /* 0,50 - 0,58 */
        .to(this.r2.node, {                                          /* 0,58 - 0,90 */
          x: () => vw() - this.r2.node.offsetWidth,
          duration: 0.32,
          onUpdate: function () { move2(this.progress()); }
        })
        .to({}, { duration: 0.10 });                                 /* 0,90 - 1,00 */

      /* satu baris petunjuk di area kosong, memudar begitu scroll mulai jalan */
      if (this.cue) tl.fromTo(this.cue, { opacity: 1 }, { opacity: 0, duration: 0.04, ease: "none" }, 0);

      this.st = tl.scrollTrigger || null;
      this.tick = function () { self.settle(); };
      gsap.ticker.add(this.tick);
    },

    /* foto di dalam frame bergerak berlawanan arah strip, max 8px */
    drift(roll, k) {
      const dx = -roll.dir * FILM_DRIFT * k;
      const s = "translate3d(" + dx.toFixed(2) + "px,0,0)";
      for (let i = 0; i < roll.imgs.length; i++) roll.imgs[i].style.transform = s;
    },

    paintSkew() {
      if (!this.r1 || !this.r2) return;
      if (!hasGSAP) return;
      gsap.set(this.r1.node, { skewX: this.sk });
      gsap.set(this.r2.node, { skewX: this.sk * 0.8 });
    },

    /* kembali ke nol begitu scroll berhenti */
    settle() {
      if (Math.abs(this.sk) < 0.02) {
        if (!this.sk) return;
        this.sk = 0;
        this.paintSkew();
        return;
      }
      this.sk *= 0.86;
      this.paintSkew();
    },

    /* -------------------------------------------------- mode / resize / bongkar */

    mode() {
      /* hanya dibongkar kalau benar-benar pindah HP <-> desktop; resize biasa
        cukup ditangani ScrollTrigger.refresh() (nilai fungsi ikut dihitung ulang) */
      if (this.section && this.wasPhone === mqPhone.matches) return;
      this.kill();
      this.build();
      if (ST) ST.refresh();
    },

    kill() {
      if (this.tick && gsap) gsap.ticker.remove(this.tick);
      this.tick = null;
      if (this.st) { this.st.kill(true); this.st = null; }   /* kill(true) lepaskan pin */
      if (this.tl) { this.tl.kill(); this.tl = null; }
      if (this.io) { this.io.disconnect(); this.io = null; }
      if (this.r1) { this.r1.node.textContent = ""; this.r1 = null; }
      if (this.r2) { this.r2.node.textContent = ""; this.r2 = null; }
      this.sk = 0;
      this.live = false;
    }
  };


  /* ------------------------------------------------- 5c. madding (papan)

     Papan 16 slot (4x4 di desktop, 2 kolom x 8 baris di HP) tanpa login.
     Sumber data:
       - normal  : /api/notes (Vercel serverless -> Upstash Redis)
       - demo    : localStorage + 6 catatan contoh, dipakai otomatis kalau
                   request gagal (mis. index.html dibuka lewat file://)

     Semua teks dari user ditulis lewat textContent, tidak pernah innerHTML.
     Posisi & rotasi note dihitung dari id lewat hash32, jadi tidak berubah
     tiap refresh dan tidak saling menimpa.

     CABUT CATATAN: siapa pun boleh, tanpa akun dan tanpa kunci. Catatan dicabut
     dulu di layar, baru dikirim ke server 5 detik kemudian; kalau selama itu
     dicabut urungkan, tidak ada yang dikirim sama sekali. Selama 5 detik itu
     polling tidak boleh memunculkan kembali catatan itu (lihat this.pending).
     Mode demo punya alur yang sama persis, hanya penyimpanan localStorage.   */

  /* Warna kertas. CSS tetap satu-satunya sumber truthful: JS hanya
     menulis nama variabel ke --paper-note (mis. "var(--note-sage)"), bukan
     kode hex, jadi palet di style.css dan di sini tidak bisa berbeda. */
  const NOTE_COLORS = [
    { id: "mentega", css: "--note-mentega", name: "Kuning mentega" },
    { id: "sage",    css: "--note-sage",    name: "Hijau sage"    },
    { id: "mint",    css: "--note-mint",    name: "Mint"           },
    { id: "peach",   css: "--note-peach",   name: "Peach"          },
    { id: "tulang",  css: "--note-tulang",  name: "Putih tulang"    },
    { id: "biru",    css: "--note-biru",    name: "Biru pucat"     }
  ];
  const NOTE_HEX = {};
  NOTE_COLORS.forEach((c) => { NOTE_HEX[c.id] = "var(" + c.css + ")"; });

  const PAD_MAX = 16;      /* kapasitas papan, sesuai ZCARD di server         */
  const PAD_UNDO = 5;      /* detik sebelum penghapusan benar-benar dikirim  */

  const DEMO_SEED = [
    { name: "Rani",      message: "Bau balai desa itu bau terigu, bukan bau sampah.", color: "mentega" },
    { name: "Bayu",      message: "Jangan lupa kolom NIK, sudah tiga kali salah tulis.", color: "peach" },
    { name: "Tari",      message: "Sawah RT 07 masih ada yang belum kami tengok.", color: "mint" },
    { name: "Dimas",     message: "Terima kasih sudah menemani pembagian buku.", color: "sage" },
    { name: "Nisa",      message: "Kopi posyandu hari ketiga paling enak, aku serious.", color: "tulang" },
    { name: "Pak Rahmat", message: "Anak-anak di sini hafal nama kami semua.", color: "biru" }
  ];

  const Madd = {
    list: [], map: {}, demo: false, ready: false,
    board: null, cloth: null, wrap: null, count: null, tally: null, banner: null,
    modal: null, read: null, toastEl: null, color: "mentega", busy: false,
    pending: {},                      /* sedang menunggu 5 detik: jangan tampilkan */
    queue: [],                        /* catatan yang dicabut, urut, tiap satu punya sisa waktunya */
    readNote: null, toastNote: null, toastLeft: 0, toastTimer: 0, toastSeq: 0,
    armT: 0,
    LS_N: "kkn-madding-name", LS_D: "kkn-madding-demo",

    /* satu sumber kebenaran untuk "ada modal yang terbuka?" (dipakai juga
       oleh handler keyboard jemuran) */
    modalOpen() { return (this.modal && !this.modal.hidden) || (this.read && !this.read.hidden); },

    /* ---------------------------------------------------------- penyimpanan */

    lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} },

    demoList() {
      let arr = null;
      try { arr = JSON.parse(this.lsGet(this.LS_D) || "null"); } catch (e) { arr = null; }
      if (!Array.isArray(arr)) {
        const base = Date.now() - DEMO_SEED.length * 5400000;
        arr = DEMO_SEED.map((s, i) => ({
          id: "demo-" + i + "-" + base,
          name: s.name, message: s.message, color: s.color,
          createdAt: new Date(base + i * 5400000).toISOString()
        }));
        this.lsSet(this.LS_D, JSON.stringify(arr));
      }
      return arr.slice(0, PAD_MAX);
    },
    demoSave(list) { this.lsSet(this.LS_D, JSON.stringify(list.slice(0, PAD_MAX))); },

    /* b/* buang karakter kontrol (enter/tab jadi spasi), rapikan spasi ganda */
    clean(s) {
      return String(s == null ? "" : s)
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    },

    sane(n) {
      if (!n || typeof n !== "object") return null;
      const name = this.clean(n.name);
      const message = this.clean(n.message);
      if (!name || !message || name.length > 20 || message.length > 100) return null;
      return {
        id: String(n.id || ("n" + Date.now())),
        name: name,
        message: message,
        color: NOTE_HEX[n.color] ? n.color : "mentega",
        createdAt: n.createdAt || new Date().toISOString()
      };
    },

    /* --------------------------------------------------------------- memuat */

    build() {
      this.board  = $("#padBoard");
      this.cloth  = $("#padCloth");
      this.wrap   = $(".madding__wrap");
      this.count  = $("#padCount");
      this.tally  = $("#padTally");
      this.banner = $("#padDemo");
      this.modal  = $("#padModal");
      this.read   = $("#padRead");
      this.toastEl = $("#padToast");
      if (!this.board || !this.cloth) return;
      this.render();
      this.watch();
      this.bind();
      this.load();
    },

    load() {
      const self = this;
      const bail = function () { self.toDemo(); };
      if (!window.fetch || location.protocol === "file:") { bail(); return; }
      fetch("/api/notes", { headers: { accept: "application/json" }, cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error("status " + r.status);
          return r.json();
        })
        .then(function (j) {
          const arr = Array.isArray(j) ? j : (j && Array.isArray(j.notes) ? j.notes : null);
          if (!arr) throw new Error("bentuk tidak dikenal");
          self.setDemo(false);
          /* papan kosong yang sah tetap perlu dirender supaya muncul
             kalimat ajakan, bukan papan kosong yang tidak terbaca */
          self.adopt(arr, false);
          if (!arr.length) self.render();
        })
        .catch(bail);
    },

    toDemo() {
      if (this.demo) { this.render(); return; }
      this.setDemo(true);
      this.adopt(this.demoList(), false);
    },

    setDemo(on) {
      this.demo = on;
      if (this.banner) this.banner.hidden = !on;
      this.sync();
    },

    /* masukkan catatan yang belum pernah tampil (polling / render ulang) */
    adopt(arr, animated) {
      const self = this;
      const fresh = [];
      arr.forEach(function (raw) {
        const n = self.sane(raw);
        /* id yang sedang dicabut tidak boleh muncul lagi walau masih di server */
        if (!n || self.map[n.id] || self.pending[n.id]) return;
        fresh.push(n);
      });
      if (!fresh.length) return false;
      fresh.forEach(function (n) {
        if (self.map[n.id]) return;
        self.map[n.id] = n;
        self.list.push(n);
      });
      /* terlama -> terbaru: slot terisi berurutan dari kolom kiri atas,
         jadi catatan baru selalu menempati slot kosong pertama */
      this.list.sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
      if (this.list.length > PAD_MAX) {
        this.list.slice(PAD_MAX).forEach(function (n) { delete self.map[n.id]; });
        this.list = this.list.slice(0, PAD_MAX);
      }
      /* mode demo: tiap perubahan langsung ditulis ke localStorage, kalau tidak
         catatan yang diketik saat offline hilang begitu halaman ditutup lagi */
      if (this.demo) this.demoSave(this.list);
      this.render();
      /* catatan yang datang dari orang lain: jatuh satu per satu, bukan rame */
      if (animated) {
        $$(".note", this.cloth).slice(-Math.min(fresh.length, 4)).forEach(function (c, i) {
          setTimeout(function () { c.classList.add("is-drop"); }, 80 + i * 120);
        });
      }
      return true;
    },

    /* --------------------------------------------------------------- render

       Papan selalu berisi tepat 16 sel: catatan yang ada mengisi slot dari
       kiri atas, sisanya kotak garis putus-putus. Menggambar ulang seluruh
       papan membuat animasi cabut & urutkan cukup satu flip yang sederhana. */

    render() {
      const self = this;
      const frag = document.createDocumentFragment();
      this.cloth.textContent = "";
      for (let i = 0; i < PAD_MAX; i++) {
        const n = this.list[i];
        if (n) { frag.appendChild(this.makeNote(n, i, false)); continue; }
        const s = el("div", "slot");
        s.setAttribute("aria-hidden", "true");
        frag.appendChild(s);
      }
      this.cloth.appendChild(frag);
      this.place();
      this.sync();
      /* papan sudah terlihat di layar -> langsung tampil, tanpa nunggu IO */
      if (this.inView) this.show();
    },

    /* penghitung "12 / 16" + kalimat status di bawah tombol Tempel */
    sync() {
      const n = Math.min(this.list.length, PAD_MAX);
      if (this.tally) {
        this.tally.classList.toggle("is-full", n >= PAD_MAX);
        const b = this.tally.firstElementChild;
        if (b) b.textContent = String(n);
      }
      if (!this.count) return;
      if (this.demo) this.count.textContent = "Tersimpan di perangkat ini saja";
      else if (n >= PAD_MAX) this.count.textContent = "Papan penuh, " + n + " / " + PAD_MAX;
      else this.count.textContent = n ? n + " catatan menempel" : "Papan masih kosong, " + PAD_MAX + " slot";
    },

    nodeById(id) {
      const kids = this.cloth.children;
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].dataset && kids[i].dataset.id === id) return kids[i];
      }
      return null;
    },

    makeNote(n, order, drop) {
      const rot = (hash32("r" + n.id) * 2 - 1) * 5.2;
      const b = el("button", "note");
      b.type = "button";
      b.style.setProperty("--rot", rot.toFixed(2) + "deg");
      b.style.setProperty("--paper-note", NOTE_HEX[n.color] || NOTE_HEX.mentega);
      b.dataset.id = n.id;
      b.dataset.order = String(order);
      b.style.transitionDelay = Math.min(order, 16) * 45 + "ms";

      const inner = el("span", "note__in");
      inner.appendChild(el("span", "note__tape"));
      inner.appendChild(el("span", "note__msg", n.message));
      inner.appendChild(el("span", "note__by", n.name + " · " + this.when(n.createdAt)));
      b.appendChild(inner);

      /* jalan pintas desktop: tanda x di pojok, membuka modal yang sama */
      const x = el("span", "note__x");
      x.setAttribute("aria-hidden", "true");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("d", "M6 6l12 12M18 6L6 18");
      svg.appendChild(p1);
      x.appendChild(svg);
      b.appendChild(x);

      b.setAttribute("aria-label", "Catatan dari " + n.name + ": " + n.message);
      const self = this;
      b.addEventListener("click", function () { self.openRead(n); });
      if (drop) setTimeout(function () { b.classList.add("is-drop"); }, 40 + Math.min(order, 8) * 55);
      return b;
    },

    /* Tata letak 16 slot: grid tetap, 4x4 di desktop dan 2x8 di HP. Kotak
       selalu persegi dan ukurannya ikut lebar papan, rotasi kecil per id tetap
       dipakai supaya tidak terlihat mesin.

       Lebar papan (--board-w) ikut dikecilkan kalau 4 baris akan lebih tinggi
       dari layar, jadi di desktop papan tidak pernah setinggi > 1 layar.
       Ukuran dihitung dari lebar yang tersedia di section, bukan dari lebar
       papan saat ini, supaya pemanggilan place() berikutnya tidak menyusut
       papan terus-terusan. */
    place() {
      const wrap = this.wrap || this.board;
      const cs = getComputedStyle(wrap);
      const gut = parseFloat(cs.paddingLeft) || 0;
      const host = wrap.parentElement || document.body;
      const avail = Math.max(240, (host.clientWidth || 900) - gut * 2);
      const pad = parseFloat(getComputedStyle(this.board).paddingLeft) || 0;
      const clothW = Math.max(180, avail - pad * 2);

      const cols = clothW < 560 ? 2 : 4;
      const rows = Math.ceil(PAD_MAX / cols);
      const gap = cols === 2 ? 14 : 22;
      const margin = 8;   /* ruang untuk rotasi 5,2 derajat di tepi papan */

      let size = Math.floor((clothW - margin * 2 - gap * (cols - 1)) / cols);
      if (cols === 4) {
        const maxH = window.innerHeight * 0.88;
        const fit = Math.floor((maxH - margin * 2 - gap * (rows - 1)) / rows);
        if (fit < size) size = fit;
      }
      size = clamp(size, 104, 300);

      const inner = size * cols + gap * (cols - 1);
      const used = inner + margin * 2;

      for (let i = 0; i < PAD_MAX; i++) {
        const node = this.cloth.children[i];
        if (!node) continue;
        const n = this.list[i];
        /* offset acak kecil per id: hanya di dalam selnya, tidak pernah keluar */
        const jx = n ? (hash32("x" + n.id) - 0.5) * gap * 0.5 : 0;
        const jy = n ? (hash32("y" + n.id) - 0.5) * gap * 0.4 : 0;
        const c = i % cols, r = Math.floor(i / cols);
        node.style.setProperty("--note", size + "px");
        node.style.left = (margin + c * (size + gap) + jx).toFixed(1) + "px";
        node.style.top = (Math.round(margin + r * (size + gap) + jy)) + "px";
      }

      this.cloth.style.height = (rows * size + (rows - 1) * gap + margin * 2) + "px";
      /* papan ikut menyempit supaya proporsinya tetap 4x4, bukan kolom kosong */
      wrap.style.setProperty("--board-w", (used + pad * 2 + gut * 2) + "px");
    },

    /* catatan muncul berurutan saat papan masuk layar */
    watch() {
      if (!("IntersectionObserver" in window)) { this.inView = true; return; }
      const self = this;
      this.io = new IntersectionObserver(function (es) {
        self.inView = es[0].isIntersecting;
        if (self.inView) self.show();
      }, { threshold: 0.06 });
      this.io.observe(this.cloth);
    },

    show() {
      Array.prototype.forEach.call(this.cloth.children, function (c) {
        c.classList.add("is-in");
      });
    },

    when(iso) {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "baru saja";
      try {
        return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
      } catch (e) {
        return d.getDate() + " " + d.getMonth();
      }
    },

    /* ------------------------------------------------------------- interaksi */

    bind() {
      const self = this;
      const openBtn = $("#padOpen");
      if (openBtn) openBtn.addEventListener("click", function () { self.openPad(); });
      const undo = $("#padToastUndo");
      if (undo) undo.addEventListener("click", function () { self.undo(); });

      let rz = 0;
      window.addEventListener("resize", function () {
        clearTimeout(rz);
        rz = setTimeout(function () { self.place(); }, 200);
      }, { passive: true });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { self.place(); });

      /* polling ringan: 30 detik, hanya saat tab aktif */
      setInterval(function () { self.poll(); }, 30000);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") self.poll();
      });
      /* Tab ditutup atau pindah halaman selagi masih ada catatan yang
         menunggu: kirim semuanya sekarang juga, dengan keepalive supaya
         request tidak dibuang browser walau masih dalam perjalanan.
         Sengaja TIDAK diikat ke visibilitychange: minimize tab bukan
         hcapan, jadi hitungan 5 detik harus tetap berjalan. */
      window.addEventListener("pagehide", function () { self.flush(); });
      window.addEventListener("beforeunload", function () { self.flush(); });
    },

    poll() {
      if (this.demo || document.visibilityState !== "visible") return;
      if (!window.fetch || location.protocol === "file:") return;
      const self = this;
      fetch("/api/notes", { headers: { accept: "application/json" }, cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j) return;
          const arr = Array.isArray(j) ? j : (j.notes || []);
          self.adopt(arr, true);
        })
        .catch(function () { /* diamkan: papan tetap jalan dengan isinya */ });
    },

    /* -------------------------------------------------------- modal tulis */

    openPad() {
      const m = this.modal;
      if (!m) return;
      const saved = this.lsGet(this.LS_N) || "";
      $("#padName").value = saved;
      $("#padMsg").value = "";
      /* papan penuh: tombolnya tetap ada, tapi modal langsung menjelaskan */
      const full = this.list.length >= PAD_MAX;
      $("#padErr").textContent = full ? "Papan penuh. Cabut satu catatan dulu." : "";
      const send = $("#padSend");
      if (send) send.disabled = full;
      this.swatch();
      this.live();
      m.hidden = false;
      lockScroll(true);
      requestAnimationFrame(function () { m.classList.add("is-open"); });
      setTimeout(function () { const f = $("#padName"); if (f) f.focus(); }, 60);
    },

    closePad() {
      const m = this.modal;
      if (!m) return;
      m.classList.remove("is-open");
      lockScroll(false);
      setTimeout(function () { m.hidden = true; }, 320);
    },

    swatch() {
      const box = $("#padSw");
      if (!box) return;
      box.textContent = "";
      const self = this;
      NOTE_COLORS.forEach(function (c) {
        const b = el("button", "sw");
        b.type = "button";
        b.style.setProperty("--c", "var(" + c.css + ")");
        b.title = c.name;
        b.setAttribute("aria-label", c.name);
        b.setAttribute("aria-pressed", c.id === self.color ? "true" : "false");
        b.addEventListener("click", function () {
          self.color = c.id;
          Array.prototype.forEach.call(box.children, function (x) {
            x.setAttribute("aria-pressed", "false");
          });
          b.setAttribute("aria-pressed", "true");
          self.live();
        });
        box.appendChild(b);
      });
    },

    /* preview kertas langsung mengikuti isian */
    live() {
      const prev = $("#padPrev");
      if (!prev) return;
      prev.style.setProperty("--paper-note", NOTE_HEX[this.color] || NOTE_HEX.mentega);
      const name = this.clean($("#padName").value);
      const msg = ($("#padMsg").value || "").replace(/\s+/g, " ");
      $("#padPrevMsg").textContent = msg || "Pesanmu akan tampil di sini.";
      $("#padPrevBy").textContent = name || "—";
      const c = $("#padCount2");
      if (c) {
        const raw = $("#padMsg").value || "";
        c.textContent = raw.length + "/100";
        c.classList.toggle("is-full", raw.length >= 100);
      }
    },

    send() {
      const self = this;
      const btn = $("#padSend");
      const err = $("#padErr");
      const name = this.clean($("#padName").value);
      const msg = this.clean($("#padMsg").value);
      const hp = ($("#padHp").value || "").trim();
      const fail = function (t) { err.textContent = t; };

      if (!name) return fail("Isi namamu dulu, biar tahu catatan ini dari siapa.");
      if (name.length > 20) return fail("Namenya kepanjangan, maximal 20 huruf.");
      if (!msg || msg.length === 0) return fail("Pesannya masih kosong. Satu kalimat saja cukup.");
      if (msg.length > 100) return fail("Pesannya terlalu panjang, maximal 100 huruf.");
      /* papan sudah 16/16: server juga akan menolak dengan 409, tapi baik
        dicek di sini supaya tidak ada request yang percuma */
      if (this.list.length >= PAD_MAX) {
        if (btn) btn.disabled = true;
        return fail("Papan penuh. Cabut satu catatan dulu.");
      }

      this.lsSet(this.LS_N, name);
      if (btn) btn.disabled = true;
      err.textContent = "Menempel…";

      const body = { name: name, message: msg, color: this.color, website: hp };
      const done = function (raw) {
        const n = self.sane(raw);
        if (btn) btn.disabled = false;
        err.textContent = "";          /* "Menempel…" harus hilang setelah selesai */
        self.closePad();
        if (!n) return;
        self.adopt([n], false);
        /* catatan baru menempati slot kosong terakhir: jatuh, lalu selotip nempel */
        const fresh = $$(".note", self.cloth).slice(-1);
        fresh.forEach(function (c) {
          setTimeout(function () {
            c.classList.add("is-in");
            c.classList.add("is-drop");
          }, 120);
        });
      };
      const offline = function () {
        self.setDemo(true);
        done({
          id: "local-" + Date.now() + "-" + Math.floor(Math.random() * 999),
          name: name, message: msg, color: self.color,
          createdAt: new Date().toISOString()
        });
      };

      if (this.demo || !window.fetch || location.protocol === "file:") { offline(); return; }

      fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 429) throw { friendly: true, msg: j.error || "Terlalu cepat nempel. Tunggu sebentar ya." };
          if (r.status === 409) throw { friendly: true, msg: j.error || "Papan penuh. Cabut satu catatan dulu." };
          if (!r.ok) throw { friendly: true, msg: j.error || "Gagal menempel. Coba lagi sebentar lagi." };
          return j.note || j;
        });
      }).then(function (raw) {
        done(raw);
      }).catch(function (e) {
        if (btn) btn.disabled = false;
        /* server tidak bisa dihubungi (mis. dibuka lewat file://) -> mode demo */
        if (e && e.friendly) { err.textContent = e.msg; return; }
        offline();
      });
    },

    /* ---------------------------------------------------------- modal baca */

    openRead(n) {
      const r = this.read;
      if (!r) return;
      const big = $("#padBig");
      big.style.setProperty("--paper-note", NOTE_HEX[n.color] || NOTE_HEX.mentega);
      $("#padReadMsg").textContent = n.message;
      $("#padReadBy").textContent = n.name + " · " + this.when(n.createdAt);
      this.readNote = n;
      this.disarm();
      r.hidden = false;
      lockScroll(true);
      requestAnimationFrame(function () { r.classList.add("is-open"); });
    },

    closeRead() {
      const r = this.read;
      if (!r) return;
      this.disarm();
      r.classList.remove("is-open");
      lockScroll(false);
      setTimeout(function () { r.hidden = true; }, 320);
    },

    /* ------------------------------------------- cabut catatan (tanpa login)

       Tombol "Cabut catatan" butuh dua klik: klik pertama cuma meminta
       konfirmasi lalu kembali normal sendiri setelah 3 detik. Klik kedua
       benar-benar mencabut: selotip lepas, catatan terangkat, berputar, jatuh
       keluar papan, slotnya jadi kosong. Toast memberi 5 detik untuk
       mengurutkan; baru lewat itu DELETE dikirim ke server. */

    pullClick() {
      const n = this.readNote;
      const b = $("#padPull");
      if (!n || !b || b.disabled) return;
      const face = b.querySelector(".padbtn__face");

      if (!b.classList.contains("is-armed")) {
        b.classList.add("is-armed");
        if (face) face.textContent = "Yakin? Cabut";
        clearTimeout(this.armT);
        const self = this;
        this.armT = setTimeout(function () { self.disarm(); }, 3000);
        return;
      }
      this.disarm();
      this.pull(n);
      this.closeRead();
    },

    disarm() {
      clearTimeout(this.armT);
      this.armT = 0;
      const b = $("#padPull");
      if (!b) return;
      b.classList.remove("is-armed");
      b.disabled = false;
      const face = b.querySelector(".padbtn__face");
      if (face) face.textContent = "Cabut catatan";
    },

    pull(n) {
      const self = this;
      this.pending[n.id] = true;
      const node = this.nodeById(n.id);
      if (node) node.classList.add("is-pull");
      /* tunggu animasi selesai, baru buang dari daftar supaya slotnya kosong */
      setTimeout(function () { self.forget(n); }, 700);
      this.toast(n);
    },

    /* buang catatan dari daftar (di layar sudah tidak terlihat) */
    forget(n) {
      this.list = this.list.filter(function (x) { return x.id !== n.id; });
      delete this.map[n.id];
      if (this.demo) this.demoSave(this.list);
      this.render();
    },

    /* kembalikan ke slot lamanya kalau sempat diurutkan */
    undo() {
      const q = this.queue;
      if (!q.length) return;
      const n = q[q.length - 1].n;                  /* yang terakhir dicabut */
      q.pop();
      delete this.pending[n.id];
      this.list.push(n);
      this.list.sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
      this.map[n.id] = n;
      this.render();
      const node = this.nodeById(n.id);
      if (node) node.classList.add("is-back");
      if (this.demo) this.demoSave(this.list);
      /* kalau masih ada yang menunggu, toast-nya tetap tampil untuk yang itu */
      this.paintToast();
    },

    /* ------------------------------------------------------- toast 5 detik

       Antrean, bukan satu catatan saja: kalau beberapa catatan dicabut
       beruntun, tiap satu punya hitungan 5 detik sendiri-sendiri dan tidak
       saling menimpa. Tombol "Urutkan" selalu menunjuk catatan yang paling
       baru dicabut, dan hitungan yang ditampilkan adalah sisa waktunya. */

    toast(n) {
      this.queue.push({ n: n, left: PAD_UNDO });
      this.paintToast();
    },

    tick() {
      const self = this;
      const q = this.queue;
      for (let i = q.length - 1; i >= 0; i--) {
        q[i].left -= 1;
        if (q[i].left > 0) continue;
        const gone = q[i].n;
        q.splice(i, 1);
        this.commit(gone);
      }
      this.paintToast();
    },

    paintToast() {
      const self = this;
      const t = this.toastEl;
      const q = this.queue;
      if (!q.length) { this.clearToast(); return; }

      if (!t) {                                     /* tidak ada elemen toast */
        const gone = q.map(function (e) { return e.n; });
        q.length = 0;
        gone.forEach(function (n) { self.commit(n); });
        return;
      }

      const cur = q[q.length - 1];
      this.toastNote = cur.n;
      this.toastLeft = cur.left;
      const num = $("#padToastNum");
      if (num) num.textContent = String(Math.max(0, cur.left));

      if (!t.classList.contains("is-on")) {
        t.hidden = false;
        requestAnimationFrame(function () { t.classList.add("is-on"); });
      }
      clearInterval(this.toastTimer);
      this.toastTimer = setInterval(function () { self.tick(); }, 1000);
    },

    clearToast() {
      clearInterval(this.toastTimer);
      this.toastTimer = 0;
      this.toastNote = null;
      const t = this.toastEl;
      if (!t || t.hidden) return;
      const seq = ++this.toastSeq;
      t.classList.remove("is-on");
      setTimeout(function () { if (Madd.toastSeq === seq) t.hidden = true; }, 460);
    },

    /* benar-benar hapus di server. Mode demo sudah menyimpan lewat
       localStorage di forget(), jadi tidak ada request apa pun. */
    commit(n) {
      if (!n) return;
      delete this.pending[n.id];
      const q = this.queue;
      for (let i = q.length - 1; i >= 0; i--) if (q[i].n.id === n.id) q.splice(i, 1);
      if (!q.length && this.toastTimer) this.clearToast();
      if (this.demo || !window.fetch || location.protocol === "file:") return;
      try {
        fetch("/api/notes?id=" + encodeURIComponent(n.id), {
          method: "DELETE",
          headers: { accept: "application/json" },
          keepalive: true,
          cache: "no-store"
        }).catch(function () { /* gagal diamkan: layar tetap konsisten */ });
      } catch (e) { /* fetch tidak tersedia */ }
    },

    /* tab ditutup atau diganti halaman selagi masih ada catatan yang
       menunggu: kirim semuanya sekarang juga, dengan keepalive supaya
       request tidak dibuang browser walau masih dalam perjalanan. */
    flush() {
      const ids = Object.keys(this.pending);
      if (!ids.length) return;
      for (let i = 0; i < ids.length; i++) {
        this.commit(this.map[ids[i]] || { id: ids[i] });
      }
      this.clearToast();
    }
  };

  function maddingUI() {
    if (!Madd.modal) return;
    const self = Madd;

    /* tombol tutup (scrim + Batal) */
    $$("[data-pad-close]").forEach(function (b) {
      b.addEventListener("click", function () { self.closePad(); });
    });
    $$("[data-read-close]").forEach(function (b) {
      b.addEventListener("click", function () { self.closeRead(); });
    });

    const nameIn = $("#padName"), msgIn = $("#padMsg");
    if (nameIn) nameIn.addEventListener("input", function () { self.live(); });
    if (msgIn) msgIn.addEventListener("input", function () { self.live(); });
    const send = $("#padSend");
    if (send) send.addEventListener("click", function () { self.send(); });
    const pull = $("#padPull");
    if (pull) pull.addEventListener("click", function () { self.pullClick(); });

    document.addEventListener("keydown", function (e) {
      if (!self.modalOpen()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (!Madd.read.hidden) self.closeRead(); else self.closePad();
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        self.send();
      }
      if (e.key === "Tab") trapFocus(e, self.modalOpen() ? Madd.modal : Madd.read);
    });
  }

  function trapFocus(e, root) {
    if (!root) return;
    const f = $$("button, input, textarea", root).filter(function (b) { return b.offsetParent !== null; });
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* -------------------------------------------- 6c. peta lompat + ke atas
     Scrubber tipis di tepi kanan (HP): penanda posisi + titik berhenti per
     bagian, tap/drag untuk meloncat. Ditambah tombol kecil ke atas. */

  function pageMap() {
    const box = $("#scrub"), thumb = $("#scrubThumb"), ticks = $("#scrubTicks");
    const top = $("#toTop");
    let h = 0, last = -1, stops = [];

    const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const gotoY = (y) => {
      const to = clamp(y, 0, maxScroll());
      if (smooth) smooth.scrollTo(to, { duration: 0.7 });
      else window.scrollTo({ top: to, behavior: reduced() ? "auto" : "smooth" });
    };

    /* titik berhenti: tiap bagian yang benar-benar terlihat (bagian yang
       disembunyikan CSS di HP dilewati, kalau tidak titiknya menumpuk) */
    function measure() {
      if (!box) return;
      h = box.clientHeight;
      const max = maxScroll();
      const nodes = [
        { sel: "#stack",    name: "Tumpukan" },
        { sel: "#jemuran",  name: "Jemuran"  },
        { sel: "#rolfilm",  name: "Rol film" },
        { sel: "#galeri",   name: "Semua foto" },
        { sel: "#madding",  name: "Madding"  },
        { sel: "#catatan",  name: "Penutup"  }
      ];
      const list = nodes.filter(function (n) {
        const node = $(n.sel);
        return node && node.offsetParent !== null;
      });
      stops = list.map(function (n) {
        const node = $(n.sel);
        const p = clamp((node.getBoundingClientRect().top + window.scrollY) / max, 0, 1);
        return { p: p, name: n.name };
      });
      if (!ticks) return;
      while (ticks.children.length < stops.length) ticks.appendChild(el("i", "scrub__tick"));
      while (ticks.children.length > stops.length) ticks.removeChild(ticks.lastChild);
      for (let i = 0; i < stops.length; i++) {
        ticks.children[i].style.top = (stops[i].p * 100).toFixed(2) + "%";
      }
    }

    function update() {
      const p = clamp(window.scrollY / maxScroll(), 0, 1);
      if (top) top.classList.toggle("is-on", window.scrollY > window.innerHeight * 1.1);
      if (!thumb || Math.abs(p - last) < 0.002) return;
      last = p;
      thumb.style.transform = "translateY(" + (p * Math.max(0, h - 26)).toFixed(1) + "px)";
      let label = Math.round(p * 100) + " persen halaman";
      for (let i = 0; i < stops.length; i++) {
        if (stops[i].name && Math.abs(stops[i].p - p) < 0.03) { label = stops[i].name; break; }
      }
      if (box) {
        box.setAttribute("aria-valuenow", String(Math.round(p * 100)));
        box.setAttribute("aria-valuetext", label);
      }
    }

    if (box && thumb && ticks) {
      const seek = (clientY) => {
        const r = box.getBoundingClientRect();
        gotoY(clamp((clientY - r.top - 13) / Math.max(1, r.height - 26), 0, 1) * maxScroll());
      };
      let pid = null;
      const down = (e) => { pid = e.pointerId; try { box.setPointerCapture(pid); } catch (err) {} seek(e.clientY); };
      const move = (e) => { if (pid === e.pointerId) seek(e.clientY); };
      const end = (e) => {
        if (pid !== e.pointerId) return;
        try { box.releasePointerCapture(pid); } catch (err) {}
        pid = null;
      };
      box.addEventListener("pointerdown", down);
      box.addEventListener("pointermove", move);
      box.addEventListener("pointerup", end);
      box.addEventListener("pointercancel", end);
      box.addEventListener("keydown", (e) => {
        const max = maxScroll(), y = window.scrollY;
        let to = null;
        if (e.key === "ArrowDown") to = y + max * 0.08;
        else if (e.key === "ArrowUp") to = y - max * 0.08;
        else if (e.key === "PageDown") to = y + max * 0.3;
        else if (e.key === "PageUp") to = y - max * 0.3;
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = max;
        else return;
        e.preventDefault();
        gotoY(to);
      });
    }

    if (top) {
      top.addEventListener("click", () => {
        if (smooth) smooth.scrollTo(0, { duration: 1.1 });
        else window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
      });
    }

    let raf = 0;
    const tick = () => { raf = 0; update(); measure(); };
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(wake);
    if (hasGSAP) ST.addEventListener("refresh", wake);
    setTimeout(wake, 150);
    setTimeout(wake, 1000);
    wake();

    return { refresh: wake };
  }

  /* ------------------------------------------------- 7. tilt ringan + kursor */

  function tiltAndCursor() {
    /* --- tilt 3D ringan, rect di-cache supaya tidak baca layout tiap frame --- */
    if (hasGSAP && fine() && !reduced()) {
      const rects = new WeakMap();
      let dirty = false, active = null, rafId = 0;

      /* loop hanya hidup saat ada foto yang disorot */
      const pump = () => {
        rafId = 0;
        if (dirty && active) { rects.set(active, active.getBoundingClientRect()); dirty = false; }
        if (active) rafId = requestAnimationFrame(pump);
      };
      const wake = () => { if (!rafId) rafId = requestAnimationFrame(pump); };
      const markDirty = () => { dirty = true; };

      window.addEventListener("scroll", markDirty, { passive: true });
      window.addEventListener("resize", markDirty, { passive: true });

      $$(".shot__btn").forEach((btn) => {
        const frame = $(".shot__frame", btn);
        if (!frame) return;
        const rX = gsap.quickTo(frame, "rotationX", { duration: 0.6, ease: "power3" });
        const rY = gsap.quickTo(frame, "rotationY", { duration: 0.6, ease: "power3" });
        const sc = gsap.quickTo(frame, "scale", { duration: 0.6, ease: "power3" });

        const onMove = (e) => {
          let r = rects.get(btn);
          if (!r) { r = btn.getBoundingClientRect(); rects.set(btn, r); }
          const px = (e.clientX - r.left) / (r.width || 1) - 0.5;
          const py = (e.clientY - r.top) / (r.height || 1) - 0.5;
          rX(py * -7);
          rY(px * 7);
          sc(1.015);
        };
        btn.addEventListener("pointerenter", () => {
          active = btn;
          rects.set(btn, btn.getBoundingClientRect());
          wake();
        });
        btn.addEventListener("pointermove", onMove, { passive: true });
        btn.addEventListener("pointerleave", () => {
          active = null;
          rX(0); rY(0); sc(1);
        });
      });
    }

    /* --- kursor kustom: circle + teks "Lihat" (state via :has di CSS) --- */
    const cursor = $(".cursor");
    if (!cursor || !fine() || reduced()) return;

    const setX = gsap.quickTo(cursor, "x", { duration: 0.3, ease: "power3" });
    const setY = gsap.quickTo(cursor, "y", { duration: 0.3, ease: "power3" });

    window.addEventListener("pointermove", (e) => {
      if (!document.body.classList.contains("has-cursor")) {
        document.body.classList.add("has-cursor");
        gsap.to(cursor, { opacity: 1, duration: 0.35, ease: "power2.out" });
      }
      setX(e.clientX);
      setY(e.clientY);
    }, { passive: true });

    document.addEventListener("mouseleave", () => {
      document.body.classList.remove("has-cursor");
      gsap.to(cursor, { opacity: 0, duration: 0.25 });
    });
  }

  /* ---------------------------------------------------------- 8. lightbox
     Buka dari posisi foto (FLIP lewat transform), panah, keyboard, swipe. */

  const LB = {
    root: null, img: null, cap: null, capText: null, capMeta: null,
    scrim: null, btns: [], index: -1, nav: null, open: false, busy: false, lastFocus: null
  };

  function lbInit() {
    LB.root    = $("#lb");
    if (!LB.root) return;
    LB.img     = $(".lb__img", LB.root);
    LB.cap     = $(".lb__cap", LB.root);
    LB.capText = $(".lb__cap-text", LB.root);
    LB.capMeta = $(".lb__cap-meta", LB.root);
    LB.scrim   = $(".lb__scrim", LB.root);
    LB.btns    = $$(".lb__btn", LB.root);

    LB.btns.forEach((b) => {
      b.addEventListener("click", () => {
        if (b.classList.contains("lb__close")) lbClose();
        else if (b.classList.contains("lb__prev")) lbGo(-1);
        else lbGo(1);
      });
    });
    LB.scrim.addEventListener("click", lbClose);

    document.addEventListener("keydown", (e) => {
      if (!LB.open) return;
      if (e.key === "Escape") { e.preventDefault(); lbClose(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); lbGo(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); lbGo(1); }
      else if (e.key === "Tab") lbTrapFocus(e);
    });

    /* --- swipe / drag ---
     Sumbu dikunci setelah 8px supaya geser mendatar dan tegak tidak saling
     menimpa. Horizontal = foto berikutnya/sebelumnya, tegak ke bawah = tutup. */
    let sx = 0, sy = 0, dx = 0, dy = 0, axis = "", dragging = false, pid = null;
    LB.img.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true; axis = ""; pid = e.pointerId;
      sx = e.clientX; sy = e.clientY; dx = 0; dy = 0;
      try { LB.img.setPointerCapture(pid); } catch (err) {}
    });
    LB.img.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = e.clientX - sx;
      dy = e.clientY - sy;
      if (!axis && Math.abs(dx) + Math.abs(dy) > 8) {
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (!hasGSAP) return;
      if (axis === "y") {
        const p = Math.max(0, dy);
        gsap.set(LB.img, {
          x: dx * 0.3, y: p * 0.62, scale: 1 - Math.min(0.12, p / 760),
          opacity: 1 - Math.min(0.55, p / 420), rotation: 0
        });
      } else {
        gsap.set(LB.img, { x: dx, y: dy, rotation: dx * 0.02 });
      }
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      if (pid != null) { try { LB.img.releasePointerCapture(pid); } catch (err) {} }
      const th = Math.min(90, window.innerWidth * 0.18);
      /* geser ke bawah melewati ambang -> tutup */
      if (axis === "y" && dy > th * 1.15) { lbClose(); return; }
      if (axis === "x" && Math.abs(dx) > th) lbGo(dx < 0 ? 1 : -1);
      else if (hasGSAP) gsap.to(LB.img, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.7, ease: "expo.out" });
    };
    LB.img.addEventListener("pointerup", endDrag);
    LB.img.addEventListener("pointercancel", endDrag);

    /* ukuran ulang saat jendela berubah */
    let rt = 0;
    window.addEventListener("resize", () => {
      if (!LB.open) return;
      clearTimeout(rt);
      rt = setTimeout(() => {
        const b = lbBox();
        lbPlace(b);
        if (hasGSAP && !LB.busy) gsap.to(LB.img, { duration: 0.4, ease: "power3.out", x: 0, y: 0, scale: 1 });
      }, 150);
    });
  }

  function lbTrapFocus(e) {
    const f = LB.btns.filter((b) => b.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* kotak panggung: contain-fit, sisakan ruang untuk caption */
  function lbBox() {
    const padX   = window.innerWidth < 700 ? 14 : 76;
    const padTop = 64;
    const padBot = window.innerHeight < 560 ? 96 : 140;
    const wAvail = window.innerWidth - padX * 2;
    const hAvail = window.innerHeight - padTop - padBot;
    const p = DATA[LB.index] || { w: 4, h: 3 };
    const ar = (p.w || 4) / (p.h || 3);
    let w = wAvail, h = w / ar;
    if (h > hAvail) { h = hAvail; w = h * ar; }
    return { w: Math.round(w), h: Math.round(h), cx: window.innerWidth / 2, cy: padTop + hAvail / 2 };
  }

  /* taruh <img> di kotak panggung lewat left/top (ditulis sekali per opening),
     transform dipakai khusus untuk FLIP supaya animasinya compositor-friendly. */
  function lbPlace(b) {
    LB.img.style.left = Math.round(b.cx - b.w / 2) + "px";
    LB.img.style.top  = Math.round(b.cy - b.h / 2) + "px";
    if (hasGSAP) gsap.set(LB.img, { width: b.w, height: b.h, x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 });
    else {
      LB.img.style.width = b.w + "px";
      LB.img.style.height = b.h + "px";
      LB.img.style.transform = "none";
      LB.img.style.opacity = "1";
    }
  }

  function lbRectFor(i) {
    const shot = shotEls[i];
    if (!shot) return null;
    const r = shot.img.getBoundingClientRect();
    if (r.bottom < 40 || r.top > window.innerHeight - 40 || r.width < 4) return null;
    return r;
  }

  function lbFill(i) {
    const p = DATA[i];
    LB.capText.textContent = p.caption;
    LB.capMeta.textContent = "";
    LB.capMeta.appendChild(el("span", null, pad2(i + 1) + " / " + pad2(TOTAL)));
    LB.capMeta.appendChild(el("span", null, p.kategori));
    LB.capMeta.appendChild(el("span", null, p.tanggal));
    LB.img.alt = p.caption;
  }

  function lbSetSrc(i) {
    const src = DATA[i].src;
    if (LB.img.getAttribute("src") !== src) LB.img.src = src;
  }

  function lbOpen(i, fromEl, nav) {
    if (!LB.root || LB.busy || !DATA[i]) return;
    LB.index = i;
    LB.nav = nav && nav.length > 1 ? nav : null;
    lbFill(i);
    lbSetSrc(i);
    LB.lastFocus = document.activeElement;
    LB.root.hidden = false;
    LB.root.classList.add("is-open");
    LB.open = true;
    LB.busy = true;
    lockScroll(true);

    const b = lbBox();
    lbPlace(b);

    /* kotak asal: elemen yang diklik, kalau tidak ada pakai foto masonry */
    let from = null;
    if (fromEl && fromEl.getBoundingClientRect) {
      const r = fromEl.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) from = r;
    }
    if (!from) from = lbRectFor(i);
    /* kalau foto asal di luar layar, pakai fade saja */
    if (from && (from.bottom < 0 || from.top > window.innerHeight)) from = null;
    const useFlip = !!(from && hasGSAP && !reduced());

    const done = () => { LB.busy = false; };

    if (!useFlip) {
      if (hasGSAP) {
        gsap.set([LB.scrim, LB.cap, LB.btns], { opacity: 0 });
        gsap.set(LB.img, { opacity: 0 });
        gsap.timeline({ onComplete: done })
          .to(LB.scrim, { opacity: 1, duration: 0.4, ease: "power2.out" }, 0)
          .to(LB.img, { opacity: 1, duration: 0.45, ease: "power2.out" }, 0.05)
          .to(LB.btns, { opacity: 1, duration: 0.35, stagger: 0.04 }, 0.2)
          .to(LB.cap, { opacity: 1, duration: 0.45, ease: "power3.out" }, 0.15);
      } else {
        done();
      }
      return;
    }

    /* FLIP: dari kotak foto -> kotak tengah (hanya transform) */
    const s  = Math.min(from.width / b.w, from.height / b.h) || 1;
    const tx = (from.left + from.width / 2) - b.cx;
    const ty = (from.top + from.height / 2) - b.cy;

    gsap.set([LB.scrim, LB.cap, LB.btns], { opacity: 0 });
    gsap.set(LB.img, { x: tx, y: ty, scale: s, opacity: 1 });
    gsap.set(LB.cap, { y: 18 });

    gsap.timeline({ onComplete: done })
      .to(LB.scrim, { opacity: 1, duration: 0.5, ease: "power2.out" }, 0)
      .to(LB.img, { x: 0, y: 0, scale: 1, duration: 0.85, ease: "expo.inOut" }, 0)
      .to(LB.btns, { opacity: 1, duration: 0.4, stagger: 0.05 }, 0.35)
      .to(LB.cap, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.45);

    setTimeout(() => { if (LB.open && LB.btns[0]) LB.btns[0].focus(); }, 140);
  }

  function lbGo(step) {
    if (!LB.open || LB.busy) return;
    /* dari baris film: navigasi bertahan di dalam kategori yang sama */
    let next;
    if (LB.nav) {
      const at = LB.nav.indexOf(LB.index);
      next = at < 0 ? LB.index : LB.nav[(at + step + LB.nav.length) % LB.nav.length];
    } else {
      next = (LB.index + step + TOTAL) % TOTAL;
    }
    LB.busy = true;
    const outX = step > 0 ? -Math.round(window.innerWidth * 0.35) : Math.round(window.innerWidth * 0.35);

    if (!hasGSAP || reduced()) {
      LB.index = next;
      lbFill(next);
      lbSetSrc(next);
      lbPlace(lbBox());
      LB.busy = false;
      return;
    }

    gsap.timeline({
      onComplete: () => {
        LB.index = next;
        lbFill(next);
        lbSetSrc(next);
        const b = lbBox();
        lbPlace(b);
        gsap.set(LB.img, { x: outX, scale: 0.94, opacity: 1 });
        gsap.to(LB.img, { x: 0, scale: 1, duration: 0.6, ease: "expo.out" });
        gsap.fromTo(LB.cap, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
        LB.busy = false;
      }
    })
      .to(LB.cap, { opacity: 0, duration: 0.22, ease: "power2.in" }, 0)
      .to(LB.img, { x: outX, scale: 0.94, duration: 0.42, ease: "power2.in" }, 0);
  }

  function lbClose() {
    if (!LB.open || LB.busy) return;
    LB.busy = true;
    if (LB.lastFocus && LB.lastFocus.focus) LB.lastFocus.focus();

    const finish = () => {
      LB.root.classList.remove("is-open");
      LB.root.hidden = true;
      lockScroll(false);
      LB.open = false; LB.busy = false; LB.index = -1; LB.nav = null;
    };

    if (!hasGSAP || reduced()) {
      if (hasGSAP) gsap.to([LB.scrim, LB.img, LB.cap, LB.btns], { opacity: 0, duration: 0.22, onComplete: finish });
      else finish();
      return;
    }

    const to = lbRectFor(LB.index);
    const b = lbBox();

    if (!to) {
      gsap.timeline({ onComplete: finish })
        .to([LB.cap, LB.btns], { opacity: 0, duration: 0.28, ease: "power2.in" }, 0)
        .to(LB.img, { scale: 0.9, opacity: 0, duration: 0.4, ease: "power2.in" }, 0)
        .to(LB.scrim, { opacity: 0, duration: 0.45, ease: "power2.in" }, 0.1);
      return;
    }

    const s  = Math.min(to.width / b.w, to.height / b.h) || 1;
    const tx = (to.left + to.width / 2) - b.cx;
    const ty = (to.top + to.height / 2) - b.cy;

    gsap.timeline({ onComplete: finish })
      .to(LB.cap, { opacity: 0, y: 12, duration: 0.3, ease: "power2.in" }, 0)
      .to(LB.btns, { opacity: 0, duration: 0.25, ease: "power2.in" }, 0)
      .to(LB.img, { x: tx, y: ty, scale: s, duration: 0.75, ease: "expo.inOut" }, 0.05)
      .to(LB.scrim, { opacity: 0, duration: 0.55, ease: "power2.in" }, 0.2);
  }

  /* ------------------------------------- 9. rail, counter foto, transisi latar */

  function railAndCounter() {
    const fill = $(".rail__fill");
    if (fill && hasGSAP) {
      const setScale = gsap.quickSetter(fill, "scaleY", "");
      ST.create({
        trigger: document.documentElement,
        start: 0,
        end: "max",
        onUpdate: (self) => setScale(self.progress)
      });
    }

    /* counter foto: galeri yang melintasi pita tengah layar */
    if (nowEl && shotEls.length && "IntersectionObserver" in window) {
      const active = new Set();
      let current = -1;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          const i = parseInt(e.target.dataset.index, 10);
          if (e.isIntersecting) active.add(i); else active.delete(i);
        });
        if (!active.size) return;
        const mid = window.innerHeight / 2;
        let best = -1, bestD = Infinity;
        active.forEach((i) => {
          const r = shotEls[i].fig.getBoundingClientRect();
          const d = Math.abs(r.top + r.height / 2 - mid);
          if (d < bestD) { bestD = d; best = i; }
        });
        if (best !== current && best > -1) {
          current = best;
          nowEl.textContent = pad2(best + 1);
        }
      }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
      shotEls.forEach((s) => io.observe(s.fig));
    }

    /* transisi latar cream -> hijau tua di bagian penutup */
    const closing = $("#catatan");
    const topbar  = $(".topbar");
    const rootCS  = getComputedStyle(document.documentElement);
    const ink     = (rootCS.getPropertyValue("--ink") || "#1F3D2B").trim();


    if (closing && hasGSAP && !reduced()) {
      /* kertas pada bagian atas penutup larut jadi hijau tua saat section masuk */
      gsap.to(".closing__veil", {
        opacity: 0, ease: "none",
        scrollTrigger: { trigger: closing, start: "top bottom", end: "top 30%", scrub: true }
      });
      /* status terang/gelap untuk header, rail, dan counter */
      ST.create({
        trigger: closing, start: "top 8%", end: "bottom 8%", scrub: true,
        onUpdate: (self) => { document.body.classList.toggle("is-dark", self.progress > 0); }
      });
      /* isi penutup muncul bertahap */
      gsap.to(".closing__inner > *", {
        opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.07,
        scrollTrigger: { trigger: closing, start: "top 32%", once: true }
      });
    } else if (closing) {
      closing.style.background = ink;
      const veil = $(".closing__veil");
      if (veil) veil.style.opacity = 0;
    }

    /* garis bawah header muncul setelah lewat hero */
    if (topbar && hasGSAP && !reduced()) {
      ST.create({
        start: "top -80",
        end: 99999,
        onToggle: (self) => topbar.classList.toggle("is-stuck", self.isActive)
      });
    }
  }

  /* --------------------------------------- 9b. daun jatuh di hero (canvas)
     Maksimal 12 daun. Loop langsung pakai rAF sendiri (tidak lewat GSAP),
     berhenti saat hero keluar layar, tab disembunyikan, atau reduced-motion. */

  function fallingLeaves() {
    const cv = $("#heroLeaves");
    const hero = $(".hero");
    if (!cv || !hero || reduced() || !cv.getContext) return;

    /* beberapa browser memblokir canvas 2d (mode privat, ekstensi): kalau
       konteksnya null, halaman tetap jalan tanpa daun. */
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const MAXN = 12;
    const inks = ["#8FA98B", "#C6D2BE", "#6E8C6A", "#A8763F", "#3C5A45"];
    const leaves = [];
    let w = 0, h = 0, dpr = 1, raf = 0, live = false, last = 0;

    function resize() {
      const r = hero.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* y awal tersebar di sepanjang tinggi hero (bukan semua di atas layar),
       dan kecepatan turun dalam px/detik. Kalau semua daun mulai dari atas,
       layar terlihat kosong selama puluhan detik pertama. */
    function spawn(n, fresh) {
      return {
        x: Math.random() * w,
        y: fresh ? Math.random() * h : -30 - Math.random() * h * 0.5,
        s: 3.4 + Math.random() * 4.2,
        vy: 26 + Math.random() * 34,
        amp: 12 + Math.random() * 26,
        fq: 0.35 + Math.random() * 0.5,
        ph: Math.random() * 6.283,
        rot: Math.random() * 6.283,
        vr: (Math.random() - 0.5) * 1.5,
        c: inks[(Math.random() * inks.length) | 0],
        a: 0.32 + Math.random() * 0.4
      };
    }

    function leaf(l) {
      /* satu daun: dua busur, diputar pelan seperti jatuh tertiup */
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      ctx.globalAlpha = l.a;
      ctx.fillStyle = l.c;
      ctx.beginPath();
      ctx.moveTo(0, -l.s);
      ctx.quadraticCurveTo(l.s * 0.92, -l.s * 0.1, 0, l.s);
      ctx.quadraticCurveTo(-l.s * 0.92, -l.s * 0.1, 0, -l.s);
      ctx.fill();
      ctx.globalAlpha = l.a * 0.55;
      ctx.strokeStyle = "rgba(243, 235, 216, 0.5)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, -l.s * 0.85);
      ctx.lineTo(0, l.s * 0.85);
      ctx.stroke();
      ctx.restore();
    }

    function pump(ms) {
      raf = requestAnimationFrame(pump);
      const t = ms / 1000;
      let dt = last ? t - last : 0;
      last = t;
      if (dt > 0.05) dt = 0.05;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < leaves.length; i++) {
        const l = leaves[i];
        l.y += l.vy * dt;
        l.rot += l.vr * dt;
        l.x += Math.sin(t * l.fq * 6.283 * 0.16 + l.ph) * l.amp * dt;
        if (l.y - l.s > h) { leaves[i] = spawn(1, false); }
        if (l.x < -40) l.x = w + 30;
        if (l.x > w + 40) l.x = -30;
        leaf(l);
      }
    }

    function play(on) {
      if (on === live) return;
      live = on;
      if (on) { last = 0; raf = requestAnimationFrame(pump); }
      else { cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, w, h); }
    }

    function wanted() {
      if (document.visibilityState !== "visible") return false;
      const r = hero.getBoundingClientRect();
      return r.bottom > -100 && r.top < window.innerHeight + 100;
    }

    resize();
    for (let i = 0; i < MAXN; i++) leaves.push(spawn(i, true));

    window.addEventListener("resize", function () {
      resize();
      if (!live) ctx.clearRect(0, 0, w, h);
    }, { passive: true });
    document.addEventListener("visibilitychange", function () { play(wanted()); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { play(es[0].isIntersecting && wanted()); },
        { rootMargin: "80px 0px" }).observe(hero);
    } else {
      play(true);
    }
    play(wanted());
  }

  /* --------------------------- 9c. garis bawah judul yang tergambar sendiri
     Path SVG di bawah setiap .head, digambar dengan stroke-dashoffset saat
     section masuk viewport. Ditunda sedikit per judul supaya berurutan. */

  function inkMarks() {
    const heads = $$(".head").filter(function (h) { return h.closest(".hero") === null; });
    if (!heads.length) return;
    const svg = "http://www.w3.org/2000/svg";
    const nodes = [];
    heads.forEach(function (h, i) {
      const s = document.createElementNS(svg, "svg");
      s.setAttribute("class", "mark");
      s.setAttribute("viewBox", "0 0 240 12");
      s.setAttribute("aria-hidden", "true");
      s.style.transitionDelay = (i % 3) * 0.12 + "s";
      const p = document.createElementNS(svg, "path");
      p.setAttribute("d", "M3 8 C 42 2.5, 80 11, 118 6 S 194 1.5, 237 7.5");
      s.appendChild(p);
      (h.parentNode || h).insertBefore(s, h.nextSibling);
      nodes.push({ head: h, sec: h.closest("section") || h.parentNode, mark: s });
    });

    const mark = function (n) { n.sec.classList.add("is-inked"); };

    if (reduced()) { nodes.forEach(mark); return; }
    if (!("IntersectionObserver" in window)) { nodes.forEach(mark); return; }

    const io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        const n = nodes.find(function (x) { return x.sec === e.target; });
        if (n) { mark(n); io.unobserve(e.target); }
      });
    }, { threshold: 0.2 });
    nodes.forEach(function (n) { io.observe(n.sec); });
  }

  /* -------------------------------- 9d. tirai kain saat pindah antar-bagian
     Sama seperti intro, cuma cepat: turun 0,3 detik, pindah, naik 0,42 detik.
     Kalau reduced-motion atau GSAP tidak ada, tetap scroll normal. */

  const Wipe = { panels: null, busy: false };

  function navTo(target) {
    if (reduced() || !hasGSAP || Wipe.busy || !Wipe.panels || !Wipe.panels.length) {
      scrollTo(target);
      return;
    }
    Wipe.busy = true;
    gsap.timeline({
      onComplete: function () { Wipe.busy = false; }
    })
      .to(Wipe.panels, { scaleY: 1, duration: 0.3, ease: "power2.in" })
      .add(function () { scrollTo(target); })
      .to(Wipe.panels, { scaleY: 0, duration: 0.42, ease: "power3.out" }, "+=0.06");
  }

  /* ------------------------------------------------- 10. section baru + init */

  function newSections() {
    Rope.build();
    Film.build();
    Madd.build();
    maddingUI();
    fallingLeaves();
    inkMarks();
    Wipe.panels = $$(".wipe__panel");
  }

  /* ------------------------------------------------------------- 10. init */

  splitHero();
  setInitialStates();
  headReveals();
  heroParallax();
  stackCards();
  wallReveal();
  pageMap();
  tiltAndCursor();
  lbInit();
  railAndCounter();
  newSections();

  const refresh = () => { if (ST) ST.refresh(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  window.addEventListener("load", refresh);
  let rz = 0;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(refresh, 200); });

  /* Masonry hanya untuk layar lebar. Di HP seluruh bagian "Semua foto"
     disembunyikan CSS karena Jemuran sudah menggantikan perannya, jadi tidak
     ada apa pun yang perlu dibangun ulang saat mode berubah. */
  const onMode = () => {
    if (!mqPhone.matches) wallFallback();
    Film.mode();
    if (ST) ST.refresh();
  };
  if (mqPhone.addEventListener) mqPhone.addEventListener("change", onMode);
  else if (mqPhone.addListener) mqPhone.addListener(onMode);
  window.addEventListener("resize", onMode);

  playIntro(refresh);

  /* jaring pengaman: kalau GSAP gagal dimuat, semua isi tetap terlihat */
  setTimeout(() => {
    if (!hasGSAP) {
      $$(".shot").forEach((s) => s.classList.add("is-seen"));
      const c = $(".closing");
      if (c) c.style.background = getComputedStyle(document.documentElement).getPropertyValue("--ink");
    }
  }, 500);
})();

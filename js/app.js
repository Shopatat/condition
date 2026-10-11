// Condition : pomodoro sans chiffres, façon électrocardiogramme de Resident Evil.
"use strict";
(() => {
  const $ = (s) => document.querySelector(s);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Réglages ---------- */
  const KEY = "condition-pomodoro";
  const DEFAULTS = { work: 25, short: 5, long: 15, cycles: 4, auto: true, beep: false, alarm: true, demo: false, theme: "moniteur" };
  let cfg = { ...DEFAULTS };
  try { cfg = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };

  const numFields = ["work", "short", "long", "cycles"];
  const boolFields = ["auto", "beep", "alarm", "demo"];
  numFields.forEach((k) => {
    const el = $("#cfg-" + k);
    el.value = cfg[k];
    el.addEventListener("change", () => {
      const v = Math.round(Number(el.value));
      if (v >= Number(el.min) && v <= Number(el.max)) { cfg[k] = v; save(); renderDots(); }
      else el.value = cfg[k];
    });
  });
  boolFields.forEach((k) => {
    const el = $("#cfg-" + k);
    el.checked = cfg[k];
    el.addEventListener("change", () => { cfg[k] = el.checked; save(); });
  });
  $("#settings").addEventListener("submit", (e) => e.preventDefault());
  $("#gear").addEventListener("click", () => {
    const s = $("#settings");
    s.hidden = !s.hidden;
    $("#gear").setAttribute("aria-pressed", String(!s.hidden));
  });

  /* ---------- Son ---------- */
  let ac = null;
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(freq, dur, vol = 0.06, when = 0, type = "sine") {
    if (!ac) return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  const beep = () => tone(980, 0.07, 0.035);
  const chime = () => { tone(660, 0.16, 0.05); tone(880, 0.16, 0.05, 0.18); tone(1320, 0.35, 0.045, 0.36); };
  const softChime = () => { tone(523, 0.3, 0.04); tone(659, 0.3, 0.04, 0.22); tone(784, 0.6, 0.035, 0.44); };
  const nudge = () => { tone(659, 0.25, 0.03); tone(523, 0.45, 0.028, 0.2); };

  /* ---------- Minuteur (invisible) ---------- */
  const NUDGE_MIN = 3;
  const STATE_KEY = "condition-pomodoro-session";
  const st = { phase: "work", status: "idle", acc: 0, runStart: 0, done: 0, breakLong: false, breakRatio: 1, nextNudge: 0 };
  try { Object.assign(st, JSON.parse(localStorage.getItem(STATE_KEY) || "{}")); } catch (e) {}
  const saveState = () => { try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch (e) {} };
  const now = () => Date.now();
  const minutes = (m) => (m * 60000) / (cfg.demo ? 60 : 1);
  // Une pause prise en avance dure proportionnellement moins longtemps
  const duration = () => st.phase === "work"
    ? minutes(cfg.work)
    : minutes(st.breakLong ? cfg.long : cfg.short) * st.breakRatio;
  const elapsed = () => st.acc + (st.status === "running" ? now() - st.runStart : 0);

  // 0 = en pleine forme, 1 = danger. La pause repart du niveau où on s'est arrêté.
  function progress() {
    if (st.status === "overtime") return 1;
    const f = Math.min(1, elapsed() / duration());
    return st.phase === "work" ? f : st.breakRatio * (1 - f);
  }

  let wakeLock = null;
  function keepAwake() {
    if (!("wakeLock" in navigator) || wakeLock) return;
    navigator.wakeLock.request("screen").then((l) => { wakeLock = l; l.addEventListener("release", () => { wakeLock = null; }); }).catch(() => {});
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    tick();
    if (st.status === "running" || st.status === "overtime") keepAwake();
  });

  function run() { st.status = "running"; st.runStart = now(); keepAwake(); }
  function start() {
    audio();
    if (st.status === "idle" || st.status === "paused") run();
    updateUI();
  }
  function pause() {
    if (st.status !== "running") return;
    st.acc += now() - st.runStart;
    st.status = "paused";
    updateUI();
  }
  function toggle() {
    if (st.status === "overtime") takeBreak();
    else if (st.status === "running") pause();
    else start();
  }
  function reset() {
    Object.assign(st, { phase: "work", status: "idle", acc: 0, done: 0, breakLong: false, breakRatio: 1 });
    updateUI();
  }

  // Fin de la concentration : pas de pause forcée, Danger reste et clignote jusqu'à ce qu'on la prenne
  function endWork() {
    st.acc = 0;
    st.status = "overtime";
    keepAwake();
    st.nextNudge = now() + minutes(NUDGE_MIN);
    if (cfg.alarm) { audio(); softChime(); }
    updateUI();
  }
  function takeBreak() {
    if (st.phase !== "work" || st.status === "idle") return;
    const ratio = st.status === "overtime" ? 1 : Math.min(1, elapsed() / duration());
    audio();
    st.done += 1;
    st.phase = "break";
    st.breakLong = st.done % cfg.cycles === 0;
    st.breakRatio = Math.max(0.02, ratio);
    st.acc = 0;
    run();
    updateUI();
  }
  function endBreak(early) {
    if (!early && cfg.alarm) { audio(); chime(); }
    if (st.breakLong) st.done = 0;
    st.phase = "work";
    st.breakLong = false;
    st.breakRatio = 1;
    st.acc = 0;
    if (cfg.auto && !early) run(); else st.status = "idle";
    updateUI();
  }
  function skip() {
    if (st.phase === "work") takeBreak(); else endBreak(true);
  }

  function tick() {
    if (st.status === "running" && elapsed() >= duration()) {
      st.phase === "work" ? endWork() : endBreak(false);
    } else if (st.status === "overtime" && now() >= st.nextNudge) {
      st.nextNudge = now() + minutes(NUDGE_MIN);
      if (cfg.alarm) { audio(); nudge(); }
    }
    const p = progress();
    const word = wordFor(p);
    const alt = st.status === "overtime" && Math.floor(Date.now() / 1000) % 2 === 1;
    document.title = (alt ? "Pause !" : word) + " · Condition";
    const status = $("#status");
    if (status.textContent !== word) status.textContent = word;
    document.documentElement.style.setProperty("--state", color(p));
    document.documentElement.style.setProperty("--ink-state", ink(p));
  }
  setInterval(tick, 250);

  /* ---------- Interface ---------- */
  function updateUI() {
    saveState();
    $("#toggle").textContent =
      st.status === "running" ? "Suspendre" :
      st.status === "paused" ? "Reprendre" :
      st.status === "overtime" ? "Prendre ma pause" : "Démarrer";
    const sk = $("#skip");
    sk.hidden = st.status === "overtime";
    sk.textContent = st.phase === "work" ? "Prendre ma pause" : "Terminer la pause";
    sk.disabled = st.phase === "work" && st.status === "idle";
    const tag = $("#phaseTag");
    const label = st.phase === "work" ? "Concentration" : st.breakLong ? "Longue pause" : "Pause";
    tag.textContent = st.status === "paused" ? "Suspendu" : label;
    tag.classList.toggle("blink", st.status === "paused");
    document.documentElement.classList.toggle("overtime", st.status === "overtime");
    document.documentElement.classList.toggle("focus", st.status === "running" || st.status === "overtime");
    renderDots();
  }
  let peekTimer = 0;
  function peek() {
    const root = document.documentElement;
    if (!root.classList.contains("focus")) return;
    root.classList.add("peek");
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => root.classList.remove("peek"), 4000);
  }
  document.addEventListener("pointerdown", peek);
  function renderDots() {
    const box = $("#dots");
    box.textContent = "";
    let filled = st.phase === "break" && st.breakLong ? cfg.cycles : st.done % cfg.cycles;
    if (st.status === "overtime") filled += 1;
    const current = st.phase === "work" && st.status !== "overtime";
    for (let i = 0; i < cfg.cycles; i++) {
      const d = document.createElement("span");
      d.className = "dot" + (i < filled ? " done" : i === filled && current ? " now" : "");
      box.appendChild(d);
    }
  }
  $("#toggle").addEventListener("click", toggle);
  $("#skip").addEventListener("click", skip);
  $("#reset").addEventListener("click", reset);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Tab") peek();
    if (e.target.closest("input, button, select, textarea")) return;
    if (e.code === "Space") { e.preventDefault(); toggle(); }
    else if (e.key === "r" || e.key === "R") reset();
  });

  /* ---------- Couleur et état ---------- */
  const HUES = [[0, 130], [0.3, 112], [0.48, 52], [0.66, 30], [0.86, 6], [1, 0]];
  function hueAt(p) {
    for (let i = 1; i < HUES.length; i++) {
      const [p1, h1] = HUES[i], [p0, h0] = HUES[i - 1];
      if (p <= p1) return h0 + (h1 - h0) * ((p - p0) / (p1 - p0));
    }
    return 0;
  }
  const color = (p, a = 1) => `hsla(${hueAt(p).toFixed(1)}, 96%, ${(58 - 6 * p).toFixed(1)}%, ${a})`;
  // Encre sombre pour le papier clair de la version 2 : l'orange est un peu éclairci pour rester lisible
  function ink(p, a = 1) {
    const h = hueAt(p), l = 30 + 9 * Math.max(0, 1 - Math.abs(h - 42) / 25);
    return `hsla(${h.toFixed(1)}, 72%, ${l.toFixed(1)}%, ${a})`;
  }
  const wordFor = (p) => p < 0.42 ? "Ok" : p < 0.78 ? "Attention" : "Danger";

  /* ---------- Écran : deux versions au choix dans les réglages ---------- */
  const screen = $("#screen");
  const gridC = $("#grid"), traceC = $("#trace"), headC = $("#head");
  const gctx = gridC.getContext("2d"), tctx = traceC.getContext("2d"), hctx = headC.getContext("2d");
  let W = 0, H = 0, dpr = 1, pulse = 0;

  function resize() {
    const r = screen.getBoundingClientRect();
    if (!r.width) return;
    const oldW = W, oldH = H;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    for (const c of [gridC, traceC, headC]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    for (const c of [gctx, tctx, hctx]) c.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.resize(oldW, oldH);
  }

  const g = (u, c, s) => Math.exp(-(((u - c) / s) ** 2));
  function shape(u, pvc) {
    if (pvc) return -0.55 * g(u, 0.38, 0.07) + 0.75 * g(u, 0.5, 0.05) - 0.2 * g(u, 0.75, 0.09);
    return 0.1 * g(u, 0.16, 0.045) - 0.12 * g(u, 0.33, 0.02) + g(u, 0.38, 0.028) - 0.32 * g(u, 0.44, 0.026) + 0.22 * g(u, 0.68, 0.08);
  }
  const bpmFor = (p) => 60 + 85 * p ** 1.4;
  // Le cœur s'emballe et devient irrégulier en approchant du Danger
  const jitterFor = (p) => 0.04 + 0.3 * Math.max(0, p - 0.45);
  const irregularFor = (p) => 0.02 + 0.22 * Math.max(0, p - 0.6);
  const pvcFor = (p) => p > 0.8 && Math.random() < (p - 0.8) * 1.6;
  function onBeat(p) {
    if (cfg.beep && ac && document.visibilityState === "visible") beep();
    if (p > 0.75) pulse = Math.min(1, (p - 0.75) * 3.2);
  }

  /* ----- Version 1 : moniteur à phosphore, un point lumineux balaie l'écran ----- */
  const monitor = (() => {
    const bufC = document.createElement("canvas"), bctx = bufC.getContext("2d");
    const SWEEP_S = 3.2, TAU = 1.5;
    let y0 = 0, amp = 0, x = 0, sweep = null, gridHue = -1;

    function resize(oldW) {
      // Garde le tracé déjà dessiné quand l'écran change de taille (vue épurée, rotation)
      let snap = null;
      if (oldW && bufC.width) {
        snap = document.createElement("canvas");
        snap.width = bufC.width; snap.height = bufC.height;
        snap.getContext("2d").drawImage(bufC, 0, 0);
      }
      bufC.width = Math.round(W * dpr); bufC.height = Math.round(H * dpr);
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (snap) bctx.drawImage(snap, 0, 0, W, H);
      y0 = H * 0.6; amp = H * 0.42;
      gridHue = -1;
      x = Math.min(W - 1, x * (oldW ? W / oldW : 0));
      newSweep();
    }
    function enter() {
      bctx.clearRect(0, 0, bufC.width, bufC.height);
      x = 0; gridHue = -1;
    }

    function drawGrid(p) {
      gctx.clearRect(0, 0, W, H);
      const step = H / 10;
      for (let i = 0, gx = 0; gx <= W; i++, gx += step) {
        gctx.fillStyle = color(p, i % 5 === 0 ? 0.13 : 0.05);
        gctx.fillRect(Math.round(gx), 0, 1, H);
      }
      for (let i = 0, gy = H - ((H - y0) % step); gy >= 0; i++, gy -= step) {
        gctx.fillStyle = color(p, i % 5 === 0 ? 0.13 : 0.05);
        gctx.fillRect(0, Math.round(gy), W, 1);
      }
    }

    // Prépare les battements d'un balayage complet, de gauche à droite
    function makeSweep(p) {
      const v = W / SWEEP_S;
      const spacing = (v * 60) / bpmFor(p);
      const bw = Math.min(spacing * 0.75, H * 0.5, 74);
      const jitter = jitterFor(p), irregular = irregularFor(p);
      const s = { beats: [], wobble: Math.max(0, p - 0.65) * H * 0.02, seed: Math.random() * 10 };
      let bx = spacing * (0.25 + Math.random() * 0.5);
      while (bx < W - bw * 0.4) {
        const pvc = pvcFor(p);
        s.beats.push({ x: bx, w: pvc ? bw * 1.15 : bw, a: 1 + (Math.random() * 2 - 1) * jitter, pvc, heard: false });
        bx += spacing * (1 + (Math.random() * 2 - 1) * irregular);
      }
      return s;
    }
    function newSweep() { sweep = makeSweep(progress()); }

    function yAt(px) {
      let y = y0;
      for (const b of sweep.beats) {
        const u = (px - b.x) / b.w;
        if (u >= 0 && u <= 1) { y -= amp * b.a * shape(u, b.pvc); break; }
      }
      if (sweep.wobble) y += sweep.wobble * (Math.sin(px * 0.07 + sweep.seed) + 0.5 * Math.sin(px * 0.19 + sweep.seed * 2));
      return y;
    }

    function drawSegment(xa, xb, p) {
      bctx.beginPath();
      bctx.moveTo(xa, yAt(xa));
      for (let px = xa + 0.6; px < xb; px += 0.6) bctx.lineTo(px, yAt(px));
      bctx.lineTo(xb, yAt(xb));
      bctx.lineJoin = "round"; bctx.lineCap = "round";
      bctx.strokeStyle = color(p);
      bctx.shadowColor = color(p);
      bctx.shadowBlur = 9 * dpr;
      bctx.lineWidth = 2.2;
      bctx.stroke();
      bctx.shadowBlur = 0;
      bctx.strokeStyle = `hsla(${hueAt(p)}, 100%, 86%, 0.85)`;
      bctx.lineWidth = 0.9;
      bctx.stroke();

      for (const b of sweep.beats) {
        const peak = b.x + b.w * (b.pvc ? 0.5 : 0.38);
        if (!b.heard && peak > xa && peak <= xb) { b.heard = true; onBeat(p); }
      }
    }

    function fadeMask() {
      const grad = tctx.createLinearGradient(0, 0, W, 0);
      const v = W / SWEEP_S, N = 14;
      const stop = (px, age) => grad.addColorStop(Math.min(1, Math.max(0, px / W)), `rgba(0,0,0,${Math.exp(-age / TAU).toFixed(4)})`);
      for (let i = 0; i <= N; i++) { const px = (x * i) / N; stop(px, (x - px) / v); }
      stop(x + 0.5, SWEEP_S);
      for (let i = 1; i <= N; i++) { const px = x + ((W - x) * i) / N; stop(px, (x + W - px) / v); }
      return grad;
    }

    function frame(dt, p) {
      if (Math.abs(hueAt(p) - gridHue) > 2) { drawGrid(p); gridHue = hueAt(p); }

      let remaining = (W / SWEEP_S) * dt;
      while (remaining > 0.01) {
        const xb = Math.min(W, x + remaining);
        drawSegment(x, xb, p);
        remaining -= xb - x;
        x = xb;
        if (x >= W) { x = 0; newSweep(); }
      }
      bctx.clearRect(x + 2, 0, Math.max(14, W * 0.025), H);

      // Rémanence du phosphore : plus un point est ancien (derrière la tête), plus il est transparent
      tctx.clearRect(0, 0, W, H);
      tctx.drawImage(bufC, 0, 0, W, H);
      tctx.globalCompositeOperation = "destination-in";
      tctx.fillStyle = fadeMask();
      tctx.fillRect(0, 0, W, H);
      tctx.globalCompositeOperation = "source-over";

      // Point lumineux de la tête
      hctx.clearRect(0, 0, W, H);
      const hy = yAt(x);
      const rad = hctx.createRadialGradient(x, hy, 0, x, hy, 12);
      rad.addColorStop(0, `hsla(${hueAt(p)}, 100%, 92%, 0.95)`);
      rad.addColorStop(0.3, color(p, 0.55));
      rad.addColorStop(1, color(p, 0));
      hctx.fillStyle = rad;
      hctx.fillRect(x - 12, hy - 12, 24, 24);
    }

    return { resize, enter, frame };
  })();

  /* ----- Version 2 : l'enregistreur de REmake, un stylet fixe trace sur du papier qui défile ----- */
  const recorder = (() => {
    const PAPER_S = 2.4;   // temps mis par un point du papier pour traverser l'écran
    const paperC = document.createElement("canvas"), pctx = paperC.getContext("2d");
    let P = 0, top = 0, bot = 0, y0 = 0, amp = 0, pivX = 0, penX = 0, dialR = 0;
    let t = 0, scroll = 0, nextBeat = 0.3, beats = [], pts = [], seed = Math.random() * 10;
    // Hasard reproductible, pour que les taches du papier ne bougent pas d'un redimensionnement à l'autre
    const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

    // Une bande de papier qui se répète sans raccord visible : fond gris, taches, grands carreaux, graduations
    function paintPaper() {
      const rowH = (bot - top) / 4;
      const cols = Math.max(4, Math.ceil(W / rowH));
      P = Math.round(rowH * cols * dpr) / dpr;
      const colW = P / cols;
      paperC.width = Math.round(P * dpr); paperC.height = Math.round(H * dpr);
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.fillStyle = "#c8c5b7";
      pctx.fillRect(0, 0, P, H);
      for (let i = 0; i < 28; i++) {
        const sx = rnd(i) * P, sy = rnd(i + 50) * H, r = H * (0.08 + 0.3 * rnd(i + 100));
        const a = 0.04 + 0.12 * rnd(i + 150);
        for (const ox of [-P, 0, P]) {
          const grad = pctx.createRadialGradient(sx + ox, sy, 0, sx + ox, sy, r);
          grad.addColorStop(0, `rgba(105, 85, 55, ${a})`);
          grad.addColorStop(1, "rgba(105, 85, 55, 0)");
          pctx.fillStyle = grad;
          pctx.fillRect(sx + ox - r, sy - r, r * 2, r * 2);
        }
      }
      // Les bords du papier s'enroulent sur les rouleaux, un peu plus sombres
      const roll = pctx.createLinearGradient(0, 0, 0, H);
      roll.addColorStop(0, "rgba(20, 18, 12, 0.45)");
      roll.addColorStop(0.09, "rgba(20, 18, 12, 0)");
      roll.addColorStop(0.91, "rgba(20, 18, 12, 0)");
      roll.addColorStop(1, "rgba(20, 18, 12, 0.45)");
      pctx.fillStyle = roll;
      pctx.fillRect(0, 0, P, H);

      pctx.fillStyle = "rgba(55, 52, 42, 0.12)";
      for (let i = 0; i < cols * 5; i++) pctx.fillRect(i * colW / 5, top, 1, bot - top);
      for (let j = 0; j < 20; j++) pctx.fillRect(0, top + j * rowH / 5, P, 1);
      pctx.fillStyle = "rgba(40, 38, 30, 0.6)";
      const lw = Math.max(1, H / 260);
      for (let i = 0; i < cols; i++) pctx.fillRect(i * colW, top, lw, bot - top);
      for (let j = 0; j <= 4; j++) pctx.fillRect(0, top + j * rowH - lw / 2, P, lw);
      const tick = H * 0.045;
      for (let i = 0; i < cols * 2; i++) {
        const tx = i * colW / 2, len = i % 2 ? tick * 0.6 : tick;
        pctx.fillRect(tx, top, lw * 1.6, len);
        pctx.fillRect(tx, bot - len, lw * 1.6, len);
      }
    }

    function resize(oldW, oldH) {
      const rx = oldW ? W / oldW : 1, ry = oldH ? H / oldH : 1;
      top = H * 0.15; bot = H * 0.85;
      y0 = top + (bot - top) * 0.6; amp = (bot - top) * 0.56;
      dialR = H * 0.16;
      pivX = Math.max(14, W * 0.05);
      penX = pivX + Math.max(dialR * 1.6, W * 0.15);
      for (const q of pts) { q.d = scroll - (scroll - q.d) * rx; q.y *= ry; }
      paintPaper();
    }
    function enter() { t = 0; scroll = 0; nextBeat = 0.3; beats = []; pts = []; }

    function schedule(p) {
      while (nextBeat <= t + 0.5) {
        const period = 60 / bpmFor(p), pvc = pvcFor(p);
        const dur = Math.min(period * 0.75, 0.34) * (pvc ? 1.15 : 1);
        beats.push({ start: nextBeat, dur, a: 1 + (Math.random() * 2 - 1) * jitterFor(p), pvc, heard: false });
        nextBeat += period * (1 + (Math.random() * 2 - 1) * irregularFor(p));
      }
      while (beats.length && beats[0].start + beats[0].dur < t - 1) beats.shift();
    }
    function value(tt, p) {
      let y = y0;
      for (const b of beats) {
        const u = (tt - b.start) / b.dur;
        if (u >= 0 && u <= 1) { y -= amp * b.a * shape(u, b.pvc); break; }
      }
      const wobble = Math.max(0, p - 0.65) * H * 0.02;
      if (wobble) y += wobble * (Math.sin(tt * 17 + seed) + 0.5 * Math.sin(tt * 47 + seed * 2));
      return y;
    }

    function drawDial() {
      const cx = pivX, cy = y0, R = dialR;
      const disc = hctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      disc.addColorStop(0, "#4a4943");
      disc.addColorStop(1, "#141412");
      hctx.fillStyle = disc;
      hctx.beginPath(); hctx.arc(cx, cy, R, 0, Math.PI * 2); hctx.fill();
      hctx.lineWidth = Math.max(1.5, R * 0.06);
      hctx.strokeStyle = "#77746a";
      hctx.stroke();
      // Couronnes de trous, comme le cadran perforé du jeu
      hctx.fillStyle = "#050505";
      for (const [ring, n] of [[0.55, 12], [0.8, 18]]) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + ring;
          hctx.beginPath();
          hctx.arc(cx + Math.cos(a) * R * ring, cy + Math.sin(a) * R * ring, R * 0.055, 0, Math.PI * 2);
          hctx.fill();
        }
      }
    }
    function drawPen(tipY, p) {
      const L = Math.hypot(penX - pivX, tipY - y0), w = Math.max(3, H * 0.024);
      hctx.save();
      hctx.translate(pivX, y0);
      hctx.rotate(Math.atan2(tipY - y0, penX - pivX));
      hctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      hctx.shadowOffsetY = Math.max(2, H * 0.012);
      hctx.shadowBlur = 4;
      const metal = hctx.createLinearGradient(0, -w, 0, w);
      metal.addColorStop(0, "#f3f0e6");
      metal.addColorStop(0.45, "#b3afa3");
      metal.addColorStop(1, "#4f4c45");
      hctx.fillStyle = metal;
      hctx.beginPath();
      hctx.moveTo(-dialR * 0.4, -w * 0.9);
      hctx.lineTo(L - w, -w * 0.35);
      hctx.lineTo(L, 0);
      hctx.lineTo(L - w, w * 0.35);
      hctx.lineTo(-dialR * 0.4, w * 0.9);
      hctx.closePath();
      hctx.fill();
      hctx.shadowColor = "transparent";
      // La pointe, encrée de la couleur du tracé
      hctx.fillStyle = ink(p);
      hctx.beginPath(); hctx.arc(L, 0, w * 0.45, 0, Math.PI * 2); hctx.fill();
      // Moyeu du pivot
      const hub = hctx.createRadialGradient(-w * 0.4, -w * 0.4, 0, 0, 0, w * 1.6);
      hub.addColorStop(0, "#efece2");
      hub.addColorStop(1, "#5d5a52");
      hctx.fillStyle = hub;
      hctx.beginPath(); hctx.arc(0, 0, w * 1.6, 0, Math.PI * 2); hctx.fill();
      hctx.fillStyle = "#1c1b18";
      hctx.beginPath(); hctx.arc(0, 0, w * 0.45, 0, Math.PI * 2); hctx.fill();
      hctx.restore();
    }

    function frame(dt, p) {
      const v = W / PAPER_S;
      schedule(p);
      const n = Math.max(1, Math.ceil(dt * 240));
      for (let i = 1; i <= n; i++) {
        scroll += (v * dt) / n;
        pts.push({ d: scroll, y: value(t + (dt * i) / n, p) });
      }
      for (const b of beats) {
        const peak = b.start + b.dur * (b.pvc ? 0.5 : 0.38);
        if (!b.heard && peak <= t + dt) { b.heard = true; if (peak > t - 0.2) onBeat(p); }
      }
      t += dt;
      let k = 0;
      while (k < pts.length && penX + scroll - pts[k].d > W + 4) k++;
      if (k) pts.splice(0, k);

      // Le papier avance vers la droite, la courbe avec lui
      gctx.clearRect(0, 0, W, H);
      const off = Math.round((scroll % P) * dpr) / dpr;
      for (let px = off - P; px < W; px += P) gctx.drawImage(paperC, px, 0, P, H);

      tctx.clearRect(0, 0, W, H);
      if (pts.length > 1) {
        tctx.beginPath();
        pts.forEach((q, i) => { const px = penX + scroll - q.d; i ? tctx.lineTo(px, q.y) : tctx.moveTo(px, q.y); });
        tctx.lineJoin = "round"; tctx.lineCap = "round";
        tctx.strokeStyle = ink(p, 0.2); tctx.lineWidth = 3.4; tctx.stroke();
        tctx.strokeStyle = ink(p); tctx.lineWidth = 1.6; tctx.stroke();
      }

      hctx.clearRect(0, 0, W, H);
      drawDial();
      drawPen(pts.length ? pts[pts.length - 1].y : y0, p);
    }

    return { resize, enter, frame };
  })();

  const views = { moniteur: monitor, remake: recorder };
  let view = monitor;
  function setView(name) {
    if (!views[name]) name = "moniteur";
    view = views[name];
    document.documentElement.classList.toggle("theme-remake", name === "remake");
    for (const c of [gctx, tctx, hctx]) c.clearRect(0, 0, W, H);
    view.enter();
    resize();
  }
  const themeSel = $("#cfg-theme");
  themeSel.value = views[cfg.theme] ? cfg.theme : "moniteur";
  themeSel.addEventListener("change", () => { cfg.theme = themeSel.value; save(); setView(cfg.theme); tick(); });

  let last = 0;
  function frame(t) {
    const dt = Math.min(0.1, last ? (t - last) / 1000 : 0.016);
    last = t;
    if (!W) { resize(); requestAnimationFrame(frame); return; }
    view.frame(dt, progress());
    if (!reduceMotion) {
      pulse *= Math.exp(-dt / 0.35);
      document.documentElement.style.setProperty("--pulse", pulse.toFixed(3));
    }
    requestAnimationFrame(frame);
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  new ResizeObserver(() => resize()).observe(screen);
  updateUI();
  tick();
  if (st.status === "running" || st.status === "overtime") keepAwake();
  setView(themeSel.value);
  requestAnimationFrame(frame);
})();

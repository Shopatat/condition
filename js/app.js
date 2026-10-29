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
    document.documentElement.style.setProperty("--ink-state", plateInk(p));
  }
  setInterval(tick, 250);

  /* ---------- Interface ---------- */
  function updateUI() {
    saveState();
    const tg = $("#toggle");
    tg.querySelector(".lbl").textContent =
      st.status === "running" ? "Suspendre" :
      st.status === "paused" ? "Reprendre" :
      st.status === "overtime" ? "Prendre ma pause" : "Démarrer";
    tg.dataset.ico = st.status === "running" ? "pause" : "play";
    const sk = $("#skip");
    sk.hidden = st.status === "overtime";
    sk.querySelector(".lbl").textContent = st.phase === "work" ? "Prendre ma pause" : "Terminer la pause";
    sk.disabled = st.phase === "work" && st.status === "idle";
    const label = st.phase === "work" ? "Concentration" : st.breakLong ? "Longue pause" : "Pause";
    for (const tag of document.querySelectorAll("[data-phase]")) {
      tag.textContent = st.status === "paused" ? "Suspendu" : label;
      tag.classList.toggle("blink", st.status === "paused");
    }
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
  const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

  /* Version 2 : les encres. Les deux bouts sont relevés dans le jeu (vert olive en Normal, cramoisi en Danger) ;
     entre les deux on passe par le jaune puis l'orange. Les teintes sont mélangées dans l'espace OKLab,
     qui suit l'œil : le passage reste naturel, sans kaki ni brun boueux au milieu.
     Les teintes intermédiaires sont provisoires, en attendant des enregistrements du jeu en Attention. */
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const unlin = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);
  function oklab([r, g, b]) {
    r = lin(r); g = lin(g); b = lin(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function srgb([L, A, B]) {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((c) => Math.max(0, Math.min(255, unlin(c))));
  }
  function ramp(stops, p) {
    let i = 1;
    while (i < stops.length - 1 && p > stops[i][0]) i++;
    const [p0, c0] = stops[i - 1], [p1, c1] = stops[i], u = smooth(p0, p1, p);
    const a = oklab(c0), b = oklab(c1);
    return srgb(a.map((v, j) => v + (b[j] - v) * u));
  }
  const INK = {
    trace: [[0, [88, 123, 71]], [0.3, [100, 126, 62]], [0.48, [158, 132, 42]], [0.66, [176, 92, 36]], [0.86, [118, 24, 25]], [1, [105, 17, 20]]],
    plate: [[0, [46, 74, 38]], [0.3, [56, 76, 32]], [0.48, [104, 84, 18]], [0.66, [120, 56, 18]], [0.86, [122, 24, 26]], [1, [121, 21, 25]]],
    vialLo: [[0, [36, 52, 30]], [0.3, [42, 52, 26]], [0.48, [56, 48, 14]], [0.66, [54, 28, 10]], [0.86, [26, 3, 3]], [1, [17, 0, 1]]],
    vialHi: [[0, [149, 226, 111]], [0.3, [170, 224, 100]], [0.48, [222, 206, 92]], [0.66, [226, 140, 58]], [0.86, [150, 22, 20]], [1, [121, 6, 10]]],
  };
  const rgba = (c, a = 1) => `rgba(${c.map(Math.round).join(",")},${a})`;
  const traceInk = (p, a = 1) => rgba(ramp(INK.trace, p), a);
  // Encre gravée de la plaque d'état
  const plateInk = (p) => rgba(ramp(INK.plate, p));
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
    // Le rythme suit le temps, pas le balayage : quand le point revient à gauche, le cœur continue sans à-coup
    let y0 = 0, amp = 0, x = 0, gridHue = -1;
    let t = 0, nextBeat = 0.4, beats = [], seed = Math.random() * 10;
    const speed = () => W / SWEEP_S;

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
    }
    function enter() {
      bctx.clearRect(0, 0, bufC.width, bufC.height);
      x = 0; gridHue = -1;
      t = 0; nextBeat = 0.4; beats = [];
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

    // Prévoit les battements un peu à l'avance, chacun à la suite du précédent (durées en secondes)
    function schedule(p) {
      const v = speed();
      while (nextBeat < t + 2) {
        const period = 60 / bpmFor(p);
        const dur = Math.min(period * 0.75, (H * 0.5) / v, 74 / v);
        const pvc = pvcFor(p);
        beats.push({ t0: nextBeat, dur: pvc ? dur * 1.15 : dur, a: 1 + (Math.random() * 2 - 1) * jitterFor(p), pvc, heard: false });
        nextBeat += period * (1 + (Math.random() * 2 - 1) * irregularFor(p));
      }
      while (beats.length && beats[0].t0 + beats[0].dur < t - 1) beats.shift();
    }

    function yAt(tt, p) {
      let y = y0;
      for (const b of beats) {
        const u = (tt - b.t0) / b.dur;
        if (u >= 0 && u <= 1) { y -= amp * b.a * shape(u, b.pvc); break; }
      }
      const wobble = Math.max(0, p - 0.65) * H * 0.02;
      if (wobble) { const q = tt * speed(); y += wobble * (Math.sin(q * 0.07 + seed) + 0.5 * Math.sin(q * 0.19 + seed * 2)); }
      return y;
    }

    // Trace de l'instant ta à tb, la tête partant de xa
    function drawSegment(ta, tb, xa, p) {
      const v = speed(), xb = xa + (tb - ta) * v;
      bctx.beginPath();
      bctx.moveTo(xa, yAt(ta, p));
      for (let px = xa + 0.6; px < xb; px += 0.6) bctx.lineTo(px, yAt(ta + (px - xa) / v, p));
      bctx.lineTo(xb, yAt(tb, p));
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

      for (const b of beats) {
        const peak = b.t0 + b.dur * (b.pvc ? 0.5 : 0.38);
        if (!b.heard && peak <= tb) { b.heard = true; if (peak > ta - 0.2) onBeat(p); }
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

      schedule(p);
      const v = speed();
      let remaining = dt;
      while (remaining > 1e-5) {
        const step = Math.min(remaining, (W - x) / v);
        drawSegment(t, t + step, x, p);
        t += step; x += step * v; remaining -= step;
        if (x >= W - 0.01) x = 0;
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
      const hy = yAt(t, p);
      const rad = hctx.createRadialGradient(x, hy, 0, x, hy, 12);
      rad.addColorStop(0, `hsla(${hueAt(p)}, 100%, 92%, 0.95)`);
      rad.addColorStop(0.3, color(p, 0.55));
      rad.addColorStop(1, color(p, 0));
      hctx.fillStyle = rad;
      hctx.fillRect(x - 12, hy - 12, 24, 24);
    }

    return { resize, enter, frame };
  })();

  /* ----- Version 2 : l'enregistreur de l'écran de statut de Resident Evil REmake -----
     Tout l'appareil est dessiné d'après l'enregistrement du jeu, image par image.
     Les cotes sont en « g », la hauteur de la grille du papier : tout le reste s'y rapporte. */
  const recorder = (() => {
    const DEV_W = 3.38, DEV_H = 2.07;
    const PAPER = { x0: 0.75, y0: 0.186, x1: 3.007, y1: 1.706 };
    const GRID_T = 0.547, GRID_B = 1.547, BASE = 1.057;
    const PIV = { x: 0.378, y: BASE }, ARM = 0.87;          // pivot du stylet et longueur du bras
    const DIAL = { x: 0.534, y: BASE, r: 0.367 };
    const VIAL = { x0: 0.075, y0: 0.465, x1: 0.295, y1: 1.755 };
    const PLATE = { x0: 1.06, y0: 1.777, x1: 2.554, y1: 1.98 };
    const SPEED = 1.14;                                    // le papier avance de 1,14 g par seconde
    const COL = 0.3, COLS = 8, ROWS = 7, TILE = COL * COLS;

    let k = 1, ox = 0, oy = 0, tileW = 0, tileH = 0;
    let t = 0, scroll = 0, nextBeat = 0.25, beats = [], pts = [], seed = Math.random() * 100, vialClock = 1;
    const X = (u) => ox + u * k, Y = (v) => oy + v * k;
    // Hasard reproductible : les taches et l'usure ne bougent pas d'un redimensionnement à l'autre
    const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    function noise(x, y, per, s) {
      const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const m = (a) => ((a % per) + per) % per;
      const h = (a, b) => rnd(m(a) * 57.31 + b * 131.7 + s * 17.13);
      const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }

    /* --- Petits outils de dessin, en unités g --- */
    function box(c, x0, y0, x1, y1, r = 0) {
      c.beginPath();
      if (r && c.roundRect) c.roundRect(X(x0), Y(y0), (x1 - x0) * k, (y1 - y0) * k, r * k);
      else c.rect(X(x0), Y(y0), (x1 - x0) * k, (y1 - y0) * k);
    }
    function grad(c, x0, y0, x1, y1, stops) {
      const gr = c.createLinearGradient(X(x0), Y(y0), X(x1), Y(y1));
      for (const [o, col] of stops) gr.addColorStop(o, col);
      return gr;
    }
    function fill(c, x0, y0, x1, y1, r, style) { box(c, x0, y0, x1, y1, r); c.fillStyle = style; c.fill(); }
    const vfill = (c, x0, y0, x1, y1, r, stops) => fill(c, x0, y0, x1, y1, r, grad(c, 0, y0, 0, y1, stops));
    const hfill = (c, x0, y0, x1, y1, r, stops) => fill(c, x0, y0, x1, y1, r, grad(c, x0, 0, x1, 0, stops));
    function circle(c, x, y, r, style) { c.beginPath(); c.arc(X(x), Y(y), r * k, 0, Math.PI * 2); c.fillStyle = style; c.fill(); }
    // Métal usé : rayures fines et taches de crasse, dans la zone donnée
    function wear(c, x0, y0, x1, y1, s, n, vertical) {
      c.save();
      box(c, x0, y0, x1, y1); c.clip();
      const lw = Math.max(0.5, k * 0.004);
      for (let i = 0; i < n; i++) {
        const r1 = rnd(s + i * 1.31), r2 = rnd(s + i * 2.17), light = rnd(s + i * 3.7) > 0.55;
        c.fillStyle = light ? `rgba(255,248,238,${(0.05 + 0.1 * r2).toFixed(3)})` : `rgba(25,18,12,${(0.05 + 0.12 * r2).toFixed(3)})`;
        if (vertical) c.fillRect(X(x0 + (x1 - x0) * r1), Y(y0), lw, (y1 - y0) * k);
        else c.fillRect(X(x0), Y(y0 + (y1 - y0) * r1), (x1 - x0) * k, lw);
      }
      for (let i = 0; i < Math.max(2, n / 6); i++) {
        const cx = x0 + (x1 - x0) * rnd(s + 50 + i), cy = y0 + (y1 - y0) * rnd(s + 80 + i), r = 0.04 + 0.12 * rnd(s + 110 + i);
        const gr = c.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), r * k);
        gr.addColorStop(0, "rgba(45,30,20,0.2)");
        gr.addColorStop(1, "rgba(45,30,20,0)");
        c.fillStyle = gr;
        c.fillRect(X(cx - r), Y(cy - r), 2 * r * k, 2 * r * k);
      }
      c.restore();
    }

    /* --- Le papier : une bande qui se répète sans raccord, taches, grille et graduations --- */
    const tileC = document.createElement("canvas"), tl = tileC.getContext("2d");
    const mottle = (() => {
      const w = 120, h = 76, c = document.createElement("canvas");
      c.width = w; c.height = h;
      const x = c.getContext("2d"), img = x.createImageData(w, h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let n = 0, a = 0.55, f = 1;
        for (let o = 0; o < 4; o++) { n += a * noise((i / w) * 5 * f, (j / h) * 3.2 * f, 5 * f, o + 3); a *= 0.5; f *= 2; }
        n = Math.max(0, Math.min(1, 0.5 + (n - 0.52) * 2));
        const q = (j * w + i) * 4;
        if (n > 0.5) { img.data[q] = 88; img.data[q + 1] = 60; img.data[q + 2] = 48; img.data[q + 3] = (n - 0.5) * 2 * 95; }
        else { img.data[q] = 205; img.data[q + 1] = 199; img.data[q + 2] = 186; img.data[q + 3] = (0.5 - n) * 2 * 80; }
      }
      x.putImageData(img, 0, 0);
      return c;
    })();
    function paintTile() {
      const tw = Math.max(1, Math.round(TILE * k * dpr)), th = Math.max(1, Math.round((PAPER.y1 - PAPER.y0) * k * dpr));
      tileC.width = tw; tileC.height = th;
      tileW = tw / dpr; tileH = th / dpr;
      const c = tl, s = tw / TILE;
      c.fillStyle = "#9b9486";
      c.fillRect(0, 0, tw, th);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.drawImage(mottle, 0, 0, tw, th);
      const dot = Math.max(1, s * 0.006);
      for (let i = 0; i < 2600; i++) {
        c.fillStyle = rnd(i + 0.7) > 0.5 ? "rgba(255,250,240,0.08)" : "rgba(40,28,18,0.09)";
        c.fillRect(rnd(i) * tw, rnd(i + 0.3) * th, dot, dot);
      }
      const gy0 = (GRID_T - PAPER.y0) * s, gy1 = (GRID_B - PAPER.y0) * s, gh = gy1 - gy0;
      const bar = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
      // Lignes fines : un grand carreau fait deux fois plus large que haut
      const fw = Math.max(1, s * 0.008);
      for (let i = 0; i <= COLS; i++) bar(i * COL * s - fw / 2, gy0, fw, gh, "rgba(72,58,42,0.16)");
      for (let j = 1; j < ROWS; j++) bar(0, gy0 + (gh * j) / ROWS - fw / 2, tw, fw, "rgba(72,58,42,0.13)");
      // Bordures haute et basse de la grille
      const bw = Math.max(1.5, s * 0.024);
      for (const y of [gy0, gy1]) {
        bar(0, y - bw, tw, bw * 2, "rgba(80,64,46,0.16)");
        bar(0, y - bw / 2, tw, bw, "rgba(86,74,55,0.92)");
      }
      // Graduations : longues sous chaque ligne, courtes à mi-chemin
      const tk = Math.max(1.5, s * 0.02), col = "rgba(76,62,44,0.95)";
      for (let i = 0; i <= COLS; i++) {
        const xl = i * COL * s - tk / 2, xs = (i + 0.5) * COL * s - tk / 2;
        bar(xl, gy0, tk, s * 0.145, col); bar(xs, gy0, tk, s * 0.062, col);
        bar(xl, gy1 - s * 0.147, tk, s * 0.147, col); bar(xs, gy1 - s * 0.08, tk, s * 0.08, col);
      }
    }

    /* --- Le cœur : un battement relevé sur le jeu (temps en s autour du pic R, hauteur en g) --- */
    const BEAT = [[-0.21, 0, "b"], [-0.18, 0.028, "p"], [-0.15, 0.04, "p"], [-0.12, 0.022, "p"], [-0.095, 0, "b"],
      [-0.058, 0.005, "b"], [-0.042, 0.04, "r"], [-0.014, 0.32, "r"], [0, 0.43, "r"], [0.011, 0.31, "r"],
      [0.044, -1, "s"], [0.06, -0.08, "b"], [0.078, -0.02, "b"], [0.094, 0.016, "b"], [0.112, 0.004, "b"],
      [0.15, 0.012, "t"], [0.185, 0.04, "t"], [0.21, 0.08, "t"], [0.228, 0.1, "t"], [0.244, 0.082, "t"],
      [0.268, 0.026, "t"], [0.29, 0, "b"]];
    // Battement en Danger, relevé sur le jeu (deuxième enregistrement) : pic R bas, creux S profond,
    // puis le tracé oscille en s'amortissant ; plus loin un petit creux suivi d'une bosse, puis un long plat
    const DANGER = [[-0.07, 0, "b"], [-0.047, 0.02, "r"], [-0.035, 0.04, "r"], [-0.024, 0.08, "r"], [-0.012, 0.15, "r"],
      [0, 0.22, "r"], [0.012, 0.2, "r"], [0.024, 0.07, "r"], [0.035, -0.14, "s"], [0.047, -0.19, "s"], [0.059, -0.17, "s"],
      [0.071, -0.07, "s"], [0.083, -0.03, "o"], [0.1, 0.02, "o"], [0.13, 0.06, "o"], [0.16, 0.035, "o"], [0.2, -0.026, "o"],
      [0.226, -0.03, "o"], [0.26, 0.03, "o"], [0.295, 0.055, "o"], [0.33, 0.035, "o"], [0.36, -0.016, "o"], [0.385, -0.022, "o"],
      [0.42, 0, "b"], [0.59, 0, "b"], [0.615, -0.03, "w"], [0.645, -0.052, "w"], [0.67, -0.04, "w"], [0.69, -0.004, "w"],
      [0.72, 0.026, "w"], [0.755, 0.032, "w"], [0.79, 0.012, "w"], [0.82, 0, "b"]];

    // Ok : environ 100 bpm. Attention : le cœur s'emballe un peu et devient irrégulier.
    // Danger : comme dans le jeu, il ralentit d'un coup (un battement toutes les 1,23 s, parfois un plus précoce)
    // et prend la forme amortie ; la bascule se fait battement par battement entre 0,7 et 0,9.
    function schedule(p) {
      const dz = smooth(0.7, 0.9, p);
      while (nextBeat <= t + 1) {
        if (Math.random() < dz) {
          const early = Math.random() < 0.2, k = early ? 0.8 : 1;
          beats.push({
            t0: nextBeat, f: 1, tpl: DANGER, heard: false,
            a: { b: 1, r: k * (0.92 + 0.16 * Math.random()), s: k * (0.75 + 0.35 * Math.random()), o: 0.7 + 0.6 * Math.random(), w: 0.7 + 0.6 * Math.random() },
          });
          nextBeat += 1.23 * (early ? 0.66 : 1) * (1 + (Math.random() * 2 - 1) * 0.03);
        } else {
          const period = 60 / (100 + 30 * p ** 1.4);
          beats.push({
            t0: nextBeat, f: Math.min(1, Math.sqrt(period / 0.55)), tpl: BEAT, heard: false,
            a: { b: 1, p: 0.6 + 0.6 * Math.random(), r: 0.96 + 0.07 * Math.random(), s: 0.14 + 0.2 * Math.random(), t: 0.85 + 0.35 * Math.random() },
          });
          nextBeat += period * (1 + (Math.random() * 2 - 1) * (0.11 + irregularFor(p)));
        }
      }
      while (beats.length && beats[0].t0 + 0.4 < t - 0.4) beats.shift();
    }
    // Le papier part vers la droite : pour que la bande se lise comme dans le jeu (onde P, pic R, creux S,
    // onde T de gauche à droite), le stylet trace chaque battement en commençant par la fin.
    function beatAt(b, tt) {
      const tpl = b.tpl, u = (b.t0 - tt) / b.f;
      if (u <= tpl[0][0] || u >= tpl[tpl.length - 1][0]) return 0;
      let i = 1;
      while (tpl[i][0] < u) i++;
      const [ta, ya, ka] = tpl[i - 1], [tb, yb, kb] = tpl[i];
      const va = ya * b.a[ka], vb = yb * b.a[kb];
      return va + (vb - va) * ((u - ta) / (tb - ta));
    }
    // Hauteur du signal en g au-dessus de la ligne de base : battements et petit tremblé du trait
    // (dans le jeu la ligne reste bien plate entre les battements, même en Danger)
    function signal(tt) {
      let v = 0;
      for (const b of beats) v += beatAt(b, tt);
      const q = tt / 0.035, i = Math.floor(q), f = q - i;
      v += 0.007 * ((rnd(i + seed) + (rnd(i + 1 + seed) - rnd(i + seed)) * f) * 2 - 1);
      return v;
    }

    /* --- Matières : le métal du jeu est poli, il renvoie la pièce autour de lui ---
       Un cylindre poli n'a pas un dégradé doux : une bande blanche franche côté lumière, une chute
       nette vers le sombre (le reflet du sol), puis un rebond de lumière près du bord opposé. */
    const ENV = {
      chrome: [[0, "#1d1c1b"], [0.06, "#6a6660"], [0.15, "#d9d4cc"], [0.22, "#ffffff"], [0.29, "#fbf8f2"], [0.35, "#aaa49b"],
        [0.46, "#55514c"], [0.58, "#26241f"], [0.7, "#45423d"], [0.82, "#968f85"], [0.9, "#6a655e"], [1, "#171614"]],
      cream: [[0, "#2a2620"], [0.08, "#8d8576"], [0.2, "#efe8da"], [0.28, "#fffcf4"], [0.4, "#e9e1d1"], [0.58, "#b9b0a0"],
        [0.76, "#7b7366"], [0.88, "#9a9183"], [0.95, "#4c463e"], [1, "#1e1b17"]],
      copper: [[0, "#2c1611"], [0.1, "#8a5546"], [0.22, "#f2c6b0"], [0.3, "#fff0e6"], [0.4, "#d79a83"], [0.6, "#8a5444"],
        [0.8, "#5a3328"], [0.9, "#7d4a3c"], [1, "#24120d"]],
      black: [[0, "#000000"], [0.08, "#3a3b3c"], [0.16, "#c3c5c7"], [0.22, "#5a5b5d"], [0.4, "#1b1c1d"], [0.78, "#0e0f10"],
        [0.9, "#36373a"], [1, "#050505"]],
      gun: [[0, "#121212"], [0.1, "#6d6b68"], [0.2, "#a9a6a1"], [0.3, "#5a5855"], [0.55, "#353432"], [0.85, "#4a4846"], [1, "#161515"]],
    };
    // Cylindre poli. axis "v" : cylindre debout, reflets de gauche à droite ; "h" : couché, reflets de haut en bas
    function cylinder(c, x0, y0, x1, y1, r, axis, env, streaks = 0.6) {
      fill(c, x0, y0, x1, y1, r, axis === "v" ? grad(c, x0, 0, x1, 0, ENV[env]) : grad(c, 0, y0, 0, y1, ENV[env]));
      if (!streaks) return;
      // Stries d'usinage le long de l'axe
      c.save();
      box(c, x0, y0, x1, y1, r); c.clip();
      const lw = Math.max(0.5, k * 0.0025), s = x0 * 13.7 + y0 * 7.3 + x1;
      for (let i = 0; i < 46; i++) {
        const a = rnd(s + i * 1.37), light = rnd(s + i * 3.1) > 0.5;
        c.fillStyle = light ? `rgba(255,255,255,${((0.05 + 0.12 * a) * streaks).toFixed(3)})` : `rgba(0,0,0,${((0.06 + 0.16 * a) * streaks).toFixed(3)})`;
        if (axis === "v") c.fillRect(X(x0 + (x1 - x0) * rnd(s + i * 1.7)), Y(y0), lw, (y1 - y0) * k);
        else c.fillRect(X(x0), Y(y0 + (y1 - y0) * rnd(s + i * 1.7)), (x1 - x0) * k, lw);
      }
      c.restore();
    }
    // Arêtes : fil de lumière en haut et à gauche, ombre en bas et à droite
    function bevel(c, x0, y0, x1, y1, a = 1) {
      const lw = Math.max(1, k * 0.007);
      c.fillStyle = `rgba(255,255,255,${0.8 * a})`; c.fillRect(X(x0), Y(y0), (x1 - x0) * k, lw);
      c.fillStyle = `rgba(255,255,255,${0.35 * a})`; c.fillRect(X(x0), Y(y0), lw, (y1 - y0) * k);
      c.fillStyle = `rgba(0,0,0,${0.65 * a})`; c.fillRect(X(x0), Y(y1) - lw, (x1 - x0) * k, lw);
      c.fillStyle = `rgba(0,0,0,${0.45 * a})`; c.fillRect(X(x1) - lw, Y(y0), lw, (y1 - y0) * k);
    }
    // Éclat spéculaire, ajouté à la lumière et contenu dans la pièce : rect [x0, y0, x1, y1] ou cercle [cx, cy, r]
    function glint(c, x, y, r, a, clip) {
      const gr = c.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * k);
      gr.addColorStop(0, `rgba(255,255,255,${a})`);
      gr.addColorStop(0.12, `rgba(255,252,246,${a * 0.6})`);
      gr.addColorStop(0.4, `rgba(255,250,240,${a * 0.15})`);
      gr.addColorStop(1, "rgba(255,250,240,0)");
      c.save();
      c.beginPath();
      if (clip.length === 3) c.arc(X(clip[0]), Y(clip[1]), clip[2] * k, 0, Math.PI * 2);
      else c.rect(X(clip[0]), Y(clip[1]), (clip[2] - clip[0]) * k, (clip[3] - clip[1]) * k);
      c.clip();
      c.globalCompositeOperation = "lighter";
      c.fillStyle = gr;
      c.fillRect(X(x - r), Y(y - r), 2 * r * k, 2 * r * k);
      c.restore();
    }
    // Plaque de métal poli : teinte de base, reflets en larges bandes obliques, reflets chauds de la pièce, brossage, arêtes
    function plate(c, x0, y0, x1, y1, r, tint, s, brushed = 1) {
      fill(c, x0, y0, x1, y1, r, grad(c, 0, y0, 0, y1, [[0, tint[0]], [0.45, tint[1]], [1, tint[2]]]));
      c.save();
      box(c, x0, y0, x1, y1, r); c.clip();
      const w = x1 - x0, h = y1 - y0;
      c.fillStyle = grad(c, x0, y0, x0 + w * 0.55 + h * 0.6, y1, [[0, "rgba(255,255,255,0)"], [0.24, "rgba(255,255,255,0.04)"],
        [0.31, "rgba(255,255,255,0.55)"], [0.36, "rgba(255,255,255,0.12)"], [0.52, "rgba(0,0,0,0.22)"], [0.66, "rgba(0,0,0,0.05)"],
        [0.74, "rgba(255,255,255,0.22)"], [0.8, "rgba(255,255,255,0)"], [1, "rgba(0,0,0,0.25)"]]);
      c.fillRect(X(x0), Y(y0), w * k, h * k);
      for (let i = 0; i < 3; i++) {
        const cx = x0 + w * rnd(s + i * 2.3), cy = y0 + h * rnd(s + i * 4.1), rr = Math.max(w, h) * (0.15 + 0.2 * rnd(s + i * 5.9));
        const gr = c.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), rr * k);
        gr.addColorStop(0, "rgba(130,86,58,0.32)"); gr.addColorStop(1, "rgba(130,86,58,0)");
        c.fillStyle = gr; c.fillRect(X(cx - rr), Y(cy - rr), 2 * rr * k, 2 * rr * k);
      }
      c.restore();
      if (brushed) wear(c, x0, y0, x1, y1, s, Math.round(40 * brushed), false);
      bevel(c, x0, y0, x1, y1);
    }

    /* --- La caisse de l'appareil : dessinée une fois par redimensionnement --- */
    function ring(c, cx, cy, r0, r1, stops, from) {
      let style;
      if (c.createConicGradient) {
        style = c.createConicGradient(from, cx, cy);
        for (const [o, col] of stops) style.addColorStop(o, col);
      } else style = stops[Math.floor(stops.length / 2)][1];
      c.beginPath(); c.arc(cx, cy, r1, 0, Math.PI * 2); c.arc(cx, cy, r0, 0, Math.PI * 2, true);
      c.fillStyle = style; c.fill("evenodd");
    }
    // Reflets en croissant d'un anneau poli, pris dans le sens du tour
    const RING = [[0, "#3b302f"], [0.08, "#f7ecea"], [0.14, "#fffaf8"], [0.22, "#9d8b89"], [0.36, "#4a3d3c"], [0.5, "#8f7c7a"],
      [0.58, "#efe3e1"], [0.64, "#b7a5a3"], [0.78, "#3e3332"], [0.9, "#7c6a68"], [1, "#3b302f"]];
    function drawDial(c) {
      const cx = X(DIAL.x), cy = Y(DIAL.y), R = DIAL.r * k;
      const disc = (r) => { c.beginPath(); c.arc(cx, cy, r * R, 0, Math.PI * 2); };
      c.save();
      c.shadowColor = "rgba(0,0,0,0.7)";
      c.shadowBlur = 0.04 * k * dpr; c.shadowOffsetX = 0.012 * k * dpr; c.shadowOffsetY = 0.028 * k * dpr;
      disc(1); c.fillStyle = "#4a3d3c"; c.fill();
      c.restore();
      ring(c, cx, cy, R * 0.9, R, RING, -0.6);
      disc(0.9);
      c.fillStyle = grad(c, DIAL.x - DIAL.r, DIAL.y - DIAL.r, DIAL.x + DIAL.r, DIAL.y + DIAL.r, [[0, "#d5c4c2"], [0.3, "#a28f8d"], [0.55, "#6d5b5a"], [0.75, "#8e7b79"], [1, "#3e3231"]]);
      c.fill();
      ring(c, cx, cy, R * 0.6, R * 0.9, [[0, "rgba(255,255,255,0)"], [0.1, "rgba(255,255,255,0.35)"], [0.2, "rgba(255,255,255,0)"],
        [0.55, "rgba(255,255,255,0)"], [0.62, "rgba(255,255,255,0.25)"], [0.7, "rgba(255,255,255,0)"], [1, "rgba(255,255,255,0)"]], -0.6);
      // Couronne de fentes rectangulaires
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2, da = 0.07;
        c.beginPath();
        c.arc(cx, cy, R * 0.85, a - da, a + da);
        c.arc(cx, cy, R * 0.65, a + da * 1.3, a - da * 1.3, true);
        c.closePath();
        c.fillStyle = "#130f0f"; c.fill();
        c.strokeStyle = "rgba(255,240,236,0.45)"; c.lineWidth = Math.max(0.5, k * 0.003); c.stroke();
      }
      // Bande sombre percée de petits trous clairs
      disc(0.6); c.fillStyle = "#332a2a"; c.fill();
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2 + 0.08;
        c.beginPath(); c.arc(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, R * 0.05, 0, Math.PI * 2);
        c.fillStyle = "#dacfcd"; c.fill();
      }
      ring(c, cx, cy, R * 0.38, R * 0.42, RING, 0.4);
      disc(0.38);
      c.fillStyle = grad(c, DIAL.x - DIAL.r * 0.4, DIAL.y - DIAL.r * 0.4, DIAL.x + DIAL.r * 0.4, DIAL.y + DIAL.r * 0.4, [[0, "#8a7c7b"], [1, "#2a2322"]]);
      c.fill();
      const dc = [DIAL.x, DIAL.y, DIAL.r];
      glint(c, DIAL.x + DIAL.r * 0.55, DIAL.y - DIAL.r * 0.72, 0.07, 0.8, dc);
      glint(c, DIAL.x + DIAL.r * 0.8, DIAL.y + DIAL.r * 0.5, 0.05, 0.45, dc);
    }

    function drawHandle(c) {
      // Attaches haute et basse, puis la barre crème polie ; les deux rouleaux qui tournent sont dessinés à chaque image
      cylinder(c, 3.03, 0.25, 3.27, 0.335, 0.02, "h", "cream", 0.4);
      cylinder(c, 3.03, 1.915, 3.27, 2.0, 0.02, "h", "cream", 0.4);
      cylinder(c, 3.17, 0.27, 3.27, 1.98, 0.05, "v", "cream", 0.7);
      glint(c, 3.2, 0.4, 0.06, 0.8, [3.17, 0.27, 3.27, 1.98]);
      glint(c, 3.2, 1.05, 0.09, 0.55, [3.17, 0.27, 3.27, 1.98]);
    }

    /* --- Les deux rouleaux noirs de la barre de droite : ce sont eux qui entraînent la bande ---
       Des cylindres lisses, comme les rouleaux d'un tapis de caisse : pas d'arête, la lumière reste fixe
       et c'est la surface (crasse, vis) qui tourne. Dans le jeu un motif passe toutes les 0,23 s,
       la face avant filant vers la gauche, soit 3,94 radians par g de papier. Celui du bas porte six vis. */
    const ROLLERS = [[0.575, 0.71, false], [1.42, 1.555, true]], ROLL_X = 3.21, ROLL_R = 0.16;
    function drawRollers(c) {
      const th = -scroll * 3.94, x0 = ROLL_X - ROLL_R, x1 = ROLL_X + ROLL_R;
      for (const [y0, y1, pins] of ROLLERS) {
        const h = y1 - y0, clip = [x0, y0, x1, y1];
        c.save();
        c.shadowColor = "rgba(0,0,0,0.75)"; c.shadowBlur = 0.03 * k * dpr; c.shadowOffsetY = 0.02 * k * dpr;
        fill(c, x0, y0, x1, y1, 0.012, "#0b0b0b");
        c.restore();
        // Corps du rouleau : laque noire, reflets fixes de gauche à droite
        fill(c, x0, y0, x1, y1, 0.012, grad(c, x0, 0, x1, 0, ENV.black));
        c.save();
        box(c, x0, y0, x1, y1, 0.012); c.clip();
        // La surface qui tourne : chaque marque suit le tour, se tasse et s'efface vers les bords
        for (let i = 0; i < 14; i++) {
          let a = th + i * 0.449 + rnd(i + (pins ? 5.5 : 1.5)) * 0.3;
          a = a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
          const ca = Math.cos(a);
          if (ca <= 0.05) continue;
          const xm = ROLL_X + ROLL_R * Math.sin(a), w = (0.025 + 0.05 * rnd(i + 2.9)) * ca;
          const ym = y0 + h * (0.2 + 0.6 * rnd(i + 3.7)), hh = h * (0.25 + 0.5 * rnd(i + 4.1));
          const light = rnd(i + 6.3) > 0.65, al = (light ? 0.28 : 0.65) * ca;
          const col = light ? "255,248,236" : "26,18,10";
          const gr = c.createRadialGradient(X(xm), Y(ym), 0, X(xm), Y(ym), Math.max(w, hh / 2) * k);
          gr.addColorStop(0, `rgba(${col},${al.toFixed(3)})`); gr.addColorStop(1, `rgba(${col},0)`);
          c.save();
          c.translate(X(xm), Y(ym)); c.scale(w / Math.max(w, hh / 2), (hh / 2) / Math.max(w, hh / 2)); c.translate(-X(xm), -Y(ym));
          c.fillStyle = gr; c.fillRect(X(xm) - Math.max(w, hh / 2) * k, Y(ym) - Math.max(w, hh / 2) * k, 2 * Math.max(w, hh / 2) * k, 2 * Math.max(w, hh / 2) * k);
          c.restore();
        }
        if (pins) for (let i = 0; i < 6; i++) {
          let a = th + (i * Math.PI) / 3;
          a = a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
          const ca = Math.cos(a);
          if (ca <= 0.08) continue;
          const xm = ROLL_X + ROLL_R * Math.sin(a), ym = (y0 + y1) / 2, rr = 0.016 * k;
          // La vis prend la lumière quand elle passe côté gauche
          const lit = Math.max(0, Math.cos(a + 0.9));
          c.beginPath(); c.ellipse(X(xm), Y(ym), rr * ca, rr, 0, 0, Math.PI * 2);
          c.fillStyle = `rgba(${Math.round(40 + 90 * lit)},${Math.round(39 + 88 * lit)},${Math.round(37 + 84 * lit)},${(0.5 + 0.5 * ca).toFixed(2)})`; c.fill();
          c.beginPath(); c.ellipse(X(xm) - rr * 0.25 * ca, Y(ym) - rr * 0.3, rr * 0.4 * ca, rr * 0.35, 0, 0, Math.PI * 2);
          c.fillStyle = `rgba(230,225,215,${(0.2 + 0.5 * lit * ca).toFixed(2)})`; c.fill();
        }
        // Le volume : bord haut qui accroche la lumière, bas dans l'ombre
        fill(c, x0, y0, x1, y1, 0, grad(c, 0, y0, 0, y1, [[0, "rgba(255,250,240,0.18)"], [0.12, "rgba(255,250,240,0)"], [0.7, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.55)"]]));
        c.restore();
        fill(c, x0 + 0.01, y0, x1 - 0.01, y0 + 0.01, 0.004, "rgba(214,208,198,0.5)");
        glint(c, x0 + ROLL_R * 0.32, y0 + h * 0.3, 0.05, 0.45, clip);
      }
    }

    /* --- La patine : le métal du jeu brille, mais il a vécu ---
       Nuages de crasse, piqûres, rayures fines et voile jauni, posés seulement sur ce qui est déjà peint. */
    const grime = (() => {
      const w = 170, h = 104, c = document.createElement("canvas");
      c.width = w; c.height = h;
      const x = c.getContext("2d"), img = x.createImageData(w, h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let n = 0, a = 0.55, f = 1;
        for (let o = 0; o < 4; o++) { n += a * noise((i / w) * 9 * f, (j / h) * 6 * f, 1e4, o + 21); a *= 0.5; f *= 2; }
        // Coulures : la crasse s'étire un peu vers le bas
        n += 0.12 * noise(i * 0.35, j * 0.03, 1e4, 29);
        const q = (j * w + i) * 4, u = smooth(0.5, 0.9, n);
        img.data[q] = 34; img.data[q + 1] = 24; img.data[q + 2] = 14; img.data[q + 3] = 150 * u;
      }
      x.putImageData(img, 0, 0);
      return c;
    })();
    function patina(c) {
      c.save();
      c.globalCompositeOperation = "source-atop";
      c.imageSmoothingEnabled = true;
      c.drawImage(grime, X(0), Y(0), DEV_W * k, DEV_H * k);
      c.fillStyle = "rgba(96,74,44,0.09)";
      c.fillRect(X(0), Y(0), DEV_W * k, DEV_H * k);
      const dot = Math.max(0.8, k * 0.006);
      for (let i = 0; i < 900; i++) {
        const light = rnd(i + 0.41) > 0.8, r = dot * (0.6 + rnd(i + 0.93));
        c.fillStyle = light ? `rgba(255,246,230,${(0.12 + 0.2 * rnd(i + 0.2)).toFixed(2)})` : `rgba(22,15,9,${(0.2 + 0.35 * rnd(i + 0.2)).toFixed(2)})`;
        c.fillRect(X(rnd(i + 0.11) * DEV_W), Y(rnd(i + 0.57) * DEV_H), r, r);
      }
      c.lineWidth = Math.max(0.5, k * 0.0025);
      for (let i = 0; i < 160; i++) {
        const x0 = rnd(i + 7.1) * DEV_W, y0 = rnd(i + 7.9) * DEV_H, len = 0.03 + 0.18 * rnd(i + 8.3);
        const ang = (rnd(i + 8.8) - 0.5) * (rnd(i + 9.4) > 0.6 ? 3 : 0.5);
        c.strokeStyle = rnd(i + 9.9) > 0.5 ? `rgba(255,250,240,${(0.08 + 0.12 * rnd(i + 10.3)).toFixed(2)})` : `rgba(0,0,0,${(0.12 + 0.18 * rnd(i + 10.3)).toFixed(2)})`;
        c.beginPath(); c.moveTo(X(x0), Y(y0)); c.lineTo(X(x0 + Math.cos(ang) * len), Y(y0 + Math.sin(ang) * len)); c.stroke();
      }
      c.restore();
    }

    function drawChassis() {
      const c = tctx;
      c.clearRect(0, 0, W, H);
      // Ombre portée de tout l'appareil
      c.save();
      c.shadowColor = "rgba(0,0,0,0.85)"; c.shadowBlur = 0.1 * k * dpr; c.shadowOffsetY = 0.03 * k * dpr;
      fill(c, 0.03, 0.12, 3.07, 2.05, 0.03, "#24211f");
      c.restore();
      c.clearRect(X(PAPER.x0), Y(PAPER.y0), (PAPER.x1 - PAPER.x0) * k, (PAPER.y1 - PAPER.y0) * k);

      // Bords de la fenêtre : barre sombre vernie en haut, montant chromé à gauche, montant noir à droite
      cylinder(c, 0.7, 0.12, 3.07, 0.186, 0, "h", "black", 0.5);
      fill(c, 0.7, 0.12, 3.07, 0.128, 0, "rgba(255,255,255,0.45)");
      glint(c, 1.15, 0.135, 0.08, 0.5, [0.7, 0.12, 3.07, 0.186]); glint(c, 2.4, 0.135, 0.12, 0.35, [0.7, 0.12, 3.07, 0.186]);
      cylinder(c, 0.7, 0.186, 0.75, 1.706, 0, "v", "chrome", 0.3);
      cylinder(c, 3.007, 0.186, 3.07, 1.706, 0, "v", "black", 0.3);

      // Ce qui recouvre le papier sans défiler : ombre de la lèvre, reflet, bande roussie, bords assombris
      vfill(c, PAPER.x0, PAPER.y0, PAPER.x1, 0.37, 0, [[0, "rgba(10,8,6,0.85)"], [0.08, "rgba(10,8,6,0.1)"],
        [0.13, "rgba(250,246,238,0.85)"], [0.2, "rgba(250,246,238,0)"], [0.3, "rgba(96,62,46,0.3)"], [0.75, "rgba(96,62,46,0.18)"], [1, "rgba(96,62,46,0)"]]);
      hfill(c, PAPER.x0, PAPER.y0, PAPER.x0 + 0.05, PAPER.y1, 0, [[0, "rgba(0,0,0,0.28)"], [1, "rgba(0,0,0,0)"]]);
      hfill(c, PAPER.x1 - 0.08, PAPER.y0, PAPER.x1, PAPER.y1, 0, [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.5)"]]);
      vfill(c, PAPER.x0, PAPER.y1 - 0.06, PAPER.x1, PAPER.y1, 0, [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.4)"]]);

      // Panneau du bas : acier poli aux reflets rosés, plus sombre à gauche, avec la fenêtre de la plaque
      plate(c, 0.7, 1.706, 3.07, 2.05, 0, ["#cfc1b7", "#a39488", "#6d5e55"], 7);
      hfill(c, 0.7, 1.706, 3.07, 2.05, 0, [[0, "rgba(30,18,12,0.55)"], [0.3, "rgba(30,18,12,0.25)"], [0.6, "rgba(30,18,12,0)"], [1, "rgba(30,18,12,0.1)"]]);
      vfill(c, 0.7, 1.706, 3.07, 1.745, 0, [[0, "rgba(0,0,0,0.75)"], [1, "rgba(0,0,0,0)"]]);
      cylinder(c, 0.7, 2.0, 3.07, 2.05, 0, "h", "black", 0.3);
      glint(c, 2.75, 1.79, 0.1, 0.35, [0.7, 1.706, 3.07, 2.0]);
      // Fenêtre de la plaque : cadre chromé biseauté, émail clair, reflet de verre
      const e = 0.024;
      fill(c, PLATE.x0 - e, PLATE.y0 - e, PLATE.x1 + e, PLATE.y1 + e, 0.006,
        grad(c, PLATE.x0 - e, PLATE.y0 - e, PLATE.x1 + e, PLATE.y1 + e, [[0, "#3a3633"], [0.2, "#8c867e"], [0.32, "#f2eee8"], [0.4, "#7a756e"], [0.62, "#2e2b28"], [0.8, "#bfb8ae"], [1, "#4a4540"]]));
      fill(c, PLATE.x0 - 0.006, PLATE.y0 - 0.006, PLATE.x1 + 0.006, PLATE.y1 + 0.006, 0.003, "#151311");
      hfill(c, PLATE.x0, PLATE.y0, PLATE.x1, PLATE.y1, 0, [[0, "#8a8f81"], [0.12, "#b8bdaf"], [0.5, "#dce1d4"], [0.88, "#b8bdaf"], [1, "#878b7e"]]);
      wear(c, PLATE.x0, PLATE.y0, PLATE.x1, PLATE.y1, 21, 70, true);
      vfill(c, PLATE.x0, PLATE.y0, PLATE.x1, PLATE.y1, 0, [[0, "rgba(0,0,0,0.5)"], [0.2, "rgba(0,0,0,0)"], [0.82, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.25)"]]);
      fill(c, PLATE.x0, PLATE.y0, PLATE.x1, PLATE.y1, 0, grad(c, PLATE.x0, PLATE.y0, PLATE.x0 + 0.5, PLATE.y1 + 0.3,
        [[0, "rgba(255,255,255,0)"], [0.35, "rgba(255,255,255,0)"], [0.45, "rgba(255,255,255,0.28)"], [0.55, "rgba(255,255,255,0)"], [1, "rgba(255,255,255,0)"]]));

      // Colonne de gauche : écrou, support à fente, tube de la fiole, support à pattes, rebord noir
      cylinder(c, 0.14, 0.02, 0.4, 0.2, 0.015, "v", "chrome", 0.8);
      fill(c, 0.14, 0.02, 0.4, 0.05, 0.012, grad(c, 0.14, 0, 0.4, 0, [[0, "#6a6660"], [0.3, "#ffffff"], [0.6, "#c9c4bc"], [1, "#55514c"]]));
      glint(c, 0.215, 0.09, 0.06, 0.85, [0.14, 0.02, 0.4, 0.2]);
      plate(c, 0.03, 0.17, 0.75, 0.46, 0.02, ["#f6f3ee", "#c3bdb5", "#6f6962"], 11, 0.8);
      hfill(c, 0.03, 0.17, 0.1, 0.46, 0.02, [[0, "rgba(0,0,0,0.5)"], [1, "rgba(0,0,0,0)"]]);
      cylinder(c, 0.11, 0.355, 0.29, 0.395, 0.018, "h", "black", 0);
      fill(c, 0.11, 0.395, 0.29, 0.404, 0.004, "rgba(255,255,255,0.6)");
      glint(c, 0.08, 0.2, 0.07, 0.8, [0.03, 0.17, 0.75, 0.46]);
      plate(c, 0.03, 1.75, 0.75, 2.0, 0.02, ["#9a9187", "#6f665d", "#3e3833"], 31, 0.6);
      for (const [x0, x1] of [[0.11, 0.175], [0.21, 0.275]]) {
        cylinder(c, x0, 1.77, x1, 1.95, 0.03, "v", "cream", 0.3);
        glint(c, x0 + (x1 - x0) * 0.3, 1.8, 0.035, 0.7, [x0, 1.77, x1, 1.95]);
      }
      cylinder(c, 0.03, 1.97, 0.75, 2.03, 0.01, "h", "black", 0.3);

      // Le cadran perforé, à moitié caché par le bloc du mécanisme
      drawDial(c);
      fill(c, 0.04, VIAL.y0 - 0.03, 0.34, VIAL.y1 + 0.03, 0, "#040604");
      const block = () => {
        c.beginPath();
        c.moveTo(X(0.33), Y(0.45)); c.lineTo(X(0.72), Y(0.45)); c.lineTo(X(0.72), Y(0.69));
        c.quadraticCurveTo(X(0.72), Y(0.74), X(0.67), Y(0.74)); c.lineTo(X(0.52), Y(0.74));
        c.lineTo(X(0.52), Y(1.78)); c.lineTo(X(0.33), Y(1.78)); c.closePath();
      };
      block();
      c.fillStyle = grad(c, 0.33, 0, 0.52, 0, ENV.gun);
      c.fill();
      c.save();
      block(); c.clip();
      wear(c, 0.33, 0.45, 0.72, 1.78, 41, 14, true);
      fill(c, 0.33, 0.45, 0.72, 0.74, 0, grad(c, 0, 0.45, 0, 0.74, [[0, "rgba(255,255,255,0.35)"], [0.15, "rgba(255,255,255,0.05)"], [1, "rgba(0,0,0,0.3)"]]));
      c.restore();
      fill(c, 0.33, 0.45, 0.72, 0.456, 0, "rgba(255,255,255,0.5)");
      fill(c, 0.33, 0.45, 0.336, 1.78, 0, "rgba(255,255,255,0.25)");
      // Molette en haut du bloc : anneau poli, dôme chromé
      circle(c, 0.55, 0.557, 0.075, "#141414");
      ring(c, X(0.55), Y(0.557), 0.06 * k, 0.075 * k, [[0, "#222"], [0.12, "#e8e8ea"], [0.25, "#555"], [0.55, "#1c1c1c"], [0.65, "#a9a9ab"], [0.8, "#333"], [1, "#222"]], -0.8);
      c.beginPath(); c.arc(X(0.55), Y(0.557), 0.032 * k, 0, Math.PI * 2);
      const dome = c.createRadialGradient(X(0.54), Y(0.546), 0, X(0.55), Y(0.557), 0.032 * k);
      dome.addColorStop(0, "#ffffff"); dome.addColorStop(0.35, "#bdbdc0"); dome.addColorStop(1, "#3a3a3c");
      c.fillStyle = dome; c.fill();
      // Boulons sous le cadran
      for (const [x0, x1] of [[0.36, 0.415], [0.445, 0.5]]) cylinder(c, x0, 1.53, x1, 1.72, 0.012, "v", "chrome", 0.6);
      // Bossage sombre et verni sous le pivot du stylet
      c.beginPath(); c.arc(X(PIV.x), Y(PIV.y), 0.15 * k, 0, Math.PI * 2);
      const boss = c.createRadialGradient(X(PIV.x - 0.05), Y(PIV.y - 0.06), 0, X(PIV.x), Y(PIV.y), 0.15 * k);
      boss.addColorStop(0, "#5a5856"); boss.addColorStop(0.35, "#2a2928"); boss.addColorStop(1, "#121110");
      c.fillStyle = boss; c.fill();
      ring(c, X(PIV.x), Y(PIV.y), 0.138 * k, 0.15 * k, [[0, "#222"], [0.1, "#d9d6d2"], [0.22, "#3a3836"], [0.6, "#1a1918"], [0.7, "#8a8682"], [0.85, "#2a2928"], [1, "#222"]], -0.9);
      glint(c, PIV.x - 0.06, PIV.y - 0.09, 0.04, 0.6, [PIV.x, PIV.y, 0.15]);

      drawHandle(c);
      patina(c);
    }

    // La plaque d'état est un vrai texte posé sur le dessin : on lui donne la place de la fenêtre
    function placePlate() {
      const m = screen.parentElement.style;
      m.setProperty("--plate-l", X(PLATE.x0) + "px");
      m.setProperty("--plate-t", Y(PLATE.y0) + "px");
      m.setProperty("--plate-w", (PLATE.x1 - PLATE.x0) * k + "px");
      m.setProperty("--plate-h", (PLATE.y1 - PLATE.y0) * k + "px");
    }

    /* --- La fiole d'encre : le liquide descend en veines, et une goutte lumineuse se forme en haut,
       se détache et tombe jusqu'au fond, comme dans le jeu (une goutte toutes les 0,85 s, chute en 0,5 s).
       C'est elle qui nourrit le stylet : elle prend la couleur du tracé, vert olive en Ok, puis orange et rouge --- */
    const VW = 18, VH = 90, DRIP = 0.85, FORM = 0.32;
    const vialC = document.createElement("canvas"), vx = vialC.getContext("2d");
    vialC.width = VW; vialC.height = VH;
    const vimg = vx.createImageData(VW, VH);
    // Rapport hauteur / largeur du tube, pour que la goutte reste ronde
    const VR = (VIAL.y1 - VIAL.y0) / (VIAL.x1 - VIAL.x0);
    // Teintes sombre et claire du liquide, relevées dans le jeu : la fiole est le réservoir d'encre du stylet
    const vialInk = (p) => [ramp(INK.vialLo, p), ramp(INK.vialHi, p)];
    function vialFrame(time, p) {
      const d = vimg.data, [lo, hi] = vialInk(p);
      const n0 = Math.floor(time / DRIP), ph = time - n0 * DRIP;
      const wob = (rnd(n0 + 0.37) - 0.5) * 0.08;            // chaque goutte tombe un peu à côté de la précédente
      const falling = ph > FORM, f = (ph - FORM) / (DRIP - FORM);
      const cy = falling ? 0.1 + 0.9 * f ** 1.15 : 0.04 + 0.06 * (ph / FORM);
      const cx = 0.48 + wob * (falling ? f : 0);
      const ry = (falling ? 0.03 + 0.012 * f : 0.02 + 0.016 * (ph / FORM));
      const rx = ry * VR * 0.75;
      const glow = falling ? 1 - 0.35 * f ** 3 : 0.45 + 0.55 * (ph / FORM);
      for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
        const u = (i + 0.5) / VW, v = (j + 0.5) / VH;
        // Veines verticales qui descendent à vitesse moyenne
        let n = 0.46 * noise(i * 0.42, j * 0.05 - time * 2.6, 1e4, 1) + 0.26 * noise(i * 0.9 + 7, j * 0.11 - time * 4.2, 1e4, 2);
        n += 0.15 * Math.exp(-(((u - 0.47) / 0.105) ** 2));
        // Filet clair qui tombe du haut, et la goutte avec sa traînée
        const dx = u - cx, dy = v - cy;
        // La larme qui reste accrochée en haut et s'étire vers le bas
        n += 0.36 * Math.exp(-((((u - 0.5) / (0.05 + 0.3 * v))) ** 2)) * Math.exp(-v / 0.13);
        // La goutte reste discrète : un léger renflement de lumière, pas un éclat
        n += 0.28 * glow * Math.exp(-((dx / rx) ** 2) - ((dy / ry) ** 2));
        if (dy < 0) n += 0.12 * glow * Math.exp(-((dx / (rx * 0.45)) ** 2)) * Math.exp(dy / 0.12);
        // Colonne claire étroite au centre, bords du tube sombres
        const b = Math.max(0, Math.min(1, n * 1.05)) * (0.24 + 0.76 * Math.exp(-(((u - 0.48) / 0.3) ** 2)));
        const q = (j * VW + i) * 4;
        d[q] = lo[0] + (hi[0] - lo[0]) * b ** 1.2; d[q + 1] = lo[1] + (hi[1] - lo[1]) * b; d[q + 2] = lo[2] + (hi[2] - lo[2]) * b ** 1.4; d[q + 3] = 255;
      }
      vx.putImageData(vimg, 0, 0);
    }
    function drawVial(c) {
      const x = X(VIAL.x0), y = Y(VIAL.y0), w = (VIAL.x1 - VIAL.x0) * k, h = (VIAL.y1 - VIAL.y0) * k;
      c.imageSmoothingEnabled = true;
      c.drawImage(vialC, x, y, w, h);
      c.fillStyle = grad(c, VIAL.x0, 0, VIAL.x1, 0, [[0, "rgba(0,0,0,0.6)"], [0.12, "rgba(0,0,0,0)"], [0.2, "rgba(255,255,255,0.12)"],
        [0.28, "rgba(255,255,255,0)"], [0.82, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.65)"]]);
      c.fillRect(x, y, w, h);
      c.fillStyle = grad(c, 0, VIAL.y0, 0, VIAL.y1, [[0, "rgba(0,0,0,0.5)"], [0.05, "rgba(0,0,0,0)"], [0.93, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.6)"]]);
      c.fillRect(x, y, w, h);
    }

    /* --- Le stylet : bras crème monté sur une tête cuivrée, il pivote et sa pointe décrit un arc --- */
    function capsule(c, x0, x1, hw) {
      c.beginPath();
      c.moveTo(x0 + hw, -hw); c.lineTo(x1 - hw, -hw); c.arc(x1 - hw, 0, hw, -Math.PI / 2, Math.PI / 2);
      c.lineTo(x0 + hw, hw); c.arc(x0 + hw, 0, hw, Math.PI / 2, -Math.PI / 2); c.closePath();
    }
    function drawPen(tip) {
      const c = hctx, L = Math.hypot(tip.x - PIV.x, tip.y - PIV.y), ARM = L;
      c.save();
      c.translate(X(PIV.x), Y(PIV.y));
      c.rotate(Math.atan2(tip.y - PIV.y, tip.x - PIV.x));
      c.scale(k, k);
      c.shadowColor = "rgba(0,0,0,0.5)";
      c.shadowBlur = 0.025 * k * dpr; c.shadowOffsetX = 0.012 * k * dpr; c.shadowOffsetY = 0.04 * k * dpr;
      const body = c.createLinearGradient(0, -0.03, 0, 0.03);
      for (const [o, col] of ENV.cream) body.addColorStop(o, col);
      c.fillStyle = body;
      c.beginPath();
      c.moveTo(0.12, -0.03); c.lineTo(ARM - 0.006, -0.019); c.quadraticCurveTo(ARM, -0.019, ARM, -0.012);
      c.lineTo(ARM, 0.012); c.quadraticCurveTo(ARM, 0.019, ARM - 0.006, 0.019); c.lineTo(0.12, 0.03); c.closePath();
      c.fill();
      const head = c.createLinearGradient(0, -0.034, 0, 0.034);
      for (const [o, col] of ENV.copper) head.addColorStop(o, col);
      c.fillStyle = head;
      capsule(c, -0.05, 0.16, 0.034);
      c.fill();
      c.shadowColor = "transparent";
      // Fil de lumière le long du bras, éclat sur la tête cuivrée
      c.fillStyle = "rgba(255,255,255,0.75)";
      c.beginPath(); c.moveTo(0.17, -0.022); c.lineTo(ARM - 0.02, -0.013); c.lineTo(ARM - 0.02, -0.010); c.lineTo(0.17, -0.017); c.closePath(); c.fill();
      const hl = c.createRadialGradient(0.07, -0.016, 0, 0.07, -0.016, 0.06);
      hl.addColorStop(0, "rgba(255,255,255,0.85)"); hl.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = hl; c.fillRect(0.01, -0.034, 0.12, 0.03);
      c.fillStyle = "rgba(70,58,46,0.55)";
      c.fillRect(ARM - 0.007, -0.013, 0.007, 0.026);
      c.beginPath(); c.arc(0, 0, 0.014, 0, Math.PI * 2); c.fillStyle = "#2b1c18"; c.fill();
      c.beginPath(); c.arc(-0.004, -0.005, 0.005, 0, Math.PI * 2); c.fillStyle = "rgba(255,230,220,0.5)"; c.fill();
      c.restore();
    }

    function resize() {
      k = Math.min(W / DEV_W, H / DEV_H);
      ox = (W - DEV_W * k) / 2; oy = (H - DEV_H * k) / 2;
      paintTile();
      drawChassis();
      placePlate();
      vialClock = 1;
    }
    function enter() { t = 0; scroll = 0; nextBeat = 0.25; beats = []; pts = []; }

    function frame(dt, p) {
      schedule(p);
      const n = Math.max(1, Math.ceil(dt * 240));
      for (let i = 1; i <= n; i++) {
        const tt = t + (dt * i) / n;
        scroll += (SPEED * dt) / n;
        const dy = Math.max(-0.9 * ARM, Math.min(0.9 * ARM, -signal(tt)));
        pts.push({ d: scroll, x: PIV.x + ARM - 0.3 * (ARM - Math.sqrt(ARM * ARM - dy * dy)), y: PIV.y + dy });
      }
      for (const b of beats) {
        if (!b.heard && b.t0 <= t + dt) { b.heard = true; if (b.t0 > t - 0.2) onBeat(p); }
      }
      t += dt;
      let cut = 0;
      while (cut < pts.length && pts[cut].x + scroll - pts[cut].d > PAPER.x1 + 0.05) cut++;
      if (cut) pts.splice(0, cut);

      // Papier qui défile vers la droite, puis le tracé, le tout dans la fenêtre
      gctx.clearRect(0, 0, W, H);
      gctx.save();
      box(gctx, PAPER.x0, PAPER.y0, PAPER.x1, PAPER.y1);
      gctx.clip();
      const off = (((scroll * k) % tileW) + tileW) % tileW;
      for (let x = Math.round((X(PAPER.x0) + off - tileW) * dpr) / dpr; x < X(PAPER.x1); x += tileW) gctx.drawImage(tileC, x, Y(PAPER.y0), tileW, tileH);
      if (pts.length > 1) {
        gctx.beginPath();
        pts.forEach((q, i) => { const x = X(q.x + scroll - q.d), y = Y(q.y); i ? gctx.lineTo(x, y) : gctx.moveTo(x, y); });
        gctx.lineJoin = "round"; gctx.lineCap = "round";
        gctx.strokeStyle = traceInk(p, 0.3); gctx.lineWidth = 0.03 * k; gctx.stroke();
        gctx.strokeStyle = traceInk(p); gctx.lineWidth = Math.max(1, 0.0145 * k); gctx.stroke();
      }
      gctx.restore();

      hctx.clearRect(0, 0, W, H);
      vialClock += dt;
      if (vialClock > 1 / 30) { vialFrame(t, p); vialClock = 0; }
      drawVial(hctx);
      drawRollers(hctx);
      drawPen(pts.length ? pts[pts.length - 1] : { x: PIV.x + ARM, y: PIV.y });
    }

    return { resize, enter, frame };
  })();

  /* ----- Version 3 : l'écran d'état de Resident Evil Zero -----
     Relevé image par image sur trois enregistrements du jeu : un petit écran cathodique gris, encastré
     dans un panneau de métal peint crème. Le trait part de la gauche, dessine un seul battement (une onde
     qui s'amortit) et traverse la vitre en une seconde, vite jusqu'au milieu puis plus lentement.
     Derrière lui il s'éteint en 0,6 s environ, à son rythme, même quand la tête est déjà repartie à gauche ;
     il n'en reste qu'un reflet très pâle jusqu'au passage suivant.
     Le rythme ne change jamais (60 par minute) : seules la forme et la couleur suivent l'état.
     Cotes en « s », la hauteur de la vitre. */
  const zero = (() => {
    const GW = 2.39, G = { x: 0.2, y: 0.21 };            // vitre et son coin haut gauche
    const DEV_W = GW + 0.4, DEV_H = 1.45;
    const TOP = 0.173, BOT = 0.905, BASE = 0.558, L = BOT - TOP;
    const PEAK = 0.36, GHOST = 0.05;
    // La tête : 1,26 largeur par seconde jusqu'à 0,47, ralentit à 0,88 vers 0,55, puis attend au bord
    const V1 = 1.26, V2 = 0.88, U1 = 0.47, U2 = 0.55;
    const T1 = U1 / V1, T2 = (U2 - U1) / ((V1 + V2) / 2);
    function headU(s) {
      if (s < T1) return V1 * s;
      s -= T1;
      if (s < T2) return U1 + V1 * s - ((V1 - V2) / (2 * T2)) * s * s;
      return Math.min(1, U2 + V2 * (s - T2));
    }
    // Les quatre formes du jeu, relevées colonne par colonne sur les passages des vidéos (OK : le passage le plus net,
    // les autres : moyenne des passages) :
    // hauteur en millièmes de l'écart entre les lignes vertes, de 0,17 à 0,70 de la largeur, tous les 0,005
    const U0 = 0.17, DU = 0.005;
    const SHAPES = {
      ok: [
        0, 0, 0, -1, -1, -1, 0, 0, 0, 1, 4, 9, 17, 26, 37, 44, 49, 52, 52, 47, 35, 12, -13, -31, -47, -71, -89,
        -99, -97, -86, -61, -15, 51, 92, 130, 178, 231, 270, 297, 305, 289, 249, 184, 103, 11, -78, -164, -251, -304, -322, -319, -294, -240, -187,
        -135, -81, -14, 37, 73, 90, 99, 92, 76, 51, 30, 8, -18, -42, -67, -76, -76, -67, -43, -12, 11, 31, 57, 77, 83, 75, 55,
        33, 12, -14, -35, -48, -56, -56, -49, -41, -33, -25, -18, -14, -9, -5, -4, -4, -3, -3, -2, -1, -1, 0, 0, 0, 0],
      jaune: [
        0, 0, 0, 0, 0, 0, 1, 3, 5, 7, 11, 17, 24, 32, 44, 50, 51, 49, 39, 22, 2, -13, -29, -47, -68, -82, -90,
        -87, -72, -42, 0, 44, 93, 146, 187, 222, 252, 265, 260, 229, 181, 142, 111, 75, 19, -43, -79, -105, -142, -181, -198, -202, -187, -130,
        -80, -48, 2, 72, 95, 98, 90, 73, 53, 34, 20, 9, 4, 5, 9, 17, 29, 43, 57, 70, 80, 85, 84, 80, 70, 57, 40,
        23, 8, -7, -21, -31, -35, -37, -37, -36, -32, -25, -15, -7, -2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      orange: [
        0, 0, 0, 0, -1, -1, -1, -2, -3, -6, -9, -15, -24, -30, -33, -33, -36, -39, -39, -35, -29, -22, -16, -7, 1, 11, 21,
        27, 30, 31, 29, 30, 28, 29, 38, 63, 91, 112, 132, 160, 170, 166, 147, 111, 72, 37, 0, -34, -59, -78, -94, -102, -103, -98,
        -89, -77, -59, -38, -20, -4, 14, 35, 49, 56, 57, 54, 44, 29, 12, -5, -19, -32, -41, -43, -42, -38, -35, -30, -20, -9, 4,
        13, 20, 26, 31, 32, 32, 31, 30, 25, 20, 16, 11, 6, 3, 1, 0, -1, -1, -1, 0, -1, 0, 0, 0, 0, 0],
      danger: [
        0, 0, 0, 0, 1, 4, 7, 11, 14, 17, 20, 22, 24, 26, 26, 27, 28, 29, 26, 17, 6, -3, -9, -13, -19, -31, -48,
        -60, -65, -66, -53, -25, 3, 29, 58, 93, 129, 148, 147, 136, 117, 96, 75, 54, 34, 14, -4, -17, -26, -32, -38, -39, -32, -17,
        3, 23, 40, 50, 55, 59, 61, 62, 61, 59, 54, 47, 38, 30, 25, 20, 14, 7, -3, -14, -25, -34, -38, -37, -32, -25, -17,
        -10, -5, -1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
    };
    // Chaque forme est échantillonnée finement, en courbe lisse passant par les points relevés
    const N = 800;
    function sample(vals) {
      const out = new Float32Array(N + 1), v = (i) => vals[Math.max(0, Math.min(vals.length - 1, i))] / 1000;
      for (let n = 0; n <= N; n++) {
        const q = (n / N - U0) / DU, i = Math.floor(q), f = q - i;
        if (i < 0 || i >= vals.length - 1) continue;
        const p0 = v(i - 1), p1 = v(i), p2 = v(i + 1), p3 = v(i + 2);
        out[n] = p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
      }
      return out;
    }
    const S = Object.fromEntries(Object.entries(SHAPES).map(([n, pts]) => [n, sample(pts)]));
    // Même passage que les encres : OK jusqu'à 0,3, Attention jaune vers 0,5, orange vers 0,68, Danger après 0,86
    const STEPS = [[0, S.ok], [0.3, S.ok], [0.5, S.jaune], [0.68, S.orange], [0.86, S.danger], [1, S.danger]];
    const INK0 = {
      trace: [[0, [22, 135, 102]], [0.3, [22, 135, 102]], [0.5, [172, 182, 58]], [0.68, [165, 135, 60]], [0.86, [163, 33, 60]], [1, [163, 33, 60]]],
      word: [[0, [80, 148, 100]], [0.3, [80, 148, 100]], [0.5, [178, 186, 78]], [0.68, [168, 136, 72]], [0.86, [175, 52, 77]], [1, [175, 52, 77]]],
    };
    function shapeAt(u, p) {
      let i = 1;
      while (i < STEPS.length - 1 && p > STEPS[i][0]) i++;
      const w = smooth(STEPS[i - 1][0], STEPS[i][0], p), a = STEPS[i - 1][1], b = STEPS[i][1];
      const q = Math.max(0, Math.min(1, u)) * N, n = Math.min(N - 1, Math.floor(q)), f = q - n;
      const ya = a[n] + (a[n + 1] - a[n]) * f, yb = b[n] + (b[n + 1] - b[n]) * f;
      return ya + (yb - ya) * w;
    }
    const glowAt = (age) => Math.max(GHOST, 0.9 * Math.max(0, 1 - age / 0.6) ** 1.1 + 0.1 * Math.max(0, 1 - age / 0.04));

    let k = 1, ox = 0, oy = 0;
    let clock = 0, sweep = 0, cur = [], prev = [];
    const X = (u) => ox + u * k, Y = (v) => oy + v * k;
    const gx = (u) => X(G.x + u * GW), gy = (v) => Y(G.y + BASE - v * L);
    const bufC = document.createElement("canvas"), bctx = bufC.getContext("2d");
    const font = (px) => `400 ${px}px "Avenir Next", Avenir, "Segoe UI", "Helvetica Neue", sans-serif`;

    // Hasard reproductible et bruit périodique, pour le grain de la peinture
    const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    function vn(x, y, per, s) {
      const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const m = (a) => ((a % per) + per) % per;
      const h = (a, b) => rnd(m(a) * 57.31 + m(b) * 131.7 + s * 17.13);
      const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    /* La peinture crème du panneau : grain serré de métal martelé, piqûres sombres, éclats plus clairs.
       Le même carreau habille les pièces de l'interface (--creme). */
    const grainC = (() => {
      const n = 160, c = document.createElement("canvas");
      c.width = n; c.height = n;
      const x = c.getContext("2d"), img = x.createImageData(n, n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const u = i / n, v = j / n;
        const f = 0.5 * vn(u * 6, v * 6, 6, 1) + 0.3 * vn(u * 16, v * 16, 16, 2) + 0.2 * vn(u * 40, v * 40, 40, 3);
        const g = rnd(i * 1.13 + j * 91.7);
        let l = 0.95 + 0.26 * (f - 0.5) + 0.14 * (g - 0.5);
        let r = 200 * l, gg = 194 * l, b = 180 * l;
        if (g > 0.975) { const d = 0.45 + 0.3 * rnd(i + j * 3.3); r *= d; gg *= d * 0.95; b *= d * 0.88; }
        else if (g < 0.02) { r = 236; gg = 232; b = 222; }
        const q = (j * n + i) * 4;
        img.data[q] = r; img.data[q + 1] = gg; img.data[q + 2] = b; img.data[q + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      return c;
    })();
    document.documentElement.style.setProperty("--creme", `url(${grainC.toDataURL()})`);
    // Rouille et crasse à grande échelle, étirées sur tout le panneau
    const dirtC = (() => {
      const w = 140, h = 74, c = document.createElement("canvas");
      c.width = w; c.height = h;
      const x = c.getContext("2d"), img = x.createImageData(w, h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const f = 0.55 * vn(i / 14, j / 14, 99, 7) + 0.3 * vn(i / 6, j / 6, 99, 8) + 0.15 * vn(i / 2.5, j / 2.5, 99, 9);
        const a = smooth(0.5, 0.82, f), q = (j * w + i) * 4;
        img.data[q] = 74; img.data[q + 1] = 56; img.data[q + 2] = 38; img.data[q + 3] = 150 * a;
      }
      x.putImageData(img, 0, 0);
      return c;
    })();

    function rrect(c, x0, y0, x1, y1, rt, rb = rt) {
      c.beginPath();
      c.moveTo(X(x0 + rt), Y(y0));
      c.arcTo(X(x1), Y(y0), X(x1), Y(y1), rt * k);
      c.arcTo(X(x1), Y(y1), X(x0), Y(y1), rb * k);
      c.arcTo(X(x0), Y(y1), X(x0), Y(y0), rb * k);
      c.arcTo(X(x0), Y(y0), X(x1), Y(y0), rt * k);
      c.closePath();
    }
    function lin(c, x0, y0, x1, y1, stops) {
      const gr = c.createLinearGradient(X(x0), Y(y0), X(x1), Y(y1));
      for (const [o, col] of stops) gr.addColorStop(o, col);
      return gr;
    }
    // La vitre : coins hauts presque droits, coins bas bien arrondis, comme un tube cathodique
    const glass = (c) => rrect(c, G.x, G.y, G.x + GW, G.y + 1, 0.05, 0.14);

    function drawPanel() {
      const c = gctx, hx0 = G.x - 0.045, hy0 = G.y - 0.06, hx1 = G.x + GW + 0.045, hy1 = G.y + 1.04;
      c.clearRect(0, 0, W, H);
      // Panneau de métal peint, éclairé d'en haut, sale et piqué
      c.save();
      rrect(c, 0, 0, DEV_W, DEV_H - 0.09, 0.03);
      c.clip();
      const pat = c.createPattern(grainC, "repeat");
      pat.setTransform(new DOMMatrix().scale(Math.max(0.5, 0.008 * k)));
      c.fillStyle = pat;
      c.fillRect(X(0), Y(0), DEV_W * k, DEV_H * k);
      c.imageSmoothingEnabled = true;
      c.drawImage(dirtC, X(0), Y(0), DEV_W * k, DEV_H * k);
      c.fillStyle = lin(c, 0, 0, 0, DEV_H, [[0, "rgba(255,250,240,0.1)"], [0.4, "rgba(0,0,0,0)"], [1, "rgba(20,14,8,0.32)"]]);
      c.fillRect(X(0), Y(0), DEV_W * k, DEV_H * k);
      // Bords du panneau : arête claire en haut, ombre en bas
      c.fillStyle = "rgba(255,252,244,0.55)"; c.fillRect(X(0), Y(0), DEV_W * k, Math.max(1, 0.012 * k));
      c.fillStyle = "rgba(0,0,0,0.5)"; c.fillRect(X(0), Y(DEV_H - 0.09) - Math.max(1, 0.014 * k), DEV_W * k, Math.max(1, 0.014 * k));
      // Le logement de l'écran est creusé : ombre portée sur le flanc gauche et sous la lèvre du haut, chant éclairé dessous
      rrect(c, hx0 - 0.05, hy0 - 0.035, hx1 + 0.03, hy1 + 0.03, 0.07);
      c.fillStyle = lin(c, hx0 - 0.05, 0, hx1 + 0.03, 0, [[0, "rgba(30,24,16,0.55)"], [0.04, "rgba(30,24,16,0.25)"], [0.12, "rgba(30,24,16,0.08)"], [0.97, "rgba(30,24,16,0.12)"], [1, "rgba(30,24,16,0.4)"]]);
      c.fill();
      c.restore();
      rrect(c, hx0 - 0.012, hy1 - 0.02, hx1 + 0.012, hy1 + 0.022, 0.03);
      c.fillStyle = lin(c, 0, hy1 - 0.02, 0, hy1 + 0.022, [[0, "rgba(0,0,0,0)"], [0.45, "rgba(250,248,240,0.9)"], [0.7, "rgba(170,164,150,0.6)"], [1, "rgba(0,0,0,0)"]]);
      c.fill();
      // Rail sombre sous le panneau, avec son filet de lumière
      c.fillStyle = "#0d0c0b"; c.fillRect(X(0), Y(DEV_H - 0.09), DEV_W * k, 0.09 * k);
      c.fillStyle = lin(c, 0, DEV_H - 0.05, 0, DEV_H - 0.03, [[0, "rgba(160,158,150,0)"], [0.5, "rgba(186,183,175,0.75)"], [1, "rgba(160,158,150,0)"]]);
      c.fillRect(X(0.02), Y(DEV_H - 0.05), (DEV_W - 0.04) * k, 0.02 * k);
      // Boîtier noir du tube
      rrect(c, hx0, hy0, hx1, hy1, 0.07);
      c.fillStyle = lin(c, 0, hy0, 0, hy1, [[0, "#0a0a09"], [0.5, "#181816"], [1, "#22211f"]]);
      c.fill();
      // La vitre : sombre sous la lèvre du haut, plus claire vers le tiers haut, assombrie vers le bas et sur les bords
      glass(c);
      c.fillStyle = lin(c, 0, G.y, 0, G.y + 1, [[0, "#10120e"], [0.05, "#1d1f1b"], [0.11, "#3c3d3b"], [0.18, "#3f403f"], [0.3, "#3a3c3b"],
        [0.55, "#333635"], [0.75, "#2d302f"], [0.9, "#262827"], [1, "#1e1f1e"]]);
      c.fill();
      c.save();
      glass(c); c.clip();
      c.fillStyle = lin(c, G.x, 0, G.x + GW, 0, [[0, "rgba(0,0,0,0.6)"], [0.012, "rgba(0,0,0,0.35)"], [0.05, "rgba(0,0,0,0.1)"], [0.4, "rgba(0,0,0,0)"],
        [0.85, "rgba(0,0,0,0.12)"], [0.97, "rgba(0,0,0,0.3)"], [1, "rgba(0,0,0,0.55)"]]);
      c.fillRect(X(G.x), Y(G.y), GW * k, k);
      // Reflet du verre bombé et liseré clair sur les flancs
      c.fillStyle = lin(c, 0, G.y + 0.08, 0, G.y + 0.42, [[0, "rgba(220,226,224,0)"], [0.35, "rgba(220,226,224,0.05)"], [1, "rgba(220,226,224,0)"]]);
      c.fillRect(X(G.x), Y(G.y + 0.08), GW * k, 0.34 * k);
      c.restore();
      c.lineWidth = Math.max(1, 0.008 * k);
      c.strokeStyle = "rgba(170,176,172,0.07)";
      glass(c); c.stroke();
      // Les deux lignes vertes, et « État » posé sur celle du haut
      const lw = Math.max(1, 0.014 * k);
      c.fillStyle = "rgba(78,158,116,0.62)";
      c.fillRect(gx(0.03), Y(G.y + TOP) - lw / 2, (0.955 * GW) * k, lw);
      c.fillStyle = "rgba(70,150,104,0.6)";
      c.fillRect(gx(0.03), Y(G.y + BOT) - lw / 2, (0.955 * GW) * k, lw);
      c.font = font(0.1 * k);
      c.textBaseline = "alphabetic";
      c.fillStyle = "rgba(96,160,124,0.4)";
      c.fillText("État", gx(0.046), Y(G.y + TOP - 0.012));
    }

    function resize() {
      k = Math.min(W / DEV_W, H / DEV_H);
      ox = (W - DEV_W * k) / 2; oy = (H - DEV_H * k) / 2;
      bufC.width = Math.round(W * dpr); bufC.height = Math.round(H * dpr);
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPanel();
    }
    function enter() { clock = 0; sweep = 0; cur = []; prev = []; }

    function path(c, pts) {
      c.beginPath();
      pts.forEach((q, i) => (i ? c.lineTo(gx(q.u), gy(q.y)) : c.moveTo(gx(q.u), gy(q.y))));
    }

    function frame(dt, p) {
      // La tête avance par petits pas ; un passage dure une seconde
      const n = Math.max(1, Math.ceil(dt * 240));
      for (let i = 1; i <= n; i++) {
        const before = headU(sweep);
        sweep += dt / n; clock += dt / n;
        if (sweep >= 1) { sweep -= 1; prev = cur; cur = []; }
        const u = headU(sweep);
        if (before < PEAK && u >= PEAK) onBeat(p);
        if (!cur.length || u > cur[cur.length - 1].u) cur.push({ u, y: shapeAt(u, p), t: clock });
      }
      const head = cur.length ? cur[cur.length - 1].u : 0;
      const ink = ramp(INK0.trace, p);

      // Le tracé entier, opaque, dans un tampon : le reflet du passage d'avant devant la tête, puis le passage en cours
      bctx.clearRect(0, 0, W, H);
      bctx.lineJoin = "round"; bctx.lineCap = "round";
      const ahead = prev.filter((q) => q.u > head + 0.006);
      for (const [w, a] of [[0.06, 0.18], [0.026, 1]]) {
        bctx.lineWidth = w * k;
        bctx.strokeStyle = rgba(ink, a);
        if (ahead.length > 1) { path(bctx, ahead); bctx.stroke(); }
        if (cur.length > 1) { path(bctx, cur); bctx.stroke(); }
      }
      // Puis la rémanence : chaque point pâlit selon le temps écoulé depuis le passage de la tête
      const grad = bctx.createLinearGradient(gx(0), 0, gx(1), 0);
      const stop = (u, a) => grad.addColorStop(Math.max(0, Math.min(1, u)), `rgba(0,0,0,${a.toFixed(3)})`);
      const step = Math.max(1, Math.floor(cur.length / 48));
      for (let i = 0; i < cur.length; i += step) stop(cur[i].u, glowAt(clock - cur[i].t));
      if (cur.length) stop(head, glowAt(0));
      // Devant la tête, le passage d'avant n'est pas effacé d'un coup : il finit de s'éteindre à son rythme
      const pstep = Math.max(1, Math.floor(ahead.length / 48));
      for (let i = 0; i < ahead.length; i += pstep) stop(ahead[i].u, glowAt(clock - ahead[i].t));
      stop(1, ahead.length ? glowAt(clock - ahead[ahead.length - 1].t) : GHOST);
      bctx.globalCompositeOperation = "destination-in";
      bctx.fillStyle = grad;
      bctx.fillRect(0, 0, W, H);
      bctx.globalCompositeOperation = "source-over";

      tctx.clearRect(0, 0, W, H);
      tctx.save();
      glass(tctx); tctx.clip();
      tctx.drawImage(bufC, 0, 0, W, H);
      // Le mot d'état, en bas à droite de la vitre ; il clignote quand le temps est dépassé
      const blink = document.documentElement.classList.contains("overtime") && !reduceMotion && Date.now() % 900 >= 450;
      const word = wordFor(p) === "Ok" ? "OK" : wordFor(p), col = ramp(INK0.word, p);
      tctx.font = font(0.212 * k);
      tctx.textAlign = "right"; tctx.textBaseline = "alphabetic";
      tctx.globalAlpha = blink ? 0.2 : 1;
      tctx.shadowColor = rgba(col, 0.45); tctx.shadowBlur = 0.03 * k * dpr;
      tctx.fillStyle = rgba(col);
      tctx.fillText(word, gx(0.975), Y(G.y + 0.857));
      tctx.restore();
    }

    return { resize, enter, frame };
  })();

  // Dans la version 2, le texte du bas s'écrit lettre après lettre, comme les descriptions du jeu
  const hint = $(".hint");
  const hintParts = [...hint.childNodes].flatMap((n) => n.nodeType === 3 ? [n] : [...n.childNodes]).filter((n) => n.nodeType === 3);
  const hintText = hintParts.map((n) => n.textContent);
  let typing = 0;
  // Les touches (<kbd>) restent cachées tant que la machine n'est pas arrivée jusqu'à elles
  const show = (n) => { if (n.parentElement !== hint) n.parentElement.style.visibility = n.textContent ? "" : "hidden"; };
  function typeHint() {
    clearInterval(typing);
    hintParts.forEach((n, i) => { n.textContent = hintText[i]; show(n); });
    if (reduceMotion || view !== recorder) return;
    hintParts.forEach((n) => { n.textContent = ""; show(n); });
    let part = 0, pos = 0;
    typing = setInterval(() => {
      if (part >= hintParts.length) { clearInterval(typing); return; }
      pos++;
      hintParts[part].textContent = hintText[part].slice(0, pos);
      show(hintParts[part]);
      if (pos >= hintText[part].length) { part++; pos = 0; }
    }, 34);
  }

  // Crasse des pièces de l'interface de la version 2 (rouleau, médaillons, barre, cadres) :
  // une petite texture qui se répète, avec taches, piqûres et rayures, donnée au CSS par --crasse
  (() => {
    const n = 128, c = document.createElement("canvas");
    c.width = n; c.height = n;
    const x = c.getContext("2d"), img = x.createImageData(n, n);
    const r = (i) => { const s = Math.sin(i * 91.7 + 47.3) * 43758.5453; return s - Math.floor(s); };
    const val = (i, j, p) => r(((i % p) + p) % p * 31.1 + (((j % p) + p) % p) * 7.7 + p);
    const vn = (u, v, p) => {
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = fu * fu * (3 - 2 * fu), b = fv * fv * (3 - 2 * fv);
      const top = val(i, j, p) + (val(i + 1, j, p) - val(i, j, p)) * a, bot = val(i, j + 1, p) + (val(i + 1, j + 1, p) - val(i, j + 1, p)) * a;
      return top + (bot - top) * b;
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const u = i / n, v = j / n;
      const f = 0.55 * vn(u * 4, v * 4, 4) + 0.28 * vn(u * 8, v * 8, 8) + 0.17 * vn(u * 16, v * 16, 16);
      const q = (j * n + i) * 4, a = smooth(0.48, 0.85, f);
      img.data[q] = 30; img.data[q + 1] = 21; img.data[q + 2] = 12; img.data[q + 3] = 175 * a;
    }
    x.putImageData(img, 0, 0);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = r(i + 0.5) > 0.78 ? `rgba(255,244,226,${0.15 + 0.2 * r(i + 0.9)})` : `rgba(18,12,7,${0.25 + 0.4 * r(i + 0.9)})`;
      x.fillRect(Math.floor(r(i + 0.1) * n), Math.floor(r(i + 0.3) * n), 1, 1);
    }
    x.lineWidth = 0.6;
    for (let i = 0; i < 26; i++) {
      const x0 = r(i + 5.1) * n, y0 = r(i + 5.7) * n, len = 6 + 22 * r(i + 6.2), ang = (r(i + 6.9) - 0.5) * 1.2;
      x.strokeStyle = r(i + 7.3) > 0.5 ? "rgba(255,248,236,0.22)" : "rgba(0,0,0,0.35)";
      x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); x.stroke();
    }
    document.documentElement.style.setProperty("--crasse", `url(${c.toDataURL()})`);
  })();

  const views = { moniteur: monitor, remake: recorder, zero };
  let view = monitor;
  function setView(name) {
    if (!views[name]) name = "moniteur";
    view = views[name];
    for (const n of Object.keys(views)) document.documentElement.classList.toggle("theme-" + n, n === name && n !== "moniteur");
    for (const c of [gctx, tctx, hctx]) c.clearRect(0, 0, W, H);
    view.enter();
    resize();
    typeHint();
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

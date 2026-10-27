/* 사신 수호대 소리 엔진
 * 소리 파일 없이 브라우저의 오디오(WebAudio)로 효과음과 배경음악을 만들어요(저작권 걱정 없음, 용량 거의 0).
 * - 소리는 화면을 처음 누른 뒤에 켜져요(브라우저 규칙).
 * - 소리 상태 3단계: 'all'(배경음악+효과음) → 'sfx'(효과음만) → 'off'(끔). 저장은 이 기기에만 해요.
 * - 나중에 직접 만든 음악 파일을 쓰고 싶으면 config.js의 BGM_FILES에 {track이름: 파일경로}를 넣으면 돼요(없으면 만들어 낸 음악을 써요). */
(function () {
  'use strict';
  var ctx = null, master = null, comp = null, sfxG = null, bgmG = null, mode = 'all', unlocked = false;
  var KEY = 'sasin_audio_mode';
  try { var m0 = localStorage.getItem(KEY); if (m0 === 'all' || m0 === 'sfx' || m0 === 'off') mode = m0; } catch (e) {}
  var listeners = [];
  function emit() { listeners.forEach(function (f) { try { f(mode); } catch (e) {} }); }

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    try {
      ctx = new AC();
      comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = 0.46;
      sfxG = ctx.createGain(); sfxG.gain.value = 0.9; bgmG = ctx.createGain(); bgmG.gain.value = 0.42;
      sfxG.connect(master); bgmG.connect(master); master.connect(comp); comp.connect(ctx.destination);
    } catch (e) { ctx = null; return false; }
    return true;
  }
  function unlock() {
    if (!ensure()) return; loadSamples();
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    if (!unlocked) { unlocked = true; if (wantTrack) playTrack(wantTrack); }
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function (n) { document.addEventListener(n, unlock, { passive: true }); });
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    try { if (document.hidden) ctx.suspend(); else if (mode !== 'off') ctx.resume(); } catch (e) {}
  });

  /* ───── 소리 재료 ───── */
  function env(g, t, a, d, peak, end) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, end || 0.0001), t + a + d); }
  function tone(o) {   // {f, f2, t, a, d, type, vol, dest, det}
    var t = o.t || ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t); if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.a || 0.01) + (o.d || 0.2));
    if (o.det) osc.detune.value = o.det;
    env(g, t, o.a || 0.01, o.d || 0.2, o.vol || 0.3); osc.connect(g); g.connect(o.dest || sfxG);
    osc.start(t); osc.stop(t + (o.a || 0.01) + (o.d || 0.2) + 0.05);
  }
  var noiseBuf = null;
  function noise(o) {  // {t, d, f, q, type, vol, dest, f2}
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate); var ch = noiseBuf.getChannelData(0); for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
    var t = o.t || ctx.currentTime, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; fl.type = o.type || 'bandpass'; fl.frequency.setValueAtTime(o.f || 1000, t); if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + o.d); fl.Q.value = o.q || 1;
    env(g, t, 0.005, o.d || 0.1, o.vol || 0.3); s.connect(fl); fl.connect(g); g.connect(o.dest || sfxG); s.start(t); s.stop(t + (o.d || 0.1) + 0.05);
  }
  function note(semi, base) { return (base || 261.63) * Math.pow(2, semi / 12); }
  function seq(list, gap, fn) { var t0 = ctx.currentTime; list.forEach(function (x, i) { fn(x, t0 + i * gap, i); }); }
  function bell(f, t, vol, d) { tone({ f: f, t: t, a: 0.004, d: d || 0.9, vol: vol, type: 'sine' }); tone({ f: f * 2.01, t: t, a: 0.004, d: (d || 0.9) * 0.6, vol: vol * 0.4, type: 'sine' }); tone({ f: f * 3.5, t: t, a: 0.004, d: (d || 0.9) * 0.3, vol: vol * 0.15, type: 'sine' }); }
  function drum(t, vol, low, dest) { tone({ f: low ? 110 : 190, f2: low ? 62 : 90, t: t, a: 0.003, d: 0.16, vol: vol, type: 'sine', dest: dest }); noise({ t: t, d: 0.05, f: 900, q: 0.8, vol: vol * 0.4, dest: dest }); }

  /* ───── 효과음 ───── */
  var SFX = {
    click: function () { tone({ f: 660, f2: 880, a: 0.004, d: 0.08, vol: 0.28, type: 'triangle' }); },
    back: function () { tone({ f: 520, f2: 380, a: 0.004, d: 0.09, vol: 0.18, type: 'triangle' }); },
    select: function () { seq([0, 4, 7], 0.07, function (s, t) { tone({ f: note(s, 392), t: t, a: 0.005, d: 0.2, vol: 0.2, type: 'triangle' }); }); },
    toast: function () { tone({ f: 740, a: 0.004, d: 0.12, vol: 0.12, type: 'sine' }); },
    /* 신수 무기와 능력 */
    throw_cr: function () { tone({ f: 500, f2: 1100, a: 0.01, d: 0.28, vol: 0.2, type: 'sine' }); noise({ d: 0.2, f: 1400, f2: 3000, q: 1.2, vol: 0.1 }); },
    throw_bh: function () { noise({ d: 0.22, f: 500, f2: 1600, q: 0.9, vol: 0.18 }); tone({ f: 150, f2: 90, a: 0.005, d: 0.2, vol: 0.15, type: 'sawtooth' }); },
    throw_jj: function () { noise({ d: 0.3, f: 900, f2: 300, q: 0.7, vol: 0.2, type: 'lowpass' }); tone({ f: 420, f2: 780, a: 0.01, d: 0.25, vol: 0.12, type: 'triangle' }); },
    throw_hm: function () { tone({ f: 1400, f2: 700, a: 0.005, d: 0.22, vol: 0.14, type: 'triangle' }); noise({ d: 0.12, f: 3500, q: 3, vol: 0.1, type: 'highpass' }); },
    skill_cr: function () { tone({ f: 260, f2: 780, a: 0.02, d: 0.5, vol: 0.2, type: 'sawtooth' }); noise({ d: 0.5, f: 600, f2: 3000, q: 0.8, vol: 0.12 }); },
    skill_bh: function () { tone({ f: 120, f2: 70, a: 0.01, d: 0.55, vol: 0.32, type: 'sawtooth' }); tone({ f: 180, f2: 110, a: 0.01, d: 0.5, vol: 0.2, type: 'square' }); noise({ d: 0.4, f: 400, q: 0.6, vol: 0.2 }); },
    skill_jj: function () { tone({ f: 330, f2: 990, a: 0.02, d: 0.55, vol: 0.18, type: 'triangle' }); noise({ d: 0.6, f: 2500, f2: 700, q: 0.9, vol: 0.14 }); },
    skill_hm: function () { bell(note(-12, 392), ctx.currentTime, 0.22, 1.2); bell(note(-5, 392), ctx.currentTime + 0.12, 0.18, 1.2); noise({ d: 0.5, f: 300, q: 0.5, vol: 0.12, type: 'lowpass' }); setTimeout(function () { hissOnce(0.12); }, 120); },
    /* 전투 */
    hit: function () { drum(ctx.currentTime, 0.28, false); },
    stun: function () { seq([9, 5, 2], 0.06, function (s, t) { tone({ f: note(s, 523), t: t, a: 0.004, d: 0.1, vol: 0.14, type: 'triangle' }); }); },
    catch_: function () { seq([0, 4, 7, 12], 0.06, function (s, t) { tone({ f: note(s, 523.25), t: t, a: 0.005, d: 0.22, vol: 0.2, type: 'triangle' }); }); },
    alert: function () { seq([0, 0], 0.16, function (s, t) { tone({ f: 330, f2: 300, t: t, a: 0.01, d: 0.12, vol: 0.2, type: 'square' }); }); },
    loot: function () { seq([-2, -5, -9], 0.14, function (s, t) { tone({ f: note(s, 392), t: t, a: 0.01, d: 0.3, vol: 0.2, type: 'sawtooth' }); }); },
    protect: function () { bell(note(0, 523), ctx.currentTime, 0.2, 1.0); bell(note(7, 523), ctx.currentTime + 0.1, 0.18, 1.0); bell(note(12, 523), ctx.currentTime + 0.2, 0.16, 1.2); },
    hurt: function () { tone({ f: 200, f2: 90, a: 0.004, d: 0.25, vol: 0.28, type: 'square' }); noise({ d: 0.15, f: 1500, q: 0.7, vol: 0.14 }); },
    tower: function () { bell(note(-24, 392), ctx.currentTime, 0.3, 1.8); tone({ f: 110, f2: 90, a: 0.05, d: 1.0, vol: 0.2, type: 'sawtooth' }); },
    arrow: function () { noise({ d: 0.18, f: 3000, f2: 900, q: 1.5, vol: 0.12, type: 'bandpass' }); },
    /* 문제 */
    quiz: function () { seq([0, 7], 0.1, function (s, t) { bell(note(s, 440), t, 0.14, 0.7); }); },
    right: function () { seq([0, 4, 7, 12], 0.08, function (s, t) { tone({ f: note(s, 523.25), t: t, a: 0.005, d: 0.25, vol: 0.2, type: 'triangle' }); }); },
    wrong: function () { seq([-3, -6], 0.13, function (s, t) { tone({ f: note(s, 330), t: t, a: 0.01, d: 0.25, vol: 0.2, type: 'sawtooth' }); }); },
    /* 결과 */
    star: function (i) { bell(note(i * 4, 659), ctx.currentTime, 0.2, 0.8); },
    win: function () { seq([0, 4, 7, 12, 16, 19], 0.1, function (s, t) { bell(note(s, 523.25), t, 0.18, 1.0); }); drum(ctx.currentTime, 0.2, true); },
    lose: function () { seq([0, -3, -7, -12], 0.2, function (s, t) { tone({ f: note(s, 330), t: t, a: 0.02, d: 0.5, vol: 0.18, type: 'triangle' }); }); },
    fanfare: function () {
      var t0 = ctx.currentTime; [0, 0, 4, 7, 12].forEach(function (s, i) { tone({ f: note(s, 392), t: t0 + i * 0.16, a: 0.01, d: 0.4, vol: 0.2, type: 'sawtooth' }); tone({ f: note(s + 7, 392), t: t0 + i * 0.16, a: 0.01, d: 0.4, vol: 0.1, type: 'triangle' }); });
      bell(note(12, 523.25), t0 + 0.9, 0.22, 2.4); bell(note(19, 523.25), t0 + 0.9, 0.16, 2.4); drum(t0, 0.3, true); drum(t0 + 0.9, 0.3, true);
    },
    title: function () { seq([0, 7, 12, 16, 19], 0.09, function (s, t) { bell(note(s, 587.33), t, 0.15, 1.2); }); },
    /* 쉼터 게임 */
    flip: function () { noise({ d: 0.07, f: 2500, q: 1, vol: 0.12 }); tone({ f: 700, f2: 500, a: 0.003, d: 0.06, vol: 0.1, type: 'triangle' }); },
    match: function () { seq([0, 7], 0.08, function (s, t) { bell(note(s, 659), t, 0.16, 0.6); }); },
    miss: function () { tone({ f: 260, f2: 200, a: 0.005, d: 0.14, vol: 0.14, type: 'triangle' }); },
    place: function () { tone({ f: 420, f2: 330, a: 0.003, d: 0.09, vol: 0.3, type: 'triangle' }); noise({ d: 0.04, f: 1200, q: 1, vol: 0.12 }); },
    /* 프롤로그 */
    drip: function () { tone({ f: 1600, f2: 800, a: 0.003, d: 0.18, vol: 0.12, type: 'sine' }); bell(note(7, 1046), ctx.currentTime + 0.05, 0.05, 0.6); },
    thud: function () { drum(ctx.currentTime, 0.8, true); noise({ d: 0.2, f: 250, q: 0.6, vol: 0.4, type: 'lowpass' }); },
    scrape: function () { noise({ d: 0.5, f: 2200, f2: 1200, q: 1.8, vol: 0.14, type: 'bandpass' }); },
    crumble: function () { for (var k = 0; k < 6; k++) noise({ t: ctx.currentTime + k * 0.07, d: 0.12, f: 600 + Math.random() * 900, q: 1.2, vol: 0.1 }); },
    awaken: function () { var t0 = ctx.currentTime; [0, 7, 12, 16].forEach(function (s, i) { tone({ f: note(s, 261.63), t: t0 + i * 0.25, a: 0.12, d: 1.6, vol: 0.14, type: 'triangle' }); bell(note(s + 12, 261.63), t0 + i * 0.25, 0.1, 1.8); }); },
    gong: function () { bell(note(-24, 392), ctx.currentTime, 0.34, 3.2); bell(note(-17, 392), ctx.currentTime, 0.2, 2.8); }
  };
  SFX['catch'] = SFX.catch_;


  /* ───── 10/26 개선: 맞추는 재미가 있는 타격음과 신수별 무기 소리 ───── */
  SFX.hit = function () {            // 도굴꾼을 맞췄을 때: 묵직한 '퍽' + 경쾌한 '띵' (무섭지 않게)
    var t = ctx.currentTime;
    tone({ f: 170, f2: 70, t: t, a: 0.002, d: 0.14, vol: 0.4, type: 'sine' });
    noise({ t: t, d: 0.07, f: 1400, q: 0.9, vol: 0.2 });
    tone({ f: 988, t: t + 0.03, a: 0.003, d: 0.22, vol: 0.1, type: 'triangle' });
    tone({ f: 1480, t: t + 0.05, a: 0.003, d: 0.16, vol: 0.06, type: 'sine' });
  };
  SFX.hit_axe = function () { var t = ctx.currentTime; tone({ f: 330, f2: 190, t: t, a: 0.002, d: 0.12, vol: 0.16, type: 'square' }); noise({ t: t, d: 0.05, f: 4500, q: 1.5, vol: 0.1, type: 'highpass' }); };
  SFX.hit_pearl = function () { var t = ctx.currentTime; tone({ f: 700, f2: 1500, t: t, a: 0.004, d: 0.12, vol: 0.14, type: 'sine' }); tone({ f: 1400, f2: 2400, t: t + 0.04, a: 0.004, d: 0.1, vol: 0.07, type: 'sine' }); };
  SFX.hit_fire = function () { var t = ctx.currentTime; noise({ t: t, d: 0.14, f: 900, f2: 3000, q: 0.8, vol: 0.14, type: 'lowpass' }); };
  SFX.hit_ice = function () { var t = ctx.currentTime; noise({ t: t, d: 0.05, f: 5200, q: 1.5, vol: 0.12, type: 'highpass' }); tone({ f: 2600, f2: 1800, t: t, a: 0.002, d: 0.14, vol: 0.1, type: 'triangle' }); bell(2093, t + 0.02, 0.07, 0.4); };
  SFX.throw_cr = function () {       // 청룡 여의주: 물결치는 '슈웅~ 뿅'
    var t = ctx.currentTime;
    noise({ t: t, d: 0.3, f: 700, f2: 3800, q: 1.1, vol: 0.2, type: 'bandpass' });
    tone({ f: 480, f2: 1500, t: t, a: 0.01, d: 0.3, vol: 0.26, type: 'sine' });
    tone({ f: 960, f2: 2200, t: t + 0.02, a: 0.01, d: 0.26, vol: 0.08, type: 'triangle' });
    bell(1568, t + 0.06, 0.07, 0.5);
  };
  SFX.throw_bh = function () {       // 백호 도끼: 묵직하게 '휘익-쾅'
    var t = ctx.currentTime;
    drum(t, 0.3, true);
    noise({ t: t, d: 0.24, f: 1600, f2: 350, q: 0.8, vol: 0.26, type: 'lowpass' });
    tone({ f: 210, f2: 110, t: t, a: 0.005, d: 0.26, vol: 0.14, type: 'sawtooth' });
    tone({ f: 2100, t: t + 0.02, a: 0.002, d: 0.09, vol: 0.05, type: 'sine' });
  };
  SFX.axe_back = function () {       // 도끼가 돌아올 때: 부메랑처럼 '위~~잉'
    var t = ctx.currentTime, dur = 0.8, o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(), f = ctx.createBiquadFilter(), env = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(520, t + dur * 0.85); o.frequency.exponentialRampToValueAtTime(560, t + dur);
    lfo.type = 'sine'; lfo.frequency.value = 22; lg.gain.value = 0.45; g.gain.value = 0.55; lfo.connect(lg); lg.connect(g.gain);
    f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(2400, t + dur);
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.2, t + dur * 0.7); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(f); f.connect(env); env.connect(sfxG); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    noise({ t: t, d: dur, f: 500, f2: 1800, q: 0.8, vol: 0.09, type: 'bandpass' });
  };
  SFX.axe_catch = function () { var t = ctx.currentTime; tone({ f: 620, f2: 320, t: t, a: 0.002, d: 0.07, vol: 0.14, type: 'triangle' }); noise({ t: t, d: 0.04, f: 1800, q: 1, vol: 0.1 }); };
  SFX.throw_jj = function () {       // 주작 불꽃: '화르륵' + 타닥
    var t = ctx.currentTime;
    noise({ t: t, d: 0.38, f: 350, f2: 2600, q: 0.7, vol: 0.8, type: 'lowpass' });
    tone({ f: 200, f2: 90, t: t, a: 0.01, d: 0.3, vol: 0.26, type: 'sawtooth' });
    noise({ t: t + 0.12, d: 0.15, f: 3200, q: 1.2, vol: 0.05, type: 'highpass' });
    for (var k = 0; k < 4; k++) noise({ t: t + 0.1 + k * 0.07 + Math.random() * 0.03, d: 0.03, f: 2500 + Math.random() * 2500, q: 2, vol: 0.04, type: 'bandpass' });
  };
  SFX.throw_hm = function () {       // 현무 얼음: 차갑게 '쉭~ 찡'
    var t = ctx.currentTime;
    noise({ t: t, d: 0.18, f: 3500, f2: 6500, q: 1.5, vol: 0.13, type: 'highpass' });
    tone({ f: 2600, f2: 1500, t: t, a: 0.003, d: 0.2, vol: 0.12, type: 'triangle' });
    bell(2093, t + 0.02, 0.09, 0.45); bell(1568, t + 0.07, 0.06, 0.5);
    tone({ f: 160, f2: 90, t: t, a: 0.003, d: 0.1, vol: 0.14, type: 'sine' });
  };
  SFX.ward_end = function () { var t = ctx.currentTime; bell(784, t, 0.12, 0.8); bell(523, t + 0.14, 0.1, 1.0); noise({ t: t, d: 0.4, f: 3200, f2: 1200, q: 0.8, vol: 0.05, type: 'bandpass' }); };

  function sfx(name, arg) {
    if (window.__sfxlog) window.__sfxlog.push(Math.round(performance.now() / 100) / 10 + ':' + name);
    if (mode === 'off' || !ensure() || !unlocked) return;
    var f = SFX[name]; if (!f) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    // 같은 소리를 너무 자주 내지 않게(50ms 안에서는 한 번만)
    var now = ctx.currentTime; sfx._last = sfx._last || {}; if (sfx._last[name] && now - sfx._last[name] < 0.05) return; sfx._last[name] = now;
    try { f(arg); } catch (e) {}
  }


  /* ───── 신수 움직임 소리(신수 영상에서 잘라 낸 소리, js/charsnd.js) ───── */
  var buffers = null;
  function b64ToBuf(uri) { var s = atob(uri.split(',')[1]), n = s.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  function loadSamples() {
    if (buffers || !ctx || !window.SASIN_SND) return; buffers = {};
    Object.keys(window.SASIN_SND).forEach(function (g) {
      buffers[g] = {};
      Object.keys(window.SASIN_SND[g]).forEach(function (k) {
        buffers[g][k] = [];
        window.SASIN_SND[g][k].forEach(function (uri) {
          try { var p = ctx.decodeAudioData(b64ToBuf(uri), function (buf) { buffers[g][k].push(buf); }, function () {}); if (p && p.catch) p.catch(function () {}); } catch (e) {}
        });
      });
    });
  }
  /* 소리 크기는 걸을 때 평균 크기가 청룡과 비슷하도록 맞춤(백호·현무 발소리는 청룡의 약 60~75%), 주작의 타닥타닥과 현무의 쉬익은 훨씬 작게 */
  var CVOL = { cr: { flap: 0.42 }, jj: { flap: 0.449 }, bh: { step: 0.174 }, hm: { step: 0.237 } }, CRACK_VOL = 0.042, HISS_VOL = 0.068, lastStep = {}, crackTm = null, hissTm = null;
  function charStep(id, type) {      // 날개 퍼덕임·발소리 한 번
    if (mode === 'off' || !ctx || !unlocked || !buffers || !buffers[id] || !buffers[id][type] || !buffers[id][type].length) return;
    var now = ctx.currentTime, key = id + type; if (lastStep[key] && now - lastStep[key] < 0.1) return; lastStep[key] = now;
    var list = buffers[id][type], s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = list[Math.floor(Math.random() * list.length)]; s.playbackRate.value = 0.95 + Math.random() * 0.1;
    g.gain.value = ((CVOL[id] && CVOL[id][type]) || 0.6) * (0.85 + Math.random() * 0.3); s.connect(g); g.connect(sfxG); s.start(now);
  }
  function hissOnce(vol) {              // 현무의 '쉬익' 뱀 소리
    if (mode === 'off' || !ctx || !buffers || !buffers.hm || !buffers.hm.hiss || !buffers.hm.hiss[0]) return;
    var s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buffers.hm.hiss[0]; s.playbackRate.value = 0.92 + Math.random() * 0.16; g.gain.value = (vol || HISS_VOL); s.connect(g); g.connect(sfxG); s.start();
  }
  function crackOnce(vol) {             // 주작의 불 소리: 간간히 작게 '타닥'
    if (mode === 'off' || !ctx || !buffers || !buffers.jj || !buffers.jj.crackle || !buffers.jj.crackle[0]) return;
    var buf = buffers.jj.crackle[0], d = 0.3 + Math.random() * 0.2, off = Math.random() * Math.max(0.1, buf.duration - d - 0.05), t = ctx.currentTime;
    var s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime((vol || CRACK_VOL), t + 0.05); g.gain.linearRampToValueAtTime(0.0001, t + d);
    s.connect(g); g.connect(sfxG); s.start(t, off, d + 0.02);
  }
  function charLoop(id, on) {        // 서 있는 동안 계속 나는 소리: 주작의 타닥타닥 불 소리, 현무의 쉬익 소리
    if (!ctx || !unlocked || !buffers) return;
    var want = !!on && mode !== 'off';
    if (id === 'jj') {
      /* 주작의 타닥타닥 소리는 이제 도굴꾼이 불에 맞고 '앗 뜨거!' 할 때만 나요 (fireHit) */
    } else if (id === 'hm') {
      if (want && !hissTm) { var next = function () { hissOnce(); hissTm = setTimeout(next, 5200 + Math.random() * 4800); }; hissTm = setTimeout(next, 1500); }
      else if (!want && hissTm) { clearTimeout(hissTm); hissTm = null; }
    }
  }
  
  /* ───── 현무 결계: 시작·끝 신호와, 결계가 이어지는 동안 아주 작게 깔리는 소리 ───── */
  var WARD_VOL = 0.065, WARD_KIND = 'breath', ward = { st: 'off', node: null };
  function fireHit() { crackOnce(0.13); }
  function wardMake(kind) {
    var g = ctx.createGain(), stops = []; g.gain.value = 0.0001;
    if (kind === 'breath') {            // 숨 쉬듯 느리게 부풀었다 가라앉는 바람 소리(뱀의 숨결 느낌)
      noise({ d: 0.01, vol: 0.0001 }); var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 0.7; am.gain.value = 0.55; lfo.frequency.value = 0.33; lg.gain.value = 0.45;
      lfo.connect(lg); lg.connect(am.gain); s.connect(f); f.connect(am); am.connect(g); s.start(); lfo.start(); stops = [s, lfo];
    } else if (kind === 'hum') {        // 낮고 부드러운 웅~ 소리
      var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), am2 = ctx.createGain(), l2 = ctx.createOscillator(), lg2 = ctx.createGain();
      o1.frequency.value = 98; o2.frequency.value = 147; am2.gain.value = 0.7; l2.frequency.value = 0.5; lg2.gain.value = 0.25; l2.connect(lg2); lg2.connect(am2.gain);
      o1.connect(am2); o2.connect(am2); am2.connect(g); o1.start(); o2.start(); l2.start(); stops = [o1, o2, l2];
    } else {                            // 'hiss': 쉬익 소리를 작게 되풀이
      var tm = setInterval(function () { if (mode !== 'off') hissOnce(0.05); }, 1800); stops = [{ stop: function () { clearInterval(tm); } }];
    }
    g.connect(sfxG); return { g: g, stops: stops };
  }
  function wardFade(node, secs) {
    if (!node) return; var t = ctx.currentTime; node.g.gain.cancelScheduledValues(t); node.g.gain.setValueAtTime(node.g.gain.value, t); node.g.gain.linearRampToValueAtTime(0.0001, t + secs);
    setTimeout(function () { node.stops.forEach(function (s) { try { s.stop(); } catch (e) {} }); try { node.g.disconnect(); } catch (e) {} }, secs * 1000 + 100);
  }
  function wardTick(active, playing) {  // 게임 장면마다 불러요: active=결계가 켜져 있음, playing=전투 진행 중
    if (!ctx || !unlocked || mode === 'off') { if (ward.node) { wardFade(ward.node, 0.1); ward.node = null; } ward.st = 'off'; return; }
    if (active && playing) {
      if (ward.st !== 'on') {
        ward.node = wardMake(WARD_KIND); var t = ctx.currentTime; ward.node.g.gain.setValueAtTime(0.0001, t); ward.node.g.gain.linearRampToValueAtTime(WARD_VOL, t + 0.9); ward.st = 'on';
      }
    } else if (ward.st === 'on') {
      wardFade(ward.node, active ? 0.4 : 0.7); ward.node = null;
      if (!active && playing) sfx('ward_end'); ward.st = active ? 'paused' : 'off';      // 시간이 다 돼서 끝났을 때만 '끝' 신호
    } else if (ward.st === 'paused' && !active) ward.st = 'off';
  }

  function charStopAll() { charLoop('jj', false); charLoop('hm', false); wardTick(false, false); }
  function charPreview(id) { if (id === 'cr' || id === 'jj') charStep(id, 'flap'); else charStep(id, 'step'); if (id === 'hm') setTimeout(hissOnce, 260); }


  /* ───── 프롤로그 소리: 영상의 소리를 mp3로 따로 넣어 두고 그림과 함께 틀어요 ───── */
  var clipSrc = null;
  function clipStop() { if (clipSrc) { try { clipSrc.stop(); } catch (e) {} clipSrc = null; } }
  function clipPrepare(uri, cb) {      // 소리를 미리 풀어 둬요. 끝나면 cb(소리 또는 null)
    if (!ensure()) { cb(null); return; }
    try { ctx.decodeAudioData(b64ToBuf(uri), function (buf) { cb(buf); }, function () { cb(null); }); } catch (e) { cb(null); }
  }
  function clipPlay(buf) {
    clipStop(); if (!buf || mode === 'off' || !ctx || !unlocked) return;
    var s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; g.gain.value = 0.85; s.connect(g); g.connect(master); s.start(); clipSrc = s;
  }

  /* ───── 배경음악(국악풍 5음 음계) ───── */
  var PYEONG = [0, 2, 5, 7, 9], GYEMYEON = [0, 3, 5, 7, 10];
  var TRACKS = {
    title:   { root: 62, scale: PYEONG, bpm: 66, wave: 'triangle', drums: 0, density: 0.55, bass: 1, bellVol: 0.1 },
    map:     { root: 60, scale: PYEONG, bpm: 72, wave: 'triangle', drums: 0, density: 0.5, bass: 1, bellVol: 0.1 },
    rest:    { root: 65, scale: PYEONG, bpm: 92, wave: 'triangle', drums: 1, density: 0.7, bass: 1, bellVol: 0.1 },
    battle1: { root: 57, scale: PYEONG, bpm: 84, wave: 'triangle', drums: 2, density: 0.6, bass: 1, bellVol: 0.06 },
    battle2: { root: 52, scale: GYEMYEON, bpm: 100, wave: 'sawtooth', drums: 2, density: 0.65, bass: 1, bellVol: 0.04 },
    battle3: { root: 55, scale: PYEONG, bpm: 88, wave: 'triangle', drums: 1, density: 0.7, bass: 1, bellVol: 0.08 },
    battle4: { root: 57, scale: GYEMYEON, bpm: 96, wave: 'square', drums: 2, density: 0.65, bass: 1, bellVol: 0.05 },
    battle5: { root: 57, scale: PYEONG, bpm: 104, wave: 'triangle', drums: 2, density: 0.75, bass: 1, bellVol: 0.08 },
    battle6: { root: 50, scale: GYEMYEON, bpm: 80, wave: 'sine', drums: 1, density: 0.45, bass: 1, bellVol: 0.1 },
    battle7: { root: 53, scale: PYEONG, bpm: 108, wave: 'triangle', drums: 2, density: 0.8, bass: 1, bellVol: 0.07 },
    battle8: { root: 50, scale: GYEMYEON, bpm: 92, wave: 'sawtooth', drums: 2, density: 0.6, bass: 1, bellVol: 0.05 },
    battle9: { root: 55, scale: PYEONG, bpm: 98, wave: 'triangle', drums: 2, density: 0.65, bass: 1, bellVol: 0.06 },
    battle10: { root: 58, scale: PYEONG, bpm: 86, wave: 'sine', drums: 1, density: 0.55, bass: 1, bellVol: 0.1 }
  };
  var cur = null, wantTrack = null, timer = null, step = 0, nextT = 0, melody = null, curEl = null;
  function rng(seed) { var s = 0; for (var i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function buildMelody(name, T) {
    var r = rng(name), motif = [], i, deg = 2;
    for (i = 0; i < 8; i++) { deg = Math.max(0, Math.min(9, deg + Math.floor(r() * 5) - 2)); motif.push(r() < T.density ? deg : -1); }
    var phrase = [];
    for (var b = 0; b < 4; b++) motif.forEach(function (d, k) { var dd = d; if (d >= 0 && b % 2 === 1 && k >= 5) dd = Math.max(0, Math.min(9, d + (b === 3 ? -1 : 1))); phrase.push(dd); });
    return phrase;   // 32 걸음(8분음표) = 4마디
  }
  function degreeToMidi(T, d) { var len = T.scale.length, oct = Math.floor(d / len), idx = d % len; return T.root + 12 + T.scale[idx] + 12 * oct; }
  function schedule() {
    if (!cur || !ctx) return;
    var T = TRACKS[cur], sp = 60 / T.bpm / 2;
    while (nextT < ctx.currentTime + 0.35) {
      var k = step % 32, d = melody[k];
      if (d >= 0) {
        var f = midi(degreeToMidi(T, d));
        tone({ f: f, t: nextT, a: 0.015, d: 0.35, vol: 0.12, type: T.wave, dest: bgmG });
        if (T.bellVol && k % 4 === 0) bell(f * 2, nextT, T.bellVol, 0.9);
      }
      if (T.bass && k % 8 === 0) { var bf = midi(T.root - 12 + (Math.floor(k / 8) % 2 ? T.scale[3] : 0)); tone({ f: bf, t: nextT, a: 0.02, d: sp * 7, vol: 0.14, type: 'sine', dest: bgmG }); }
      if (T.drums) {  // 장구 느낌: 덩(낮은 북) 기덕 쿵 더러러러 같은 반복
        if (k % 8 === 0) drum(nextT, 0.2, true, bgmG);
        if (T.drums === 2 && (k % 8 === 4 || k % 8 === 6)) drum(nextT, 0.12, false, bgmG);
        if (T.drums === 1 && k % 8 === 4) drum(nextT, 0.1, false, bgmG);
      }
      nextT += sp; step++;
    }
  }
  function stopEl() { if (curEl) { try { curEl.pause(); } catch (e) {} curEl = null; } }
  function playTrack(name) {
    wantTrack = name; if (mode !== 'all' || !ensure() || !unlocked) return;
    if (cur === name && timer) return;
    stopTrack(true);
    var files = (window.SASIN_CONFIG && window.SASIN_CONFIG.BGM_FILES) || {};
    if (files[name]) {   // 직접 만든 음악 파일이 있으면 그것을 써요
      try { curEl = new Audio(files[name]); curEl.loop = true; curEl.volume = 0.5; curEl.play().catch(function () {}); cur = name; return; } catch (e) { curEl = null; }
    }
    var T = TRACKS[name]; if (!T) return;
    cur = name; melody = buildMelody(name, T); step = 0; nextT = ctx.currentTime + 0.08;
    bgmG.gain.cancelScheduledValues(ctx.currentTime); bgmG.gain.setValueAtTime(0.0001, ctx.currentTime); bgmG.gain.exponentialRampToValueAtTime(0.42, ctx.currentTime + 1.2);
    timer = setInterval(schedule, 100); schedule();
  }
  function stopTrack(keep) {
    if (timer) { clearInterval(timer); timer = null; }
    stopEl(); cur = null; if (!keep) wantTrack = null;
  }
  function track(name) { playTrack(name); }
  function setMode(m) {
    if (m !== 'all' && m !== 'sfx' && m !== 'off') return; mode = m;
    try { localStorage.setItem(KEY, m); } catch (e) {}
    if (m === 'off') { charStopAll(); clipStop(); }
    if (m !== 'all') { if (timer || curEl) { var keep = wantTrack; stopTrack(true); wantTrack = keep; } } else if (wantTrack) { var w = wantTrack; cur = null; playTrack(w); }
    if (ctx) { try { if (m === 'off') ctx.suspend(); else ctx.resume(); } catch (e) {} }
    emit();
  }
  function cycle() { setMode(mode === 'all' ? 'sfx' : mode === 'sfx' ? 'off' : 'all'); sfx('click'); return mode; }
  function label() { return mode === 'all' ? '🔊 소리 켬' : mode === 'sfx' ? '🎵 효과음만' : '🔇 소리 끔'; }

  window.SasinAudio = {
    clipPrepare: clipPrepare, clipPlay: clipPlay, clipStop: clipStop, fireHit: fireHit, wardTick: wardTick, charStep: charStep, charLoop: charLoop, charStopAll: charStopAll, charPreview: charPreview,
    sfx: sfx, track: track, stop: function () { stopTrack(false); }, setMode: setMode, cycle: cycle, mode: function () { return mode; }, label: label,
    onChange: function (f) { listeners.push(f); }, unlock: unlock, tracks: Object.keys(TRACKS),
    _peak: function () {   // 시험용: 지금 나는 소리의 가장 큰 값(0~1)
      if (!ctx) return -1; if (!window._an) { window._an = ctx.createAnalyser(); window._an.fftSize = 2048; comp.connect(window._an); }
      var d = new Float32Array(window._an.fftSize); window._an.getFloatTimeDomainData(d); var m = 0; for (var i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); return m;
    },
    _tune: function (o) { if (o.ward != null) WARD_VOL = o.ward; if (o.wardKind) WARD_KIND = o.wardKind; if (o.cvol) Object.keys(o.cvol).forEach(function (k) { var p = k.split('.'); CVOL[p[0]][p[1]] = o.cvol[k]; }); if (o.crack != null) CRACK_VOL = o.crack; if (o.hiss != null) HISS_VOL = o.hiss; return { CVOL: CVOL, CRACK_VOL: CRACK_VOL, HISS_VOL: HISS_VOL }; },
    _fire: function (k) { if (k === 'hiss') hissOnce(); else if (k === 'crack') crackOnce(); else { var p = k.split('.'); charStep(p[0], p[1]); } },
    _centroid: function () { if (!ctx) return 0; if (!window._an3) { window._an3 = ctx.createAnalyser(); window._an3.fftSize = 2048; comp.connect(window._an3); } var d = new Float32Array(window._an3.frequencyBinCount); window._an3.getFloatFrequencyData(d); var sr = ctx.sampleRate, num = 0, den = 0; for (var i = 1; i < d.length; i++) { var p = Math.pow(10, d[i] / 10); num += p * (i * sr / window._an3.fftSize); den += p; } return den > 0 ? num / den : 0; },
    _rms: function () { if (!ctx) return 0; if (!window._an2) { window._an2 = ctx.createAnalyser(); window._an2.fftSize = 2048; comp.connect(window._an2); } var d = new Float32Array(window._an2.fftSize); window._an2.getFloatTimeDomainData(d); var s = 0; for (var i = 0; i < d.length; i++) s += d[i] * d[i]; return s / d.length; },
    _state: function () { return { ctx: !!ctx, state: ctx && ctx.state, unlocked: unlocked, cur: cur, mode: mode, ward: ward.st }; }
  };
})();

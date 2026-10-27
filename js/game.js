/* 사신 수호대 - 화면 흐름과 퀘스트 엔진 */
(function () {
  'use strict';
  var D = window.SASIN_DATA, C = window.SASIN_CORE, S = window.SasinStore, CFG = window.SASIN_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var W = 960, H = 465, K = 1, fitT = 0, GUARD_SCALE = 1.22, THIEF_SCALE = 1.12;

  /* ───────── 상태 ───────── */
  var st = null, practice = false;
  var curR = (function () { for (var i = 0; i < D.REGIONS.length; i++) if (D.REGIONS[i].ready) return i + 1; return 1; })(), view = 'vLogin';
  var selMode = 'first', selPick = null, bonusFrom = 'world', restMode = false, bonusReg = 0, newTitles = [];
  var VIEWS = ['vSplash', 'vIntro', 'vLogin', 'vSelect', 'vWorld', 'vRegion', 'vBonus', 'vCard', 'vCardEnd', 'vReview', 'vOrder', 'vPiece', 'vDef', 'vDogam', 'vRegionClear'];

  var imgCache = {};
  function loadImg(src) {
    if (!imgCache[src]) { var i = new Image(); i.src = src; imgCache[src] = i; }
    return imgCache[src];
  }
  function ready(i) { return i && i.complete && i.naturalWidth; }

  function persist() { if (!practice && st && S) S.commit(st); }
  function guardian() { return D.GUARDIANS[st.guardian]; }
  function region() { return D.REGIONS[curR - 1]; }

  /* ───────── 화면 바꾸기 ───────── */
  /* ───────── 게임 중에는 핀치 확대를 막고(조이스틱·능력 버튼을 동시에 눌러도 화면이 커지지 않게), 전체 화면을 켜요 ───────── */
  var zoomLock = false, vpMeta = null, vpOrig = '';
  function setZoomLock(on) {
    if (on === zoomLock) return;
    zoomLock = on; document.body.classList.toggle('nozoom', on);
    vpMeta = vpMeta || document.querySelector('meta[name=viewport]');
    if (vpMeta) { if (!vpOrig) vpOrig = vpMeta.getAttribute('content'); vpMeta.setAttribute('content', on ? 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' : vpOrig); }
  }
  document.addEventListener('touchmove', function (e) { if (zoomLock && (e.touches.length > 1 || (e.scale && e.scale !== 1))) e.preventDefault(); }, { passive: false });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) { document.addEventListener(n, function (e) { if (zoomLock) e.preventDefault(); }); });
  var lastTapT = 0;
  document.addEventListener('touchend', function (e) { var t = Date.now(); if (zoomLock && t - lastTapT < 320) e.preventDefault(); lastTapT = t; }, { passive: false });
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function fsOK() { var d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); }
  function goFullscreen() {
    if (fsEl() || !fsOK()) return;
    var d = document.documentElement, rq = d.requestFullscreen || d.webkitRequestFullscreen;
    try { var p = rq.call(d, { navigationUI: 'hide' }); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
  function toggleFullscreen() {
    if (fsEl()) { var ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) { try { ex.call(document); } catch (e) {} } } else goFullscreen();
  }
  /* '아닌' 같은 낱말을 굵게 + 밑줄로 강조해요 (학생이 '아닌 것 고르기'를 헷갈리지 않게) */
  function emph(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/(아닌|않은|틀린|맞지 않는|잘못된)/g, '<b class="neg">$1</b>');
  }
  var WORLD_IMG = 'img/map_world.webp';
  function rno(id) { var R0 = D.REGIONS[id - 1]; return R0 && R0.num !== undefined ? R0.num : id; }      // 화면에 보이는 지역 번호(독도는 0)
  function musicFor(v) {
    var A = window.SasinAudio; if (!A) return;
    if (v === 'vSplash' || v === 'vLogin' || v === 'vSelect') A.track('title');
    else if (v === 'vWorld' || v === 'vDogam' || v === 'vRegionClear') A.track('map');
    else if (['vBonus', 'vCard', 'vCardEnd', 'vReview', 'vOrder', 'vPiece', 'vDef'].indexOf(v) >= 0) A.track('rest');
  }
  function show(v) {
    view = v;
    setZoomLock(['vRegion', 'vCard', 'vReview', 'vOrder', 'vPiece', 'vDef'].indexOf(v) >= 0); musicFor(v); if (v !== 'vRegion' && window.SasinAudio) SasinAudio.charStopAll();
    VIEWS.forEach(function (id) { $(id).className = 'view' + (id === v ? ' on' : ''); });
    hud();
    if (v === 'vRegion') { layoutStage(); layoutSoon(); setTimeout(layoutStage, 400); }
  }
  /* ───────── 별과 칭호 보여 주기 ───────── */
  function globalTitleName() { return C.globalTitleName(D, C.totalStars(st)); }
  function regionTitleHtml(r) {
    var sum = C.regionStarSum(st, r), t = C.regionTier(D, sum), m = D.TITLES.regionMin, names = D.TITLES.region[r];
    return '★ ' + sum + ' / ' + m[m.length - 1] + ' · 칭호: <b>' + (t ? names[t - 1] : '아직 없어요') + '</b>' + (t < m.length ? ' · 다음 칭호까지 ★ ' + (m[t] - sum) : ' · 최고 칭호예요!');
  }
  function regionTitleShort(r) {
    var sum = C.regionStarSum(st, r), t = C.regionTier(D, sum);
    return '★ ' + sum + ' / ' + D.TITLES.regionMin[D.TITLES.regionMin.length - 1] + (t ? ' · ' + D.TITLES.region[r][t - 1] : '');
  }
  function withTitles(fn) {
    var b = C.titleSnap(D, st), r = fn(); C.syncTitles(D, st);
    newTitles = C.titleNews(D, b, C.titleSnap(D, st)); return r;
  }
  function titleNewsHtml() {
    if (window.SasinAudio && newTitles && newTitles.length) SasinAudio.sfx('title');
    if (!newTitles.length) return '';
    return '<div class="newtitle">🎖️ 새 칭호가 열렸어요! ' + newTitles.map(function (n) { return '<b>' + n + '</b>'; }).join(' · ') + '</div>';
  }

  /* ───────── 지역 클리어 축하 화면 ───────── */
  function laurelSvg(mirror) {
    var leaves = '', i;
    for (i = 0; i < 7; i++) {
      var y = 118 - i * 15, x = 38 + Math.sin(i * 0.5) * 6 - i * 1.2;
      leaves += '<ellipse cx="' + (x - 13) + '" cy="' + y + '" rx="13" ry="5.5" transform="rotate(-38 ' + (x - 13) + ' ' + y + ')" fill="#8FD07A" stroke="#3E7F32" stroke-width="1.6"/>';
      leaves += '<ellipse cx="' + (x + 12) + '" cy="' + (y - 7) + '" rx="12" ry="5" transform="rotate(30 ' + (x + 12) + ' ' + (y - 7) + ')" fill="#6FBF5C" stroke="#3E7F32" stroke-width="1.6"/>';
    }
    return '<svg class="laurel' + (mirror ? ' r' : '') + '" viewBox="0 0 80 140" aria-hidden="true"><path d="M40 134 C26 100 28 52 44 8" fill="none" stroke="#6B4A1B" stroke-width="3.2" stroke-linecap="round"/>' + leaves + '</svg>';
  }
  var CROWN = '<svg class="crown" viewBox="0 0 80 52" aria-hidden="true"><path d="M6 44 L10 14 L26 28 L40 6 L54 28 L70 14 L74 44 Z" fill="#F2C14E" stroke="#8A5A00" stroke-width="3" stroke-linejoin="round"/><rect x="6" y="40" width="68" height="9" rx="3" fill="#E0A93A" stroke="#8A5A00" stroke-width="3"/><circle cx="40" cy="30" r="5" fill="#E8544A" stroke="#8A5A00" stroke-width="2"/><circle cx="22" cy="38" r="3.4" fill="#4FA6E0"/><circle cx="58" cy="38" r="3.4" fill="#4FB98C"/></svg>';
  var CLOUD = '<svg viewBox="0 0 260 90" aria-hidden="true"><path d="M10 74 Q8 48 34 46 Q38 20 70 22 Q92 2 120 20 Q150 8 166 32 Q204 26 214 56 Q250 56 250 74 Z" fill="#FFE9A0"/><path d="M60 58 q10-10 20 0 q8 8 -2 14 M130 52 q12-12 24 0 q9 9 -3 16" fill="none" stroke="#C98A12" stroke-width="3" stroke-linecap="round"/></svg>';
  function openRegionClear(r, demo) {
    if (window.SasinAudio) SasinAudio.sfx('fanfare');
    var R = D.REGIONS[r - 1], g = guardian(), mins = D.TITLES.regionMin, names = D.TITLES.region[r], max = mins[mins.length - 1];
    var tier, sum, owned = {}, fresh = newTitles.slice(); newTitles = [];
    if (demo) { tier = (typeof demo === 'object' && demo.tier !== undefined) ? demo.tier : 3; sum = tier ? mins[tier - 1] : 6; R.sites.forEach(function (q) { owned[q.id] = 1; }); }
    else { sum = C.regionStarSum(st, r); tier = C.regionTier(D, sum); R.sites.forEach(function (q) { if (st.dogam[q.id]) owned[q.id] = 1; }); }
    var got = 0, cards = '';
    R.sites.forEach(function (q, i) {
      if (owned[q.id]) { got++; cards += '<div class="rcc t' + tier + '" style="animation-delay:' + (0.15 * i + 0.4) + 's"><div class="art">' + D.ILLUSTRATIONS[q.ill] + '</div><div class="nm">' + q.name + '</div></div>'; }
      else cards += '<div class="rcc lockd" style="animation-delay:' + (0.15 * i + 0.4) + 's"><div class="art">🔒</div><div class="nm">' + q.name + '</div></div>';
    });
    var ribbon = tier
      ? '<div class="ribbon">' + names[tier - 1] + (fresh.indexOf(names[tier - 1]) >= 0 ? '<span class="newb">새 칭호!</span>' : '') + '<span class="shine"></span></div>'
      : '<div class="ribbon none">별 ' + mins[0] + '개를 모으면 "' + names[0] + '" 칭호가 열려요<span class="shine"></span></div>';
    var note = tier >= mins.length ? '이 지역의 최고 칭호를 얻었어요!' : '다음 칭호 "' + names[tier] + '"까지 별 ' + (mins[tier] - sum) + '개 남았어요. 지난 레벨과 쉼터 게임을 다시 하면 별을 더 모을 수 있어요.';
    var pct = Math.min(100, Math.round(sum / max * 100)), ticks = '';
    mins.forEach(function (m) { ticks += '<b style="left:calc(' + Math.round(m / max * 100) + '% - 2px)"></b>'; });
    var nextR = R.id < D.REGIONS.length ? D.REGIONS[R.id] : null; if (nextR && nextR.free) nextR = null; var nextOk = nextR && nextR.ready && C.regionStatus(D, st, nextR.id) !== 'locked';
    var nextLabel = demo ? '다음 지역으로 ▶' : (nextOk ? rno(nextR.id) + '지역으로 ▶' : '전국 지도로');
    var confetti = '', i, cols = ['#F2B945', '#E8654A', '#5BC0BE', '#9BC53D', '#F78FB3', '#7AA2F7'];
    for (i = 0; i < 28; i++) confetti += '<span class="confetti" style="left:' + Math.round(Math.random() * 100) + '%;background:' + cols[i % cols.length] + ';animation-duration:' + (5 + Math.random() * 5).toFixed(1) + 's;animation-delay:-' + (Math.random() * 8).toFixed(1) + 's"></span>';
    var clouds = '<div class="cloud" style="left:4%;top:16%">' + CLOUD + '</div><div class="cloud" style="right:3%;top:34%;animation-delay:-9s">' + CLOUD + '</div><div class="cloud" style="left:10%;bottom:12%;animation-delay:-4s">' + CLOUD + '</div><div class="cloud" style="right:12%;bottom:6%;animation-delay:-14s">' + CLOUD + '</div>';
    var pills = '';
    if (demo) pills = '<div class="demo">미리 보기 · 별을 모은 정도에 따라 칭호와 카드 테두리가 이렇게 바뀌어요</div><div class="pills">' + [['아직 없음', 0], ['동 · 1단계', 1], ['은 · 2단계', 2], ['금 · 3단계', 3]].map(function (p) { return '<button data-t="' + p[1] + '" class="' + (p[1] === tier ? 'on' : '') + '">' + p[0] + '</button>'; }).join('') + '</div>';
    $('rcRoot').innerHTML = '<div class="rc">' + clouds + confetti + '<div class="in">' +
      '<div class="ttl-row">' + laurelSvg(false) + '<h1>' + (R.free ? R.name + ' 탐험 완료!' : rno(r) + '지역 클리어!') + '</h1>' + laurelSvg(true) + '</div>' +
      '<div class="sub">' + R.name + '의 레벨 5개를 모두 깼어요!<br>도감에 문화재 ' + got + '곳이 등록되어 있어요.</div>' +
      '<div class="hero">' + (tier >= 3 ? CROWN : '') + '<img src="' + g.face + '" alt="' + g.name + '"></div><div class="jua" style="font-size:20px;margin-top:2px">' + g.name + '</div>' +
      '<div class="ribbon-wrap">' + ribbon + '</div>' +
      '<div class="stars-line">★ 별 기록 <b>' + sum + ' / ' + max + '</b> · 전체 칭호 <b>' + globalTitleName() + '</b>' + (fresh.indexOf(globalTitleName()) >= 0 ? ' <span class="newb" style="font-size:12px">새 칭호!</span>' : '') + '</div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i>' + ticks + '</div><div class="note">' + note + '</div>' + pills +
      '<div class="cards">' + cards + '</div>' +
      '<div class="btns"><button class="btn" id="rcDogam">도감 보기</button><button class="btn" id="rcChange">신수 바꾸기</button><button class="btn ghost" id="rcLevels">레벨 고르기</button><button class="btn gold" id="rcNext">' + nextLabel + '</button></div>' +
      (!demo && !nextOk && nextR && !nextR.ready ? '<div class="note" style="margin-top:8px">다음 지역은 아직 준비 중이에요.</div>' : '') +
      '</div></div>';
    $('rcDogam').onclick = function () { openDogam(); };
    $('rcChange').onclick = function () { openSelect('change'); };
    $('rcLevels').onclick = function () { curR = r; show('vRegion'); showLevels(); };
    $('rcNext').onclick = function () { if (!demo && nextOk) enterRegion(nextR.id); else openWorld(); };
    Array.prototype.forEach.call(document.querySelectorAll('#rcRoot .pills button'), function (b) { b.onclick = function () { openRegionClear(r, { tier: +b.getAttribute('data-t') }); }; });
    show('vRegionClear'); var rootEl = $('rcRoot'); if (rootEl.parentNode) rootEl.parentNode.scrollTop = 0;
  }


  /* 시험판 전용: 모든 지역의 퀘스트(레벨)·도감·별·칭호를 전부 연 상태로 시작해요 (저장되지 않는 연습 모드에서만) */
  function unlockAllForTest() {
    D.REGIONS.forEach(function (R) {
      var reg = st.regions[String(R.id)];
      reg.q = [1, 1, 1, 1, 1];
      reg.stars = { L1: 3, L2: 3, L3: 3, L4: 3, L5: 3, card: 3, review: 3, order: 3, piece: 3, defense: 3 };
      (R.sites || []).forEach(function (s) { st.dogam[s.id] = 1; });
    });
    st.unlocked = D.REGIONS.length; C.syncTitles(D, st);
  }

  function hud() {
    var on = !!st && view !== 'vLogin' && view !== 'vSelect';
    $('hud').className = on ? 'on' : '';
    if (!on) return;
    var g = st.guardian ? guardian() : null;
    if (g) { $('hface').src = g.face; $('hname').innerHTML = g.name + ' <span class="ttl">' + globalTitleName() + '</span>'; }
    hearts();
    $('hstars').textContent = '★ ' + C.totalStars(st);
    var lbl = '';
    if (view === 'vWorld') lbl = '전국 지도';
    else if (view === 'vRegion') lbl = (rno(curR) === 0 ? '0 · ' : rno(curR) + '지역 · ') + region().name;
    else if (view === 'vBonus' || view === 'vCard' || view === 'vCardEnd') lbl = '쉼터';
    else if (view === 'vDogam') lbl = '도감';
    $('hlabel').textContent = lbl;
    $('hbWorld').style.display = view === 'vWorld' ? 'none' : '';
    $('hbHelp').style.display = view === 'vRegion' ? '' : 'none';
    $('hbRest').style.display = (view === 'vBonus' || view === 'vCard' || view === 'vCardEnd') ? 'none' : '';
    $('hbDogam').style.display = view === 'vDogam' ? 'none' : '';
    $('hbChange').style.display = view === 'vWorld' ? '' : 'none';      // 신수 바꾸기·나가기는 전국 지도에서 위쪽 단추로
    $('hbOut').style.display = view === 'vWorld' ? '' : 'none';
  }
  function hearts() {
    if (!st || !st.guardian) { $('hearts').innerHTML = ''; return; }
    var fighting = (view === 'vRegion' && B), max = fighting ? B.maxLife : C.maxLife(D, st.guardian), cur = fighting ? B.life : st.life, h = '';
    for (var i = 0; i < max; i++) {
      var on = i < cur;
      h += '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 20.5C5 15.8 2.5 12.4 2.5 8.9 2.5 6.3 4.5 4.5 6.9 4.5c1.9 0 3.5 1 5.1 3 1.6-2 3.2-3 5.1-3 2.4 0 4.4 1.8 4.4 4.4 0 3.5-2.5 6.9-9.5 11.6z" fill="' + (on ? '#E8654A' : 'none') + '" stroke="' + (on ? '#E8654A' : '#8A7566') + '" stroke-width="1.8"></path></svg>';
    }
    $('hearts').innerHTML = h;
  }
  function overlays(id) {
    ['ovLevels', 'ovQuiz', 'ovDone', 'ovClear', 'ovPause', 'ovHelp'].forEach(function (o) { $(o).className = 'ov' + (o === id ? ' on' : ''); });
    if (document.body && document.body.classList) document.body.classList.toggle('ovopen', !!id);
    if (id !== 'ovHelp') curOv = id;
  }
  var curOv = null;
  /* 도움말: 처음 레벨을 시작할 때 한 번 자동으로 보여 주고(시작하기), 이후에는 도움말 단추로 언제든 다시 볼 수 있어요(돌아가기). */
  function showHelp(opts) {
    opts = opts || {}; var back = opts.back === undefined ? curOv : opts.back;
    $('hpSub').textContent = opts.onStart ? '처음이라면 꼭 읽어 보세요! 나중에 \'도움말\' 버튼으로 다시 볼 수 있어요.' : '언제든 다시 볼 수 있어요.';
    $('hpGo').style.display = opts.onStart ? '' : 'none'; $('hpClose').textContent = opts.onStart ? '돌아가기' : '닫기';
    $('hpGo').onclick = function () { overlays(null); opts.onStart(); };
    $('hpClose').onclick = function () { overlays(back); };
    overlays('ovHelp');
  }
  var toastT = 0;
  function toast(t) { var e = $('toast'); e.className = ''; void e.offsetWidth; e.textContent = t; e.className = 'on'; toastT = 1.6; }

  /* ───────── 1. 로그인 ───────── */
  function initLogin() {
    var hasUrl = !!CFG.SAVE_URL;
    $('noUrl').style.display = hasUrl ? 'none' : 'block';
    $('btnLogin').disabled = !hasUrl;
    $('codeIn').disabled = !hasUrl;
    if (hasUrl) { S.configure({ url: CFG.SAVE_URL }); var rc = S.rememberedCode(); if (rc) $('codeIn').value = rc; }
    $('btnLogin').onclick = function () { goFullscreen(); doLogin(); };
    if ($('hbFull')) { if (!fsOK()) $('hbFull').style.display = 'none'; else $('hbFull').onclick = toggleFullscreen; }
    $('codeIn').onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };
    $('btnPractice').onclick = function () { goFullscreen(); practice = true; st = C.normalize(D, null); if (CFG.TEST_OPEN_LEVELS) { st.regions['2'].q = [1, 1, 1, 1, 0]; st.unlocked = D.REGIONS.length; } if (CFG.TEST_UNLOCK_ALL) unlockAllForTest(); afterLogin(); };
    if (S) S.on(function (ev) {
      var t = { saving: '저장 중…', saved: '저장됨', offline: '인터넷이 끊겼어요. 나중에 올려요', merged: '다른 기기의 기록과 합쳤어요' }[ev.type] || '';
      $('savestat').textContent = t;
      if (ev.type === 'merged') { st = C.normalize(D, S.getState()); hud(); }
    });
  }
  function doLogin() {
    var msg = $('loginMsg'); msg.className = 'msg'; msg.textContent = '확인하는 중…'; $('btnLogin').disabled = true;
    S.login($('codeIn').value, { remember: $('remember').checked }).then(function (r) {
      $('btnLogin').disabled = false;
      if (!r.ok) {
        msg.className = 'msg err';
        msg.textContent = r.error === 'invalid_code' ? '코드가 맞지 않아요. 다시 확인해 주세요.' :
          r.error === 'network' ? '인터넷 연결이나 저장 주소를 확인해 주세요.' : '불러오지 못했어요. 잠시 뒤에 다시 해 주세요.';
        return;
      }
      practice = false; st = C.normalize(D, r.state); msg.textContent = ''; afterLogin();
    });
  }
  function afterLogin() {
    if (!st.guardian) { openSelect('first'); } else { openWorld(); }
  }

  /* ───────── 2. 신수 고르기 ───────── */
  function openSelect(mode) {
    selMode = mode; selPick = mode === 'change' ? st.guardian : null;
    renderSelect();
    show('vSelect');
  }
  function renderSelect() {
    var h = '';
    Object.keys(D.GUARDIANS).forEach(function (id) {
      var g = D.GUARDIANS[id];
      h += '<button class="gc' + (selPick === id ? ' on' : '') + '" data-id="' + id + '" style="border-color:' + (selPick === id ? '#F2B945' : g.color) + '"><img src="' + g.card + '" alt="' + g.name + '" style="object-position:' + (g.cardPos || '50% 50%') + '"><div class="in"><div class="row" style="justify-content:space-between"><b>' + g.name + '</b><span class="chip">' + g.type + '</span></div><small>' + g.dir + '</small><small><b style="color:#F2B945">' + g.skill + '</b> - ' + g.desc + '</small><div class="row"><span class="chip">속도 ' + Math.round(g.spd * 100) + '%</span><span class="chip">생명력 ' + g.life + '</span></div></div></button>';
    });
    $('selGrid').innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll('#selGrid .gc'), function (b) {
      b.onclick = function () { selPick = b.getAttribute('data-id'); renderSelect(); };
    });
    $('selOk').disabled = !selPick;
    $('selOk').onclick = function () {
      if (!selPick) return;
      if (selMode === 'first' || !st.guardian) { st.guardian = selPick; st.life = C.maxLife(D, selPick); }
      else C.changeGuardian(D, st, selPick);
      persist(); openWorld();
    };
    $('selBack').onclick = function () { if (st.guardian) openWorld(); else { show('vLogin'); st = null; hud(); } };
  }

  /* ───────── 3. 전국 지도 ───────── */
  function openWorld() {
    $('worldImg').src = WORLD_IMG;
    var wm = $('worldMap');
    Array.prototype.slice.call(wm.querySelectorAll ? wm.querySelectorAll('.pinw,.plab,#lead') : []).forEach(function (p) { p.parentNode.removeChild(p); });
    var svg = '<svg id="lead" viewBox="0 0 500 750" preserveAspectRatio="none">';
    D.REGIONS.forEach(function (reg) { svg += '<line x1="' + reg.pin[0] + '" y1="' + (reg.pin[1] - 4) + '" x2="' + reg.lab[0] + '" y2="' + reg.lab[1] + '"></line>'; });
    svg += '</svg>';
    var holder = document.createElement('div'); holder.innerHTML = svg; if (holder.firstChild) wm.appendChild(holder.firstChild);
    var list = ''; worldFit = [];
    D.REGIONS.slice().sort(function (a, b) { return rno(a.id) - rno(b.id); }).forEach(function (reg) {      // 0번(독도)이 맨 위
      var s = C.regionStatus(D, st, reg.id);
      var w = document.createElement('div'); w.className = 'pinw'; w.style.left = (reg.pin[0] / 5) + '%'; w.style.top = (reg.pin[1] / 7.5) + '%';
      var sym = s === 'cleared' ? '✓' : s === 'locked' ? '🔒' : String(rno(reg.id));
      w.innerHTML = '<button class="pin ' + s + '" aria-label="' + rno(reg.id) + '지역 ' + reg.name + '"><span>' + sym + '</span></button>';
      w.onclick = function () { enterRegion(reg.id); };
      wm.appendChild(w);
      var lb = document.createElement('div'); lb.className = 'plab ' + s; lb.style.left = (reg.lab[0] / 5) + '%'; lb.style.top = (reg.lab[1] / 7.5) + '%';
      lb.innerHTML = '<i>' + (s === 'cleared' ? '✓' : rno(reg.id)) + '</i><span>' + reg.name + '<small>' + (s === 'soon' ? '준비 중' : s === 'locked' ? '잠겨 있어요' : s === 'cleared' ? '클리어' : C.clearedCount(st, reg.id) + ' / 5') + '</small></span>';
      lb.onclick = function () { enterRegion(reg.id); };
      wm.appendChild(lb); worldFit.push({ reg: reg, pin: w, lab: lb });
      var stText = s === 'locked' ? '잠겨 있어요' : s === 'soon' ? '준비 중이에요' : s === 'cleared' ? '클리어 ●' : C.clearedCount(st, reg.id) + ' / 5';
      list += '<button class="rg ' + s + '" data-id="' + reg.id + '"><span class="no">' + rno(reg.id) + '</span><span><div class="nm">' + reg.name + '</div><div class="muted" style="font-size:13px">' + reg.era + ' · ' + reg.place + '</div>' + (reg.ready ? '<div class="muted" style="font-size:12.5px">' + regionTitleShort(reg.id) + '</div>' : '') + '</span><span class="st">' + stText + '</span></button>';
    });
    $('regionList').innerHTML = list;
    Array.prototype.forEach.call(document.querySelectorAll('#regionList .rg'), function (b) {
      b.onclick = function () { enterRegion(+b.getAttribute('data-id')); };
    });
    var era = '';
    D.ERA_ORDER.forEach(function (id, i) {
      var reg = D.REGIONS[id - 1];
      era += (i ? '→ ' : '') + '<span class="' + (C.regionCleared(st, id) ? 'ok' : '') + '">' + reg.era.replace(' 시대', '') + '</span> ';
    });
    $('era').innerHTML = era;
    $('hbChange').onclick = function () { openSelect('change'); };
    $('hbOut').onclick = function () { if (!practice && S) { S.flush(); S.logout(); } st = null; practice = false; show('vLogin'); $('codeIn').value = ''; hud(); };
    show('vWorld'); fitWorldLabels(); requestAnimationFrame(fitWorldLabels);
  }
  /* 작은 화면에서는 지도가 줄어도 표시점·이름표 크기는 그대로라 서로 겹칠 수 있어요. 겹치면 이름표를 겹치지 않을 만큼만 위로 올리고 점선도 따라가요. */
  var worldFit = [];
  function fitWorldLabels() {
    if (view !== 'vWorld' || !worldFit.length) return;
    var wm = $('worldMap'), H = wm.clientHeight || 1, lines = wm.querySelectorAll('#lead line');
    worldFit.forEach(function (f) { f.lab.style.marginTop = '0px'; if (lines[f.reg.id - 1]) lines[f.reg.id - 1].setAttribute('y2', f.reg.lab[1]); });
    worldFit.forEach(function (f) {
      var a = f.pin.firstChild.getBoundingClientRect(), b = f.lab.getBoundingClientRect();
      var ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 0 && oy > 0) { var dy = (b.bottom - a.top) + 6; f.lab.style.marginTop = (-dy) + 'px'; if (lines[f.reg.id - 1]) lines[f.reg.id - 1].setAttribute('y2', f.reg.lab[1] - dy / (H / 750)); }
    });
  }
  window.addEventListener('resize', fitWorldLabels);

  function enterRegion(r) {
    var reg = D.REGIONS[r - 1];
    var s = C.regionStatus(D, st, r);
    if (s === 'locked') { worldToast('앞 지역의 퀘스트를 3개 이상 깨면 열려요'); return; }
    if (!reg.ready) { worldToast('이 지역은 준비 중이에요. 곧 만나요!'); return; }
    curR = r;
    show('vRegion');
    showLevels();
  }
  function worldToast(t) { var el = $('regionList'); var old = $('worldNote'); if (!old) { old = document.createElement('div'); old.id = 'worldNote'; old.className = 'msg'; el.parentNode.insertBefore(old, el); } old.textContent = t; }

  /* ───────── 4. 전투(도굴꾼 잡기) 엔진 ───────── */
  var B = null, phase = 'idle', lastQ = -1;
  var keys = {}, joy = { x: 0, y: 0 };
  var fx = [], puffs = [], floats = [], petals = [];
  var shake = 0, flash = 0, flashCol = '#fff', dirP = 1, wt = 0, moving = false, mvx = 1, mvy = 0, puffT = 0, af = 0, lastT = 0, toastT = 0, hudT = 0;
  var TWS = [], OB = null, MAPW = 960, MAPH = 465, cam = { x: 0, y: 0 };
  var grid = null, CELL = 30, CAPTURE_T = 0.2, ROAR_R = 320, WARD_T = 8, testAllSites = false;
  var P = { x: 0, y: 0, r: 18 };

  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function coastAt(y) {
    var c = OB.coast;
    for (var i = 0; i < c.length - 1; i++) { var a = c[i], b = c[i + 1]; if (y >= a[0] && y <= b[0]) return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]); }
    return c[c.length - 1][1];
  }
  function inForest(p) { var f = OB.forests; for (var i = 0; i < f.length; i++) if (dist(p, f[i]) < f[i].r) return true; return false; }
  function allRivers() { return OB.rivers ? [OB.river].concat(OB.rivers) : [OB.river]; }
  function inBridge(x, y) { var rs = allRivers(), k, i; for (k = 0; k < rs.length; k++) { var b = rs[k].bridges; for (i = 0; i < b.length; i++) if (Math.hypot(x - b[i][0], y - b[i][1]) < b[i][2]) return true; } return false; }
  function inRiver(x, y, pad) {
    var rs = allRivers(), k, i;
    for (k = 0; k < rs.length; k++) { var rv = rs[k];
      for (i = 0; i < rv.pts.length; i++) if (Math.abs(x - rv.pts[i][0]) < 80 && Math.abs(y - rv.pts[i][1]) < 80 && Math.hypot(x - rv.pts[i][0], y - rv.pts[i][1]) < rv.half[i] + pad) return !inBridge(x, y); }
    return false;
  }
  /* 바다·호수(여러 각형): 안쪽이거나 가장자리에서 pad 이내면 막힘 */
  function inPoly(x, y, p) { var c = false, i, j; for (i = 0, j = p.length - 1; i < p.length; j = i++) if (((p[i][1] > y) !== (p[j][1] > y)) && (x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0])) c = !c; return c; }
  function nearPoly(x, y, p, pad) {
    if (inPoly(x, y, p)) return true;
    for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0; if (Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)) < pad) return true; }
    return false;
  }
  function inWater(x, y, pad) { var w = OB.water; if (!w) return false; for (var i = 0; i < w.length; i++) if (nearPoly(x, y, w[i], pad)) return true; return false; }
  function blockedG(x, y, r, fly) {
    if (x < coastAt(y) + r || x > MAPW - r || y < r || y > MAPH - r) return true;
    if (inWater(x, y, r)) return true;
    if (fly) return false;
    for (var i = 0; i < OB.mountains.length; i++) { var m = OB.mountains[i]; if (Math.hypot(x - m.x, y - m.y) < m.r + r * 0.5) return true; }
    for (var ti = 0; ti < TWS.length; ti++) { if (Math.hypot(x - TWS[ti].x, y - (TWS[ti].y - 12)) < 30 + r * 0.5) return true; }
    return inRiver(x, y, r);
  }

  /* 길찾기 격자: 산과 강(다리 빼고)과 바다는 막힘, 숲은 느림 */
  function buildGrid() {
    var gw = Math.ceil(MAPW / CELL), gh = Math.ceil(MAPH / CELL), n = gw * gh, walk = new Uint8Array(n), cost = new Uint8Array(n);
    for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
      var x = i * CELL + CELL / 2, y = j * CELL + CELL / 2, ok = !blockedG(x, y, 16, false);
      walk[j * gw + i] = ok ? 1 : 0; cost[j * gw + i] = ok && inForest({ x: x, y: y }) ? 2 : 1;
    }
    return { gw: gw, gh: gh, n: n, walk: walk, cost: cost };
  }
  function cellIdx(x, y) { var i = Math.max(0, Math.min(grid.gw - 1, Math.floor(x / CELL))), j = Math.max(0, Math.min(grid.gh - 1, Math.floor(y / CELL))); return j * grid.gw + i; }
  function cellXY(idx) { return { x: (idx % grid.gw) * CELL + CELL / 2, y: Math.floor(idx / grid.gw) * CELL + CELL / 2 }; }
  function nearestWalk(idx) {
    if (grid.walk[idx]) return idx;
    var cx = idx % grid.gw, cy = Math.floor(idx / grid.gw);
    for (var r = 1; r < 8; r++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      var x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= grid.gw || y >= grid.gh) continue;
      if (grid.walk[y * grid.gw + x]) return y * grid.gw + x;
    }
    return idx;
  }
  var NB = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];
  function hpush(h, k, v) { h.k.push(k); h.v.push(v); var i = h.k.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (h.k[p] <= h.k[i]) break; var tk = h.k[p], tv = h.v[p]; h.k[p] = h.k[i]; h.v[p] = h.v[i]; h.k[i] = tk; h.v[i] = tv; i = p; } }
  function hpop(h) {
    var rk = h.k[0], rv = h.v[0], lk = h.k.pop(), lv = h.v.pop();
    if (h.k.length) { h.k[0] = lk; h.v[0] = lv; var i = 0, n = h.k.length; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < n && h.k[l] < h.k[m]) m = l; if (r < n && h.k[r] < h.k[m]) m = r; if (m === i) break; var tk = h.k[m], tv = h.v[m]; h.k[m] = h.k[i]; h.v[m] = h.v[i]; h.k[i] = tk; h.v[i] = tv; i = m; } }
    return [rk, rv];
  }
  function stepOK(c, dx, dy) {
    var cx = c % grid.gw, cy = Math.floor(c / grid.gw), nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= grid.gw || ny >= grid.gh) return -1;
    var ni = ny * grid.gw + nx; if (!grid.walk[ni]) return -1;
    if (dx && dy && (!grid.walk[cy * grid.gw + nx] || !grid.walk[ny * grid.gw + cx])) return -1;
    return ni;
  }
  function dijkstra(start, goal, prev) {
    var dist_ = new Float32Array(grid.n); for (var i = 0; i < grid.n; i++) dist_[i] = 1e9;
    var h = { k: [], v: [] }; dist_[start] = 0; hpush(h, 0, start);
    while (h.k.length) {
      var t = hpop(h), c = t[1]; if (t[0] > dist_[c]) continue; if (c === goal) break;
      for (var q = 0; q < 8; q++) { var ni = stepOK(c, NB[q][0], NB[q][1]); if (ni < 0) continue; var nd = t[0] + NB[q][2] * grid.cost[ni]; if (nd < dist_[ni]) { dist_[ni] = nd; if (prev) prev[ni] = c; hpush(h, nd, ni); } }
    }
    return dist_;
  }
  function pathTo(fx_, fy_, tx, ty) {
    var a = nearestWalk(cellIdx(fx_, fy_)), b = nearestWalk(cellIdx(tx, ty)), prev = new Int32Array(grid.n); prev.fill(-1);
    var d = dijkstra(a, b, prev); if (d[b] >= 1e9) return [];
    var path = [], c = b; while (c !== a && c >= 0) { path.push(c); c = prev[c]; } path.reverse(); return path;
  }
  /* 도망 지도: 신수에게서 멀수록 낮은 값. 막다른 길은 다시 계산해서 피한다. */
  function safetyMap() {
    var g = nearestWalk(cellIdx(P.x, P.y)), D_ = dijkstra(g, -1, null), S = new Float32Array(grid.n), h = { k: [], v: [] }, i;
    for (i = 0; i < grid.n; i++) {
      if (!grid.walk[i]) { S[i] = 1e9; continue; }
      S[i] = D_[i] >= 1e9 ? 1e6 : -1.3 * D_[i] / 10;
      if (grid.cost[i] === 2) S[i] -= 3;
    }
    B.fires.forEach(function (f) {
      var c0 = Math.max(0, Math.floor((f.x - f.r - CELL) / CELL)), c1 = Math.min(grid.gw - 1, Math.floor((f.x + f.r + CELL) / CELL)), r0 = Math.max(0, Math.floor((f.y - f.r - CELL) / CELL)), r1 = Math.min(grid.gh - 1, Math.floor((f.y + f.r + CELL) / CELL));
      for (var yy = r0; yy <= r1; yy++) for (var xx = c0; xx <= c1; xx++) if (Math.hypot(xx * CELL + CELL / 2 - f.x, yy * CELL + CELL / 2 - f.y) < f.r + CELL / 2) S[yy * grid.gw + xx] += 60;
    });
    for (i = 0; i < grid.n; i++) if (grid.walk[i]) hpush(h, S[i], i);
    while (h.k.length) {
      var t = hpop(h), c = t[1]; if (t[0] > S[c]) continue;
      for (var q = 0; q < 8; q++) { var ni = stepOK(c, NB[q][0], NB[q][1]); if (ni < 0) continue; var nd = t[0] + NB[q][2] / 10 * grid.cost[ni]; if (nd < S[ni]) { S[ni] = nd; hpush(h, nd, ni); } }
    }
    return S;
  }

  /* 판 시작 */
  function showLevels() {
    phase = 'idle'; B = null;
    var h = '', reg = st.regions[String(curR)];
    D.LEVELS.forEach(function (L) {
      var open = C.levelOpen(st, curR, L.lv), stars = C.levelStars(st, curR, L.lv), done = reg.q[L.lv - 1];
      h += '<button class="lv' + (open ? '' : ' lock') + '" data-lv="' + L.lv + '"' + (open ? '' : ' disabled') + '><div class="jua" style="font-size:24px">레벨 ' + L.lv + (done ? ' ✓' : '') + '</div><div style="font-size:14px;line-height:1.5">문화재 ' + L.sites + '곳<br>도굴꾼 ' + L.thieves + '명<br>제한 시간 ' + L.time + '초<br>던지는 것: ' + D.TOOLS[L.tool] + '</div><div class="jua" style="color:#C98A12;font-size:20px">' + (open ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '🔒 앞 레벨을 깨요') + '</div></button>';
    });
    $('lvGrid').innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll('#lvGrid .lv'), function (b) { b.onclick = function () { chooseLevel(+b.getAttribute('data-lv')); }; });
    $('lvSub').textContent = rno(curR) + '지역 ' + region().name + ' · 레벨마다 문화재가 흩어져 있어요(레벨이 높을수록 많아지고, 할 때마다 곳이 달라져요). 제한 시간 안에 도굴꾼을 피하고 쫓아내며 문화재를 모두 지켜요. 도굴꾼이 세운 감시탑은 도굴꾼을 모두 잡으면 깨어나서 화살을 쏴요.';
    var tl = $('lvTitle');
    if (!tl) { tl = document.createElement('div'); tl.id = 'lvTitle'; tl.className = 'titleline'; $('lvSub').parentNode.insertBefore(tl, $('lvSub').nextSibling); }
    tl.innerHTML = regionTitleHtml(curR);
    var cleared = C.regionCleared(st, curR), testMode = !!CFG.TEST_OPEN_LEVELS;
    if (cleared || testMode) {
      tl.innerHTML += '<div style="margin-top:6px"><button class="btn gold" id="lvClearBtn" style="font-size:15px;padding:6px 14px">' + (cleared ? '🎉 지역 클리어 화면 보기' : '🎉 지역 클리어 화면 미리 보기 (시험판)') + '</button></div>';
      $('lvClearBtn').onclick = function () { openRegionClear(curR, cleared ? false : true); };
    }
    overlays('ovLevels'); hud(); bhud();
  }

  function chooseLevel(lv) {
    goFullscreen();
    if (st && !st.help) showHelp({ back: 'ovLevels', onStart: function () { st.help = 1; persist(); startBattle(lv); } });
    else startBattle(lv);
  }
  var snd_k = -1;
  function charSound() {    // 신수 움직임에 맞춘 소리: 날개짓·발소리는 그림의 걸음(날갯짓) 박자에 맞춰 내요
    var A = window.SasinAudio; if (!A || !st || !st.guardian) return;
    var id = st.guardian, F = D.GUARDIANS[id].sprite, playing = phase === 'play';
    A.charLoop(id, playing);
    if (id === 'hm') A.wardTick(!!(B && B.ward > 0), playing);
    if (!playing) return;
    var per = (id === 'bh' || id === 'hm') ? 2 : 1, k = Math.floor(af * F.r * per);
    if (k !== snd_k) { snd_k = k; if (id === 'cr' || id === 'jj') A.charStep(id, 'flap'); else if (moving) A.charStep(id, 'step'); }
  }
  function startBattle(level) {
    snd_k = -1;
    if (window.SasinAudio) SasinAudio.track(region().track || ('battle' + curR));
    var R = region(), L = D.LEVELS[level - 1], g = guardian();
    OB = R.obstacles; MAPW = R.size[0]; MAPH = R.size[1];
    grid = buildGrid();
    var sp0 = (R.starts && R.starts[level - 1]) || R.start;
    P = { x: sp0[0], y: sp0[1], r: 20 };
    var pool = R.sites.slice();
    if (!testAllSites) pool = C.shuffle(pool).slice(0, Math.min(L.sites || pool.length, pool.length));
    var sites = pool.map(function (s) { return { id: s.id, d: s, x: s.site[0], y: s.site[1], r: 36, state: 'ok', dig: 0, diggers: 0, ward: 0 }; });
    var thieves = [], i;
    for (i = 0; i < L.thieves; i++) {
      var boss = level === 5 && i === 0;
      var img = boss ? D.THIEVES[4].img : D.THIEVES[Math.min(level, 4) - 1].img;
      thieves.push({ i: i, boss: boss, img: img, x: 0, y: 0, state: 'wait', active: false, spawnAt: i < L.pre ? 0 : 4 + 8 * (i - L.pre), site: -1, path: [], pi: 0, stunT: 0, cd: 1.5 + Math.random() * 1.5, windT: 0, aim: { x: 0, y: 0 }, capT: 0, revealT: 0, fleeT: 0, tgt: -1, fireCd: 0, kx: 0, ky: 0, kt: 0, spin: 0, tool: 'shovel', thr: 0, wob: 0, tornT: 0, tornTot: 1, burnT: 0, zzT: 0, thrT: 9, thrDir: 1 });
    }
    B = { level: level, L: L, t: 0, timeLeft: L.time, life: g.life, maxLife: g.life, inv: 0, hits: 0, looted: 0, captured: 0, sites: sites, thieves: thieves, projs: [], fires: [], trails: [], cdThrow: 0, cdSkill: 0, boost: 0, fly: 0, ward: 0, shield: g.id === 'hm' ? 1 : 0, frosts: [], thr: null, towers: (TWS = (OB.towers || []).slice(0, L.towers || 0).map(function (t, i) { return { x: t.x, y: t.y, state: 'sleep', cd: 1.2 + i * 0.8, windT: 0, aim: null, flash: 0, shake: 0 }; })), towersOn: false, towerHinted: false, sMapT: 0, S: null, protectedN: 0, quiz: null, wrongT: 0 };
    // 이미 도굴을 시작한 도굴꾼
    var start = sites.slice().sort(function () { return Math.random() - 0.5; });
    for (i = 0; i < L.pre; i++) { var th = thieves[i], s = start[i]; th.x = s.x + 24; th.y = s.y + 18; th.active = true; th.state = 'dig'; th.site = sites.indexOf(s); s.dig = 0.1; s.diggers++; }
    fx = []; puffs = []; floats = []; petals = []; dirP = 1; moving = false; keys = {}; joy = { x: 0, y: 0 }; lastQ = -1;
    fitCanvas(); snapCam(); overlays(null); phase = 'play'; hud(); bhud(); updBtns();
    $('qLabel').textContent = rno(curR) + '지역 · ' + region().name + ' · 레벨 ' + level;
    loadImg(g.sprite.src); loadImg(R.map); D.THIEVES.forEach(function (T) { loadImg(T.img); });
    toast('도굴꾼이 문화재를 노리고 있어요! 막아요!');
  }

  /* 도굴꾼 */
  function pickSite(th) {
    var best = -1, bs = 1e9;
    B.sites.forEach(function (s, i) { if (s.state !== 'ok') return; var sc = s.diggers * 600 + Math.hypot(s.x - th.x, s.y - th.y) * 0.4 + Math.random() * 250; if (sc < bs) { bs = sc; best = i; } });
    return best;
  }
  function goSite(th) {
    var k = pickSite(th);
    if (th.site >= 0 && B.sites[th.site].diggers > 0 && th.state === 'dig') B.sites[th.site].diggers--;
    th.site = k; th.path = []; th.pi = 0;
    if (k < 0) { th.state = 'flee'; th.fleeT = 0; return; }
    th.path = pathTo(th.x, th.y, B.sites[k].x, B.sites[k].y); th.pi = 0; th.state = 'arrive';
  }
  function leaveDig(th) { if (th.state === 'dig' && th.site >= 0 && B.sites[th.site].diggers > 0) B.sites[th.site].diggers--; }
  function toolFor(th) { return B.L.tool === 'mix' ? ['shovel', 'hoe', 'pickaxe'][Math.floor(Math.random() * 3)] : B.L.tool; }
  function thiefSpeed(th) { var s = 140 * B.L.mult; if (inForest(th)) s *= 0.8; return s; }
  function hidden(th) { return inForest(th) && dist(P, th) > 210 && th.revealT <= 0; }

  function moveAlong(th, dt) {
    if (th.pi >= th.path.length) return true;
    var c = cellXY(th.path[th.pi]), dx = c.x - th.x, dy = c.y - th.y, d = Math.sqrt(dx * dx + dy * dy), sp = thiefSpeed(th) * dt;
    if (d <= sp) { th.x = c.x; th.y = c.y; th.pi++; } else { th.x += dx / d * sp; th.y += dy / d * sp; }
    return false;
  }
  function fleeStep(th, dt) {
    if (!B.S) return;
    var ci = nearestWalk(cellIdx(th.x, th.y)), best = ci, bs = B.S[ci];
    if (th.tgt >= 0 && grid.walk[th.tgt]) { var tc = cellXY(th.tgt); if (Math.hypot(tc.x - th.x, tc.y - th.y) > 6) { th.x += (tc.x - th.x) / Math.hypot(tc.x - th.x, tc.y - th.y) * thiefSpeed(th) * dt; th.y += (tc.y - th.y) / Math.hypot(tc.x - th.x, tc.y - th.y) * thiefSpeed(th) * dt; return; } }
    for (var q = 0; q < 8; q++) { var ni = stepOK(ci, NB[q][0], NB[q][1]); if (ni >= 0 && B.S[ni] < bs) { bs = B.S[ni]; best = ni; } }
    th.tgt = best === ci ? -1 : best;
  }
  function stunThief(th, sec, frozen) {
    leaveDig(th); th.state = frozen ? 'frozen' : 'stun'; th.stunT = sec; th.windT = 0; th.capT = 0; th.revealT = Math.max(th.revealT, 1.5);
  }
  function catchThief(th) {
    th.state = 'caught'; th.active = false; B.captured++; SasinAudio.sfx('catch'); if (B.captured === 1 && (st.capHint || 0) < 2) { st.capHint = (st.capHint || 0) + 1; persist(); } spawnDrift(th.x, th.y - 20, st.guardian); floatTxt(th.x, th.y - 60, '잡았다!', '#2F8F83'); doShake(0.3, '#FFF3B0'); toast('도굴꾼을 잡았어요! (' + B.captured + '/' + B.thieves.length + ')');
  }
  function thiefThrow(th) {
    var L = B.L, tool = th.tool || toolFor(th), lead = B.level >= 3 ? 0.25 : 0;
    var ax = P.x + (moving ? mvx * 140 * lead : 0), ay = P.y + (moving ? mvy * 140 * lead : 0);
    var ang = Math.atan2(ay - th.y, ax - th.x), shots = th.boss ? 2 : 1;
    for (var k = 0; k < shots; k++) { var a = ang + (shots === 2 ? (k ? 0.16 : -0.16) : 0); B.projs.push({ from: 'thief', type: tool, x: th.x, y: th.y - 16, vx: Math.cos(a) * L.pspeed, vy: Math.sin(a) * L.pspeed, d: 0, range: L.range + 40, r: 13, rot: 0, boomerang: !!th.boss, owner: th, back: false, hitG: false, age: 0 }); }
    th.revealT = Math.max(th.revealT, 1.0); th.thrT = 0; th.thrDir = Math.cos(ang) >= 0 ? 1 : -1; puff(th.x, th.y + 24, th.thrDir * 30, -20, 4, 'rgba(160,125,80,', 0.5);
  }
  function updateThief(th, dt) {
    if (th.state === 'caught') return;
    var L = B.L;
    if (!th.active) {
      if (B.t >= th.spawnAt) {
        var R = region(), sp = C.pickSpawn(R.spawns, [B.sites[0].x, B.sites[0].y], [P.x, P.y], 600);
        var far = R.spawns.slice().sort(function (a, b) { return Math.hypot(b[0] - P.x, b[1] - P.y) - Math.hypot(a[0] - P.x, a[1] - P.y); });
        sp = far[Math.floor(Math.random() * Math.min(3, far.length))] || sp;
        th.x = sp[0]; th.y = sp[1]; th.active = true; goSite(th);
      }
      return;
    }
    th.cd = Math.max(0, th.cd - dt); th.revealT -= dt; th.fireCd = Math.max(0, th.fireCd - dt); th.spin *= Math.max(0, 1 - dt * 5); if (th.tornT > 0) th.tornT -= dt; if (th.burnT > 0) th.burnT -= dt; if (th.zzT > 0) th.zzT -= dt; if (th.thrT < 0.5) th.thrT += dt;
    if (th.kt > 0) { var nx = th.x + th.kx * dt, ny = th.y + th.ky * dt; if (grid.walk[cellIdx(nx, ny)]) { th.x = nx; th.y = ny; } th.kt -= dt; }
    var d = dist(P, th);
    for (var fi = 0; fi < B.fires.length; fi++) {
      var f = B.fires[fi];
      if (th.fireCd <= 0 && Math.hypot(th.x - f.x, th.y - f.y) < f.r + 8) {
        if (th.state === 'stun' || th.state === 'frozen') th.stunT = Math.max(th.stunT, f.burn); else stunThief(th, f.burn, false);
        th.fireCd = 0.8; th.burnT = 0.8; floatTxt(th.x, th.y - 55, '앗 뜨거!', '#E8654A'); SasinAudio.fireHit(); burst(th.x, th.y, '#FF8A2A', false); break;
      }
    }
    if (th.state === 'stun' || th.state === 'frozen') {
      th.stunT -= dt;
      if (d < 46) { th.capT += dt; if (th.capT >= CAPTURE_T) { catchThief(th); return; } } else th.capT = Math.max(0, th.capT - dt * 2);
      if (th.stunT <= 0) { th.state = 'flee'; th.fleeT = 0; th.capT = 0; }
      return;
    }
    if (th.state === 'wind') {
      th.windT -= dt; if (th.windT <= 0) { thiefThrow(th); th.state = 'flee'; th.cd = L.cd; th.fleeT = Math.max(th.fleeT, 0.01); }
      return;
    }
    if (th.state === 'arrive') {
      if (d < L.alert) { th.state = 'flee'; th.fleeT = 0; th.tgt = -1; return; }
      if (B.sites[th.site] && B.sites[th.site].state !== 'ok') { goSite(th); return; }
      if (moveAlong(th, dt)) { th.state = 'dig'; B.sites[th.site].diggers++; }
      return;
    }
    if (th.state === 'dig') {
      var s = B.sites[th.site];
      if (!s || s.state !== 'ok') { th.state = 'arrive'; goSite(th); return; }
      if (d < L.alert) { leaveDig(th); th.state = 'flee'; th.fleeT = 0; th.tgt = -1; floatTxt(th.x, th.y - 55, '들켰다!', '#E8654A'); return; }
      return;
    }
    if (th.state === 'flee') {
      th.fleeT += dt;
      if (th.cd <= 0 && d < L.range) { th.state = 'wind'; th.windT = L.tele; th.aim = { x: P.x, y: P.y }; th.tool = toolFor(th); return; }
      fleeStep(th, dt);
      if (th.fleeT > 3 && d > 480) { th.tgt = -1; goSite(th); }
    }
  }
  function updateSites(dt) {
    B.sites.forEach(function (s, i) {
      if (s.ward > 0) s.ward = Math.max(0, s.ward - dt);
      if (s.state !== 'ok') { s.ward = 0; return; }
      var rate = s.diggers / B.L.dig * (s.ward > 0 ? 0.2 : 1);
      if (s.diggers > 0) {
        s.dig += rate * dt;
        if (Math.random() < dt * 6) puff(s.x + (Math.random() - 0.5) * 30, s.y + 10, (Math.random() - 0.5) * 70, -70 - Math.random() * 60, 3 + Math.random() * 3, 'rgba(122,90,58,', 0.7);
        if (s.dig >= 1) {
          s.state = 'looted'; s.dig = 1; B.looted++; SasinAudio.sfx('loot'); doShake(0.5, '#E8654A'); burst(s.x, s.y, '#E8433B', true); toast(s.d.name + '이(가) 도굴됐어요! (' + B.looted + '/2)');
          B.thieves.forEach(function (th) { if (th.active && th.site === i && (th.state === 'dig' || th.state === 'arrive')) { th.state = 'arrive'; goSite(th); } });
          s.diggers = 0;
        }
      } else s.dig = Math.max(0, s.dig - dt * 0.01);
    });
    if (phase === 'play') checkWin();
  }

  /* 신수 던지기와 능력 */
  function nearestVisibleThief(maxD) {
    var best = null, bd = maxD;
    B.thieves.forEach(function (th) { if (!th.active || th.state === 'caught' || hidden(th)) return; var d = dist(P, th); if (d < bd) { bd = d; best = th; } });
    return best;
  }
  var THROW_RELEASE = 0, THROW_TOTAL = 0.34;
  /* 던지기 버튼을 누르는 순간 무기가 바로 나가고, 몸은 짧게 젖혔다가 앞으로 뻗었다 돌아와요(0.34초). 던지는 동안에도 움직일 수 있어요. */
  function throwWeapon() {
    if (phase !== 'play' || B.cdThrow > 0 || B.thr) return;
    var Wp = D.WEAPONS[st.guardian], tgt = nearestVisibleThief(Wp.range * 1.5), ang = tgt ? Math.atan2(tgt.y - P.y, tgt.x - P.x) : (dirP > 0 ? 0 : Math.PI);
    B.cdThrow = Wp.cd; dirP = Math.cos(ang) >= 0 ? 1 : -1; B.thr = { t: 0, ang: ang, fired: false, type: Wp.type };
    releaseThrow();   // 누르는 순간 바로 나가요
  }
  function releaseThrow() {
    var Wp = D.WEAPONS[st.guardian], tgt = nearestVisibleThief(Wp.range * 1.5), ang = tgt ? Math.atan2(tgt.y - P.y, tgt.x - P.x) : B.thr.ang;
    B.thr.ang = ang; B.thr.fired = true; dirP = Math.cos(ang) >= 0 ? 1 : -1; SasinAudio.sfx('throw_' + st.guardian);
    B.projs.push({ from: 'guardian', type: Wp.type, x: P.x, y: P.y - 10, vx: Math.cos(ang) * Wp.speed, vy: Math.sin(ang) * Wp.speed, d: 0, range: Wp.range, r: Wp.hitR || 14, rot: 0, back: false, hit: {}, age: 0, ox: P.x, oy: P.y - 10, ang: ang });
    floatTxt(P.x, P.y - 66, '휙!', '#3B2A20');
  }
  function updateThrow(dt) {
    if (!B.thr) return;
    B.thr.t += dt;
    if (!B.thr.fired && B.thr.t >= THROW_RELEASE) releaseThrow();
    if (B.thr.t >= THROW_TOTAL) B.thr = null;
  }
  /* 던지는 몸짓: 뒤로 젖힘 -> 앞으로 뻗음 -> 돌아옴 (회전, 앞으로 밀림, 찌그러짐) */
  function poseAt(t, s) {   // 던지는 몸짓: t초가 지난 모습. s=+1 오른쪽, -1 왼쪽을 향해 던져요
    var lean, k;
    if (t < 0.04) { k = t / 0.04; lean = -0.1 * k; }
    else if (t < 0.15) { k = (t - 0.04) / 0.11; lean = -0.1 + 0.32 * (1 - Math.pow(1 - k, 2)); }
    else { k = Math.min(1, (t - 0.15) / (THROW_TOTAL - 0.15)); lean = 0.22 * (1 - k); }
    var fwd = lean > 0 ? lean / 0.22 : 0, back = lean < 0 ? -lean / 0.1 : 0;
    return { rot: lean * s, shift: s * (fwd * 7 - back * 2), sx: 1 - 0.05 * fwd + 0.03 * back, sy: 1 + 0.07 * fwd - 0.04 * back };
  }
  function throwPose() {
    if (!B.thr) return { rot: 0, shift: 0, sx: 1, sy: 1 };
    return poseAt(B.thr.t, Math.cos(B.thr.ang) >= 0 ? 1 : -1);
  }
  /* 무기마다 손끝에 나오는 효과 */
  function drawThrowFx(tm) {
    var T = B.thr; if (!T) return; var a = T.ang, c = Math.cos(a), sn = Math.sin(a), hx = P.x + c * 34, hy = P.y - 16 + sn * 16, t = T.t, wnd = 1, after = Math.min(1, t / THROW_TOTAL), i;
    ctx.save(); ctx.lineCap = 'round';
    if (T.type === 'pearl') {
      var r_ = t < THROW_RELEASE ? 4 + 12 * wnd : 16 * (1 - after);
      if (r_ > 0.5) { var pg = ctx.createRadialGradient(hx, hy, 1, hx, hy, r_ * 1.9); pg.addColorStop(0, 'rgba(255,255,255,.95)'); pg.addColorStop(0.4, 'rgba(120,200,255,.8)'); pg.addColorStop(1, 'rgba(58,143,199,0)'); ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(hx, hy, r_ * 1.9, 0, 6.283); ctx.fill(); }
      for (i = 0; i < 6; i++) { var sa = i * 1.047 + tm / 140, sr = 10 + 16 * (t < THROW_RELEASE ? 1 - wnd : after); ctx.fillStyle = 'rgba(210,240,255,' + (0.9 - after * 0.8).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(hx + Math.cos(sa) * sr, hy + Math.sin(sa) * sr, 2.4, 0, 6.283); ctx.fill(); }
    } else if (T.type === 'axe') {
      if (t >= THROW_RELEASE) {
        var al = 1 - after, R = 54;
        ctx.strokeStyle = 'rgba(235,242,250,' + (0.9 * al).toFixed(2) + ')'; ctx.lineWidth = 8 * al + 2; ctx.beginPath(); ctx.arc(P.x, P.y - 8, R, a - 1.0, a + 1.0); ctx.stroke();
        ctx.strokeStyle = 'rgba(159,176,201,' + (0.7 * al).toFixed(2) + ')'; ctx.lineWidth = 4 * al + 1; ctx.beginPath(); ctx.arc(P.x, P.y - 8, R - 9, a - 0.8, a + 0.8); ctx.stroke();
        for (i = -1; i <= 1; i++) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * al).toFixed(2) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P.x + c * 60 - sn * i * 12, P.y - 8 + sn * 60 + c * i * 12); ctx.lineTo(P.x + c * (82 + after * 20) - sn * i * 12, P.y - 8 + sn * (82 + after * 20) + c * i * 12); ctx.stroke(); }
      }
    } else if (T.type === 'fire') {
      var fl = t < THROW_RELEASE ? wnd : 1 - after * 0.7;
      for (i = 0; i < 6; i++) { var fa = a + (i - 2.5) * 0.28, len = (12 + Math.abs(Math.sin(tm / 70 + i)) * 12 + after * 18) * fl, fx0 = hx + Math.cos(fa) * 4, fy0 = hy + Math.sin(fa) * 4; ctx.fillStyle = i % 2 ? 'rgba(255,170,50,.9)' : 'rgba(255,90,30,.9)'; ctx.beginPath(); ctx.moveTo(fx0 - Math.sin(fa) * 5, fy0 + Math.cos(fa) * 5); ctx.quadraticCurveTo(fx0 + Math.cos(fa) * len * 0.5, fy0 + Math.sin(fa) * len * 0.5, fx0 + Math.cos(fa) * len, fy0 + Math.sin(fa) * len); ctx.quadraticCurveTo(fx0 + Math.cos(fa) * len * 0.5, fy0 + Math.sin(fa) * len * 0.5, fx0 + Math.sin(fa) * 5, fy0 - Math.cos(fa) * 5); ctx.fill(); }
      var fg = ctx.createRadialGradient(hx, hy, 1, hx, hy, 22 * fl); fg.addColorStop(0, 'rgba(255,240,170,.8)'); fg.addColorStop(1, 'rgba(255,100,30,0)'); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(hx, hy, 22 * fl, 0, 6.283); ctx.fill();
    } else {
      var gr = 10 + 38 * Math.min(1, t / 0.2), ga = Math.max(0, 1 - t / THROW_TOTAL);
      ctx.strokeStyle = 'rgba(190,235,255,' + (0.85 * ga).toFixed(2) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(P.x, P.y + 26, gr, gr * 0.36, 0, 0, 6.283); ctx.stroke();
      for (i = 0; i < 5; i++) { var sa2 = a + (i - 2) * 0.34, sl = (10 + i % 2 * 6) * Math.min(1, t / 0.14) * (t < 0.26 ? 1 : (THROW_TOTAL - t) / 0.08), bx = P.x + Math.cos(sa2) * (26 + i * 3), by = P.y + 26 + Math.sin(sa2) * 9; if (sl > 1) { ctx.fillStyle = 'rgba(214,242,255,.95)'; ctx.strokeStyle = '#5BA8CF'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(bx - 3.5, by); ctx.lineTo(bx, by - sl); ctx.lineTo(bx + 3.5, by); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
    }
    ctx.restore();
  }
  function skill() {
    if (phase !== 'play' || B.cdSkill > 0) return;
    var g = guardian(), id = g.id; SasinAudio.sfx('skill_' + id);
    if (id === 'cr') { B.boost = 3; floatTxt(P.x, P.y - 70, '질주!', '#3A8FC7'); burst(P.x, P.y, '#3A8FC7', true); }
    else if (id === 'bh') {
      burst(P.x, P.y, '#9FB0C9', true); burst(P.x, P.y, '#F2B945', true); floatTxt(P.x, P.y - 70, '크아앙!', '#E8654A'); doShake(0.5, '#fff'); B.roar = { t: 0, r: ROAR_R };
      B.thieves.forEach(function (th) {
        if (!th.active || th.state === 'caught') return; var d = dist(P, th); if (d >= ROAR_R) return;
        var pd = Math.max(0, d - 55), ex = (P.x - th.x) / (d || 1), ey = (P.y - th.y) / (d || 1);
        stunThief(th, 2.0, false); th.kx = ex * pd / 0.35; th.ky = ey * pd / 0.35; th.kt = 0.35; floatTxt(th.x, th.y - 55, '으악!', '#3B2A20'); burst(th.x, th.y, '#9FB0C9', false);
      });
    }
    else if (id === 'jj') { B.fly = 2.5; floatTxt(P.x, P.y - 70, '날기!', '#E8654A'); burst(P.x, P.y, '#E8654A', true); }
    else if (id === 'hm') { B.ward = WARD_T; floatTxt(P.x, P.y - 70, '결계!', '#1E8A86'); burst(P.x, P.y, '#2FA7A0', true); B.sites.forEach(function (s) { if (s.state === 'ok') { s.ward = WARD_T; burst(s.x + 30, s.y, '#2FA7A0', true); } });
      var fz = D.WEAPONS.hm.freeze;   // 결계 기둥이 선 곳에서 도굴하던 도굴꾼은 얼음에 얼 때와 같은 시간 동안 기절해요
      B.thieves.forEach(function (th) {
        if (th.active && th.state === 'dig' && B.sites[th.site] && B.sites[th.site].state === 'ok') { stunThief(th, fz, false); th.zzT = fz; floatTxt(th.x, th.y - 55, '기절!', '#1E8A86'); burst(th.x, th.y, '#2FA7A0', false); }
      });
    }
    B.cdSkill = g.cd; doShake(0.12, '#fff');
  }
  function spawnFire(x, y) {
    var Wp = D.WEAPONS.jj; B.fires.push({ x: x, y: y, t: Wp.fire, max: Wp.fire, r: Wp.radius, burn: Wp.burn });
    burst(x, y, '#FF8A2A', true); doShake(0.25, '#FFB070'); floatTxt(x, y - 50, '화르륵!', '#E8654A');
  }
  /* 현무: 맞은 곳(또는 날아간 끝)에 타격 범위만큼 흰 서리 원이 퍼졌다가 녹듯이 사라져요 */
  function spawnFrost(x, y, R) { B.frosts.push({ x: x, y: y, t: 0, R: R, seed: Math.random() * 6.283 }); }
  function pushTrail(pr, hit) { B.trails.push({ ox: pr.ox, oy: pr.oy, ang: pr.ang, len: pr.d, t: 0, hit: !!hit }); }
  var DRIFT_KIND = { cr: 'petal', bh: 'leaf', jj: 'ember', hm: 'snow' };
  function spawnDrift(x, y, gid) {
    var kind = DRIFT_KIND[gid] || 'petal', pal = { petal: ['#FFC9D6', '#FFE3EA', '#FFF5F8', '#F7A8C0'], leaf: ['#BFE3C0', '#9ED2A8', '#DDEFE0', '#C6D6CC'], ember: ['#FF8A3A', '#FFB347', '#FF6A2A', '#FFD27A'], snow: ['#FFFFFF', '#E6F6FF', '#CBEBFA', '#F2FBFF'] }[kind];
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * 6.283, sp = 14 + Math.random() * 40;
      petals.push({ kind: kind, x: x + (Math.random() - 0.5) * 26, y: y + (Math.random() - 0.5) * 18, vx: Math.cos(a) * sp, vy: -34 - Math.random() * 30, rot: Math.random() * 6.283, vr: (Math.random() - 0.5) * 2.2, t: 0, life: 2.6 + Math.random() * 1.2, sz: (kind === 'leaf' ? 5 : 3.5) + Math.random() * 3, col: pal[Math.floor(Math.random() * pal.length)], ph: Math.random() * 6.283 });
    }
  }
  function hitThief(th, pr) {
    var Wp = D.WEAPONS[st.guardian]; SasinAudio.sfx('hit'); SasinAudio.sfx('hit_' + Wp.type);
    if (B.captured === 0 && (st.capHint || 0) < 2 && !B.capHinted) { B.capHinted = true; toast('멈춘 도굴꾼 곁에 가까이 붙어서 0.2초만 있으면 잡아요!'); toastT = 3.2; }
    if (Wp.type === 'axe') {
      if (!pr.back) {
        stunThief(th, Wp.stun, false);
        var dx = th.x - P.x, dy = th.y - P.y, l = Math.hypot(dx, dy) || 1; th.kx = dx / l * Wp.knock / 0.3; th.ky = dy / l * Wp.knock / 0.3; th.kt = 0.3; th.spin = 12; floatTxt(th.x, th.y - 55, '으악!', '#3B2A20');
      } else {
        var rem = (th.state === 'stun' || th.state === 'frozen') ? th.stunT : 0, ex = P.x - th.x, ey = P.y - th.y, el = Math.hypot(ex, ey) || 1, pd = Math.min(Wp.pull, Math.max(0, el - 40));
        stunThief(th, Math.max(Wp.backStun, rem), false); th.kx = ex / el * pd / 0.3; th.ky = ey / el * pd / 0.3; th.kt = 0.3; floatTxt(th.x, th.y - 55, '어어어~', '#9FB0C9');
      }
      burst(th.x, th.y, '#C9D2DC', false); doShake(0.2, '#fff'); return;
    }
    if (Wp.type === 'ice') { stunThief(th, Wp.freeze, true); floatTxt(th.x, th.y - 55, '꽁꽁!', '#3A8FC7'); }
    else {
      stunThief(th, Wp.stun, false);
      if (Wp.type === 'axe') { var dx = th.x - P.x, dy = th.y - P.y, l = Math.hypot(dx, dy) || 1; th.kx = dx / l * Wp.knock / 0.3; th.ky = dy / l * Wp.knock / 0.3; th.kt = 0.3; th.spin = 12; floatTxt(th.x, th.y - 55, '으악!', '#3B2A20'); }
      else if (Wp.type === 'pearl') { var ex = P.x - th.x, ey = P.y - th.y, el = Math.hypot(ex, ey) || 1; th.kx = ex / el * Wp.pull / 0.3; th.ky = ey / el * Wp.pull / 0.3; th.kt = 0.3; th.tornT = th.tornTot = Wp.stun; floatTxt(th.x, th.y - 55, '어질어질~', '#3A8FC7'); burst(th.x, th.y, '#BFE3F0', true); }
      else if (Wp.type === 'fire') { floatTxt(th.x, th.y - 55, '앗 뜨거!', '#E8654A'); SasinAudio.fireHit(); }
    }
    burst(th.x, th.y, Wp.type === 'ice' ? '#9FD8F0' : (Wp.type === 'fire' ? '#FF8A2A' : '#F2B945'), false); doShake(0.2, '#fff');
  }
  function hitGuardian(pr) {
    if (B.inv > 0) return; SasinAudio.sfx('hurt');
    if (B.shield > 0) { B.shield = 0; B.inv = 1.0; floatTxt(P.x, P.y - 70, '방패!', '#1E8A86'); burst(P.x, P.y, '#2FA7A0', false); return; }
    B.life--; B.hits++; B.inv = 1.5; floatTxt(P.x, P.y - 70, '아야! -1', '#E8433B'); burst(P.x, P.y, '#E8433B', false); doShake(0.45, '#E8654A'); hud();
    if (B.life <= 0) endBattle(false, 'life');
  }
  /* 감시탑: 도굴꾼이 세운 방어 도구예요. 도굴꾼을 모두 잡으면 깨어나서, 사정거리 안의 신수에게 화살을 쏴요. */
  var testNoTowers = false;
  function activateTowers() {
    B.towersOn = true; SasinAudio.sfx('tower');
    B.towers.forEach(function (t) { t.state = 'idle'; t.cd = 1.0 + Math.random() * 1.2; burst(t.x, t.y - 90, '#E8433B', true); });
    toast('도굴꾼을 모두 잡았어요! 그런데 감시탑이 깨어났어요. 화살을 조심해요!'); toastT = 3.2; doShake(0.35, '#E8433B');
  }
  function updateTowers(dt) {
    if (!B.towers.length || testNoTowers) return;
    if (!B.towerHinted && B.t > 2.4 && !B.towersOn) { B.towerHinted = true; toast('저 멀리 도굴꾼의 감시탑이 보여요. 도굴꾼을 모두 잡으면 깨어나요!'); toastT = 3; }
    if (!B.towersOn) { if (B.thieves.length && B.thieves.every(function (th) { return th.state === 'caught'; })) activateTowers(); return; }
    var T = D.TOWER, L = B.L;
    B.towers.forEach(function (t) {
      if (t.flash > 0) t.flash -= dt; if (t.shake > 0) t.shake -= dt;
      if (t.state === 'idle') { t.cd -= dt; if (t.cd <= 0 && Math.hypot(P.x - t.x, P.y - t.y) < T.range) { t.state = 'wind'; t.windT = T.tele; t.aim = { x: P.x, y: P.y - 8 }; } }
      else if (t.state === 'wind') {
        t.windT -= dt;
        if (t.windT <= 0) {
          var sx = t.x, sy = t.y - 156, dx = t.aim.x - sx, dy = t.aim.y - sy, dl = Math.hypot(dx, dy) || 1, sp = L.pspeed * T.speedMul;
          SasinAudio.sfx('arrow'); B.projs.push({ from: 'thief', type: 'arrow', x: sx, y: sy, vx: dx / dl * sp, vy: dy / dl * sp, d: 0, range: dl + 160, r: 10, rot: Math.atan2(dy, dx), tower: true });
          t.state = 'idle'; t.cd = T.cd; t.flash = 0.25; t.shake = 0.4;
        }
      }
    });
  }
  function updateProjs(dt) {
    var Wb = D.WEAPONS[st.guardian];
    B.projs.forEach(function (pr) {
      if (pr.from === 'thief' && pr.boomerang) {   // 두목의 도구는 사정거리 끝에서 돌아와요(끌어당기는 효과는 없어요)
        pr.rot += dt * 14;
        if (!pr.back) { pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.d += Math.hypot(pr.vx, pr.vy) * dt; if (pr.d >= pr.range) { pr.back = true; pr.hitG = false; pr.age = 0; } }
        else {
          var ow = pr.owner, bx = ow.x - pr.x, by = (ow.y - 16) - pr.y, bl = Math.hypot(bx, by), bsp = B.L.pspeed * 1.1;
          if (bl < 26 || ow.state === 'caught' || !ow.active || pr.age > 3) { pr.dead = true; return; }
          pr.x += bx / bl * bsp * dt; pr.y += by / bl * bsp * dt; pr.age += dt;
        }
        if (!pr.hitG && Math.hypot(pr.x - P.x, pr.y - P.y) < pr.r + P.r - 4) { pr.hitG = true; hitGuardian(pr); }
        return;
      }
      if (pr.type === 'axe' && pr.from === 'guardian') {
        pr.rot += dt * 14;
        if (!pr.back) { pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.d += Math.hypot(pr.vx, pr.vy) * dt; if (pr.d >= pr.range) { pr.back = true; pr.hit = {}; pr.age = 0; SasinAudio.sfx('axe_back'); } }
        else {
          var bx = P.x - pr.x, by = (P.y - 10) - pr.y, bl = Math.hypot(bx, by);
          if (bl < 24) { pr.dead = true; SasinAudio.sfx('axe_catch'); return; }
          pr.x += bx / bl * Wb.back * dt; pr.y += by / bl * Wb.back * dt; pr.age += dt; if (pr.age > 3) { pr.dead = true; return; }
        }
        B.thieves.forEach(function (th) { if (th.active && th.state !== 'caught' && !pr.hit[th.i] && Math.hypot(pr.x - th.x, pr.y - (th.y - 14)) < pr.r + 21) { pr.hit[th.i] = true; hitThief(th, pr); } });
        return;
      }
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.d += Math.hypot(pr.vx, pr.vy) * dt; if (pr.type !== 'arrow') pr.rot += dt * 14;
      if (pr.d >= pr.range) { pr.dead = true; if (pr.from === 'guardian') { if (pr.type === 'fire') spawnFire(pr.x, pr.y + 12); else if (pr.type === 'ice') { pushTrail(pr, false); spawnFrost(pr.x, pr.y + 12, pr.r + 19); } } return; }
      if (pr.from === 'thief') { if (Math.hypot(pr.x - P.x, pr.y - P.y) < pr.r + P.r - 4) { pr.dead = true; hitGuardian(pr); } }
      else B.thieves.forEach(function (th) { if (!pr.dead && th.active && th.state !== 'caught' && Math.hypot(pr.x - th.x, pr.y - (th.y - 14)) < pr.r + 19) { pr.dead = true; hitThief(th, pr); if (pr.type === 'fire') spawnFire(pr.x, pr.y + 12); else if (pr.type === 'ice') { pushTrail(pr, true); spawnFrost(th.x, th.y + 10, pr.r + 19); } } });
    });
    B.projs = B.projs.filter(function (p) { return !p.dead; });
    B.fires.forEach(function (f) { f.t -= dt; }); B.fires = B.fires.filter(function (f) { return f.t > 0; });
    B.frosts.forEach(function (f) { f.t += dt; }); B.frosts = B.frosts.filter(function (f) { return f.t < 1.05; });
    B.trails.forEach(function (tr) { tr.t += dt; }); B.trails = B.trails.filter(function (tr) { return tr.t < 1.0; });
  }

  /* 퀴즈 */
  function openQuiz(si) {
    var s = B.sites[si]; phase = 'quiz'; SasinAudio.sfx('quiz'); B.quiz = { si: si, qi: C.pickQuestion(st, s.d, B.level, null, lastQ) };
    var q = s.d.qs[B.quiz.qi]; lastQ = B.quiz.qi;
    $('qSite').textContent = s.d.name; $('qClue').textContent = s.d.clue; $('qText').innerHTML = emph(q.q); $('qMsg').textContent = '';
    var order = C.shuffle([0, 1, 2]), h = '';
    order.forEach(function (oi, k) { h += '<button class="opt" data-o="' + oi + '"><i>' + 'ABC'.charAt(k) + '</i>' + q.opts[oi] + '</button>'; });
    $('qOpts').innerHTML = h; $('qHint').textContent = q.hint; $('qHint').style.display = 'none';
    Array.prototype.forEach.call(document.querySelectorAll('#qOpts .opt'), function (b) { b.onclick = function () { answer(b); }; });
    overlays('ovQuiz');
  }
  function answer(b) {
    var s = B.sites[B.quiz.si], q = s.d.qs[B.quiz.qi], oi = +b.getAttribute('data-o'), ok = oi === q.ans;
    C.recordAnswer(st, s.d.id, B.quiz.qi, ok, s.d.qs.length);
    if (!practice && S) S.logAnswer(s.d.id + 'q' + (B.quiz.qi + 1), ok, curR);
    if (!ok) { SasinAudio.sfx('wrong'); b.className = 'opt bad'; B.timeLeft = Math.max(1, B.timeLeft - 5); $('qHint').style.display = 'block'; $('qMsg').textContent = '아쉬워요. 시간이 5초 줄었어요. 힌트를 읽고 다시 골라요.'; return; }
    var first = !st.dogam[s.d.id]; s.state = 'protected'; B.protectedN++; st.dogam[s.d.id] = 1; persist();
    B.thieves.forEach(function (th) { if (th.active && th.site === B.quiz.si && (th.state === 'dig' || th.state === 'arrive')) { if (th.state === 'dig') s.diggers = Math.max(0, s.diggers - 1); th.state = 'arrive'; goSite(th); } });
    s.diggers = 0; s.dig = 0; s.ward = 0;
    $('dName').textContent = s.d.name; $('dReg').textContent = '지킨 문화재 ' + B.protectedN + ' / ' + B.sites.length + ' · 도감 ' + Object.keys(st.dogam).length + '장';
    $('dArt').style.display = first ? 'block' : 'none'; $('dArt').innerHTML = first ? D.ILLUSTRATIONS[s.d.ill] : '';
    $('dExp').textContent = first ? s.d.exp : q.fb + ' ' + s.d.short + '이에요.';
    $('dScore').textContent = first ? '도감에 새로 등록됐어요!' : ''; $('dScoreD').textContent = '';
    $('dNext').textContent = '계속하기'; $('dNext').onclick = function () { overlays(null); phase = 'play'; B.quiz = null; checkWin(); };
    burst(s.x, s.y, '#2FA7A0', true); phase = 'done'; overlays('ovDone'); SasinAudio.sfx('right'); setTimeout(function () { SasinAudio.sfx('protect'); }, 380);
  }
  function checkWin() {
    var open = B.sites.filter(function (s) { return s.state === 'ok'; }).length;
    if (open === 0 && B.looted < 2) endBattle(true, 'all');
    else if (B.looted >= 2) endBattle(false, 'looted');
  }
  function endSounds(win, stars) {
    var A = window.SasinAudio; if (!A) return;
    A.sfx(win ? 'win' : 'lose');
    if (win) for (var i = 0; i < stars; i++) (function (k) { setTimeout(function () { A.sfx('star', k); }, 900 + k * 260); })(i);
    setTimeout(function () { A.track('map'); }, 1800);
  }
  function endBattle(win, why) {
    if (phase === 'end') return;
    phase = 'end'; var L = B.L, stars = 0, extra = '', regionDone = false; newTitles = [];
    if (win) {
      var allCaught = B.captured === B.thieves.length;
      stars = 1 + (B.looted === 0 ? 1 : 0) + ((allCaught || B.timeLeft >= L.time * 0.3) ? 1 : 0);
      var wasCleared = C.regionCleared(st, curR); var res = withTitles(function () { return C.applyLevelClear(D, st, curR, B.level, stars); }); regionDone = !wasCleared && C.regionCleared(st, curR); persist();
      if (res.opened) extra = ' ' + rno(res.opened) + '지역이 열렸어요!' + (D.REGIONS[res.opened - 1].ready ? '' : ' (아직 준비 중이에요)');
      if (res.firstTime && B.level < 5) extra += ' 레벨 ' + (B.level + 1) + '도 열렸어요!';
    }
    endSounds(win, stars);
    $('cTitle').textContent = win ? '레벨 ' + B.level + ' 클리어!' : '아쉬워요, 실패했어요';
    var why2 = { time: '시간이 다 됐어요.', looted: '문화재 2곳이 도굴됐어요.', life: '생명력이 없어졌어요.', all: '' }[why] || '';
    $('cText').innerHTML = (win ? '문화재를 모두 지켰어요!' + extra : why2 + ' 다시 도전해요!') + '<br><span style="font-size:16px">지킨 문화재 ' + B.protectedN + '/' + B.sites.length + ' · 잡은 도굴꾼 ' + B.captured + '/' + B.thieves.length + ' · 맞은 횟수 ' + B.hits + ' · 남은 시간 ' + Math.ceil(B.timeLeft) + '초</span>' + (win ? '<br><span class="jua" style="font-size:34px;color:#C98A12">' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + '</span><br><span style="font-size:13px;color:#6B5644">★1 클리어 · ★2 도굴당한 문화재 없음 · ★3 도굴꾼을 모두 잡거나 시간이 30% 이상 남음</span>' : '');
    $('cText').innerHTML += titleNewsHtml();
    var lv = B.level; $('cBtn').onclick = function () { openWorld(); }; $('cAgain').onclick = function () { startBattle(lv); }; $('cLevels').onclick = function () { showLevels(); };
    $('cBtn').textContent = regionDone ? '🎉 지역 클리어 화면 보기' : '전국 지도로';
    var hasNext = win && !regionDone && lv < D.LEVELS.length && C.levelOpen(st, curR, lv + 1);      // 다음 레벨이 있고 열려 있으면 '다음 레벨로' 단추를 보여요
    $('cNext').style.display = hasNext ? '' : 'none'; $('cNext').className = 'btn gold'; $('cBtn').className = hasNext ? 'btn' : 'btn gold';
    $('cNext').onclick = function () { chooseLevel(lv + 1); };
    if (regionDone) {
      $('cText').innerHTML += '<div class="newtitle" style="background:#E8F7EE;border-color:#5BB98C;color:#1E6B4A">🎉 ' + rno(curR) + '지역의 레벨 5개를 모두 깼어요!</div>';
      $('cBtn').onclick = function () { openRegionClear(curR); };
    }
    if (regionDone) { hud(); var rr = curR; setTimeout(function () { if (phase === 'end' && view === 'vRegion') openRegionClear(rr); }, 700); return; }      // 지역을 모두 깬 순간: 결과 창 없이 바로 지역 클리어 화면
    overlays('ovClear'); hud();
  }

  function unstick() {
    if (!blockedG(P.x, P.y, P.r, false)) return;
    for (var rad = 6; rad <= 420; rad += 6) for (var k = 0; k < 24; k++) {
      var a = k / 24 * 6.283, nx = P.x + Math.cos(a) * rad, ny = P.y + Math.sin(a) * rad;
      if (!blockedG(nx, ny, P.r, false)) { P.x = nx; P.y = ny; burst(P.x, P.y, '#E8654A', false); return; }
    }
  }
  /* 한 프레임 */
  function update(dt) {
    var g = guardian();
    B.t += dt; B.timeLeft -= dt; updateThrow(dt); B.cdThrow = Math.max(0, B.cdThrow - dt); B.cdSkill = Math.max(0, B.cdSkill - dt); B.inv = Math.max(0, B.inv - dt);
    if (B.boost > 0) B.boost -= dt; if (B.fly > 0) B.fly -= dt; if (B.ward > 0) B.ward -= dt;
    if (B.roar) { B.roar.t += dt; if (B.roar.t > 0.5) B.roar = null; }
    if (B.timeLeft <= 0) { B.timeLeft = 0; endBattle(false, 'time'); return; }
    var ax = (keys['arrowright'] || keys['d'] ? 1 : 0) - (keys['arrowleft'] || keys['a'] ? 1 : 0) + joy.x;
    var ay = (keys['arrowdown'] || keys['s'] ? 1 : 0) - (keys['arrowup'] || keys['w'] ? 1 : 0) + joy.y;
    var l = Math.sqrt(ax * ax + ay * ay); if (l > 1) { ax /= l; ay /= l; l = 1; }
    moving = l > 0.1; if (moving) { mvx = ax / l; mvy = ay / l; }
    if (ax > 0.2) dirP = 1; else if (ax < -0.2) dirP = -1;
    var fly = B.fly > 0; if (!fly) unstick();
    var sp = 140 * g.spd * (B.boost > 0 ? 1.8 : 1) * (fly ? 1.25 : 1); if (!fly && inForest(P)) sp *= 0.55;
    var nx = P.x + ax * sp * dt, ny = P.y + ay * sp * dt;
    if (!blockedG(nx, P.y, P.r, fly)) P.x = nx; if (!blockedG(P.x, ny, P.r, fly)) P.y = ny;
    if (moving) { wt += dt * (B.boost > 0 ? 14 : 8); puffT -= dt; if (puffT <= 0 && !fly) { puffT = B.boost > 0 ? 0.05 : 0.11; puff(P.x - mvx * 10, P.y + 24, -mvx * 30 + (Math.random() - 0.5) * 20, -14 - Math.random() * 14, 4 + Math.random() * 3, inForest(P) ? 'rgba(110,150,90,' : 'rgba(160,125,80,', 0.55); } } else wt += dt * 2;
    petals.forEach(function (q) { q.t += dt; q.ph += dt * 2.2; q.vy = Math.min(32, q.vy + 70 * dt); q.vx *= (1 - dt * 1.6); q.x += (q.vx + Math.sin(q.ph) * 20) * dt; q.y += q.vy * dt; q.rot += q.vr * dt; }); petals = petals.filter(function (q) { return q.t < q.life; });
    B.sMapT -= dt;
    if (B.sMapT <= 0 && B.thieves.some(function (t) { return t.active && t.state === 'flee'; })) { B.S = safetyMap(); B.sMapT = 0.3; }
    B.thieves.forEach(function (th) { updateThief(th, dt); });
    updateSites(dt); updateTowers(dt); updateProjs(dt);
    for (var i = 0; i < B.sites.length; i++) { var s = B.sites[i]; if (s.state === 'ok' && dist(P, s) < s.r + P.r - 6) { openQuiz(i); return; } }
    fx.forEach(function (f) { f.t += dt; }); fx = fx.filter(function (f) { return f.t < 0.8; });
    puffs.forEach(function (p) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; }); puffs = puffs.filter(function (p) { return p.t < p.life; });
    floats.forEach(function (f) { f.t += dt; }); floats = floats.filter(function (f) { return f.t < 1.0; });
    hudT -= dt; if (hudT <= 0) { hudT = 0.25; bhud(); }
  }
  function bhud() {
    if (!B) { $('bStat').textContent = ''; return; }
    var m = Math.floor(B.timeLeft / 60), s = Math.ceil(B.timeLeft % 60); if (s === 60) { m++; s = 0; }
    $('bStat').textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s + '  ·  문화재 ' + B.protectedN + '/' + B.sites.length + '  ·  도굴당함 ' + B.looted + '/2  ·  잡은 도굴꾼 ' + B.captured + '/' + B.thieves.length;
  }

  /* 입력 */
  window.addEventListener('keydown', function (e) {
    if (view !== 'vRegion') return;
    var k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].indexOf(k) >= 0) e.preventDefault();
    if (k === 'e' || k === 'E') throwWeapon(); else if (k === ' ') skill();
    else if (k === 'p' || k === 'P' || k === 'Escape') pause(); else keys[k.toLowerCase()] = true;
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  function pause() {
    if (phase === 'play') { phase = 'pause'; overlays('ovPause'); }
    else if (phase === 'pause') { phase = 'play'; overlays(null); }
  }
  function initControls() {
    $('bChase').addEventListener('pointerdown', function (e) { e.preventDefault(); throwWeapon(); });
    $('bSkill').addEventListener('pointerdown', function (e) { e.preventDefault(); skill(); });
    $('pBtn').onclick = pause;
    $('qHintBtn').onclick = function () { $('qHint').style.display = 'block'; };
    var j = $('joy'), kn = $('knob'), act = false;
    function mv(e) {
      var r = j.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = e.clientX - cx, dy = e.clientY - cy, m = r.width / 2 - 10, l = Math.sqrt(dx * dx + dy * dy);
      if (l > m) { dx = dx / l * m; dy = dy / l * m; }
      kn.style.left = (r.width / 2 - 20 + dx) + 'px'; kn.style.top = (r.height / 2 - 20 + dy) + 'px';
      joy.x = dx / m; joy.y = dy / m; if (Math.abs(joy.x) < 0.15 && Math.abs(joy.y) < 0.15) { joy.x = 0; joy.y = 0; }
    }
    j.addEventListener('pointerdown', function (e) { act = true; j.setPointerCapture(e.pointerId); mv(e); });
    j.addEventListener('pointermove', function (e) { if (act) mv(e); });
    function up() { act = false; joy.x = 0; joy.y = 0; kn.style.left = '45px'; kn.style.top = '45px'; }
    j.addEventListener('pointerup', up); j.addEventListener('pointercancel', up);
    function leave() { if (view === 'vRegion') { phase = 'idle'; B = null; overlays(null); } }
    $('lvHelp').onclick = function () { showHelp({ back: 'ovLevels' }); };
    $('pHelp').onclick = function () { showHelp({ back: 'ovPause' }); };
    $('hbHelp').onclick = function () { if (phase === 'play') pause(); showHelp({ back: phase === 'pause' ? 'ovPause' : curOv }); };
    $('hbWorld').onclick = function () { leave(); openWorld(); };
    $('hbRest').onclick = function () { bonusFrom = view === 'vRegion' ? 'region' : 'world'; leave(); openBonus('free'); };
    $('hbDogam').onclick = function () { leave(); openDogam(); };
  }
  function ring(btn, frac, col) {
    var rr = btn / 2 - 2, c = btn / 2 + 4, circ = 2 * Math.PI * rr;
    return '<svg width="' + (btn + 8) + '" height="' + (btn + 8) + '" viewBox="0 0 ' + (btn + 8) + ' ' + (btn + 8) + '"><circle cx="' + c + '" cy="' + c + '" r="' + rr + '" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="6"></circle><circle cx="' + c + '" cy="' + c + '" r="' + rr + '" fill="none" stroke="' + col + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + circ + '" stroke-dashoffset="' + (circ * (1 - frac)) + '" transform="rotate(-90 ' + c + ' ' + c + ')"></circle></svg>';
  }
  function updBtns() {
    if (!B || !st || !st.guardian) return;
    var g = guardian(), Wp = D.WEAPONS[g.id], live = phase === 'play';
    var c = $('bChase'), cf = B.cdThrow > 0 ? 1 - B.cdThrow / Wp.cd : 1;
    c.innerHTML = (B.cdThrow > 0 ? ring(96, cf, '#F2B945') : '') + '<span>' + Wp.name + '<br>던지기</span><small>' + (B.cdThrow > 0 ? Math.ceil(B.cdThrow * 10) / 10 + '초' : '준비') + '</small>';
    c.className = 'ab' + ((B.cdThrow > 0 || !live) ? ' off' : ' pulse'); c.style.fontSize = '17px';
    var s = $('bSkill'), sf = B.cdSkill > 0 ? 1 - B.cdSkill / g.cd : 1, act = (g.id === 'cr' && B.boost > 0) || (g.id === 'jj' && B.fly > 0) || (g.id === 'hm' && B.ward > 0);
    s.innerHTML = (B.cdSkill > 0 ? ring(78, sf, '#F2B945') : '') + '<span>' + g.skill + '</span><small>' + (act ? '사용 중' : (B.cdSkill > 0 ? Math.ceil(B.cdSkill) + '초' : '준비')) + '</small>';
    s.className = 'ab' + ((B.cdSkill > 0 || !live) ? ' off' : '') + (act && live ? ' pulse' : '');
  }

  /* 그리기 */
  var ctx = null, cv = null;
  /* 플레이 화면을 남은 화면에 가득 채워요: 가로 칸(960)은 그대로, 세로 칸(H)을 화면 모양에 맞춰요(가로로 길면 낮게, 세로로 길면 높게). */
  function layoutStage() {
    var stg = $('stage'); if (!stg || view !== 'vRegion' || !stg.getBoundingClientRect || !window.innerWidth) return;
    var host = $('vRegion'), aw = host.clientWidth, top = stg.getBoundingClientRect().top + (window.pageYOffset || 0), ah = window.innerHeight - top - (window.matchMedia && window.matchMedia('(orientation:landscape) and (max-height:600px)').matches ? 8 : 32);
    if (!aw) return;
    var fit = C.stageFit(aw, ah);
    stg.style.width = fit.w + 'px'; stg.style.aspectRatio = '960 / ' + fit.H;
    if (H !== fit.H) { H = fit.H; if (typeof B !== 'undefined' && B && P) snapCam(); }
    fitCanvas();
  }
  var layoutT = 0;
  function layoutSoon() { clearTimeout(layoutT); layoutT = setTimeout(layoutStage, 60); }
  function fitCanvas() {
    var stg = $('stage'); if (!stg || !cv) return; var cw = stg.clientWidth; if (!cw) return;
    var kk = Math.min(2.2, Math.max(1, cw * (window.devicePixelRatio || 1) / W)), nw = Math.round(W * kk), nh = Math.round(H * kk);
    if (cv.width !== nw || cv.height !== nh) { cv.width = nw; cv.height = nh; } K = nw / W;
  }
  function snapCam() { cam.x = Math.max(0, Math.min(MAPW - W, P.x - W / 2)); cam.y = Math.max(0, Math.min(MAPH - H, P.y - H / 2)); }
  function followCam(dt) {
    var tx = Math.max(0, Math.min(MAPW - W, P.x - W / 2)), ty = Math.max(0, Math.min(MAPH - H, P.y - H / 2)), k = Math.min(1, dt * 6);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  }
  function burst(x, y, col, big) { fx.push({ x: x, y: y, t: 0, col: col || '#F2B945', big: big ? 1 : 0 }); }
  function floatTxt(x, y, txt, col) { floats.push({ x: x, y: y, t: 0, txt: txt, col: col || '#E8654A' }); }
  function puff(x, y, vx, vy, r, col, life) { if (RM) return; puffs.push({ x: x, y: y, vx: vx, vy: vy, r: r, col: col, life: life, t: 0 }); }
  function doShake(s, c) { if (RM) return; shake = Math.max(shake, s); flash = 0.3; flashCol = c || '#fff'; }
  function sprite(k, x, footY, dh, dir, sx, sy, alpha, rot, shift) {
    var g = D.GUARDIANS[k], F = g.sprite, img = loadImg(F.src);
    if (!ready(img)) return;
    var dw = dh * F.w / F.h, fr, fr2 = -1, fa = 1;
    if (!moving && F.idleN) { var ps = af * F.r * F.idleN; fr = F.idleStart + Math.floor(ps) % F.idleN; fr2 = F.idleStart + (Math.floor(ps) + 1) % F.idleN; fa = ps - Math.floor(ps); }
    else if (!moving && F.still != null) fr = F.still;
    else if (F.pp) { var LL = 2 * (F.n - 1), qq = Math.floor(af * F.r * LL) % LL; fr = qq < F.n ? qq : LL - qq; }
    else fr = Math.floor(af * F.r * F.n) % F.n;
    var al0 = alpha == null ? 1 : alpha;
    ctx.save(); ctx.translate(x + (shift || 0), footY); if (rot) ctx.rotate(rot); ctx.scale((dir === F.face ? 1 : -1) * (sx || 1), sy || 1);
    ctx.globalAlpha = al0; ctx.drawImage(img, fr * F.w, 0, F.w, F.h, -dw / 2, -dh, dw, dh);
    if (fr2 >= 0) { ctx.globalAlpha = al0 * fa; ctx.drawImage(img, fr2 * F.w, 0, F.w, F.h, -dw / 2, -dh, dw, dh); }
    ctx.restore();
  }
  function pill(x, y, text) {
    ctx.font = "700 14px 'Gowun Dodum',sans-serif"; var tw = ctx.measureText(text).width + 24;
    ctx.fillStyle = '#FFF8E6'; ctx.strokeStyle = '#8B6B3E'; ctx.lineWidth = 1.5; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - tw / 2, y, tw, 26, 13); else ctx.rect(x - tw / 2, y, tw, 26);
    ctx.fill(); ctx.stroke(); ctx.fillStyle = '#3B2A20'; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 18);
  }
  function drawTool(pr) {
    ctx.save(); ctx.translate(pr.x, pr.y); if (pr.type !== 'fire' && pr.type !== 'pearl' && pr.type !== 'ice') ctx.rotate(pr.rot); ctx.lineCap = 'round';
    var t = pr.type;
    if (t === 'pearl') { var gr = ctx.createRadialGradient(0, 0, 2, 0, 0, 20); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.35, 'rgba(120,200,255,.95)'); gr.addColorStop(1, 'rgba(58,143,199,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 20, 0, 6.283); ctx.fill(); ctx.fillStyle = '#9FD8F0'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-3, -3, 3, 0, 6.283); ctx.fill(); }
    else if (t === 'arrow') { ctx.strokeStyle = '#7A5638'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(12, 0); ctx.stroke(); ctx.fillStyle = '#C9D2DC'; ctx.strokeStyle = '#4C5866'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(23, 0); ctx.lineTo(12, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E8433B'; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-24, -5); ctx.lineTo(-13, -1.5); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-24, 5); ctx.lineTo(-13, 1.5); ctx.closePath(); ctx.fill(); }
    else if (t === 'axe') { ctx.strokeStyle = '#7A5638'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke(); ctx.fillStyle = '#C9D2DC'; ctx.strokeStyle = '#5E6B7A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, -14); ctx.lineTo(18, -9); ctx.lineTo(18, 9); ctx.lineTo(6, 14); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else if (t === 'fire') {
      var sp = Math.hypot(pr.vx, pr.vy) || 1, ux = pr.vx / sp, uy = pr.vy / sp;
      for (var k = 5; k >= 1; k--) { ctx.fillStyle = 'rgba(' + (255 - k * 6) + ',' + (130 + k * 12) + ',40,' + (0.5 - k * 0.08).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(-ux * k * 9, -uy * k * 9, 15 - k * 1.8, 0, 6.283); ctx.fill(); }
      var fg = ctx.createRadialGradient(0, 0, 2, 0, 0, 22); fg.addColorStop(0, 'rgba(255,255,230,1)'); fg.addColorStop(0.35, 'rgba(255,205,70,.95)'); fg.addColorStop(0.75, 'rgba(255,100,30,.8)'); fg.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, 0, 22, 0, 6.283); ctx.fill();
    }
    else if (t === 'ice') { var ig = ctx.createRadialGradient(0, 0, 1, 0, 0, 16); ig.addColorStop(0, 'rgba(255,255,255,.95)'); ig.addColorStop(0.5, 'rgba(160,220,250,.7)'); ig.addColorStop(1, 'rgba(120,200,240,0)'); ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 6.283); ctx.fill(); }
    else if (t === 'shovel') { ctx.strokeStyle = '#7A5638'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(8, 0); ctx.stroke(); ctx.fillStyle = '#9AA3AD'; ctx.strokeStyle = '#4B525A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(13, 0, 8, 6, 0, 0, 6.283); ctx.fill(); ctx.stroke(); }
    else if (t === 'hoe') { ctx.strokeStyle = '#7A5638'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(10, 0); ctx.stroke(); ctx.strokeStyle = '#6B747E'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(10, -9); ctx.lineTo(10, 9); ctx.stroke(); ctx.fillStyle = '#9AA3AD'; ctx.fillRect(10, 2, 8, 8); }
    else { ctx.strokeStyle = '#7A5638'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.stroke(); ctx.strokeStyle = '#5D656F'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-3, -12); ctx.quadraticCurveTo(10, -14, 12, 0); ctx.quadraticCurveTo(10, 14, -3, 12); ctx.stroke(); }
    ctx.restore();
  }
  /* 문화재 표시: 보물 지도 두루마리. 그림은 문화재마다 달라요(지키면 빛나고, 도굴당하면 흑백이 돼요) */
  function sitePic(id) { return (window.SITE_PICS && window.SITE_PICS[id]) || ('img/site_' + id + '.webp'); }   // 문화재 두루마리 그림
  var grayCache = {};
  function grayVariant(img, key) {
    if (grayCache[key]) return grayCache[key];
    var out = img;
    try {
      var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; var x = c.getContext('2d'); x.drawImage(img, 0, 0);
      var id = x.getImageData(0, 0, c.width, c.height), d = id.data;
      for (var i = 0; i < d.length; i += 4) { var gr = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; d[i] = (gr * 0.85 + d[i] * 0.15) * 0.7; d[i + 1] = (gr * 0.85 + d[i + 1] * 0.15) * 0.7; d[i + 2] = (gr * 0.85 + d[i + 2] * 0.15) * 0.72; }
      x.putImageData(id, 0, 0); out = c;
    } catch (e) { out = img; }
    grayCache[key] = out; return out;
  }
  function drawSite(s, tm) {
    var x = s.x, y = s.y, src = sitePic(s.id), img = loadImg(src), ok = ready(img);
    var dig = s.diggers > 0, danger = s.dig > 0.7, pulse = 1 + 0.05 * Math.sin(tm / (danger ? 90 : 240));
    var dw = 153, nh = ok ? (img.naturalHeight || img.naturalWidth) : 100, dh = ok ? dw * nh / img.naturalWidth : 79, bottom = y + 36, top = bottom - dh, cy = bottom - dh / 2;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x, bottom - 4, dw * 0.46, 12, 0, 0, 6.283); ctx.fill();
    if (s.state === 'ok') {
      ctx.beginPath(); ctx.ellipse(x, cy, (dw * 0.6 + 12) * pulse, (dh * 0.62 + 10) * pulse, 0, 0, 6.283); ctx.strokeStyle = dig ? (danger && Math.floor(tm / 140) % 2 ? '#FFB4A8' : '#E8433B') : 'rgba(232,162,43,.95)'; ctx.lineWidth = 4; ctx.setLineDash([8, 7]); ctx.lineDashOffset = -tm / 30; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    if (ok) {
      ctx.save();
      if (s.state === 'protected') { ctx.shadowColor = 'rgba(95,214,201,.95)'; ctx.shadowBlur = 16 + 6 * Math.sin(tm / 260); }
      ctx.drawImage(s.state === 'looted' ? grayVariant(img, src) : img, x - dw / 2, top, dw, dh);
      ctx.restore();
    }
    if (s.state === 'protected') {
      var cxs = x + dw * 0.31, cys = top + dh * 0.28;   // 상자 위치에서 반짝여요
      for (var k = 0; k < 3; k++) { var ph = (tm / 600 + k / 3) % 1; ctx.strokeStyle = 'rgba(255,250,210,' + (1 - ph).toFixed(2) + ')'; ctx.lineWidth = 2; var rr = 6 + ph * 14; ctx.beginPath(); ctx.moveTo(cxs - rr, cys); ctx.lineTo(cxs + rr, cys); ctx.moveTo(cxs, cys - rr); ctx.lineTo(cxs, cys + rr); ctx.stroke(); }
      ctx.fillStyle = '#2F8F83'; ctx.beginPath(); ctx.arc(x + dw * 0.44, top + 10, 15, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = "700 19px 'Jua',sans-serif"; ctx.textAlign = 'center'; ctx.fillText('✓', x + dw * 0.44, top + 17);
    }
    if (s.state === 'looted') { ctx.strokeStyle = '#E8433B'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 30, cy - 26); ctx.lineTo(x + 30, cy + 26); ctx.moveTo(x + 30, cy - 26); ctx.lineTo(x - 30, cy + 26); ctx.stroke(); }
    if (s.dig > 0.02 && s.state === 'ok') { ctx.beginPath(); ctx.ellipse(x, cy, dw * 0.6 + 24, dh * 0.62 + 22, 0, -Math.PI / 2, -Math.PI / 2 + 6.283 * Math.min(1, s.dig)); ctx.strokeStyle = danger && Math.floor(tm / 140) % 2 ? '#FFB4A8' : '#E8654A'; ctx.lineWidth = 9; ctx.lineCap = 'butt'; ctx.stroke(); }
    if (dist(P, s) < 340 || dig) pill(x, top - 34, s.d.name);
  }
  /* 현무의 결계 기둥: 돌기둥을 뱀이 감고 올라가요 (처음 디자인의 색과 모양, 감는 모양과 움직임만 고침) */
  /* 현무의 결계 기둥: 돌기둥을 뱀이 나선형으로 감고 올라가요 (비늘 무늬가 아래에서 위로 흘러요) */
  function drawWard(s, tm) {
    var age = WARD_T - s.ward, rise = Math.min(1, age / 0.4), fade = Math.min(1, s.ward / 0.8);
    var cx = s.x + 98, base = s.y + 33, h = 92 * rise, w = 18, steps = 54, i, t, ph, px, py, last, front, band;
    ctx.save(); ctx.globalAlpha = fade; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(47,167,160,' + (0.5 + 0.25 * Math.sin(tm / 150)).toFixed(2) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(s.x + 98, s.y + 31, 36, 11, 0, 0, 6.283); ctx.stroke();
    ctx.fillStyle = 'rgba(30,138,134,.18)'; ctx.fill();
    function snake(frontPass) {
      last = null;
      for (i = 0; i <= steps; i++) {
        t = i / steps; ph = -t * Math.PI * 6; px = cx + Math.sin(ph) * (w / 2 + 3); py = base - 6 - t * (h - 12); front = Math.cos(ph) > 0;
        if (last && front === frontPass && last.front === frontPass) {
          band = Math.floor(t * 20 - tm / 240) % 2 === 0;
          ctx.strokeStyle = frontPass ? (band ? '#1E8A86' : '#43D3C6') : (band ? '#145A57' : '#1F8079'); ctx.lineWidth = 7.5 - t * 2.2; ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(px, py); ctx.stroke();
          if (frontPass && band) { ctx.strokeStyle = 'rgba(200,245,235,.75)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(px, py); ctx.stroke(); }
        }
        last = { x: px, y: py, front: front };
      }
    }
    snake(false);
    ctx.fillStyle = '#BFC7B8'; ctx.strokeStyle = '#5E6B56'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx - w / 2 - 3, base); ctx.lineTo(cx - w / 2, base - h); ctx.lineTo(cx + w / 2, base - h); ctx.lineTo(cx + w / 2 + 3, base); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(94,107,86,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 2, base); ctx.lineTo(cx - 2, base - h); ctx.stroke();
    ctx.fillStyle = '#8E9A84'; ctx.fillRect(cx - w / 2 - 5, base - 5, w + 10, 7); ctx.strokeRect(cx - w / 2 - 5, base - 5, w + 10, 7);
    snake(true);
    if (rise > 0.9) {
      var hx = cx, hy = base - h - 4 - Math.abs(Math.sin(tm / 300)) * 3;
      ctx.fillStyle = '#1E8A86'; ctx.strokeStyle = '#0F4A47'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(hx, hy, 6.5, 10, 0, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx - 3, hy - 2, 1.9, 0, 6.283); ctx.arc(hx + 3, hy - 2, 1.9, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#0F4A47'; ctx.beginPath(); ctx.arc(hx - 3, hy - 2.4, 0.8, 0, 6.283); ctx.arc(hx + 3, hy - 2.4, 0.8, 0, 6.283); ctx.fill();
      if (Math.floor(tm / 260) % 2) { ctx.strokeStyle = '#E8433B'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx, hy - 9); ctx.lineTo(hx, hy - 16); ctx.moveTo(hx, hy - 16); ctx.lineTo(hx - 3, hy - 19); ctx.moveTo(hx, hy - 16); ctx.lineTo(hx + 3, hy - 19); ctx.stroke(); }
    }
    ctx.restore();
  }
  function drawSpike(x, y, h, w, k) {
    var lean = ((k * 53) % 7 - 3) * 0.8;
    ctx.fillStyle = 'rgba(214,242,255,.96)'; ctx.strokeStyle = '#5BA8CF'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + lean, y - h); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(150,205,235,.85)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + lean, y - h); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x - w * 0.18, y - h * 0.15); ctx.lineTo(x + lean * 0.8 - 1, y - h * 0.8); ctx.stroke();
  }
  /* 현무가 얼음이 닿는 곳까지 땅에서 얼음 가지가 솟아요: 가까운 곳은 작고, 멀수록 커져요 */
  function iceSpikes(ox, oy, ang, len, extraAge, scale, hit) {
    var step = 26, sp = D.WEAPONS.hm.speed, k, dd, age, gr, frac, h, w, lat, x, y;
    for (k = 1; k * step <= len; k++) {
      dd = k * step; age = (len - dd) / sp + extraAge; gr = Math.min(1, age / 0.12) * scale; if (gr <= 0.03) continue;
      frac = dd / 380; h = (9 + 44 * Math.pow(frac, 1.1)) * gr; w = 7 + h * 0.32; lat = ((k % 2) ? 1 : -1) * (5 + ((k * 37) % 9));
      x = ox + Math.cos(ang) * dd - Math.sin(ang) * lat; y = oy + 34 + Math.sin(ang) * dd + Math.cos(ang) * lat; drawSpike(x, y, h, w, k);
    }
    if (hit) { var ex = ox + Math.cos(ang) * len, ey = oy + 34 + Math.sin(ang) * len, gg = Math.min(1, (extraAge + 0.05) / 0.2) * scale; [[-22, 6, 58], [20, 4, 50], [0, 14, 64]].forEach(function (q, i) { if (gg > 0.03) drawSpike(ex + q[0], ey + q[1], q[2] * gg, 16 + q[2] * 0.25, 40 + i); }); }
  }
  function drawFrost(f, tm) {
    var t = f.t, pop = Math.min(1, t / 0.16), ease = 1 - Math.pow(1 - pop, 3), over = t < 0.16 ? 1.12 * ease : 1.12 - 0.12 * Math.min(1, (t - 0.16) / 0.12);
    var melt = t > 0.45 ? Math.min(1, (t - 0.45) / 0.58) : 0, al = Math.min(1, t / 0.07) * (1 - melt), R = f.R * over * (1 - 0.07 * melt), i, a;
    ctx.save(); ctx.globalAlpha = Math.max(0, al);
    var gr = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, R * 1.06);   // 서리가 낀 듯한 흰 원판
    gr.addColorStop(0, 'rgba(255,255,255,.62)'); gr.addColorStop(0.55, 'rgba(236,248,255,.42)'); gr.addColorStop(0.9, 'rgba(200,232,250,.2)'); gr.addColorStop(1, 'rgba(190,226,248,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, R * 1.06, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.96)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, 6.283); ctx.stroke();                          // 또렷한 흰 테두리 = 타격 범위
    ctx.strokeStyle = 'rgba(190,230,252,.8)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(f.x, f.y, R - 6, 0, 6.283); ctx.stroke();
    var grow = Math.min(1, t / 0.3);   // 얼어붙은 균열이 가운데에서 바깥으로 뻗어요
    ctx.lineCap = 'round';
    for (i = 0; i < 6; i++) {
      a = f.seed + i / 6 * 6.283; var l1 = R * (0.22 + 0.68 * grow), cx1 = f.x + Math.cos(a) * l1, cy1 = f.y + Math.sin(a) * l1;
      ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * R * 0.18, f.y + Math.sin(a) * R * 0.18); ctx.lineTo(cx1, cy1); ctx.stroke();
      if (grow > 0.5) { var bl = R * 0.2 * (grow - 0.5) * 2, bx = f.x + Math.cos(a) * R * 0.56, by = f.y + Math.sin(a) * R * 0.56; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a + 0.7) * bl, by + Math.sin(a + 0.7) * bl); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a - 0.7) * bl, by + Math.sin(a - 0.7) * bl); ctx.stroke(); }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.8; ctx.beginPath();   // 가운데 눈꽃 모양(육각 별)
    for (i = 0; i < 6; i++) { a = f.seed + i / 6 * 6.283 + t * 0.9; ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + Math.cos(a) * R * 0.3, f.y + Math.sin(a) * R * 0.3); }
    ctx.stroke();
    if (t < 0.3) { var wv = t / 0.3; ctx.globalAlpha = Math.max(0, (1 - wv)) * 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 * (1 - wv) + 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.R * (0.5 + 1.0 * wv), 0, 6.283); ctx.stroke(); }   // 퍼져 나가는 서리 물결
    ctx.globalAlpha = Math.max(0, al);
    for (i = 0; i < 9; i++) {   // 반짝이는 얼음 가루가 위로 떠올라요
      var ph = Math.min(1, t * 1.15 + i * 0.045), ang = f.seed * 3 + i * 2.4, rr = R * (0.25 + 0.7 * ((i * 37) % 10) / 10), sx = f.x + Math.cos(ang) * rr, sy = f.y + Math.sin(ang) * rr * 0.9 - ph * 26, sz = 2.6 - ph * 1.2;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.95 - ph * 0.6).toFixed(2) + ')'; ctx.beginPath(); ctx.moveTo(sx, sy - sz * 1.5); ctx.lineTo(sx + sz, sy); ctx.lineTo(sx, sy + sz * 1.5); ctx.lineTo(sx - sz, sy); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function drawFireZone(f, tm) {
    var age = f.max - f.t, grow = Math.min(1, age / 0.3), fade = Math.min(1, f.t / 0.5), R = f.r * (0.6 + 0.4 * grow), i, a;
    ctx.save(); ctx.globalAlpha = fade;
    var gr = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, R * 1.08);
    gr.addColorStop(0, 'rgba(255,240,170,.72)'); gr.addColorStop(0.45, 'rgba(255,150,50,.46)'); gr.addColorStop(0.85, 'rgba(255,80,30,.22)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, R * 1.08, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,100,.95)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,120,40,.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(f.x, f.y, R - 7, 0, 6.283); ctx.stroke();
    for (i = 0; i < 24; i++) { a = i / 24 * 6.283 + tm / 1800; var l2 = i % 3 === 0 ? 9 : 5; ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,235,160,.95)' : 'rgba(255,170,70,.8)'; ctx.lineWidth = i % 3 === 0 ? 2.2 : 1.4; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * (R - 3), f.y + Math.sin(a) * (R - 3)); ctx.lineTo(f.x + Math.cos(a) * (R + l2 - 3), f.y + Math.sin(a) * (R + l2 - 3)); ctx.stroke(); }
    for (i = 0; i < 8; i++) {
      a = i / 8 * 6.283 - tm / 1500; var len = R * 0.8 * (0.92 + 0.08 * Math.sin(tm / 160 + i)), wd = R * 0.27;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(a);
      var pg = ctx.createLinearGradient(0, 0, 0, -len); pg.addColorStop(0, 'rgba(255,240,150,.85)'); pg.addColorStop(0.55, 'rgba(255,160,50,.72)'); pg.addColorStop(1, 'rgba(255,70,30,.78)');
      ctx.fillStyle = pg; ctx.strokeStyle = 'rgba(255,230,160,.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(wd, -len * 0.3, wd * 0.6, -len * 0.75, 0, -len); ctx.bezierCurveTo(-wd * 0.6, -len * 0.75, -wd, -len * 0.3, 0, 0); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,245,200,.9)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (i = 0; i <= 6; i++) { a = (i % 6) / 6 * 6.283 + tm / 1200; var px = f.x + Math.cos(a) * R * 0.34, py = f.y + Math.sin(a) * R * 0.34; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke();
    var cg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R * 0.2); cg.addColorStop(0, 'rgba(255,255,230,1)'); cg.addColorStop(1, 'rgba(255,200,80,0)'); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(f.x, f.y, R * 0.2, 0, 6.283); ctx.fill();
    for (i = 0; i < 10; i++) { var ph = (tm / 900 + i * 0.37) % 1, sx = f.x + Math.cos(i * 2.4) * R * 0.72 * (1 - ph * 0.3), sy = f.y - ph * R * 0.95 + Math.sin(i * 1.7) * 6; ctx.fillStyle = 'rgba(' + (i % 2 ? '255,210,110' : '255,130,50') + ',' + (1 - ph).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(sx, sy, 2.6 * (1 - ph) + 0.8, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }
  function drawPetal(q) {
    var k = q.t / q.life, al = (k > 0.65 ? (1 - k) / 0.35 : 1) * Math.min(1, q.t / 0.2), s = q.sz;
    ctx.save(); ctx.globalAlpha = Math.max(0, al); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
    if (q.kind === 'petal') {
      ctx.fillStyle = q.col; ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.95, -s * 0.2, 0, s); ctx.quadraticCurveTo(-s * 0.95, -s * 0.2, 0, -s); ctx.fill();
      ctx.strokeStyle = 'rgba(214,110,150,.45)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -s * 0.6); ctx.lineTo(0, s * 0.7); ctx.stroke();
    } else if (q.kind === 'leaf') {
      ctx.fillStyle = q.col; ctx.strokeStyle = 'rgba(70,120,90,.6)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(0, -s * 1.5); ctx.quadraticCurveTo(s * 1.0, -s * 0.3, 0, s * 1.5); ctx.quadraticCurveTo(-s * 1.0, -s * 0.3, 0, -s * 1.5); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(0, s * 1.5); ctx.stroke();
    } else if (q.kind === 'ember') {
      var gl = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 3.2); gl.addColorStop(0, 'rgba(255,200,90,.55)'); gl.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, s * 3.2, 0, 6.283); ctx.fill();
      for (var pi = 0; pi < 5; pi++) { ctx.save(); ctx.rotate(pi * 1.2566); ctx.fillStyle = pi % 2 ? '#FF6A2A' : q.col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.9, -s * 0.8, 0, -s * 1.9); ctx.quadraticCurveTo(-s * 0.9, -s * 0.8, 0, 0); ctx.fill(); ctx.restore(); }
      ctx.fillStyle = '#FFF2B0'; ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, 6.283); ctx.fill();
    } else {
      ctx.strokeStyle = q.col; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(140,200,240,.8)'; ctx.shadowBlur = 3;
      for (var ai = 0; ai < 6; ai++) { ctx.save(); ctx.rotate(ai * 1.0472); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 1.7); ctx.moveTo(0, -s * 1.0); ctx.lineTo(s * 0.55, -s * 1.5); ctx.moveTo(0, -s * 1.0); ctx.lineTo(-s * 0.55, -s * 1.5); ctx.stroke(); ctx.restore(); }
    }
    ctx.restore();
  }
  /* 청룡의 회오리: 땅 쪽은 뿔처럼 좁고, 위로 갈수록 더 큰 동심원을 그리며 넓어져요 */
  function drawFunnel(th, tm, lift, inten, front) {
    var y0 = th.y + 28, Hf = 128 * (0.8 + 0.2 * lift), strands = 3, st_, s, a, x, y, last, lastFront, steps = 34, r_, rr;
    ctx.save(); ctx.lineCap = 'round';
    for (st_ = 0; st_ < strands; st_++) {
      last = null;
      for (var n = 0; n <= steps; n++) {
        s = n / steps; r_ = 4 + 44 * Math.pow(s, 1.15); a = s * Math.PI * 5.2 + st_ * 2.094 + tm / 190;
        x = th.x + Math.cos(a) * r_; y = y0 - s * Hf + Math.sin(a) * r_ * 0.28;
        var isFront = Math.sin(a) > 0;
        if (last && isFront === front && lastFront === front) {
          ctx.strokeStyle = 'rgba(' + (front ? '235,250,255' : '170,215,240') + ',' + ((front ? 0.85 : 0.5) * inten * (1 - s * 0.45)).toFixed(2) + ')'; ctx.lineWidth = (front ? 4 : 3) - s * 1.6;
          ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(x, y); ctx.stroke();
        }
        last = { x: x, y: y }; lastFront = isFront;
      }
    }
    if (!front) { ctx.strokeStyle = 'rgba(210,235,250,' + (0.45 * inten).toFixed(2) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(th.x, y0, 14 + 4 * Math.sin(tm / 160), 4, 0, 0, 6.283); ctx.stroke(); }
    ctx.restore();
  }
  /* 도굴꾼이 던지는 몸짓: 도구를 머리 뒤로 들어 올리며 젖혔다가, 던지고 앞으로 뻗어요 */
  function thiefPose(th) {
    var k;
    if (th.state === 'wind') {
      var dS = th.aim && th.aim.x < th.x ? -1 : 1; k = Math.min(1, Math.max(0, 1 - th.windT / B.L.tele));
      return { rot: -0.24 * k * dS, shift: -4 * k * dS, sx: 1 + 0.03 * k, sy: 1 - 0.05 * k };
    }
    if (th.thrT < 0.3) {
      var t = th.thrT, lean, f; if (t < 0.08) { k = t / 0.08; lean = -0.24 + 0.54 * k; } else { k = (t - 0.08) / 0.22; lean = 0.3 * (1 - k); }
      f = Math.max(lean, 0) / 0.3; return { rot: lean * th.thrDir, shift: th.thrDir * f * 8, sx: 1 - 0.05 * f, sy: 1 + 0.08 * f };
    }
    return { rot: 0, shift: 0, sx: 1, sy: 1 };
  }
  function drawThief(th, tm) {
    if (!th.active || th.state === 'caught') return;
    var hid = hidden(th);
    if (hid) { if (Math.floor(tm / 400 + th.i * 3) % 5 === 0) { ctx.fillStyle = 'rgba(70,120,60,.55)'; ctx.beginPath(); ctx.arc(th.x + Math.sin(tm / 120) * 6, th.y - 20, 6, 0, 6.283); ctx.fill(); } return; }
    var img = loadImg(th.img), sc = (th.boss ? 1.3 : 1) * THIEF_SCALE;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(th.x, th.y + 30, 20 * sc, 6, 0, 0, 6.283); ctx.fill();
    var torn = th.tornT > 0, lift = 0, yoff = 0, xoff = 0, inten = 0;
    if (torn) {
      var u = 1 - th.tornT / th.tornTot; lift = u < 0.7 ? u / 0.7 : Math.max(0, (1 - u) / 0.3); yoff = -lift * 56; xoff = Math.sin(tm / 95) * lift * 8; inten = Math.min(1, u * 6, (1 - u) * 4);
      drawFunnel(th, tm, lift, inten, false);
    }
    ctx.save(); var moving_ = th.state === 'arrive' || (th.state === 'flee'), tb = moving_ ? Math.abs(Math.sin(tm / 90 + th.i)) * 5 : 0;
    var shk = th.state === 'stun' ? Math.sin(tm / 35) * 4 : (th.state === 'dig' ? Math.sin(tm / 45) * 2.5 : 0);
    var tpo = thiefPose(th);
    ctx.translate(th.x + shk + xoff + tpo.shift, th.y + 30 - tb + yoff); ctx.rotate((moving_ ? -0.08 : 0) + (th.spin || 0) * 0.03 + (torn ? Math.sin(tm / 120) * 0.3 : 0) + tpo.rot); ctx.scale(sc * tpo.sx, sc * tpo.sy); if (ready(img)) ctx.drawImage(img, -28, -66, 56, 66); ctx.restore();
    if (torn) {
      var hx = th.x + xoff, hy = th.y - 52 * sc + yoff;
      for (var ds = 0; ds < 3; ds++) { var da = tm / 170 + ds * 2.09; ctx.fillStyle = '#FFE680'; ctx.strokeStyle = '#C98A12'; ctx.lineWidth = 1.5; ctx.save(); ctx.translate(hx + Math.cos(da) * 20, hy + Math.sin(da) * 7); ctx.rotate(tm / 200 + ds); ctx.beginPath(); for (var sp_ = 0; sp_ < 5; sp_++) { var sa = sp_ * 1.2566 - 1.5708; ctx.lineTo(Math.cos(sa) * 6, Math.sin(sa) * 6); var sb = sa + 0.628; ctx.lineTo(Math.cos(sb) * 2.6, Math.sin(sb) * 2.6); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
      ctx.strokeStyle = '#3A8FC7'; ctx.lineWidth = 2.5; ctx.beginPath(); for (var sw = 0; sw < 26; sw++) { var ang2 = sw * 0.5 + tm / 200, rr = 1 + sw * 0.34; var spx = hx + Math.cos(ang2) * rr, spy = hy - 18 + Math.sin(ang2) * rr * 0.6; if (sw) ctx.lineTo(spx, spy); else ctx.moveTo(spx, spy); } ctx.stroke();
    }
    if (torn) drawFunnel(th, tm, lift, inten, true);
    if (th.burnT > 0) { for (var bf = 0; bf < 3; bf++) { var bx2 = th.x - 14 + bf * 14, fh = 18 + Math.abs(Math.sin(tm / 80 + bf)) * 12; ctx.fillStyle = bf % 2 ? 'rgba(255,170,50,.9)' : 'rgba(255,90,30,.9)'; ctx.beginPath(); ctx.moveTo(bx2 - 6, th.y + 26); ctx.quadraticCurveTo(bx2 - 2, th.y + 26 - fh * 0.6, bx2, th.y + 26 - fh); ctx.quadraticCurveTo(bx2 + 2, th.y + 26 - fh * 0.6, bx2 + 6, th.y + 26); ctx.closePath(); ctx.fill(); } }
    if ((th.state === 'stun' || th.state === 'frozen') && B.captured === 0 && (st.capHint || 0) < 2) {
      var hb = Math.sin(tm / 140) * 2, hx2 = th.x, hy2 = th.y - 84 * sc + hb;
      ctx.font = "700 15px 'Jua',sans-serif"; var hw = ctx.measureText('곁에 붙어요!').width + 16;
      ctx.fillStyle = '#F2B945'; ctx.strokeStyle = '#7A4F12'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(hx2 - hw / 2 + 8, hy2 - 13); ctx.lineTo(hx2 + hw / 2 - 8, hy2 - 13); ctx.quadraticCurveTo(hx2 + hw / 2, hy2 - 13, hx2 + hw / 2, hy2 - 5); ctx.lineTo(hx2 + hw / 2, hy2 + 3); ctx.quadraticCurveTo(hx2 + hw / 2, hy2 + 11, hx2 + hw / 2 - 8, hy2 + 11); ctx.lineTo(hx2 + 6, hy2 + 11); ctx.lineTo(hx2, hy2 + 18); ctx.lineTo(hx2 - 6, hy2 + 11); ctx.lineTo(hx2 - hw / 2 + 8, hy2 + 11); ctx.quadraticCurveTo(hx2 - hw / 2, hy2 + 11, hx2 - hw / 2, hy2 + 3); ctx.lineTo(hx2 - hw / 2, hy2 - 5); ctx.quadraticCurveTo(hx2 - hw / 2, hy2 - 13, hx2 - hw / 2 + 8, hy2 - 13); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3B2A20'; ctx.textAlign = 'center'; ctx.fillText('곁에 붙어요!', hx2, hy2 + 4);
    }
    if (th.zzT > 0 && th.state === 'stun') {
      var zb = Math.sin(tm / 260) * 3, zx = th.x + 16, zy = th.y - 62 * sc + zb;
      ctx.font = "700 20px 'Jua',sans-serif"; ctx.textAlign = 'left'; ctx.lineWidth = 4; ctx.strokeStyle = '#FFFFFF'; ctx.strokeText('Zzz', zx, zy); ctx.fillStyle = '#1E8A86'; ctx.fillText('Zzz', zx, zy);
    }
    if (th.state === 'stun' && !torn) for (var i = 0; i < 4; i++) { var a2 = tm / 160 + i * 1.57; ctx.fillStyle = '#F2B945'; ctx.beginPath(); ctx.arc(th.x + Math.cos(a2) * 24, th.y - 40 * sc + Math.sin(a2) * 7, 5, 0, 6.283); ctx.fill(); }
    if (th.state === 'frozen') {   // 두목은 몸이 커서 얼음 덩어리도 더 크게(가로 1.72배, 세로 1.3배) 그려서 몸 전체가 얼음 안에 들어가요
      var ix = th.boss ? 1.72 : 1, iy = th.boss ? 1.3 : 1;
      ctx.save(); ctx.translate(th.x, th.y + 32); ctx.scale(ix, iy); ctx.fillStyle = 'rgba(170,225,250,.62)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 / Math.max(ix, iy);
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-20, -68); ctx.lineTo(0, -80); ctx.lineTo(20, -68); ctx.lineTo(26, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    if (th.state === 'wind' && th.tool) {
      var wd = th.aim && th.aim.x < th.x ? -1 : 1, wk = Math.min(1, Math.max(0, 1 - th.windT / B.L.tele)), fwd = wd > 0 ? 0 : Math.PI;
      drawTool({ type: th.tool, x: th.x + wd * (20 - 6 * wk) * sc, y: th.y - (34 + 14 * wk) * sc, rot: fwd - wd * (0.6 + 1.7 * wk), vx: 0, vy: 0 });
    }
    if (th.state === 'wind') {
      ctx.strokeStyle = 'rgba(232,67,59,.75)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(th.x, th.y - 16); ctx.lineTo(th.aim.x, th.aim.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#E8433B'; ctx.beginPath(); ctx.arc(th.x, th.y - 80 * sc, 15, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = "700 20px 'Jua',sans-serif"; ctx.textAlign = 'center'; ctx.fillText('!', th.x, th.y - 74 * sc);
    }
    if ((th.state === 'stun' || th.state === 'frozen') && th.capT > 0) { ctx.beginPath(); ctx.arc(th.x, th.y - 10, 42, -Math.PI / 2, -Math.PI / 2 + 6.283 * Math.min(1, th.capT / CAPTURE_T)); ctx.strokeStyle = '#2F8F83'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke(); }
    if (th.boss) { ctx.fillStyle = '#F2B945'; ctx.font = "700 13px 'Jua',sans-serif"; ctx.textAlign = 'center'; ctx.fillText('두목', th.x, th.y - 74); }
  }
  function edgePos(wx, wy) {
    var sx = wx - cam.x, sy = wy - cam.y;
    if (sx > 24 && sx < W - 24 && sy > 24 && sy < H - 24) return null;
    var cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy, k = Math.min((W / 2 - 30) / (Math.abs(dx) || 1e-6), (H / 2 - 30) / (Math.abs(dy) || 1e-6));
    return { x: cx + dx * k, y: cy + dy * k, a: Math.atan2(dy, dx) };
  }
  function arrowAt(p, col, txt, nudge) {
    ctx.save(); ctx.translate(p.x + (nudge ? -Math.sin(p.a) * nudge : 0), p.y + (nudge ? Math.cos(p.a) * nudge : 0));
    ctx.fillStyle = 'rgba(20,14,20,.78)'; ctx.beginPath(); ctx.arc(0, 0, 19, 0, 6.283); ctx.fill();
    ctx.rotate(p.a); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(27, 0); ctx.lineTo(15, -9); ctx.lineTo(15, 9); ctx.closePath(); ctx.fill(); ctx.rotate(-p.a);
    ctx.fillStyle = '#fff'; ctx.font = "700 17px 'Jua',sans-serif"; ctx.textAlign = 'center'; ctx.fillText(txt, 0, 6); ctx.restore();
  }
  function arrows() {
    var nd = null, nk = null, bd = 1e9, bk = 1e9;
    B.sites.forEach(function (s) { if (s.state !== 'ok') return; var d = dist(P, s); if (s.diggers > 0 && d < bd) { bd = d; nd = s; } if (d < bk) { bk = d; nk = s; } });
    var a = nd ? edgePos(nd.x, nd.y) : null, b = nk && nk !== nd ? edgePos(nk.x, nk.y) : null;
    if (a) arrowAt(a, '#E8433B', '!', 0);
    if (b) arrowAt(b, '#F2B945', '문', a && Math.hypot(a.x - b.x, a.y - b.y) < 46 ? 44 : 0);
  }
  function minimap(map) {
    var mw = 190, mh = Math.round(mw * MAPH / MAPW), x0 = W - mw - 10, y0 = 10, s = mw / MAPW, tm = Date.now();
    ctx.save(); ctx.globalAlpha = 0.93; ctx.fillStyle = 'rgba(20,14,20,.7)'; ctx.fillRect(x0 - 3, y0 - 3, mw + 6, mh + 6);
    if (ready(map)) ctx.drawImage(map, 0, 0, map.naturalWidth, map.naturalHeight, x0, y0, mw, mh);
    B.sites.forEach(function (q) {
      var col = q.state === 'protected' ? '#2F8F83' : q.state === 'looted' ? '#3B2A20' : (q.diggers > 0 ? (Math.floor(tm / 250) % 2 ? '#E8433B' : '#FFD0C8') : '#F2B945');
      ctx.beginPath(); ctx.arc(x0 + q.x * s, y0 + q.y * s, q.diggers > 0 && q.state === 'ok' ? 5 : 3.5, 0, 6.283); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    });
    B.thieves.forEach(function (th) { if (!th.active || th.state === 'caught' || hidden(th)) return; ctx.beginPath(); ctx.arc(x0 + th.x * s, y0 + th.y * s, 3.5, 0, 6.283); ctx.fillStyle = '#E8654A'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); });
    ctx.beginPath(); ctx.arc(x0 + P.x * s, y0 + P.y * s, 5, 0, 6.283); ctx.fillStyle = guardian().color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + cam.x * s, y0 + cam.y * s, W * s, H * s);
    ctx.restore();
  }
  function drawGuardian(tm) {
    var gd = guardian(), dh = gd.sprite.dh * GUARD_SCALE, fly = B.fly > 0;
    var bob = moving ? Math.abs(Math.sin(wt)) * 3 : Math.sin(wt) * 1.3, sq = moving ? 1 + Math.sin(wt * 2) * 0.02 : 1, foot = P.y + 26 - bob - (fly ? 16 + Math.sin(tm / 90) * 3 : 0);
    ctx.fillStyle = 'rgba(0,0,0,' + (fly ? 0.12 : 0.22) + ')'; ctx.beginPath(); ctx.ellipse(P.x, P.y + 26, ((fly ? 13 : 19) - bob * 0.4) * GUARD_SCALE, 5.5, 0, 0, 6.283); ctx.fill();
    if (B.boost > 0) { ctx.fillStyle = 'rgba(58,143,199,.22)'; ctx.beginPath(); ctx.arc(P.x, P.y, P.r + 18 + Math.sin(tm / 60) * 3, 0, 6.283); ctx.fill(); }
    if (fly) { ctx.fillStyle = 'rgba(232,101,74,.18)'; ctx.beginPath(); ctx.arc(P.x, P.y - 8, P.r + 16 + Math.sin(tm / 80) * 3, 0, 6.283); ctx.fill(); }
    if (B.ward > 0) {
      var wf = B.ward / WARD_T, wr = 46 + Math.sin(tm / 150) * 2;
      ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(47,167,160,.22)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(P.x, P.y - 4, wr, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = 'rgba(47,200,190,' + (0.8 + 0.15 * Math.sin(tm / 120)).toFixed(2) + ')'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(P.x, P.y - 4, wr, -Math.PI / 2 + 6.283 * (1 - wf), Math.PI * 1.5); ctx.stroke();
    }
    if (B.shield > 0) { ctx.strokeStyle = 'rgba(110,143,103,.8)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(P.x, P.y - 4, 34, 0, 6.283); ctx.stroke(); }
    var blink = B.inv > 0 && Math.floor(tm / 90) % 2 === 0; var tp = throwPose(); sprite(gd.id, P.x, foot, dh, dirP, tp.sx / sq, tp.sy * sq, blink ? 0.35 : 1, tp.rot, tp.shift); drawThrowFx(tm);
  }
  /* 감시탑 그림: 도굴꾼을 모두 잡기 전에는 잠들어 있고, 깨어나면 사정거리 고리와 경고선이 나와요 */
  /* 탑 그림 그리기: 석축(아래 절반)은 그대로 두고, 나무 윗부분만 위로 갈수록 더 많이 옆으로 밀어서 흔들림을 표현해요 */
  var TOWER_SEAM = 170;   // 원본 그림에서 석축이 시작되는 높이
  function towerBody(img, bx, top, dw, dh, sw, a) {
    var iw = img.naturalWidth || 1, ih = img.naturalHeight || 1, k = dh / ih, y;
    if (!sw || Math.abs(sw) < 0.05 || !img.naturalHeight) { ctx.drawImage(img, bx - dw / 2, top, dw, dh); return; }
    ctx.drawImage(img, 0, TOWER_SEAM, iw, ih - TOWER_SEAM, bx - dw / 2, top + TOWER_SEAM * k, dw, (ih - TOWER_SEAM) * k);
    for (y = 0; y < TOWER_SEAM; y += 3) { var h3 = Math.min(3, TOWER_SEAM - y), f = (TOWER_SEAM - y) / TOWER_SEAM; ctx.drawImage(img, 0, y, iw, h3 + 0.5, bx - dw / 2 + sw * Math.pow(f, 1.3), top + y * k, dw, h3 * k + 0.6); }
  }
  function drawTower(t, tm) {
    var img = loadImg('img/tower_watch.webp'), ok = ready(img), dh = 190, dw = ok ? dh * img.naturalWidth / (img.naturalHeight || img.naturalWidth) : 113, bx = t.x, by = t.y + 6, top = by - dh, sy = t.y - 156;
    var fx = bx, fy = by - 22;   // 탑 바닥(네모 발자국)의 한가운데
    ctx.fillStyle = 'rgba(60,44,26,.16)'; ctx.beginPath(); ctx.moveTo(fx - 74, fy); ctx.lineTo(fx, fy - 40); ctx.lineTo(fx + 74, fy); ctx.lineTo(fx, fy + 40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(60,44,26,.30)'; ctx.beginPath(); ctx.moveTo(fx - 58, fy); ctx.lineTo(fx, fy - 31); ctx.lineTo(fx + 58, fy); ctx.lineTo(fx, fy + 31); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(60,44,26,.20)'; ctx.beginPath(); ctx.moveTo(fx + 8, fy - 30); ctx.lineTo(fx + 64, fy - 6); ctx.lineTo(fx + 158, fy + 30); ctx.lineTo(fx + 100, fy + 58); ctx.lineTo(fx + 6, fy + 28); ctx.closePath(); ctx.fill();   // 오른쪽 아래로 길게 드리운 그림자
    if (B.towersOn) {
      var RG = D.TOWER.range, near = dist(P, t) < RG + 60;
      ctx.strokeStyle = 'rgba(232,67,59,' + (near ? 0.55 : 0.24).toFixed(2) + ')'; ctx.lineWidth = 3; ctx.setLineDash([10, 9]); ctx.lineDashOffset = -tm / 40;
      ctx.beginPath(); ctx.ellipse(t.x, t.y - 6, RG, RG * 0.62, 0, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    if (ok) {
      var sw = Math.sin(t.shake * 72) * 3.4 * Math.max(0, t.shake / 0.4);   // 쏠 때 윗부분이 미세하게 좌우로 흔들려요(석축 아랫부분은 그대로예요)
      towerBody(img, bx, top, dw, dh, sw, 1);
      if (t.flash > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28 * (t.flash / 0.25); towerBody(img, bx, top, dw, dh, sw, 1); ctx.restore(); }   // 쏠 때 탑이 잠깐 밝아져요
    }
    if (!B.towersOn) { ctx.font = "700 20px 'Jua',sans-serif"; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#FFFFFF'; var zy = top - 6 + Math.sin(tm / 500) * 3; ctx.strokeText('Zzz', bx + 6, zy); ctx.fillStyle = '#6A7A8A'; ctx.fillText('Zzz', bx + 6, zy); }
    if (t.state === 'wind') {
      ctx.strokeStyle = 'rgba(232,67,59,.8)'; ctx.lineWidth = 3; ctx.setLineDash([8, 7]); ctx.beginPath(); ctx.moveTo(bx, sy); ctx.lineTo(t.aim.x, t.aim.y); ctx.stroke(); ctx.setLineDash([]);
      var bob = Math.sin(tm / 90) * 2; ctx.fillStyle = '#E8433B'; ctx.beginPath(); ctx.arc(bx + 34, top + 10 + bob, 14, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = "700 19px 'Jua',sans-serif"; ctx.textAlign = 'center'; ctx.fillText('!', bx + 34, top + 17 + bob);
    }
    if (t.flash > 0) { ctx.fillStyle = 'rgba(255,240,170,' + Math.min(1, t.flash / 0.25).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(bx + 6, sy - 6, 12 * (t.flash / 0.25) + 3, 0, 6.283); ctx.fill(); }
  }

  /* 강물 위를 상류에서 하류로 흘러가는 하얀 실금 (강의 방향은 데이터의 점 순서와 같아요) */
  function buildFlow(R) {
    var out = [], rv = [], o = R.obstacles; if (o.river) rv.push(o.river); (o.rivers || []).forEach(function (r) { rv.push(r); });
    rv.forEach(function (r) {
      var pts = r.pts, cum = [0], L = 0, i;
      for (i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); }
      var n = Math.max(6, Math.min(26, Math.round(L / 110))), half = r.half || 30, st = [];
      if (!Array.isArray(half)) half = pts.map(function () { return half; });
      for (i = 0; i < n; i++) st.push({ u0: Math.random() * (L + 160), sp: 40 + Math.random() * 20, off: (Math.random() * 2 - 1) * 0.55, ph: Math.random() * 6.283, len: 70 + Math.random() * 50 });
      out.push({ pts: pts, cum: cum, L: L, half: half, st: st, br: r.bridges || [] });
    });
    return out;
  }
  function flowAt(f, s, off) {
    if (s < 0) s = 0; if (s > f.L) s = f.L; var lo = 0, hi = f.cum.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (f.cum[mid] <= s) lo = mid; else hi = mid; }
    var a = f.pts[lo], b = f.pts[hi], seg = (f.cum[hi] - f.cum[lo]) || 1, u = (s - f.cum[lo]) / seg, dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
    var hw = (f.half[lo] || 30) * (1 - u) + (f.half[hi] || f.half[lo] || 30) * u, o = off * hw;
    return { x: a[0] + dx * u + nx * o, y: a[1] + dy * u + ny * o, nx: nx, ny: ny };
  }
  function drawFlow(tm) {
    if (RM) return; var R = region(); if (!B.flow || B.flowR !== curR) { B.flow = buildFlow(R); B.flowR = curR; }
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.62)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    B.flow.forEach(function (f) {
      f.st.forEach(function (q) {
        var span = f.L + q.len * 2, s = ((q.u0 + q.sp * tm / 1000) % span) - q.len;
        var a0 = flowAt(f, s - q.len / 2, q.off), a1 = flowAt(f, s + q.len / 2, q.off), am = flowAt(f, s, q.off);
        if (Math.max(a0.x, a1.x) < cam.x - 30 || Math.min(a0.x, a1.x) > cam.x + W + 30 || Math.max(a0.y, a1.y) < cam.y - 30 || Math.min(a0.y, a1.y) > cam.y + H + 30) return;
        for (var bi = 0; bi < f.br.length; bi++) { if (Math.hypot(am.x - f.br[bi][0], am.y - f.br[bi][1]) < 120) return; }     // 다리 위에는 그리지 않아요
        var t1 = Math.min(1, Math.max(0, (s + q.len / 2) / q.len)), t2 = Math.min(1, Math.max(0, (f.L - s + q.len / 2) / q.len)); ctx.globalAlpha = Math.min(t1, t2);
        var wob = Math.sin(tm / 420 + q.ph) * 4;
        ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.quadraticCurveTo(am.x + am.nx * wob, am.y + am.ny * wob, a1.x, a1.y); ctx.stroke();
      });
    });
    ctx.restore();
  }
  function draw(tm) {
    var ox = 0, oy = 0; if (shake > 0) { ox = (Math.random() - 0.5) * 14 * Math.min(1, shake / 0.3); oy = (Math.random() - 0.5) * 14 * Math.min(1, shake / 0.3); }
    var R = region(), map = loadImg(R.map);
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.save(); ctx.translate(ox, oy); ctx.clearRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = '#E6D3A3'; ctx.fillRect(-20, -20, W + 40, H + 40);
    if (ready(map)) { var msc = map.naturalWidth / MAPW; ctx.drawImage(map, cam.x * msc, cam.y * msc, W * msc, H * msc, 0, 0, W, H); }
    ctx.save(); ctx.translate(-cam.x, -cam.y);
    ctx.save(); ctx.beginPath(); ctx.rect(0, cam.y - 10, 250, H + 20); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (var wi = 0; wi * 46 < MAPH; wi++) { var wy = 24 + wi * 46; if (wy < cam.y - 10 || wy > cam.y + H + 10) continue; var wo = (tm / 38 + wi * 41) % 300; ctx.beginPath(); ctx.moveTo(wo - 70, wy); ctx.quadraticCurveTo(wo - 52, wy - 6, wo - 34, wy); ctx.quadraticCurveTo(wo - 16, wy + 6, wo, wy); ctx.stroke(); }
    ctx.restore();
    drawFlow(tm);
    B.fires.forEach(function (f) { drawFireZone(f, tm); });
    B.frosts.forEach(function (f) { drawFrost(f, tm); });
    B.trails.forEach(function (tr) { iceSpikes(tr.ox, tr.oy, tr.ang, tr.len, tr.t + 0.12, tr.t > 0.6 ? Math.max(0, 1 - (tr.t - 0.6) / 0.4) : 1, tr.hit); });
    B.projs.forEach(function (pr) { if (pr.type === 'ice' && pr.from === 'guardian') iceSpikes(pr.ox, pr.oy, pr.ang, pr.d, 0, 1, false); });
    if (B.roar) { var rk = B.roar.t / 0.5; ctx.strokeStyle = 'rgba(255,255,255,' + (1 - rk).toFixed(2) + ')'; ctx.lineWidth = 8 * (1 - rk) + 2; ctx.beginPath(); ctx.arc(P.x, P.y, B.roar.r * (1 - rk * 0.85), 0, 6.283); ctx.stroke(); ctx.strokeStyle = 'rgba(242,185,69,' + (1 - rk).toFixed(2) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(P.x, P.y, B.roar.r * (1 - rk * 0.6) * 0.7, 0, 6.283); ctx.stroke(); }
    B.sites.forEach(function (s) { drawSite(s, tm); });
    B.sites.forEach(function (s) { if (s.ward > 0 && s.state === 'ok') drawWard(s, tm); });
    puffs.forEach(function (p) { var k = p.t / p.life; ctx.fillStyle = p.col + (0.55 * (1 - k)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + k * 1.6), 0, 6.283); ctx.fill(); });
    var drawList = [];
    B.thieves.forEach(function (th) { drawList.push({ y: th.y, f: function () { drawThief(th, tm); } }); });
    B.towers.forEach(function (tw) { drawList.push({ y: tw.y, f: function () { drawTower(tw, tm); } }); });
    drawList.push({ y: P.y, f: function () { drawGuardian(tm); } });
    drawList.sort(function (p1, p2) { return p1.y - p2.y; }); drawList.forEach(function (it) { it.f(); });
    B.projs.forEach(drawTool);
    petals.forEach(drawPetal);
    fx.forEach(function (f) {
      var k = f.t / 0.8, Rr = f.big ? 110 : 80; ctx.strokeStyle = f.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = 7 * (1 - k) + 1; ctx.beginPath(); ctx.arc(f.x, f.y, 18 + k * Rr, 0, 6.283); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * Rr * 0.6, 0, 6.283); ctx.stroke();
      for (var i2 = 0; i2 < (f.big ? 12 : 8); i2++) { var an3 = i2 * (6.283 / (f.big ? 12 : 8)) + 0.3, r2 = 14 + k * (Rr - 10); ctx.fillStyle = i2 % 2 ? '#F2B945' : '#FFF3B0'; ctx.beginPath(); ctx.arc(f.x + Math.cos(an3) * r2, f.y + Math.sin(an3) * r2, 6 * (1 - k) + 1.5, 0, 6.283); ctx.fill(); }
      ctx.globalAlpha = 1;
    });
    floats.forEach(function (f) {
      var k = f.t / 1.0; ctx.globalAlpha = Math.min(1, 2 * (1 - k)); ctx.font = "28px 'Jua',sans-serif"; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#FFFFFF';
      var sc = 1 + Math.max(0, 0.5 - k) * 1.2; ctx.save(); ctx.translate(f.x, f.y - k * 46); ctx.scale(sc, sc); ctx.strokeText(f.txt, 0, 0); ctx.fillStyle = f.col; ctx.fillText(f.txt, 0, 0); ctx.restore(); ctx.globalAlpha = 1;
    });
    ctx.restore();
    arrows(); minimap(map);
    ctx.restore();
    if (flash > 0) { ctx.globalAlpha = Math.min(0.4, flash); ctx.fillStyle = flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }
  function loop(tm) {
    var dt = Math.min(0.05, (tm - lastT) / 1000 || 0); lastT = tm;
    if (view === 'vRegion' && st && st.guardian && B) {
      if (phase === 'play') update(dt);
      followCam(dt);
      if (shake > 0) shake = Math.max(0, shake - dt); if (flash > 0) flash = Math.max(0, flash - dt * 1.4);
      af += dt * ((B.boost > 0) ? 2 : (moving ? 1.18 : 0.71)); charSound();
      fitT -= dt; if (fitT <= 0) { fitT = 0.5; fitCanvas(); }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').className = ''; }
      if (phase === 'play' || phase === 'quiz' || phase === 'pause') updBtns();
      draw(tm);
    }
    if (view === 'vDef' && df) { af += dt * 0.9; stepDef(dt); drawDef(tm); }
    requestAnimationFrame(loop);
  }

  /* ───────── 5. 쉼터와 카드 짝 맞추기 ───────── */
  function bestStars(key) { var rg = st.regions[String(curR)]; return (rg && rg.stars && rg.stars[key]) || 0; }
  function gameBox(title, desc, key, btnId, btnText) {
    return '<div class="game"><div class="jua" style="font-size:22px">' + title + '</div><div class="muted" style="font-size:14px;line-height:1.5">' + desc + '</div><div class="chip">최고 별 ' + bestStars(key) + ' / 3</div><button class="btn gold" id="' + btnId + '" style="margin-top:auto">' + (btnText || '하기') + '</button></div>';
  }
  function openBonus(mode) {
    restMode = mode === 'rest';
    bonusReg = (restMode || bonusFrom === 'region') ? curR : 0;
    var h = '';
    h += gameBox('틀린 문제 복습 도전', '내가 틀렸던 문제만 모아서 다시 풀어요. 틀린 문제가 없으면 새 문제가 나와요.', 'review', 'gReview');
    h += gameBox('시대 순서 퍼즐', '문화재 카드를 오래된 것부터 차례대로 눌러 놓아요.', 'order', 'gOrder');
    h += gameBox('유물 조각 맞추기', '쪼개진 문화재 그림의 조각을 눌러 자리를 바꿔 완성해요. 완성하면 설명이 나와요.', 'piece', 'gPiece');
    h += gameBox('카드 짝 맞추기', '짝이 맞는 카드를 찾아요. 처음에는 신수와 방위, 문화재를 지킬수록 문화재 카드가 늘어요.', 'card', 'gStart');
    h += gameBox('방어 게임', '도굴꾼이 길 네 개로 몰려와요. 눌러서 쫓아내고 60초 동안 문화재를 지켜요.', 'defense', 'gDef');
    $('gameList').innerHTML = h;
    $('gStart').onclick = startCard; $('gReview').onclick = startReview; $('gOrder').onclick = startOrder; $('gPiece').onclick = startPiece; $('gDef').onclick = startDef;
    $('bonusSub').textContent = (bonusReg ? rno(curR) + '지역 ' + region().name + ' 문화재로 만든 보너스 게임이에요. ' : '보너스 게임으로 별을 모아요. ') + '별은 게임마다 최고 기록을 넘긴 만큼만 늘어요.';
    $('bonusBack').disabled = false;
    $('bonusBack').onclick = backFromBonus;
    show('vBonus');
  }
  function backFromBonus() {
    if (restMode) { restMode = false; show('vRegion'); showLevels(); }
    else if (bonusFrom === 'region') { show('vRegion'); showLevels(); }
    else openWorld();
  }

  var deck = [], upIdx = [], matched = 0, mistakes = 0, busyCard = false;
  function startCard() {
    var pairs = C.cardPairs(D, st, null, bonusReg);
    deck = C.deckFromPairs(pairs); upIdx = []; matched = 0; mistakes = 0; busyCard = false;
    $('mcMsg').textContent = ''; $('mcMsg').className = 'msg';
    drawCards(); $('mcQuit').onclick = function () { openBonus(restMode ? 'rest' : 'free'); };
    show('vCard');
  }
  function drawCards() {
    var h = '';
    deck.forEach(function (c, i) { h += '<button class="cd' + (c.done ? ' done' : (c.up ? ' up' : '')) + '" data-i="' + i + '">' + (c.up || c.done ? c.t : '?') + '</button>'; });
    $('mcGrid').innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll('#mcGrid .cd'), function (b) { b.onclick = function () { flip(+b.getAttribute('data-i')); }; });
  }
  function flip(i) {
    if (busyCard || deck[i].up || deck[i].done) return;
    deck[i].up = true; upIdx.push(i); drawCards(); SasinAudio.sfx('flip');
    if (upIdx.length === 2) {
      var a = deck[upIdx[0]], b = deck[upIdx[1]];
      if (a.k === b.k) { SasinAudio.sfx('match'); a.done = b.done = true; a.up = b.up = false; upIdx = []; matched++; drawCards(); if (matched === 4) endCard(); }
      else { SasinAudio.sfx('miss'); mistakes++; busyCard = true; setTimeout(function () { a.up = b.up = false; upIdx = []; busyCard = false; drawCards(); }, 800); }
    }
  }
  function endCard() {
    var stars = C.starsFromMistakes(mistakes);
    var res = withTitles(function () { return C.applyBonusResult(D, st, curR, 'card', stars); });
    persist(); hud();
    $('ceTitle').textContent = '모두 맞혔어요!'; $('ceStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('ceText').innerHTML = '틀린 횟수 ' + mistakes + '번<br>별 기록 +' + res.starsGain + ' (최고 ' + res.best + '개)';
    $('ceText').innerHTML += titleNewsHtml();
    $('ceAgain').onclick = startCard;
    $('ceBack').onclick = function () { openBonus(restMode ? 'rest' : 'free'); };
    show('vCardEnd');
  }

  /* 쉼터의 보너스 게임이 끝났을 때(공통): 별 기록을 저장하고 결과 화면을 보여줘요 */
  function bonusEnd(key, stars, title, html, againFn) {
    if (window.SasinAudio) { SasinAudio.sfx(stars > 0 ? 'win' : 'lose'); }
    var res = withTitles(function () { return C.applyBonusResult(D, st, curR, key, stars); }); persist(); hud();
    $('ceTitle').textContent = title; $('ceStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('ceText').innerHTML = html + '<br>별 기록 +' + res.starsGain + ' (최고 ' + res.best + '개)';
    $('ceText').innerHTML += titleNewsHtml();
    $('ceAgain').onclick = againFn; $('ceBack').onclick = function () { openBonus(restMode ? 'rest' : 'free'); };
    show('vCardEnd'); return res;
  }
  function findSite(id) { var f = null; D.REGIONS.forEach(function (rg) { if (rg.sites) rg.sites.forEach(function (q) { if (q.id === id) f = q; }); }); return f; }

  /* ── 틀린 문제 복습 도전: 약한 문제부터 5문제. 맞힐 때까지 다시 고를 수 있고, 처음 고른 답만 기록해요. ── */
  var rv = null;
  function startReview() {
    var pick = C.reviewPick(D, st, 5, null, bonusReg);
    rv = { items: pick.items, i: 0, firstOk: 0, weak: pick.weakCount, tries: 0, done: false, order: [0, 1, 2] };
    $('rvSub').textContent = pick.weakCount > 0 ? '틀렸던 문제 ' + pick.weakCount + '개를 다시 풀어 봐요!' : '틀렸던 문제가 아직 없어요. 새 문제로 도전해요!';
    $('rvQuit').onclick = function () { openBonus(restMode ? 'rest' : 'free'); };
    showReviewQ(); show('vReview');
  }
  function showReviewQ() {
    var it = rv.items[rv.i], site = findSite(it.siteId), q = site.qs[it.qi], h = '';
    rv.tries = 0; rv.done = false; rv.order = C.shuffle([0, 1, 2]);
    $('rvSite').textContent = (rv.i + 1) + ' / ' + rv.items.length + ' · ' + site.name;
    $('rvQ').innerHTML = emph(q.q);
    rv.order.forEach(function (oi, k) { h += '<button class="opt" data-o="' + oi + '"><i>' + 'ABC'.charAt(k) + '</i>' + q.opts[oi] + '</button>'; });
    $('rvOpts').innerHTML = h; $('rvMsg').textContent = ''; $('rvNext').style.display = 'none'; $('rvHint').style.display = '';
    Array.prototype.forEach.call(document.querySelectorAll('#rvOpts .opt'), function (b) { b.onclick = function () { reviewAnswer(+b.getAttribute('data-o'), b); }; });
    $('rvHint').onclick = function () { $('rvMsg').textContent = '힌트: ' + q.hint; };
    $('rvNext').onclick = reviewNext;
  }
  function reviewAnswer(o, btn) {
    if (!rv || rv.done) return;
    var it = rv.items[rv.i], site = findSite(it.siteId), q = site.qs[it.qi], ok = o === q.ans;
    if (rv.tries === 0) { C.recordAnswer(st, site.id, it.qi, ok, site.qs.length); persist(); if (ok) rv.firstOk++; }
    rv.tries++;
    SasinAudio.sfx(ok ? 'right' : 'wrong');
    if (ok) {
      rv.done = true; if (btn) btn.className = 'opt good'; $('rvMsg').textContent = '맞았어요! ' + q.fb; $('rvNext').style.display = ''; $('rvNext').textContent = rv.i + 1 >= rv.items.length ? '결과 보기' : '다음 문제'; $('rvHint').style.display = 'none';
    } else {
      if (btn) btn.className = 'opt bad'; $('rvMsg').textContent = rv.tries >= 2 ? '아쉬워요. 힌트: ' + q.hint : '다시 생각해 봐요. 다른 답을 눌러도 돼요.';
    }
  }
  function reviewNext() {
    if (!rv || !rv.done) return;
    rv.i++;
    if (rv.i >= rv.items.length) {
      var stars = C.starsFromReview(rv.firstOk, rv.items.length);
      bonusEnd('review', stars, '복습을 마쳤어요!', '처음에 맞힌 문제 ' + rv.firstOk + ' / ' + rv.items.length + '개<br>' + (rv.firstOk >= rv.items.length ? '하나도 안 틀렸어요! 대단해요!' : '틀린 문제는 다음에 또 나와요.'), startReview);
    } else showReviewQ();
  }

  /* ── 시대 순서 퍼즐: 오래된 것부터 차례대로 누르면 칸에 들어가요. 틀리면 흔들려요. 두 번 틀리면 몇 세기인지 알려줘요. ── */
  var od = null;
  function featureOf(q) { var t = (q.tags || []).filter(function (x) { return x.indexOf('특징') === 0; })[0]; return t ? t.replace(/^특징\s*/, '') : q.short; }
  function startOrder() {
    var items = C.orderPick(D, 4, null, bonusReg);
    od = { cards: items, truth: C.orderCorrect(items), placed: [], used: items.map(function () { return false; }), mistakes: 0, streak: 0 };
    $('odMsg').textContent = ''; $('odMsg').className = 'msg';
    $('odQuit').onclick = function () { openBonus(restMode ? 'rest' : 'free'); };
    drawOrder(); show('vOrder');
  }
  function drawOrder() {
    var h = '', i;
    for (i = 0; i < od.cards.length; i++) {
      var p = od.placed[i];
      h += '<div class="odslot' + (p ? ' fill' : '') + '"><b>' + (i + 1) + '</b>' + (p ? '<div class="jua" style="font-size:17px">' + p.name + '</div>' + (od.done ? '<div class="yr">' + p.yrText + '</div>' : '') : '') + '</div>';
    }
    $('odSlots').innerHTML = h; h = '';
    od.cards.forEach(function (q, k) {
      h += '<button class="odcard' + (od.used[k] ? ' used' : '') + '" data-i="' + k + '"><div class="art">' + (D.ILLUSTRATIONS[q.ill] || '') + '</div><div class="nm">' + q.name + '</div><div>' + featureOf(q) + '</div><div class="cent">' + (od.streak >= 2 ? (q.yrHint || (Math.floor((q.yr - 1) / 100 + 1) + '세기')) : '') + '</div></button>';
    });
    $('odCards').innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll('#odCards .odcard'), function (b) { b.onclick = function () { orderTap(+b.getAttribute('data-i'), b); }; });
  }
  function orderTap(i, btn) {
    if (!od || od.done || od.used[i]) return;
    var card = od.cards[i], next = od.truth[od.placed.length];
    if (card === next) {
      SasinAudio.sfx('place'); od.used[i] = true; od.placed.push(card); od.streak = 0; $('odMsg').className = 'msg'; $('odMsg').textContent = '맞아요! ' + (od.placed.length < od.cards.length ? '다음으로 오래된 것은?' : '');
      if (od.placed.length === od.cards.length) { od.done = true; drawOrder(); endOrder(); return; }
      drawOrder();
    } else {
      SasinAudio.sfx('wrong'); od.mistakes++; od.streak++; $('odMsg').className = 'msg err'; $('odMsg').textContent = od.streak >= 2 ? '아직이에요. 카드에 몇 세기인지 알려 줄게요!' : '아직이에요. 다른 카드를 눌러 봐요.';
      if (btn) { btn.className = 'odcard shake'; setTimeout(function () { if (od) drawOrder(); }, 380); } else drawOrder();
    }
  }
  function endOrder() {
    var stars = C.starsFromOrder(od.mistakes), rows = '';
    od.placed.forEach(function (q) { rows += '<div style="text-align:left;margin:2px 0">· <b>' + q.name + '</b> ' + q.yrText + ' : ' + q.yrNote + '</div>'; });
    bonusEnd('order', stars, '순서를 모두 맞혔어요!', '틀린 횟수 ' + od.mistakes + '번<br>' + rows, startOrder);
  }

  /* ── 유물 조각 맞추기: 문화재 그림(두루마리)을 4x3, 12조각으로 나눠 섞어요. 두 조각을 차례로 누르면 자리가 바뀌고, 제자리에 놓인 조각은 초록 테두리로 잠겨요. ── */
  var pz = null;
  function startPiece() {
    var site = C.puzzlePickSite(D, st, null, bonusReg);
    pz = { site: site, perm: C.shufflePieces(C.PIECES), sel: -1, moves: 0, done: false, peek: false };
    $('pzMsg').textContent = ''; $('pzPeek').className = 'pzpeek';
    $('pzSub').textContent = site.name + ' 그림이 조각났어요. 조각 두 개를 차례로 눌러 자리를 바꿔요.';
    $('pzPeek').style.backgroundImage = 'url(' + sitePic(site.id) + ')';
    $('pzQuit').onclick = function () { openBonus(restMode ? 'rest' : 'free'); };
    $('pzHint').onclick = peekPiece;
    drawPiece(); show('vPiece');
  }
  function drawPiece() {
    var h = '', i, url = sitePic(pz.site.id);
    for (i = 0; i < C.PIECES; i++) {
      var id = pz.perm[i], col = id % 4, row = Math.floor(id / 4), ok = id === i;
      h += '<button class="pzp' + (ok ? ' ok' : '') + (pz.sel === i ? ' sel' : '') + '" data-i="' + i + '" style="background-image:url(' + url + ');background-size:400% 300%;background-position:' + (col * 100 / 3) + '% ' + (row * 50) + '%"></button>';
    }
    $('pzGrid').innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll('#pzGrid .pzp'), function (b) { b.onclick = function () { pieceTap(+b.getAttribute('data-i')); }; });
  }
  function pieceTap(i) {
    if (!pz || pz.done || pz.perm[i] === i) return;
    if (pz.sel < 0) { pz.sel = i; drawPiece(); return; }
    if (pz.sel === i) { pz.sel = -1; drawPiece(); return; }
    pz.perm = C.swapPieces(pz.perm, pz.sel, i); pz.moves++; pz.sel = -1; SasinAudio.sfx('place');
    var fixed = pz.perm.filter(function (v, k) { return v === k; }).length;
    $('pzMsg').textContent = '바꾼 횟수 ' + pz.moves + '번 · 맞춘 조각 ' + fixed + ' / ' + C.PIECES;
    drawPiece();
    if (C.piecesSolved(pz.perm)) { pz.done = true; endPiece(); }
  }
  function peekPiece() {
    if (!pz || pz.done || pz.peek) return;
    pz.peek = true; pz.moves++; $('pzPeek').className = 'pzpeek on'; $('pzMsg').textContent = '그림을 잠깐 보여 줄게요! (바꾼 횟수 ' + pz.moves + '번으로 쳐요)';
    setTimeout(function () { if (pz) { pz.peek = false; $('pzPeek').className = 'pzpeek'; } }, 1500);
  }
  function endPiece() {
    var site = pz.site, stars = C.starsFromPuzzle(pz.moves, C.PIECES);
    bonusEnd('piece', stars, '그림을 완성했어요!', '<img src="' + sitePic(site.id) + '" style="width:100%;max-width:380px;border-radius:12px;display:block;margin:4px auto"><b>' + site.name + '</b> · ' + site.short + '<br><span style="font-size:15px">' + site.exp + '</span><br>바꾼 횟수 ' + pz.moves + '번', startPiece);
  }

  /* ── 방어 게임: 도굴꾼이 길 네 개로 문화재를 향해 걸어와요. 눌러서 쫓아내요(두목은 3번). 붉은 선을 넘으면 문화재를 빼앗겨요(3번이면 끝). 60초를 버티면 이겨요. ── */
  var df = null;
  var DEF_PROJ = { pearl: '#6FC3FF', axe: '#C9D2DC', fire: '#FF8A2A', ice: '#BFE8FF' };
  function startDef() {
    df = { s: C.defNew(), run: false, fx: [], proj: [], flash: 0, atk: 0, ended: false, site: C.puzzlePickSite(D, st, null, bonusReg) };
    var cvd = $('cvDef'); df.cv = cvd; df.cx = cvd.getContext ? cvd.getContext('2d') : null;
    $('dfStart').style.display = ''; $('dfSub').textContent = '도굴꾼을 눌러서 쫓아내요! 오른쪽 문화재 앞의 붉은 선을 넘으면 문화재를 빼앗겨요.';
    $('dfGo').onclick = function () { $('dfStart').style.display = 'none'; df.run = true; };
    $('dfQuit').onclick = function () { df = null; openBonus(restMode ? 'rest' : 'free'); };
    cvd.onpointerdown = function (e) {
      if (!df) return; var rc = cvd.getBoundingClientRect(); e.preventDefault();
      defTapXY((e.clientX - rc.left) * C.DEF.W / rc.width, (e.clientY - rc.top) * C.DEF.H / rc.height);
    };
    defHud(); show('vDef');
  }
  function defTapXY(x, y) {
    if (!df || !df.run || df.s.over) return { hit: false };
    SasinAudio.sfx('throw_' + st.guardian);
    var res = C.defTap(df.s, x, y), wt = D.WEAPONS[st.guardian] ? D.WEAPONS[st.guardian].type : 'pearl';
    if (res.hit) {
      df.atk = THROW_TOTAL; df.proj.push({ x0: C.DEF.gate + 60, y0: 218, x1: res.th.x, y1: C.defY(res.th), t: 0, col: DEF_PROJ[wt] || '#fff' });
      df.fx.push({ x: res.th.x, y: C.defY(res.th) - 40, t: 0, txt: res.dead ? '쫓아냈어요!' : '으악!', col: res.dead ? '#2F8F83' : '#E8654A' });
    } else { df.atk = THROW_TOTAL; df.fx.push({ x: x, y: y, t: 0, txt: '', col: '#fff', miss: true }); }
    return res;
  }
  function defHud() {
    var s = df.s; $('dfLives').textContent = '문화재 ' + '♥'.repeat(s.lives) + '♡'.repeat(3 - s.lives);
    $('dfTime').textContent = '남은 시간 ' + Math.max(0, Math.ceil(C.DEF.duration - s.t)) + '초'; $('dfScore').textContent = '쫓아낸 도굴꾼 ' + s.score;
  }
  function stepDef(dt) {
    if (!df || !df.run) return;
    var ev = C.defStep(df.s, dt);
    ev.forEach(function (e) { if (e.t === 'steal') { df.flash = 0.5; df.fx.push({ x: C.DEF.gate, y: C.defY(e.th) - 30, t: 0, txt: '앗! 빼앗겼어요', col: '#E8433B' }); } });
    df.proj.forEach(function (p) { p.t += dt; }); df.proj = df.proj.filter(function (p) { return p.t < 0.16; });
    df.fx.forEach(function (f) { f.t += dt; }); df.fx = df.fx.filter(function (f) { return f.t < 0.9; });
    if (df.flash > 0) df.flash -= dt; if (df.atk > 0) df.atk -= dt;
    defHud();
    if (df.s.over && !df.ended) { df.ended = true; df.run = false; endDef(); }
  }
  function endDef() {
    var s = df.s, stars = C.starsFromDefense(s.lives, s.win);
    if (s.win) bonusEnd('defense', stars, '문화재를 지켜 냈어요!', '쫓아낸 도굴꾼 ' + s.score + '명<br>빼앗긴 횟수 ' + s.steals + '번', startDef);
    else bonusEnd('defense', 0, '문화재를 빼앗겼어요...', '쫓아낸 도굴꾼 ' + s.score + '명<br>이번에는 ' + Math.floor(s.t) + '초를 버텼어요. 다시 도전해 봐요!', startDef);
  }
  function drawDef(tm) {
    if (!df || !df.cx) return;
    var keep = ctx; ctx = df.cx; var s = df.s, i, W_ = C.DEF.W, H_ = C.DEF.H;
    ctx.clearRect(0, 0, W_, H_); ctx.fillStyle = '#E7D2A0'; ctx.fillRect(0, 0, W_, H_);
    C.DEF.lanes.forEach(function (ly) {
      ctx.fillStyle = 'rgba(160,120,70,.28)'; ctx.fillRect(0, ly - 36, W_, 72);
      ctx.strokeStyle = 'rgba(120,85,45,.45)'; ctx.lineWidth = 2; ctx.setLineDash([14, 12]); ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(C.DEF.gate, ly); ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.fillStyle = 'rgba(70,120,60,.55)'; for (i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(8, 36 + i * 66, 26, 0, 6.283); ctx.fill(); }
    ctx.strokeStyle = df.flash > 0 ? '#FF3B2F' : 'rgba(232,67,59,.85)'; ctx.lineWidth = df.flash > 0 ? 7 : 4; ctx.setLineDash([12, 9]); ctx.beginPath(); ctx.moveTo(C.DEF.gate, 30); ctx.lineTo(C.DEF.gate, 372); ctx.stroke(); ctx.setLineDash([]);
    var rimg = loadImg(sitePic(df.site.id)), g_ = st.guardian ? guardian() : null;
    if (ready(rimg)) { var rw = 134, rh = rw * (rimg.naturalHeight || rimg.naturalWidth) / rimg.naturalWidth; ctx.save(); if (df.flash > 0) { ctx.shadowColor = '#FF3B2F'; ctx.shadowBlur = 24; } ctx.drawImage(rimg, C.DEF.gate + 18, 152 - rh, rw, rh); ctx.restore(); }
    if (g_) {   // 문화재 옆에 서서 도굴꾼(왼쪽)을 바라보는, 전투 때와 같은 움직이는 신수 그림. 도굴꾼을 누르면 던지는 몸짓을 해요.
      var gp = df.atk > 0 ? poseAt(THROW_TOTAL - df.atk, -1) : { rot: 0, shift: 0, sx: 1, sy: 1 }, mv0 = moving; moving = false;
      sprite(st.guardian, C.DEF.gate + 85, 268, g_.sprite.dh * 1.15, -1, gp.sx, gp.sy, 1, gp.rot, gp.shift); moving = mv0;
    }
    s.thieves.slice().sort(function (a, b) { return a.lane - b.lane; }).forEach(function (th) {
      var im = loadImg(D.THIEVES[th.type === 'boss' ? 4 : (th.type === 'fast' ? 2 : 0)].img), sc = th.type === 'boss' ? 1.45 : 1, cy = C.defY(th), bob = Math.sin(tm / 110 + th.id) * 2.5;
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(th.x, cy + 30, 24 * sc, 7, 0, 0, 6.283); ctx.fill();
      if (ready(im)) { ctx.save(); if (th.hitT > 0) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(tm / 30); ctx.drawImage(im, th.x - 30 * sc, cy + 30 - 72 * sc + bob, 60 * sc, 72 * sc); ctx.restore(); }
      if (th.type === 'fast') { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(th.x - 48, cy - 6); ctx.lineTo(th.x - 30, cy - 6); ctx.moveTo(th.x - 52, cy + 6); ctx.lineTo(th.x - 32, cy + 6); ctx.stroke(); }
      if (th.max > 1) { ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(th.x - 24, cy - 56, 48, 7); ctx.fillStyle = '#E8433B'; ctx.fillRect(th.x - 24, cy - 56, 48 * th.hp / th.max, 7); }
    });
    df.proj.forEach(function (p) { var k = Math.min(1, p.t / 0.14), px = p.x0 + (p.x1 - p.x0) * k, py = p.y0 + (p.y1 - p.y0) * k; ctx.fillStyle = p.col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 11, 0, 6.283); ctx.fill(); ctx.stroke(); });
    df.fx.forEach(function (f) {
      var k = f.t / 0.9; ctx.globalAlpha = Math.max(0, 1 - k);
      if (f.miss) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 22, 0, 6.283); ctx.stroke(); }
      else { ctx.font = "700 22px 'Jua',sans-serif"; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.strokeText(f.txt, f.x, f.y - k * 30); ctx.fillStyle = f.col; ctx.fillText(f.txt, f.x, f.y - k * 30); }
      ctx.globalAlpha = 1;
    });
    ctx = keep;
  }
  /* ───────── 6. 도감 ───────── */
  function openDogam() {
    var h = '', n = 0, total = 0;
    D.REGIONS.forEach(function (R) {
      if (!R.sites) return;
      R.sites.forEach(function (q) {
        total++;
        if (st.dogam[q.id]) {
          n++;
          h += '<div class="dgc t' + C.regionTier(D, C.regionStarSum(st, R.id)) + '"><div class="art">' + D.ILLUSTRATIONS[q.ill] + '</div><div class="in"><div class="jua" style="font-size:18px">' + q.name + '</div><div class="muted">' + q.short + '</div><div style="margin-top:4px;font-size:13px">' + q.exp + '</div></div></div>';
        } else h += '<div class="dgc lockd"><div class="art">🔒</div><div class="in"><div class="jua" style="font-size:18px">' + q.name + '</div><div class="muted">아직 보호하지 못했어요</div></div></div>';
      });
    });
    $('dgGrid').innerHTML = h;
    var tot = C.totalStars(st), gt = C.globalTier(D, tot), gl = D.TITLES.global, earned = [];
    D.REGIONS.forEach(function (R) { var t = C.regionTier(D, C.regionStarSum(st, R.id)); if (t) earned.push(D.TITLES.region[R.id][t - 1]); });
    $('dogamTitle') && $('dogamTitle').parentNode.removeChild($('dogamTitle'));
    var tb = document.createElement('div'); tb.id = 'dogamTitle'; tb.className = 'titleline';
    tb.innerHTML = '★ 별 합계 <b>' + tot + '</b> · 전체 칭호: <b>' + globalTitleName() + '</b>' + (gt < gl.length ? ' · 다음 칭호까지 ★ ' + (gl[gt].min - tot) : ' · 최고 칭호예요!') + (earned.length ? '<br>지역 칭호: ' + earned.join(' · ') : '<br>지역 칭호는 한 지역에서 별 10개를 모으면 열려요.') + '<br><span class="muted" style="font-size:12.5px">카드 테두리: 지역 칭호가 열릴수록 동색 → 은색 → 금색으로 바뀌어요.</span>';
    $('dogamSub').parentNode.insertBefore(tb, $('dogamSub').nextSibling);
    $('dogamSub').textContent = '지킨 문화재 ' + n + ' / ' + total + (D.REGIONS.every(function (R) { return R.ready; }) ? '' : ' (준비 중인 지역의 문화재는 아직 없어요)');
    $('dogamBack').onclick = function () { openWorld(); };
    show('vDogam');
  }

  /* ───────── 시작 ───────── */
  /* ───────── 시작 화면과 프롤로그(그림책) ───────── */
  var introI = 0, introTm = [], introSteps = [], introReady = false, INTRO_KEY = 'sasin_intro_seen', forceIntro = false;
  function introSeen() { try { return localStorage.getItem(INTRO_KEY) === '1'; } catch (e) { return false; } }
  function introMark() { try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) {} }
  function gCard(id, fit) { return '<img src="' + D.GUARDIANS[id].card + '" alt="' + D.GUARDIANS[id].name + '"' + (fit ? ' style="object-position:' + (D.GUARDIANS[id].cardPos || '50% 50%') + '"' : '') + '>'; }
  var IN_CUTS = [null, null, null,
    function () {   // 컷 4: 신수들의 각성
      var L = [['cr', '청룡', '동쪽 바람이 불어오네. 내가 제일 먼저 달려갈게!'], ['bh', '백호', '우리 문화재를 건드리면 안 돼. 내 힘으로 막아 줄게!'], ['jj', '주작', '하늘에서 보니 위험한 곳이 많아. 내가 날아가 볼게!'], ['hm', '현무', '서두르지 마. 든든하게 버티며 하나씩 지켜 내자.']];
      var h = '<div class="ic4-row">', st = [[200, 'sfx', 'awaken']];
      L.forEach(function (x, k) { h += '<div class="ic4-col sleep">' + gCard(x[0], true) + '<div class="bub" data-l="' + k + '"><b>' + x[1] + '</b> ' + x[2] + '</div></div>'; st.push([900 + k * 1500, 'wake', k], [900 + k * 1500, 'show', k], [900 + k * 1500, 'sfx', 'star', k]); });
      st.push([7200, 'show', 4], [7300, 'sfx', 'hit']);
      h += '</div><div class="ic4-t"><img src="' + D.THIEVES[2].img + '" alt=""><div class="bub r" data-l="4">“으악, 벽화가 움직인다! 일단 도망쳐!”</div></div>';
      return { steps: st, html: h };
    },
    function () {   // 컷 5: 출발
      var dots = '', st = [[300, 'sfx', 'gong']];
      D.REGIONS.forEach(function (r, k) { dots += '<i class="ic5-dot" style="left:' + (r.pin[0] / 5) + '%;top:' + (r.pin[1] / 7.5) + '%"></i>'; st.push([800 + k * 350, 'dot', k]); });
      st.push([3600, 'show', 0], [3600, 'sfx', 'title'], [4600, 'show', 1]);
      return { steps: st, html: '<div class="ic5-map"><img src="' + WORLD_IMG + '" alt="한반도 지도">' + dots + '</div><div class="ic5-txt"><div class="t1 isee0" data-l="0"><h2>사신 수호대:</h2><h2>문화재를 지켜라</h2><div class="muted">Four Guardians: Protect Our Heritage</div></div><div class="cap2" data-l="1">도굴꾼들은 한반도 곳곳으로 흩어졌어요.<br><b>사신 수호대, 출동!</b></div></div>' };
    }
  ];
  /* 프롤로그 동영상(무덤 → 신수의 눈이 빛남 → 도굴꾼 도망 → 한반도).
   * 폴더(깃허브) 버전은 video/prologue.mp4 를 <video> 로 틀고,
   * 한 파일 미리보기처럼 <video> 가 막히는 환경에서는 같은 영상을 '그림 여러 장 + 소리'로 틀어요(js 파일 SASIN_PRO).
   * 둘 다 안 되면 예전 컷 대신 바로 신수 소개로 넘어가요. */
  var PRO_SRC = 'video/prologue.mp4', PRO = window.SASIN_PRO || null, proEl = null, proBlob = null, proFail = false, proMode = '', proImgs = [], proBuf = null, proAudioTried = false, proRaf = 0;
  var introList = [], introK = 0, introBusy = false, proTriedData = false;
  function proSrc() {
    if (!PRO_SRC || PRO_SRC.indexOf('data:') !== 0) return PRO_SRC;
    if (!proBlob) {
      try { var p = PRO_SRC.split(','), bin = atob(p[1]), n = bin.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i); proBlob = URL.createObjectURL(new Blob([u], { type: 'video/mp4' })); } catch (e) { proBlob = PRO_SRC; }
    }
    return proBlob;
  }
  function proError() {
    if (proMode === 'video' && !proTriedData && PRO_SRC.indexOf('data:') === 0 && proEl && proEl.src !== PRO_SRC) { proTriedData = true; try { proEl.src = PRO_SRC; proEl.load(); if (introList[introK] === 'v' && view === 'vIntro') { try { proEl.play(); } catch (e) {} } return; } catch (e) {} }
    proFail = true; if (view === 'vIntro' && introList[introK] === 'v') skipVideo();
  }
  function preloadPro() {
    if (/[?&]novideo/.test(location.search)) { proFail = true; return; }
    if (PRO && PRO.frames && PRO.frames.length) {       // 그림 여러 장 방식
      proMode = 'frames'; proImgs = PRO.frames.map(function (u) { var im = new Image(); im.decoding = 'async'; im.src = u; return im; }); return;
    }
    if (!PRO_SRC) { proFail = true; return; }
    try {
      proMode = 'video'; proEl = document.createElement('video'); proEl.setAttribute('playsinline', ''); proEl.setAttribute('webkit-playsinline', ''); proEl.preload = 'auto'; proEl.className = 'pv';
      proEl.onerror = proError; proEl.src = proSrc(); proEl.load();
    } catch (e) { proFail = true; }
  }
  function proStop() {
    if (proRaf) { cancelAnimationFrame(proRaf); proRaf = 0; }
    if (window.SasinAudio) SasinAudio.clipStop();
    if (proEl) { try { proEl.pause(); } catch (e) {} proEl.onended = null; proEl.onplaying = null; proEl.onwaiting = null; }
  }
  function introClear() { introTm.forEach(clearTimeout); introTm = []; }
  function doStep(s) {
    var stage = $('introStage'), A = window.SasinAudio, el;
    if (s[1] === 'show') { el = stage.querySelector('[data-l="' + s[2] + '"]'); if (el) el.classList.add('isee'); }
    else if (s[1] === 'sfx') { if (A) A.sfx(s[2], s[3]); }
    else if (s[1] === 'wake') { el = stage.querySelectorAll('.ic4-col')[s[2]]; if (el) el.classList.remove('sleep'); }
    else if (s[1] === 'dot') { el = stage.querySelectorAll('.ic5-dot')[s[2]]; if (el) el.classList.add('on'); }
  }
  function introFinish() {
    introClear(); introSteps.forEach(function (s) { if (!s.done && s[1] !== 'sfx') { doStep(s); s.done = 1; } });
    var stage = $('introStage'); Array.prototype.forEach.call(stage.querySelectorAll('.sleep'), function (e) { if (introList[introK] === 3) e.classList.remove('sleep'); });
    introReady = true; $('introNext').classList.add('pulse');
  }
  function introFade(fn) {      // 화면을 부드럽게 어두워졌다가 다음 장면이 밝아져요
    var s = $('introStage'); introBusy = true; s.style.transition = 'opacity .55s'; s.style.opacity = '0';
    introTm.push(setTimeout(function () { introBusy = false; fn(); s.style.opacity = '1'; }, 600));
  }
  function skipVideo() {        // 영상을 못 틀 때는 예전 컷이 아니라 바로 '신수들의 이야기'로
    proStop(); introList = [3, 4]; var dots = ''; for (var k = 0; k < introList.length; k++) dots += '<i class="idot"></i>'; $('introDots').innerHTML = dots; showCut(0);
  }
  function showFramesCut() {
    var stage = $('introStage'), A = window.SasinAudio, n = PRO.frames.length, fps = PRO.fps || 12;
    stage.className = 'icv'; stage.innerHTML = '<canvas id="proCv" class="pv" width="' + (PRO.w || 640) + '" height="' + (PRO.h || 360) + '"></canvas><div class="pv-load">동영상을 불러오고 있어요…</div>';
    var cv = $('proCv'), cx = cv.getContext('2d'), t0 = 0, started = false, waited = 0, audioReady = !A || proAudioTried;
    function imgsReady() { for (var i = 0; i < Math.min(n, 8); i++) { var im = proImgs[i]; if (!(im.complete && im.naturalWidth)) return false; } return true; }
    if (A && !proAudioTried) {      // 소리를 풀어 둬요(처음 한 번만)
      proAudioTried = true; A.unlock(); A.clipPrepare(PRO.audio, function (buf) { proBuf = buf; audioReady = true; });
    }
    function tick() {
      if (introList[introK] !== 'v' || view !== 'vIntro') { proRaf = 0; return; }
      if (!started) {
        waited += 16;
        if ((imgsReady() && audioReady) || waited > 4000) { started = true; t0 = performance.now(); var l = stage.querySelector('.pv-load'); if (l) l.style.display = 'none'; if (A) A.clipPlay(proBuf); }
        else { proRaf = requestAnimationFrame(tick); return; }
      }
      var el = performance.now() - t0, i = Math.min(n - 1, Math.floor(el / 1000 * fps)), im = proImgs[i];
      if (im && im.complete && im.naturalWidth) cx.drawImage(im, 0, 0, cv.width, cv.height);
      if (el >= n / fps * 1000) { proRaf = 0; goNextCut(); return; }
      proRaf = requestAnimationFrame(tick);
    }
    proRaf = requestAnimationFrame(tick);
    $('introNext').textContent = '영상 넘기기 ▶'; introReady = false;
  }
  function showVideoCut() {
    var stage = $('introStage'), A = window.SasinAudio, v = proEl;
    if (proFail) { skipVideo(); return; }
    if (proMode === 'frames') { showFramesCut(); return; }
    stage.className = 'icv'; stage.innerHTML = '<div class="pv-load">동영상을 불러오고 있어요…</div>';
    if (!v) { skipVideo(); return; }
    v.currentTime = 0; v.muted = !!(A && A.mode() === 'off'); v.volume = 0.85; stage.insertBefore(v, stage.firstChild);
    v.onplaying = function () { var l = stage.querySelector('.pv-load'); if (l) l.style.display = 'none'; var b = stage.querySelector('.pv-play'); if (b) b.parentNode.removeChild(b); };
    v.onwaiting = function () { var l = stage.querySelector('.pv-load'); if (l) l.style.display = ''; };
    v.onended = function () { if (introList[introK] === 'v') goNextCut(); };
    var pr = null; try { pr = v.play(); } catch (e) {}
    if (pr && pr.catch) pr.catch(function (err) {     // 브라우저가 자동 재생을 막으면 눌러서 재생해요
      if ((err && err.name === 'NotSupportedError') || v.error) { proError(); return; }
      if (proFail) return; var bt = document.createElement('button'); bt.className = 'btn gold pv-play'; bt.textContent = '▶ 눌러서 영상 보기';
      bt.onclick = function (e) { e.stopPropagation(); try { v.play(); } catch (er) {} }; stage.appendChild(bt);
    });
    $('introNext').textContent = '영상 넘기기 ▶'; introReady = false;
  }
  function showCut(k) {
    introClear(); introK = k; introI = k; introReady = false; $('introNext').classList.remove('pulse');
    Array.prototype.forEach.call(document.querySelectorAll('#introDots .idot'), function (d, j) { d.className = 'idot' + (j === k ? ' on' : j < k ? ' past' : ''); });
    var ci = introList[k], A = window.SasinAudio, stage = $('introStage');
    stage.style.transition = 'none';
    if (ci === 'v') { showVideoCut(); return; }
    var c = IN_CUTS[ci](); stage.className = 'ic' + (ci + 1); stage.innerHTML = c.html;
    $('introNext').textContent = k === introList.length - 1 ? '게임 시작 ▶' : '다음 ▶';
    introSteps = c.steps; var last = 0;
    introSteps.forEach(function (s) { last = Math.max(last, s[0]); introTm.push(setTimeout(function () { doStep(s); s.done = 1; }, s[0])); });
    introTm.push(setTimeout(function () { introReady = true; $('introNext').classList.add('pulse'); }, last + 1200));
    if (A && (ci === 3 || ci === 4)) A.track('title');
  }
  function goNextCut() {
    if (introBusy) return;
    if (introK < introList.length - 1) { proStop(); introFade(function () { showCut(introK + 1); }); } else introEnd();
  }
  function introNext() {
    if (introBusy) return;
    if (introList[introK] === 'v') { goNextCut(); return; }     // 영상 넘기기
    if (!introReady) { introFinish(); return; }
    goNextCut();
  }
  function introEnd() { introClear(); proStop(); introMark(); introBusy = false; var s = $('introStage'); s.style.opacity = '1'; if (window.SasinAudio) { SasinAudio.sfx('click'); SasinAudio.track('title'); } show('vLogin'); }
  function startIntro() {
    var A = window.SasinAudio; if (A) A.stop();
    introList = proFail ? [3, 4] : ['v', 3, 4];
    var dots = ''; for (var k = 0; k < introList.length; k++) dots += '<i class="idot"></i>'; $('introDots').innerHTML = dots;
    introBusy = false; $('introStage').style.opacity = '1'; show('vIntro'); showCut(0);
  }
  function initSplash() {
    var f = ''; ['cr', 'bh', 'jj', 'hm'].forEach(function (id, k) { f += '<img class="spf" style="animation-delay:' + (k * 0.45) + 's;border-color:' + D.GUARDIANS[id].color + '" src="' + D.GUARDIANS[id].face + '" alt="' + D.GUARDIANS[id].name + '">'; });
    $('spFaces').innerHTML = f;
    forceIntro = /[?&]intro/.test(location.search);
    function go() {
      if (view !== 'vSplash') return; var A = window.SasinAudio;
      if (A) { A.unlock(); A.sfx('gong'); A.track('title'); }
      goFullscreen();
      startIntro();      // 시작 화면 → 프롤로그 → 로그인 (프롤로그는 언제든 '건너뛰기' 가능)
    }
    var infoOpen = false;
    function setInfo(on) { infoOpen = on; $('infoModal').style.display = on ? 'flex' : 'none'; if (on) { try { $('infoClose').focus(); } catch (e) {} } }
    $('btnInfo').onclick = function (e) { e.stopPropagation(); setInfo(true); };
    $('btnInfo2').onclick = function (e) { e.stopPropagation(); setInfo(true); };
    $('infoClose').onclick = function (e) { e.stopPropagation(); setInfo(false); };
    $('infoModal').onclick = function (e) { if (e.target === $('infoModal')) setInfo(false); };
    $('vSplash').onclick = function (e) { if (infoOpen || (e.target.closest && (e.target.closest('.sndbtn') || e.target.closest('.infobtn')))) return; go(); };
    document.addEventListener('keydown', function (e) {
      if (infoOpen) { if (e.key === 'Escape') setInfo(false); return; }
      if (view === 'vSplash' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(); }
      else if (view === 'vIntro') { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); introNext(); } else if (e.key === 'Escape') introEnd(); }
    });
    $('introStage').onclick = introNext; $('introNext').onclick = introNext; $('introSkip').onclick = introEnd;
    $('btnIntro').onclick = startIntro;
  }
  function initSound() {
    var A = window.SasinAudio; if (!A) return;
    var btns = function () { return document.querySelectorAll('.sndbtn,#hbSound'); };
    function upd() { var t = A.label(); Array.prototype.forEach.call(btns(), function (b) { b.textContent = t; b.setAttribute('aria-label', '소리 설정: ' + t); }); }
    Array.prototype.forEach.call(btns(), function (b) { b.onclick = function (e) { e.stopPropagation(); A.cycle(); }; });
    A.onChange(upd); upd(); A.onChange(function (m) { if (proEl) proEl.muted = (m === 'off'); });
    document.addEventListener('click', function (e) {   // 버튼을 누를 때 나는 소리
      var b = e.target.closest ? e.target.closest('button') : null; if (!b || b.disabled) return;
      if (b.classList.contains('infobtn') || b.id === 'infoClose') { A.sfx('click'); return; }
      if (b.classList.contains('opt') || b.id === 'bSkill' || b.id === 'bChase' || b.classList.contains('sndbtn') || b.id === 'hbSound' || b.classList.contains('odcard') || b.classList.contains('pzp')) return;
      A.sfx(b.classList.contains('gc') ? 'select' : (b.id === 'selBack' || b.id === 'dfQuit' || b.id === 'odQuit') ? 'back' : 'click');
    }, true);
  }

  function boot() {
    cv = $('cv'); ctx = cv.getContext('2d');
    window.addEventListener('resize', function () { fitCanvas(); layoutSoon(); }); window.addEventListener('orientationchange', function () { setTimeout(layoutStage, 250); }); initLogin(); initControls();
    preloadPro(); initSplash(); initSound();
    if (/[?&]nosplash/.test(location.search)) show('vLogin'); else show('vSplash');
    requestAnimationFrame(loop);
  }
  window.SasinGame = {
    boot: boot,
    _t: { // 시험용(화면 없이 흐름을 확인할 때 쓴다)
      emph: emph, setPro: function (u) { PRO_SRC = u; PRO = null; proMode = ''; proFail = false; proTriedData = false; proBlob = null; preloadPro(); }, proMode: function () { return proMode; }, introStart: startIntro, introNext: introNext, introList: function () { return introList; }, proFail: function () { return proFail; }, introI: function () { return introI; }, introReady: function () { return introReady; }, state: function () { return st; }, practice: function () { practice = true; st = C.normalize(D, null); afterLogin(); },
      pick: function (id) { selPick = id; $('selOk').onclick(); }, enter: enterRegion, view: function () { return view; }, phase: function () { return phase; },
      start: function (lv, r) { curR = r || curR; if (view !== 'vRegion') show('vRegion'); startBattle(lv); }, step: function (n, dt) { for (var i = 0; i < n && phase === 'play'; i++) update(dt || 0.05); },
      arena: function () { TWS = []; OB = { mountains: [], forests: [], river: { pts: [], half: [], bridges: [] }, coast: OB.coast }; grid = buildGrid(); B.sites.forEach(function (s, i) { s.x = 400 + i * 230; s.y = 1120; }); },
      blocked: function (x, y) { return blockedG(x, y, P.r, false); }, giveFly: function (t) { B.fly = t; },
      allSites: function (v) { testAllSites = !!v; },
      noTowers: function (v) { testNoTowers = !!v; },
      chooseLevel: chooseLevel, helpGo: function () { $('hpGo').onclick(); }, helpClose: function () { $('hpClose').onclick(); }, showHelp: showHelp, overlayOf: function () { return curOv; },
      blockedReal: function (x, y, r) { var keep = OB, kt = TWS; OB = region().obstacles; TWS = region().obstacles.towers || []; var v = blockedG(x, y, r || 20); OB = keep; TWS = kt; return v; },
      petals: function () { return petals.length; }, driftKind: function () { return petals.length ? petals[0].kind : ''; },
      raw: function () { return { B: B, P: P, grid: grid, OB: OB }; }, setKeys: function (o) { keys = o || {}; }, setPos: function (x, y) { P.x = x; P.y = y; }, path: function (a, b, c, d) { return pathTo(a, b, c, d); }, hidden: function (th) { return hidden(th); }, safety: function () { return safetyMap(); }, throwW: function () { throwWeapon(); if (B.thr && !B.thr.fired) { releaseThrow(); } }, throwPress: throwWeapon, thrInfo: function () { return B.thr ? { t: B.thr.t, fired: B.thr.fired } : null; }, skillU: skill, hitG: function () { hitGuardian({}); },
      quizAnswer: function (right) { var q = B.sites[B.quiz.si].d.qs[B.quiz.qi]; answer({ getAttribute: function () { return String(right ? q.ans : (q.ans + 1) % 3); }, className: '' }); },
      continueBtn: function () { $('dNext').onclick(); }, levelsOpen: showLevels, endNow: function (w, why) { endBattle(w, why); },
      defStart: startDef, defState: function () { return df; }, defGo: function () { $('dfGo').onclick(); }, defRun: function (n, dt) { for (var i = 0; i < n; i++) stepDef(dt || 0.05); }, defTap: defTapXY,
      pieceStart: startPiece, pieceState: function () { return pz; }, pieceTap: pieceTap, piecePeek: peekPiece,
      reviewStart: startReview, reviewState: function () { return rv; }, reviewAnswer: reviewAnswer, reviewNext: reviewNext, orderStart: startOrder, orderState: function () { return od; }, orderTap: orderTap,
      openBonus: openBonus, openDogam: openDogam, openWorld: openWorld, cardAll: function (m) { startCard(); mistakes = m || 0; matched = 3; endCard(); }, bonusBack: function () { $('bonusBack').onclick(); }
    }
  };
  if (typeof document !== 'undefined' && document.getElementById && document.getElementById('vLogin')) boot();
})();

/* 사신 수호대 - 화면과 상관없는 규칙(저장 형식, 지역 열림, 별과 생명력, 카드 짝 맞추기) */
(function (root) {
  var C = {};
  var QUESTS = 5, REGIONS = 10;

  C.QUESTS = QUESTS;
  C.REGIONS = REGIONS;

  C.maxLife = function (D, gid) { var g = D.GUARDIANS[gid]; return g ? g.life : 3; };

  C.defaultState = function () {
    return { v: 1, guardian: null, unlocked: 1, life: null, regions: {}, dogam: {}, qs: {} };
  };

  /* 저장된 기록(또는 비어 있는 기록)을 게임이 쓰기 좋은 모양으로 맞춘다. */
  C.normalize = function (D, s) {
    s = s && typeof s === 'object' ? s : C.defaultState();
    s.v = 1;
    C._seq = D.REGIONS.filter(function (x) { return !x.free; }).length || REGIONS;      // 순서대로 열리는 지역 수
    var firstReady = 1; for (var fr = 0; fr < D.REGIONS.length; fr++) if (D.REGIONS[fr].ready) { firstReady = fr + 1; break; }
    s.unlocked = Math.max(firstReady, Math.min(REGIONS, Number(s.unlocked) || 1));
    if (!s.regions || typeof s.regions !== 'object') s.regions = {};
    if (!s.dogam || typeof s.dogam !== 'object') s.dogam = {};
    if (!s.qs || typeof s.qs !== 'object') s.qs = {};
    for (var r = 1; r <= REGIONS; r++) {
      var key = String(r), reg = s.regions[key] || {};
      var q = Array.isArray(reg.q) ? reg.q.slice(0, QUESTS) : [];
      while (q.length < QUESTS) q.push(0);
      for (var i = 0; i < QUESTS; i++) q[i] = q[i] ? 1 : 0;
      reg.q = q;
      reg.stars = reg.stars && typeof reg.stars === 'object' ? reg.stars : {};
      reg.title = Math.max(0, Math.min(3, Math.floor(Number(reg.title) || 0)));   // 지역 칭호 단계(0~3)
      s.regions[key] = reg;
    }
    if (s.guardian && !D.GUARDIANS[s.guardian]) s.guardian = null;
    var max = s.guardian ? C.maxLife(D, s.guardian) : 3;
    if (s.life === null || s.life === undefined || isNaN(Number(s.life))) s.life = max;
    s.life = Math.max(0, Math.min(max, Math.floor(Number(s.life))));
    s.help = s.help ? 1 : 0;   // 도움말(도굴꾼 잡는 방법)을 이미 봤는지
    s.capHint = Math.max(0, Math.min(9, Math.floor(Number(s.capHint) || 0)));   // '곁에 붙어요' 힌트를 보여 준 판 수
    return s;
  };

  /* 레벨(1~5) 클리어 기록: q[0..4] 가 레벨 1~5를 깼는지를 뜻한다. */
  C.clearedCount = function (s, r) {
    var q = s.regions[String(r)].q, n = 0;
    for (var i = 0; i < q.length; i++) if (q[i]) n++;
    return n;
  };
  C.regionCleared = function (s, r) { return C.clearedCount(s, r) >= QUESTS; };
  C.levelOpen = function (s, r, lv) { return lv === 1 || !!s.regions[String(r)].q[lv - 2]; };
  C.levelStars = function (s, r, lv) { return Number(s.regions[String(r)].stars['L' + lv]) || 0; };
  C.totalStars = function (s) {
    var t = 0;
    for (var r = 1; r <= REGIONS; r++) {
      var st = s.regions[String(r)].stars;
      for (var k in st) t += Number(st[k]) || 0;
    }
    return t;
  };
  /* ───────── 별과 칭호 ─────────
     지역 칭호: 그 지역에서 모은 별 10·20·30개일 때 1·2·3단계, 전체 칭호: 모든 별 20·50·100·150·300개일 때 1~5단계 */
  C.regionStarSum = function (s, r) {
    var st = s.regions[String(r)].stars, t = 0;
    for (var k in st) t += Number(st[k]) || 0;
    return t;
  };
  C.regionTier = function (D, sum) { var m = D.TITLES.regionMin, t = 0; for (var i = 0; i < m.length; i++) if (sum >= m[i]) t = i + 1; return t; };
  C.globalTier = function (D, total) { var g = D.TITLES.global, t = 0; for (var i = 0; i < g.length; i++) if (total >= g[i].min) t = i + 1; return t; };
  C.globalTitleName = function (D, total) { var t = C.globalTier(D, total); return t ? D.TITLES.global[t - 1].name : D.TITLES.start; };
  C.titleSnap = function (D, s) {
    var o = { g: C.globalTier(D, C.totalStars(s)), r: {} };
    for (var r = 1; r <= REGIONS; r++) o.r[r] = C.regionTier(D, C.regionStarSum(s, r));
    return o;
  };
  C.titleNews = function (D, before, after) {
    var out = [];
    for (var r = 1; r <= REGIONS; r++) if (after.r[r] > before.r[r]) out.push(D.TITLES.region[r][after.r[r] - 1]);
    if (after.g > before.g) out.push(D.TITLES.global[after.g - 1].name);
    return out;
  };
  C.syncTitles = function (D, s) {      /* 저장용: 지역 칭호 단계는 내려가지 않게 */
    for (var r = 1; r <= REGIONS; r++) { var reg = s.regions[String(r)], t = C.regionTier(D, C.regionStarSum(s, r)); if (t > reg.title) reg.title = t; }
  };
  C.regionStatus = function (D, s, r) {
    var reg = D.REGIONS[r - 1];
    if (r > s.unlocked && !reg.free) return 'locked';      // 특별 지역(free)은 처음부터 언제든 열려 있어요
    if (!reg.ready) return 'soon';
    return C.regionCleared(s, r) ? 'cleared' : 'open';
  };

  /* 레벨을 깼을 때: 기록하고 별은 이전 최고보다 높을 때만 늘린다. 레벨 1을 처음 깨면 다음 지역이 열린다. */
  C.applyLevelClear = function (D, s, r, lv, stars) {
    var reg = s.regions[String(r)];
    var firstTime = !reg.q[lv - 1];
    reg.q[lv - 1] = 1;
    var prev = Number(reg.stars['L' + lv]) || 0;
    reg.stars['L' + lv] = Math.max(prev, stars);
    var opened = 0;
    if (lv === 1 && r < (C._seq || REGIONS) && s.unlocked < r + 1) { s.unlocked = r + 1; opened = r + 1; }
    return { firstTime: firstTime, starsGain: Math.max(0, stars - prev), best: reg.stars['L' + lv], opened: opened };
  };

  /* ───── 문제 고르기: 레벨에 맞는 어려움, 안 푼 문제와 틀렸던 문제를 먼저 ───── */
  C.questionStat = function (s, siteId, qi) {
    var a = s.qs[siteId] || [];
    return { n: Number(a[qi * 2]) || 0, ok: Number(a[qi * 2 + 1]) || 0 };
  };
  C.recordAnswer = function (s, siteId, qi, ok, count) {
    var a = s.qs[siteId] || [];
    while (a.length < count * 2) a.push(0);
    a[qi * 2] = (Number(a[qi * 2]) || 0) + 1;
    if (ok) a[qi * 2 + 1] = (Number(a[qi * 2 + 1]) || 0) + 1;
    s.qs[siteId] = a;
  };
  C.pickQuestion = function (s, site, level, rnd, lastIdx) {
    rnd = rnd || Math.random;
    var target = level <= 2 ? 1 : (level === 3 ? 2 : 3);
    var best = -1, bs = -1e9;
    site.qs.forEach(function (q, i) {
      var st = C.questionStat(s, site.id, i), wrong = st.n - st.ok;
      var score = -Math.abs(q.d - target) * 1.5 + wrong * 2.2 - st.n * 0.6 + rnd() * 0.8;
      if (i === lastIdx) score -= 5;
      if (score > bs) { bs = score; best = i; }
    });
    return best;
  };

  /* 신수를 바꿀 때: 생명력이 새 신수의 최대치를 넘지 않게 한다. */
  C.changeGuardian = function (D, s, gid) {
    s.guardian = gid;
    var max = C.maxLife(D, gid);
    s.life = s.life === null || s.life === undefined ? max : Math.min(s.life, max);
    return s;
  };

  /* ───── 쉼터: 카드 짝 맞추기 ───── */
  C.shuffle = function (arr, rnd) {
    rnd = rnd || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  /* 4쌍을 고른다. 아직 보호한 문화재가 적으면 프롤로그에서 본 신수·방위 짝으로 채운다. */
  C.cardPairs = function (D, s, rnd, regId) {
    var prot = [], rest = [];
    D.REGIONS.forEach(function (reg) {
      if (!reg.sites || (regId && reg.id !== regId)) return;
      reg.sites.forEach(function (q) { (s.dogam[q.id] ? prot : rest).push([q.name, q.short]); });
    });
    var pairs = C.shuffle(prot, rnd).slice(0, 4);
    if (pairs.length < 4) pairs = pairs.concat(C.shuffle(rest, rnd).slice(0, 4 - pairs.length));     // 지킨 문화재가 적으면 같은 지역의 다른 문화재로 채워요
    if (pairs.length < 4) pairs = pairs.concat(C.shuffle(D.PAIRS_GUARDIAN, rnd).slice(0, 4 - pairs.length));
    return pairs;
  };

  C.deckFromPairs = function (pairs, rnd) {
    var cards = [];
    pairs.forEach(function (p, i) { cards.push({ k: i, t: p[0] }); cards.push({ k: i, t: p[1] }); });
    return C.shuffle(cards, rnd);
  };

  C.starsFromMistakes = function (m) { return m <= 2 ? 3 : (m <= 5 ? 2 : 1); };

  /* ───── 쉼터: 틀린 문제 복습 도전 ───── */
  // 약한 정도: 틀린 횟수가 맞힌 횟수의 0.7배보다 많으면 아직 약한 문제(여러 번 맞히면 졸업해요)
  C.weakness = function (s, siteId, qi) {
    var st = C.questionStat(s, siteId, qi);
    return (st.n - st.ok) - 0.7 * st.ok;
  };
  C.reviewPick = function (D, s, n, rnd, regId) {
    rnd = rnd || Math.random; n = n || 5;
    var weak = [], tried = [], fresh = [];
    D.REGIONS.forEach(function (reg) {
      if (!reg.sites || (regId && reg.id !== regId)) return;
      reg.sites.forEach(function (q) {
        q.qs.forEach(function (qq, qi) {
          var st = C.questionStat(s, q.id, qi), item = { siteId: q.id, qi: qi, w: C.weakness(s, q.id, qi) };
          if (st.n === 0) fresh.push(item); else if (item.w > 0) weak.push(item); else tried.push(item);
        });
      });
    });
    weak.sort(function (a, b) { return (b.w + rnd() * 0.4) - (a.w + rnd() * 0.4); });
    var out = weak.slice(0, n);
    if (out.length < n) out = out.concat(C.shuffle(fresh, rnd).slice(0, n - out.length));
    if (out.length < n) out = out.concat(C.shuffle(tried, rnd).slice(0, n - out.length));
    return { items: C.shuffle(out, rnd), weakCount: Math.min(weak.length, n) };
  };
  C.starsFromReview = function (correctFirst, total) { var miss = total - correctFirst; return miss <= 0 ? 3 : (miss <= 1 ? 2 : 1); };

  /* ───── 쉼터: 시대 순서 퍼즐 (만든 해가 분명한 문화재만 써요) ───── */
  C.datedSites = function (D, regId) {
    var out = [];
    D.REGIONS.forEach(function (reg) { if (reg.sites && (!regId || reg.id === regId)) reg.sites.forEach(function (q) { if (typeof q.yr === 'number') out.push(q); }); });
    return out;
  };
  C.orderPick = function (D, n, rnd, regId) {
    var pool = C.datedSites(D, regId); n = Math.min(n || 4, pool.length);
    return C.shuffle(pool, rnd).slice(0, n);
  };
  C.orderCorrect = function (picked) { return picked.slice().sort(function (a, b) { return a.yr - b.yr; }); };
  C.starsFromOrder = function (m) { return m <= 0 ? 3 : (m <= 2 ? 2 : 1); };

  /* ───── 쉼터: 유물 조각 맞추기 (그림을 4x3, 12조각으로 나눠 섞고, 두 조각을 눌러 자리를 바꿔요) ───── */
  C.PIECES = 12;
  C.shufflePieces = function (n, rnd) {
    rnd = rnd || Math.random; n = n || C.PIECES;
    var base = [], i; for (i = 0; i < n; i++) base.push(i);
    for (var t = 0; t < 200; t++) { var p = C.shuffle(base, rnd), fixed = false; for (i = 0; i < n; i++) if (p[i] === i) fixed = true; if (!fixed) return p; }
    return base.slice(1).concat(base[0]);       // (거의 일어나지 않아요) 모든 조각이 제자리가 아닌 순서
  };
  C.swapPieces = function (perm, a, b) { var p = perm.slice(), t = p[a]; p[a] = p[b]; p[b] = t; return p; };
  C.piecesSolved = function (perm) { for (var i = 0; i < perm.length; i++) if (perm[i] !== i) return false; return true; };
  C.starsFromPuzzle = function (moves, n) { n = n || C.PIECES; return moves <= n + 2 ? 3 : (moves <= n + 8 ? 2 : 1); };
  // 보호한(도감에 있는) 문화재를 먼저 쓰고, 아직 없으면 아무 문화재나 써요
  C.puzzlePickSite = function (D, s, rnd, regId) {
    var all = [], own = [];
    D.REGIONS.forEach(function (reg) { if (reg.sites && (!regId || reg.id === regId)) reg.sites.forEach(function (q) { all.push(q); if (s.dogam[q.id]) own.push(q); }); });
    var pool = own.length ? own : all; rnd = rnd || Math.random;
    return pool[Math.floor(rnd() * pool.length)];
  };

  /* ───── 쉼터: 방어 게임 (도굴꾼이 길 네 개로 문화재를 향해 몰려와요. 눌러서 쫓아내요) ───── */
  C.DEF = { W: 960, H: 400, lanes: [90, 165, 240, 315], gate: 790, duration: 60, hitR: 46, speedMul: 1.5 };   // speedMul: 도굴꾼이 걸어오는 속도 배수
  C.defNew = function () { return { t: 0, lives: 3, score: 0, steals: 0, thieves: [], nextSpawn: 0.6, nextBoss: 12, nid: 1, lastLane: -1, over: false, win: false }; };
  C.defStep = function (s, dt, rnd) {
    rnd = rnd || Math.random; var ev = [], D_ = C.DEF, i;
    if (s.over) return ev;
    s.t += dt;
    while (s.t >= s.nextSpawn && s.t < D_.duration - 6) {            // 끝나기 6초 전부터는 새 도굴꾼이 오지 않아요
      var boss = s.t >= s.nextBoss; if (boss) s.nextBoss += 18;
      var lane = Math.floor(rnd() * 4); if (lane === s.lastLane) lane = (lane + 1 + Math.floor(rnd() * 3)) % 4; s.lastLane = lane;
      var base = Math.min(135, 60 + s.t * 1.2) * D_.speedMul, type = boss ? 'boss' : (s.t > 15 && rnd() < 0.22 ? 'fast' : 'normal');
      s.thieves.push({ id: s.nid++, lane: lane, x: -30, type: type, hp: boss ? 3 : 1, max: boss ? 3 : 1, v: type === 'fast' ? base * 1.5 : (type === 'boss' ? base * 0.55 : base), hitT: 0 });
      s.nextSpawn += Math.max(0.45, 1.15 - s.t * 0.014);
    }
    for (i = s.thieves.length - 1; i >= 0; i--) {
      var th = s.thieves[i]; th.x += th.v * dt; if (th.hitT > 0) th.hitT -= dt;
      if (th.x >= D_.gate) { s.thieves.splice(i, 1); s.lives--; s.steals++; ev.push({ t: 'steal', th: th }); }
    }
    if (s.lives <= 0) { s.lives = 0; s.over = true; s.win = false; s.thieves = []; ev.push({ t: 'lose' }); }
    else if (s.t >= D_.duration) { s.over = true; s.win = true; ev.push({ t: 'win' }); }
    return ev;
  };
  C.defY = function (th) { return C.DEF.lanes[th.lane] - 18; };
  C.defTap = function (s, x, y) {
    if (s.over) return { hit: false };
    var best = null, bd = 1e9, R = C.DEF.hitR;
    s.thieves.forEach(function (th) { var dx = x - th.x, dy = y - C.defY(th), d = Math.hypot(dx, dy); if (Math.abs(dx) <= R && Math.abs(dy) <= R && d < bd) { bd = d; best = th; } });
    if (!best) return { hit: false };
    best.hp--; best.hitT = 0.25; var dead = best.hp <= 0;
    if (dead) { s.thieves.splice(s.thieves.indexOf(best), 1); s.score++; }
    return { hit: true, dead: dead, th: best };
  };
  C.starsFromDefense = function (lives, win) { return !win ? 0 : (lives >= 3 ? 3 : (lives === 2 ? 2 : 1)); };

  /* ───── 화면 맞춤: 남은 화면(aw x ah)을 가득 채우는 플레이 화면의 크기. 가로 960은 그대로 두고 세로 칸 수(H)만 화면 비율에 맞춰요. ───── */
  C.stageFit = function (aw, ah) {
    aw = Math.max(200, aw); ah = Math.max(160, ah);
    var a = Math.max(1.25, Math.min(2.6, aw / ah)), w = Math.min(aw, ah * a);
    return { aspect: a, H: Math.round(960 / a), w: Math.round(w), h: Math.round(w / a) };
  };

  /* 보너스 게임 결과: 별 기록은 이전 최고를 넘은 만큼만 늘린다. (생명력과는 관계없어요) */
  C.applyBonusResult = function (D, s, regionId, game, stars) {
    var reg = s.regions[String(regionId)];
    var prev = Number(reg.stars[game]) || 0;
    var gain = Math.max(0, stars - prev);
    reg.stars[game] = Math.max(prev, stars);
    return { starsGain: gain, lifeGain: 0, best: reg.stars[game] };
  };

  /* ───── 도굴꾼 ───── */
  C.thiefFor = function (D, level) { return D.THIEVES[Math.max(0, Math.min(D.THIEVES.length - 1, level - 1))]; };

  C.pickSpawn = function (spawns, site, player, target) {
    var best = null, bd = 1e9;
    spawns.forEach(function (p) {
      var ds = Math.hypot(p[0] - site[0], p[1] - site[1]);
      var dp = Math.hypot(p[0] - player[0], p[1] - player[1]);
      if (dp < 200) return;                    // 사신 바로 옆에서 나타나지 않게
      var score = Math.abs(ds - target);
      if (score < bd) { bd = score; best = p; }
    });
    return best || spawns[0];
  };

  root.SASIN_CORE = C;
  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : this);

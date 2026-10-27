/**
 * 사신 수호대 - 게임 쪽 저장 도우미
 * 게임은 이 파일의 login / commit / logAnswer 만 부른다.
 * 저장 장소(구글 시트 앱 스크립트)는 SasinStore.configure 에서 주소 하나만 바꾸면 달라진다.
 */
var SasinStore = (function () {
  var cfg = { url: '', timeoutMs: 12000, remember: false };
  var session = { code: null, label: '', ver: 0 };
  var state = null;
  var pendingLogs = [];
  var timer = null, busy = false, dirty = false, listeners = [];
  var KEY_CODE = 'sasin_code_v1', KEY_PENDING = 'sasin_pending_v1_';

  function emit(ev) { listeners.forEach(function (f) { try { f(ev); } catch (e) {} }); }
  function on(f) { listeners.push(f); }
  function configure(c) { for (var k in c) cfg[k] = c[k]; }

  function defaultState() { return { v: 1, guardian: null, unlocked: 1, regions: {}, dogam: {} }; }

  function post(payload) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, cfg.timeoutMs) : null;
    return fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // 사전 확인 요청을 피하려고 일부러 text/plain
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { if (t) clearTimeout(t); return r.json(); })
      .catch(function (e) { if (t) clearTimeout(t); return { ok: false, error: 'network' }; });
  }

  /* 두 기록을 합친다: 숫자는 큰 쪽, 0/1 목록은 하나라도 1이면 1, 글자는 이 기기(a) 쪽을 따른다. */
  function merge(a, b) {
    if (a === undefined || a === null) return b;
    if (b === undefined || b === null) return a;
    if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
    if (typeof a === 'boolean' && typeof b === 'boolean') return a || b;
    if (Array.isArray(a) && Array.isArray(b)) {
      var simple = a.every(function (x) { return typeof x === 'number' || typeof x === 'boolean'; }) &&
                   b.every(function (x) { return typeof x === 'number' || typeof x === 'boolean'; });
      if (simple) {
        var n = Math.max(a.length, b.length), out = [];
        for (var i = 0; i < n; i++) out.push(Math.max(Number(a[i]) || 0, Number(b[i]) || 0));
        return out;
      }
      return a;
    }
    if (typeof a === 'object' && typeof b === 'object') {
      var res = {}, k;
      for (k in b) res[k] = b[k];
      for (k in a) res[k] = (k in b) ? merge(a[k], b[k]) : a[k];
      return res;
    }
    return a;
  }

  function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  function login(code, opts) {
    var c = normCode(code);
    if (c.length < 4) return Promise.resolve({ ok: false, error: 'invalid_code' });
    return post({ action: 'load', code: c }).then(function (res) {
      if (!res.ok) return res;
      session = { code: c, label: res.label || '', ver: res.ver || 0 };
      state = res.state || defaultState();
      // 인터넷이 끊겨서 못 올린 기록이 이 기기에 남아 있으면 합친다.
      var pend = readPending(c);
      if (pend) { state = merge(pend, state); dirty = true; scheduleSave(300); }
      if (opts && opts.remember) { try { localStorage.setItem(KEY_CODE, c); } catch (e) {} }
      return { ok: true, label: session.label, state: state };
    });
  }

  function logout() {
    session = { code: null, label: '', ver: 0 }; state = null; pendingLogs = [];
    try { localStorage.removeItem(KEY_CODE); } catch (e) {}
  }

  function rememberedCode() { try { return localStorage.getItem(KEY_CODE) || ''; } catch (e) { return ''; } }
  function readPending(c) { try { var s = localStorage.getItem(KEY_PENDING + c); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function writePending(c, st) { try { localStorage.setItem(KEY_PENDING + c, JSON.stringify(st)); } catch (e) {} }
  function clearPending(c) { try { localStorage.removeItem(KEY_PENDING + c); } catch (e) {} }

  function getState() { return state; }

  /* 게임은 상태를 바꾼 뒤 commit(새상태)만 부르면 된다. 저장은 알아서 한다. */
  function commit(newState) {
    if (!session.code) return;
    state = newState; dirty = true;
    scheduleSave(1500);
  }

  function logAnswer(qid, correct, region) {
    if (!session.code) return;
    pendingLogs.push({ q: String(qid), c: correct ? 1 : 0, r: String(region || '') });
    if (pendingLogs.length > 200) pendingLogs.shift();
    dirty = true; scheduleSave(1500);
  }

  function scheduleSave(ms) { if (timer) clearTimeout(timer); timer = setTimeout(flush, ms); }

  function flush() {
    timer = null;
    if (!session.code || !dirty) return Promise.resolve();
    if (busy) { scheduleSave(800); return Promise.resolve(); }
    busy = true; emit({ type: 'saving' });
    var sentLogs = pendingLogs.slice(0, 60);
    return attempt(0, sentLogs);
  }

  function attempt(n, sentLogs) {
    var snapshot = state;
    return post({ action: 'save', code: session.code, baseVer: session.ver, state: snapshot, logs: sentLogs })
      .then(function (res) {
        if (res.ok) {
          session.ver = res.ver; pendingLogs = pendingLogs.slice(sentLogs.length);
          dirty = (state !== snapshot) || pendingLogs.length > 0;
          clearPending(session.code); busy = false; emit({ type: 'saved' });
          if (dirty) scheduleSave(1500);
          return;
        }
        if (res.error === 'conflict' && n < 3) {                 // 다른 기기에서 먼저 저장했다 -> 합쳐서 다시 저장
          state = merge(state, res.state); session.ver = res.ver; emit({ type: 'merged' });
          return attempt(n + 1, sentLogs);
        }
        if (res.error === 'too_fast' && n < 3) {
          return new Promise(function (ok) { setTimeout(ok, 2500); }).then(function () { return attempt(n + 1, sentLogs); });
        }
        writePending(session.code, state);                         // 실패 -> 이 기기에 임시 보관
        busy = false; emit({ type: 'offline', error: res.error }); scheduleSave(15000);
      });
  }

  return { configure: configure, login: login, logout: logout, commit: commit, logAnswer: logAnswer,
           getState: getState, flush: flush, on: on, merge: merge, defaultState: defaultState, rememberedCode: rememberedCode };
})();
if (typeof window !== 'undefined') window.SasinStore = SasinStore;
if (typeof module !== 'undefined') module.exports = SasinStore;

// FelixXx background alerts: runs the SAME analysis engine as index.html, then pushes A+ setups to ntfy.
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const sc = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).pop();
const a = sc.indexOf('const $=i=>'), b = sc.indexOf('/* ---- chart ---- */');
if (a < 0 || b < 0) throw new Error('could not find the analysis engine in index.html');
const za = sc.indexOf('function lreg('), zb = sc.indexOf('function stDraw(');
if (za < 0 || zb < 0) throw new Error('could not find the confirmation indicators in index.html');
const pa = sc.indexOf('const p0Of='), pb = sc.indexOf('function gradeP(');
if (pa < 0 || pb < 0) throw new Error('could not find the Live Analysis picks in index.html');
const engine = sc.slice(a, b) + '\n' + sc.slice(za, zb) +
  "\nconst KIND={'OVER/UNDER':'digits','EVEN/ODD':'digits','MATCHES':'digits','DIFFERS':'digits','RISE/FALL':'dir','HIGHER/LOWER':'dir'};\n" + sc.slice(pa, pb) +
  "\nM.unshift({id:'cryBTCUSD',n:'BTC/USD',g:'Crypto',cost:.0006},{id:'frxXAUUSD',n:'XAU/USD',g:'Metal',cost:.0002});" +
  "\nreturn {M,req,picksOf,lcand,backtest,analyze,zlCalc,stop:()=>{try{ws&&ws.close()}catch(e){}}};";
const E = new Function('WebSocket', 'localStorage', 'document', engine)(globalThis.WebSocket, undefined, undefined);

const TOPIC = process.env.NTFY_TOPIC, BASE = process.env.NTFY_URL || 'https://ntfy.sh';
const APP = process.env.APP_URL || '';
const TEST = process.env.SEND_TEST === 'true', FAKE = process.env.FAKE_APLUS === '1';
if (!TOPIC) { console.error('NTFY_TOPIC secret is missing'); process.exit(1); }
const now = Date.now();
const COOL = 180 * 60e3;

async function push(title, body, tags) {
  const h = { Title: title, Priority: '4', Tags: tags };
  if (APP) h.Click = APP;
  const r = await fetch(`${BASE}/${TOPIC}`, { method: 'POST', body, headers: h });
  if (!r.ok) throw new Error('ntfy ' + r.status);
}
const gr = o => { const { A, E: e } = o, solid = e && e.n >= 15 && e.net > 0 && e.pf > 1.2; return A.go && solid && !A.h30x ? 'A+' : A.go && e && e.net > 0 ? 'A' : A.dir && A.ok >= 6 ? 'FORMING' : '-' };
const fx = (n, d) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

if (TEST) { await push('TEST · FelixXx', 'Background alerts are working. Real A+ setups will arrive like this.', 'bat'); console.log('test sent'); }

const LF = new URL('alerts/log.json', root);
let LOG = []; try { LOG = JSON.parse(fs.readFileSync(LF, 'utf8')) } catch (_) {}
const LOG0 = JSON.stringify(LOG), nowS = Math.floor(now / 1000);
LOG = LOG.filter(e => nowS - e.t < 14 * 86400);

const MM = E.M.filter(m => !m.imp), res = { ok: 0, closed: 0, fail: 0, aplus: [], agrade: [] }, C15 = {}, CN = [];
for (let i = 0; i < MM.length; i += 3) {
  await Promise.all(MM.slice(i, i + 3).map(async m => {
    try {
      const [c15, c1h, c4h, c30] = await Promise.all([E.lcand(m.id, '15m', 5000), E.lcand(m.id, '1h', 500), E.lcand(m.id, '4h', 500), E.lcand(m.id, '30m', 500).catch(() => null)]);
      if (Date.now() / 1000 - c15.at(-1).t > 2400) { res.closed++; return }
      C15[m.id] = c15.slice(-300); CN.push(c15.length);
      const ed = E.backtest(c15, m.cost), A = E.analyze(c30 && c30.length > 100 ? { '15m': c15, '30m': c30, '1h': c1h, '4h': c4h } : { '15m': c15, '1h': c1h, '4h': c4h }, ed);
      if (A.err) { res.fail++; return }
      res.ok++;
      if (gr({ A, E: ed }) === 'A+' || (FAKE && res.aplus.length === 0 && A.lv)) {
        const z = E.zlCalc(c15.slice(-800)), n = z.c.length - 1, up = A.dir > 0, zs = z.zs[n];
        const conf = FAKE || (zs != null && z.tr[n] !== 0 && (z.tr[n] > 0) === up && (z.c[n] > zs) === up);
        res.aplus.push({ m, A, conf });
      } else if (gr({ A, E: ed }) === 'A' && A.lv) {
        const z = E.zlCalc(c15.slice(-800)), n = z.c.length - 1, up = A.dir > 0, zs = z.zs[n];
        res.agrade.push({ m, A, conf: zs != null && z.tr[n] !== 0 && (z.tr[n] > 0) === up && (z.c[n] > zs) === up, pf: ed ? ed.pf : 0, wr: ed ? ed.wr : 0, nt: ed ? ed.n : 0 });
      }
    } catch (e) { res.fail++; console.log('fail', m.n, e.message) }
  }));
}
// Live Analysis picks (volatility indices): same scan as the app, pushed when z >= 2.5
const PF = new URL('alerts/picks.json', root);
let PK = {}; try { PK = JSON.parse(fs.readFileSync(PF, 'utf8')) } catch (_) {}
const PK0 = JSON.stringify(PK); let pushedP = 0;
for (const k of Object.keys(PK)) if (nowS - PK[k] > 6 * 3600) delete PK[k];
try {
  for (const m of E.M.filter(z => z.g === 'Vol')) {
    try {
      const r = await E.req({ ticks_history: m.id, count: 500, end: 'latest', style: 'ticks' }), p = r.history.prices, pip = r.pip_size || 2, g = p.map(v => +v.toFixed(pip).slice(-1));
      if (Date.now() / 1000 - r.history.times.at(-1) > 600) continue;
      for (const o of E.picksOf(m, p.slice(-500), g.slice(-500)).filter(o => o.z >= 2.5)) {
        const key = `${m.id}|${o.cat}|${o.pick}`;
        if (PK[key] && nowS - PK[key] < 1800) continue;
        if (pushedP >= 4) break;
        await push(`RECOMMENDED · ${m.n}`, `${o.cat}: ${o.pick} (${o.z.toFixed(1)}σ)`, 'dart');
        PK[key] = nowS; pushedP++;
      }
    } catch (e) { console.log('picks fail', m.n, e.message) }
  }
} catch (e) { console.log('picks error', e.message) }
if (JSON.stringify(PK) !== PK0) { fs.mkdirSync(new URL('alerts/', root), { recursive: true }); fs.writeFileSync(PF, JSON.stringify(PK)) }
E.stop();

// 1) results for setups already logged: TP1 or stop first (stop wins ties, like the backtest)
for (const e of LOG) {
  if (e.res !== 'open') continue;
  const c = C15[e.id], up = e.dir === 'BUY';
  if (c) for (const k of c) {
    if (k.t < e.t0) continue;
    const hitSL = up ? k.l <= e.sl : k.h >= e.sl, hitTP = up ? k.h >= e.tp[0] : k.l <= e.tp[0];
    if (hitSL) { e.res = 'SL'; e.rt = k.t; break }
    if (hitTP) { e.res = 'TP1'; e.rt = k.t; break }
  }
  if (e.res === 'open' && nowS - e.t > 86400) e.res = 'expired';
}
// 2) log every A+ setup, notify the confirmed ones once
let sent = 0, logged = 0;
for (const { m, A, conf } of res.aplus) {
  const dir = A.dir > 0 ? 'BUY' : 'SELL';
  let en = LOG.find(e => e.id === m.id && e.dir === dir && !e.g && nowS - e.t < COOL / 1000);
  if (!en) {
    en = { t: nowS, t0: Math.floor(nowS / 900) * 900, id: m.id, n: m.n, dir, ok: A.ok, e: A.lv.e, sl: A.lv.sl, tp: A.lv.tp.slice(0, 3), conf: false, notified: false, res: 'open' };
    LOG.push(en); logged++;
  }
  if (conf) en.conf = true;
  if (!en.conf && !en.pre && !en.notified) {
    const dp = A.lv.e < 2 ? 5 : A.lv.e < 200 ? 3 : 2;
    await push(`A+ SETUP · ${m.n}`, `${dir} · ${A.ok}/8 checks · backtest proven · NOT yet confirmed by Zero Lag Trend\nEntry ${fx(en.e, dp)}\nSL ${fx(en.sl, dp)} (risk ${(Math.abs(en.e - en.sl) / en.e * 100).toFixed(2)}%)\nTP1 ${fx(en.tp[0], dp)} (1:2)\nYou'll get another alert if it gets confirmed.`, A.dir > 0 ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend');
    en.pre = true; sent++;
  }
  if (en.conf && !en.notified) {
    const dp = A.lv.e < 2 ? 5 : A.lv.e < 200 ? 3 : 2;
    await push(`CONFIRMED A+ · ${m.n}`, `${dir} · ${A.ok}/8 checks · Zero Lag Trend + ZLSMA agree\nEntry ${fx(en.e, dp)}\nSL ${fx(en.sl, dp)} (risk ${(Math.abs(en.e - en.sl) / en.e * 100).toFixed(2)}%)\nTP1 ${fx(en.tp[0], dp)} (1:2) · TP2 ${fx(en.tp[1], dp)} (1:3)\n4H + 1H + 30M trend agree\nOpen the app to place it.`, A.dir > 0 ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend');
    en.notified = true; sent++;
  }
}
// 2b) A-grade setups (lower quality: positive backtest but not yet a proven A+): log with g:'A' and notify once
let sentA = 0;
for (const { m, A, conf, pf, wr, nt } of res.agrade) {
  const dir = A.dir > 0 ? 'BUY' : 'SELL';
  let en = LOG.find(e => e.id === m.id && e.dir === dir && e.g === 'A' && nowS - e.t < COOL / 1000);
  if (!en) {
    en = { t: nowS, t0: Math.floor(nowS / 900) * 900, id: m.id, n: m.n, dir, ok: A.ok, e: A.lv.e, sl: A.lv.sl, tp: A.lv.tp.slice(0, 3), conf, notified: false, res: 'open', g: 'A' };
    LOG.push(en); logged++;
  }
  if (conf) en.conf = true;
  if (!en.notified && sentA < 3) {
    const dp = A.lv.e < 2 ? 5 : A.lv.e < 200 ? 3 : 2;
    await push(`A-GRADE · ${m.n}`, `${dir} · ${A.ok}/8 checks · lower quality than A+\nBacktest here: ${nt} trades, PF ${pf.toFixed(2)}\nEntry ${fx(en.e, dp)}\nSL ${fx(en.sl, dp)} (risk ${(Math.abs(en.e - en.sl) / en.e * 100).toFixed(2)}%)\nTP1 ${fx(en.tp[0], dp)} (1:2)\nTrade small and tag it "outside the rules".`, 'warning');
    en.notified = true; sent++; sentA++;
  }
}
LOG = LOG.slice(-150);
// daily "still watching" message, once per UTC day after 12:00 UTC (8am Curacao)
try {
  const SF = new URL('alerts/state.json', root);
  let st = {}; try { st = JSON.parse(fs.readFileSync(SF, 'utf8')) } catch (_) {}
  const day = new Date().toISOString().slice(0, 10);
  if (new Date().getUTCHours() >= 12 && st.hb !== day && res.ok + res.closed > 0) {
    const LA = LOG.filter(e => !e.g), y = LA.filter(e => nowS - e.t < 86400), w = LA.filter(e => e.res === 'TP1').length, l = LA.filter(e => e.res === 'SL').length;
    await push('Still watching · FelixXx', `Background job is alive.\nLast 24h: ${y.length} A+ setup${y.length === 1 ? '' : 's'}, ${y.filter(e => e.notified).length} alerted.\n14-day results: ${w} won, ${l} stopped.\nChecked ${res.ok} markets now (${res.closed} closed).`, 'eyes');
    st.hb = day; fs.mkdirSync(new URL('alerts/', root), { recursive: true }); fs.writeFileSync(SF, JSON.stringify(st));
  }
} catch (e) { console.log('heartbeat failed', e.message) }
fs.mkdirSync(new URL('alerts/', root), { recursive: true });
if (JSON.stringify(LOG) !== LOG0) fs.writeFileSync(LF, JSON.stringify(LOG));
console.log(`analyzed ${res.ok}, closed ${res.closed}, failed ${res.fail}, A+ now ${res.aplus.length}, A-grade now ${res.agrade.length} (${res.aplus.filter(x => x.conf).length} confirmed), newly logged ${logged}, sent ${sent}, picks sent ${pushedP}, 15m candles per market ${CN.length ? Math.min(...CN) + '-' + Math.max(...CN) : 'none'} (backtest needs 2000+)`);
if (res.ok === 0 && res.closed === 0) process.exit(1);

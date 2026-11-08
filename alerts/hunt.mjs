// FelixXx background alerts: runs the SAME analysis engine as index.html, then pushes A+ setups to ntfy.
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const sc = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).pop();
const a = sc.indexOf('const $=i=>'), b = sc.indexOf('/* ---- chart ---- */');
if (a < 0 || b < 0) throw new Error('could not find the analysis engine in index.html');
const za = sc.indexOf('function lreg('), zb = sc.indexOf('function stDraw(');
if (za < 0 || zb < 0) throw new Error('could not find the confirmation indicators in index.html');
const engine = sc.slice(a, b) + '\n' + sc.slice(za, zb) +
  "\nM.unshift({id:'cryBTCUSD',n:'BTC/USD',g:'Crypto',cost:.0006},{id:'frxXAUUSD',n:'XAU/USD',g:'Metal',cost:.0002});" +
  "\nreturn {M,lcand,backtest,analyze,zlCalc,stop:()=>{try{ws&&ws.close()}catch(e){}}};";
const E = new Function('WebSocket', 'localStorage', 'document', engine)(globalThis.WebSocket, undefined, undefined);

const TOPIC = process.env.NTFY_TOPIC, BASE = process.env.NTFY_URL || 'https://ntfy.sh';
const APP = process.env.APP_URL || '';
const TEST = process.env.SEND_TEST === 'true', FAKE = process.env.FAKE_APLUS === '1';
if (!TOPIC) { console.error('NTFY_TOPIC secret is missing'); process.exit(1); }
const SF = new URL('alerts/state.json', root);
let ST = {}; try { ST = JSON.parse(fs.readFileSync(SF, 'utf8')) } catch (_) {}
const now = Date.now(); for (const k in ST) if (now - ST[k] > 6 * 3600e3) delete ST[k];
const COOL = 180 * 60e3;

async function push(title, body, tags) {
  const h = { Title: title, Priority: '4', Tags: tags };
  if (APP) h.Click = APP;
  const r = await fetch(`${BASE}/${TOPIC}`, { method: 'POST', body, headers: h });
  if (!r.ok) throw new Error('ntfy ' + r.status);
}
const gr = o => { const { A, E: e } = o, solid = e && e.n >= 15 && e.net > 0 && e.pf > 1.2; return A.go && solid ? 'A+' : A.go && e && e.net > 0 ? 'A' : A.dir && A.ok >= 6 ? 'FORMING' : '-' };
const fx = (n, d) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

if (TEST) { await push('TEST · FelixXx', 'Background alerts are working. Real A+ setups will arrive like this.', 'bat'); console.log('test sent'); }

const MM = E.M.filter(m => !m.imp), res = { ok: 0, closed: 0, fail: 0, aplus: [], unconfirmed: 0 };
for (let i = 0; i < MM.length; i += 3) {
  await Promise.all(MM.slice(i, i + 3).map(async m => {
    try {
      const [c15, c1h, c4h] = await Promise.all([E.lcand(m.id, '15m', 5000), E.lcand(m.id, '1h', 500), E.lcand(m.id, '4h', 500)]);
      if (Date.now() / 1000 - c15.at(-1).t > 2400) { res.closed++; return }
      const ed = E.backtest(c15, m.cost), A = E.analyze({ '15m': c15, '1h': c1h, '4h': c4h }, ed);
      if (A.err) { res.fail++; return }
      res.ok++;
      if (gr({ A, E: ed }) === 'A+' || (FAKE && res.aplus.length === 0 && A.lv)) {
        const z = E.zlCalc(c15.slice(-800)), n = z.c.length - 1, up = A.dir > 0, zs = z.zs[n];
        const conf = zs != null && z.tr[n] !== 0 && (z.tr[n] > 0) === up && (z.c[n] > zs) === up;
        if (conf || FAKE) res.aplus.push({ m, A }); else res.unconfirmed++;
      }
    } catch (e) { res.fail++; console.log('fail', m.n, e.message) }
  }));
}
E.stop();
let sent = 0;
for (const { m, A } of res.aplus) {
  const dir = A.dir > 0 ? 'BUY' : 'SELL', key = `s|${m.id}|${dir}`;
  if (ST[key] && now - ST[key] < COOL) continue;
  const dp = A.lv.e < 2 ? 5 : A.lv.e < 200 ? 3 : 2;
  await push(`CONFIRMED A+ · ${m.n}`, `${dir} · ${A.ok}/8 checks · Zero Lag Trend + ZLSMA agree\nEntry ${fx(A.lv.e, dp)}\nSL ${fx(A.lv.sl, dp)}\nTP1 ${fx(A.lv.tp[0], dp)} · TP2 ${fx(A.lv.tp[1], dp)}\nOpen the app to place it.`, A.dir > 0 ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend');
  ST[key] = now; sent++;
}
fs.mkdirSync(new URL('alerts/', root), { recursive: true });
fs.writeFileSync(SF, JSON.stringify(ST));
console.log(`analyzed ${res.ok}, closed ${res.closed}, failed ${res.fail}, A+ confirmed ${res.aplus.length}, A+ not confirmed ${res.unconfirmed}, sent ${sent}`);
if (res.ok === 0 && res.closed === 0) process.exit(1);

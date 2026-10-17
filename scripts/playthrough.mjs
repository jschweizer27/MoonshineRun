#!/usr/bin/env node
// The robot playthrough: `npm run playthrough -- [label] [--seed N] [--until C] [--ending
// all|deed|paper|crown] [--minutes M] [--police off]`. A bot (scripts/bot/) plays a new game from the title
// screen with everything a player has on (the story's cards, the clock, the Bureau, traffic,
// odd finds, breakdowns, tips): it drives the roads, plays the salvage, the still and the
// brewery, buys, sells, takes and delivers orders, sleeps, gets away from chases and works
// every chapter step and side story it can. At each chapter it reloads the save and carries
// on (a save round-trip); at the choice it copies the save and takes each ending from it.
// Anything that gets stuck, dead-ends or errors is a finding. Writes
// artifacts/playthrough/<label>/ (report.md, report.json, a shot a step, a contact sheet);
// exits non-zero on any finding. Chapter C (1-9) stops it early.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const label = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'run';
const seed = opt('seed', null), until = Number(opt('until', 99)), minutes = Number(opt('minutes', 120));
const endings = opt('ending', 'all') === 'all' ? ['deed', 'paper', 'crown'] : [opt('ending')];
const out = `artifacts/playthrough/${label}`;
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(`${out}/shots`, { recursive: true });
// (`--police off`: no Bureau, no Vail's men: the story's paths alone)
const police = opt('police', 'on') !== 'off';
const QUERY = `?test&story&time${police ? '&police' : ''}&traffic&odd&damage&hints${seed ? `&seed=${seed}` : ''}`;
const t0 = Date.now(), wall = () => Math.round((Date.now() - t0) / 1000);

const port = 4800 + Math.floor(Math.random() * 100);
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: 'ignore' });
const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const report = { label, seed: seed || 'default', query: QUERY, started: new Date().toISOString(), events: [], beats: [], findings: [], chapters: [], endings: {}, errors: [] };
let shotN = 0;

try {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('pageerror', (e) => finding({ kind: 'ERROR', text: `pageerror: ${e.message}` }));
  // (not the blank page the saves are copied on between endings: it's a 404 by design)
  page.on('console', (m) => { if (m.type() === 'error' && !page.url().includes('__no-game')) finding({ kind: 'ERROR', text: `console: ${m.text()}` }); });

  const boot = async (fresh) => {
    for (let i = 0; i < 50; i++) { try { await page.goto(`http://localhost:${port}/${QUERY}`); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
    await page.waitForFunction(() => window.__shineReady === true, null, { timeout: 120_000 });
    if (fresh) await page.evaluate(() => window.shine.game.eraseProgress());
    await page.evaluate(() => window.shine.game.renderer.setAnimationLoop(null));
    await page.click('#start-btn');
  };
  const start = (opts) => page.evaluate(async (opts) => {
    const { Bot } = await import('/scripts/bot/bot.js');
    window.shine.game.renderer.setAnimationLoop(null);
    window.__bot = new Bot(window.shine.game, opts);
  }, opts);

  // A shot of the road (or the screen that's up), with the draw stats.
  async function beat(name, note = '') {
    const stats = await page.evaluate(() => {
      const g = window.shine.game;
      if (g.state === 'playing') g.renderFrame();
      const info = window.shine.renderInfo();
      return { calls: info.calls, lights: info.lights, programs: info.programs, geometries: info.geometries, banner: document.getElementById('objective-text')?.textContent || '' };
    });
    if (stats.lights !== 12) finding({ kind: 'INVARIANT', text: `${stats.lights} lights at “${name}” (12 expected)` });
    if (stats.calls >= 60) finding({ kind: 'INVARIANT', text: `${stats.calls} draw calls at “${name}” (under 60 expected)` });
    const file = `shots/${String(++shotN).padStart(3, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}.png`;
    await page.screenshot({ path: `${out}/${file}` });
    report.beats.push({ name, note, file, ...stats });
  }

  function finding(f) {
    const key = `${f.kind}:${f.text}`;
    if (report.findings.some((x) => `${x.kind}:${x.text}` === key)) return;
    report.findings.push({ ...f, wall: wall() });
    console.log(`  ! ${f.kind}: ${f.text}`);
  }

  // Play until `stop(event)` says so (or the time runs out). Returns why it stopped.
  async function play(stop, phase) {
    const deadline = t0 + minutes * 60_000;
    for (;;) {
      if (Date.now() > deadline) { finding({ kind: 'TIME', text: `Ran out of time (${minutes} min) in ${phase}` }); return 'time'; }
      const r = await page.evaluate(() => window.__bot.run(240));
      report.last = r.status;
      for (const e of r.events) {
        report.events.push({ ...e, phase });
        if (e.t === 'step') { console.log(`  ✓ [${e.chapter + 1}] ${e.arc ? `(${e.arc}) ` : ''}${e.text}  · day ${e.day} ${e.hour}h · $${e.cash} · ${wall()}s`); await beat(e.id, e.text); }
        if (e.t === 'arc') console.log(`  ★ side story done: ${e.title}`);
        if (e.t === 'finding') { finding({ kind: e.kind, text: e.text, step: e.step, plan: e.plan, banner: e.banner, recent: e.recent, data: e.data, day: e.day, hour: e.hour, chapter: e.chapter }); await beat(`finding-${e.kind}`, e.text); }
      }
      const s = r.status;
      const stopWhy = stop(r.events, s);
      if (stopWhy) return stopWhy;
      const abort = r.events.find((e) => e.t === 'abort');
      if (abort) { finding({ kind: 'ABORT', text: abort.why, plan: s.plan, step: s.step, banner: s.banner }); return 'abort'; }
      // A chapter: note its time, then reload the save and carry on (a save round-trip).
      if (r.events.some((e) => e.t === 'chapter')) {
        const prev = report.chapters.at(-1);
        report.chapters.push({ n: s.chapter, day: s.day, sim: s.sim, cash: s.cash, wall: wall(), drive: s.drive, counts: s.counts, simSince: s.sim - (prev?.sim || 0), daysSince: s.day - (prev?.day || 0) });
        console.log(`== chapter ${s.chapter} done at day ${s.day} · ${s.drive.km} km · $${s.cash} · ${wall()}s`);
        await beat(`chapter-${s.chapter}`, `Chapter ${s.chapter} complete`);
        if (s.chapter >= until) return 'until';
        const memo = r.memo;
        await page.evaluate(() => window.shine.game.dredge.save());
        await boot(false);
        await start({ memo, ending: null });
      }
      if (r.events.some((e) => e.t === 'choice')) return 'choice';
    }
  }

  console.log(`playthrough ${label}: ${QUERY}`);
  await boot(true);
  await start({});
  await beat('start', 'a new game');
  const why = await play((events) => (events.some((e) => e.t === 'choice') ? 'choice' : null), 'story');
  report.storyEnd = { why, ...report.last, wall: wall() };

  // The choice: the same save, each ending in turn.
  if (why === 'choice') {
    await beat('choice', 'the choice is open');
    const save = await page.evaluate(() => { window.shine.game.dredge.save(); return JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))); });
    const memo = await page.evaluate(() => window.__bot.memo());
    for (const ending of endings) {
      // (from a page with no game on it: the game saves itself as it unloads)
      await page.goto(`http://localhost:${port}/__no-game`);
      await page.evaluate((save) => { localStorage.clear(); for (const [k, v] of Object.entries(JSON.parse(save))) localStorage.setItem(k, v); }, save);
      await boot(false);
      await start({ memo, ending });
      const from = report.storyEnd;                // (each ending from the choice's save)
      console.log(`== ending: ${ending}`);
      const got = await play((events) => (events.some((e) => e.t === 'ending') ? 'ending' : null), `ending:${ending}`);
      const s = report.last;
      report.endings[ending] = { reached: got === 'ending' && s.ending === ending, why: got, days: s.day - from.day, sim: s.sim - from.sim, cash: s.cash, wall: wall() };
      if (got === 'ending') await beat(`ending-${ending}`, `The ${ending}`);
      else finding({ kind: 'ENDING', text: `The ${ending} wasn't reached (${got}): ${s.plan}` });
    }
  }
} finally {
  report.wall = wall();
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  writeReport();
  await sheet().catch(() => {});
  await browser.close();
  server.kill();
}
console.log(`\n${report.findings.length} finding(s); report: ${out}/report.md`);
process.exitCode = report.findings.length ? 1 : 0;

function writeReport() {
  const L = [];
  const mins = (s) => `${Math.round(s / 6) / 10} min`;
  L.push(`# Playthrough: ${label}`, '', `Seed ${report.seed} · \`${report.query}\` · ${Math.round(report.wall / 60)} min wall · started ${report.started}`, '');
  L.push(`**Story:** ${report.storyEnd?.why === 'choice' ? 'reached the choice' : `stopped (${report.storyEnd?.why})`} at game day ${report.storyEnd?.day}, $${report.storyEnd?.cash}, ${report.storyEnd?.drive?.km} km driven.`, '');
  L.push('## Chapters', '', '| chapter | game days | driving | km (total) | cash | screens (salvage / brews / sales / orders / cards / sleeps) |', '|---|---|---|---|---|---|');
  for (const c of report.chapters) {
    const k = c.counts || {};
    L.push(`| ${c.n} | ${c.daysSince} (day ${c.day}) | ${mins(c.simSince)} | ${c.drive.km} | $${c.cash} | ${k.salvage || 0} / ${k.brew || 0} / ${k.sales || 0} / ${k.orders || 0} / ${k.cards || 0} / ${k.sleeps || 0} |`);
  }
  L.push('', '## Endings', '');
  for (const [e, r] of Object.entries(report.endings)) L.push(`- **${e}:** ${r.reached ? 'reached' : `NOT reached (${r.why})`} after ${r.days} more game days, ${mins(r.sim)} of driving; $${r.cash}.`);
  if (!Object.keys(report.endings).length) L.push('- (the choice wasn’t reached)');
  L.push('', `## Findings (${report.findings.length})`, '');
  for (const f of report.findings) {
    L.push(`### ${f.kind}: ${f.text}`, '');
    if (f.chapter != null) L.push(`- chapter ${f.chapter + 1}, game day ${f.day} ${f.hour}h`);
    if (f.step) L.push(`- step: ${f.step}`);
    if (f.plan) L.push(`- the bot was: ${f.plan}`);
    if (f.banner) L.push(`- banner: ${f.banner}`);
    if (f.data && Object.keys(f.data).length) L.push(`- data: \`${JSON.stringify(f.data)}\``);
    if (f.recent?.length) L.push('', '```', ...f.recent, '```');
    L.push('');
  }
  L.push('## Steps', '');
  for (const e of report.events.filter((x) => x.t === 'step' || x.t === 'arc')) L.push(`- day ${e.day} ${e.hour}h · ch ${e.chapter + 1} · ${e.t === 'arc' ? `side story done: ${e.title}` : `${e.arc ? `(${e.arc}) ` : ''}${e.text}`} · $${e.cash}`);
  fs.writeFileSync(`${out}/report.md`, L.join('\n') + '\n');
}

async function sheet() {
  const page = await browser.newPage({ viewport: { width: 1640, height: 400 } });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const img = (f) => `data:image/png;base64,${fs.readFileSync(`${out}/${f}`).toString('base64')}`;
  await page.setContent(`<body style="margin:0;background:#111;font:12px monospace;color:#ddd;display:grid;grid-template-columns:repeat(4,400px);gap:8px;padding:8px">${
    report.beats.map((b) => `<div><img style="width:400px;display:block" src="${img(b.file)}"><div><b>${esc(b.name)}</b> ${esc(b.note)} · ${b.calls} calls</div></div>`).join('')}</body>`);
  await page.screenshot({ path: `${out}/sheet.png`, fullPage: true });
}

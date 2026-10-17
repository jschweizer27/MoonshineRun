/* global document, setTimeout */
// The robot that plays SHINE through (scripts/playthrough.mjs): the pilot drives, the hands
// play the screens, the brain picks the errands. `run(seconds)` plays that many seconds of
// game time at a fixed 60 Hz (screens take none) and returns what happened: steps done,
// chapters, findings (STUCK, DEADEND, STALL, SCREEN, CONFIRM, STATE), the ending. Runs in the
// page; `memo()` carries it across a reload.
import { Pilot } from './pilot.js';
import { Brain } from './brain.js';
import { handle } from './hands.js';
import { current, choiceOpen, CHAPTERS } from '../../src/chapters.js';
import { ARCS } from '../../src/arcs.js';
import { dayOf } from '../../src/market.js';

const DT = 1 / 60;

export class Bot {
  constructor(g, { ending = null, memo = null } = {}) {
    this.g = g;
    this.ending = ending;
    this.events = [];
    this.log = memo?.log || [];
    this.counts = memo?.counts || {};
    this.found = new Set(memo?.found || []);
    this.pilot = new Pilot(g, (kind, text, data) => this.find(kind, text, data));
    if (memo?.drive) Object.assign(this.pilot.stats, memo.drive);
    this.brain = new Brain(this);
    this.plan = null;
    this.decideT = 0;
    this.watchT = 0;
    this.atT = 0;
    this.rearm = 0;
    this.rearming = false;
    this.screenN = 0;
    this.lastTop = null;
    const d = g.dredge.data;
    this.seen = { steps: new Set(Object.keys(d.steps)), arcs: new Set(ARCS.filter((a) => d.arcs?.[a.id]?.done).map((a) => a.id)), chapter: d.chapter || 0, choice: choiceOpen(d) };
    this.mark = { key: this.key(), clock: g.dredge.market.clock, warned: false };
  }

  memo() { return { log: this.log.slice(-60), counts: this.counts, found: [...this.found], drive: { ...this.pilot.stats } }; }

  get clock() { return this.g.dredge.market.clock; }
  stamp() { const d = this.g.dredge.data; return { clock: Math.round(this.clock * 10) / 10, day: dayOf(this.g.dredge.market), hour: Math.round(this.g.env.hour * 10) / 10, sim: Math.round(this.pilot.stats.seconds), cash: d.cash, chapter: d.chapter || 0 }; }
  event(e) { this.events.push({ ...e, ...this.stamp() }); }
  note(text) { this.log.push(`[d${dayOf(this.g.dredge.market)} ${this.g.env.clock}] ${text}`); if (this.log.length > 200) this.log.shift(); }
  count(k) { this.counts[k] = (this.counts[k] || 0) + 1; }
  find(kind, text, data = {}) {
    const key = `${kind}:${text}`;
    if (this.found.has(key)) return;
    this.found.add(key);
    const { step } = current(this.g.dredge.data);
    this.event({ t: 'finding', kind, text, data, step: step?.text || null, plan: this.plan?.why || null, banner: document.getElementById('objective-text')?.textContent || '', recent: this.log.slice(-12) });
  }

  // Story progress (not cash: salvaging always moves that).
  key() {
    const d = this.g.dredge.data;
    // (at the choice, saving up counts too: each $1,000 more is progress toward the deed)
    const saved = choiceOpen(d) ? Math.floor(d.cash / 1000) : '';
    return `${d.chapter || 0}|${Object.keys(d.steps).length}|${ARCS.filter((a) => d.arcs?.[a.id]?.done).length}|${d.ending || ''}|${Object.values(d.trust).reduce((s, n) => s + n, 0)}|${saved}`;
  }

  // (async: the game finishes its confirms and story cards in promises, so after each screen
  // action the bot lets the page run them before it goes on)
  async run(seconds) {
    const g = this.g, end = this.pilot.stats.seconds + seconds;
    this.events = [];
    for (let iter = 0; iter < 2e6 && this.pilot.stats.seconds < end; iter++) {
      if (this.events.some((e) => ['ending', 'abort', 'chapter', 'choice'].includes(e.t))) break;
      if (g.state === 'intro') { this.event({ t: 'abort', why: 'back at the title screen' }); break; }
      if (g.ui.anyOpen) {
        const top = g.ui.top.id;
        if (top === this.lastTop) this.screenN++; else { this.screenN = 0; this.lastTop = top; this.count(`screen:${top}`); if (!/^(dialog|trunk)$/.test(top)) this.note(`[${top}]`); }
        if (this.screenN > 400) { this.find('SCREEN', `The ${top} screen wouldn't close`); g.ui.close(); }
        const did = handle(this);
        if (did && !/^(dialog|trunk|salvage)$/.test(did)) this.note(`${top}: ${did}`);
        await new Promise((r) => setTimeout(r, 0));
        continue;
      }
      this.lastTop = null;
      this.brain.visit = null;
      if (g.state === 'paused') { g.resume(); continue; }
      if ((this.decideT -= DT) <= 0) { this.decide(); this.decideT = 1.5; }
      g.step(DT, this.pilot.input(DT, this.brain.fragile() ? 12 : 16));
      this.pilot.tick(DT);
      this.arrival();
      if ((this.watchT -= DT) <= 0) { this.watch(); this.watchT = 0.5; }
    }
    return { events: this.events, memo: this.memo(), status: this.status() };
  }

  decide() {
    const g = this.g, d = g.dredge.data;
    if ((d.nerves ?? 1) < 0.3 && (d.charge?.wind || 0) >= 1 && g.useAbility('wind')) this.note('Second Wind');
    // Shine aboard at night: headlamps off (the agents see much less of the truck; a careful
    // player's trick), on again otherwise.
    const dark = g._night() && g._contraband() > 0;
    if (dark !== !!g.lightsOff) g.toggleLights();
    if (g.police.tier > 0) {
      if ((d.charge?.smoke || 0) >= 1 && g.useAbility('smoke')) this.note('Smoke Screen');
      if (this.plan?.why !== 'getting away') { this.note(`chased (★${g.police.tier}): getting away`); this.chaseFrom = this.pilot.stats.seconds; this.count('chases'); }
      this.plan = { why: 'getting away', flee: true };
      // Two minutes and still on his tail: pull over (a bust, as for a player who can't shake
      // them); if nobody comes to make it, drive on.
      const t = this.pilot.stats.seconds - this.chaseFrom;
      if (t > 120 && t < 160) { if (!this.gaveUp) { this.note('pulled over'); this.count('pulled over'); } this.gaveUp = true; this.pilot.stop(); return; }
      if (t >= 160) { this.chaseFrom = this.pilot.stats.seconds; this.gaveUp = false; }
      this.pilot.flee();
      return;
    }
    this.gaveUp = false;
    if (this.rearming) {
      if (this.pilot.dist > 6) return;
      this.rearming = false;
    }
    const plan = this.brain.choose();
    if (plan.screen === 'notebook' && !plan.go) { this.note(plan.why); g.openNotebook(); this.plan = plan; return; }
    const same = this.plan?.go && plan.go && Math.hypot(plan.go.x - this.plan.go.x, plan.go.z - this.plan.go.z) < 1;
    if (!same) { this.atT = 0; this.rearm = 0; }
    if (plan.why !== this.plan?.why) this.note(`→ ${plan.why}`);
    this.plan = plan;
    if (plan.go) this.pilot.go(plan.go, { near: plan.near ?? 5, avoid: this.avoid(), why: plan.why });
    else this.pilot.stop();
  }

  // Round the York Road checkpoint at night with shine aboard (the back roads), if there's a
  // way round.
  avoid() {
    const g = this.g, C = g.police.checkpoint;
    return C && g._night() && g._contraband() ? [{ x: C.x, z: C.z, r: 45 }] : [];
  }

  // Pulled up where the errand is and nothing's opened: drive off and come back (the stops
  // want Otto to arrive), twice; then it's a finding and the errand waits a while.
  arrival() {
    const g = this.g, P = this.plan;
    if (!P?.go || P.flee || this.rearming || !this.pilot.arrived || g.ui.anyOpen) { if (!this.pilot.arrived) this.atT = 0; return; }
    this.atT += DT;
    if (this.atT < 3 || /^wait for/.test(P.why)) return;
    this.atT = 0;
    if (this.rearm++ < 2) {
      // (the nearest road node more than 35 m off: county roads have long stretches)
      const p = g.player.position, far = g.world.roads.nodes.filter((x) => Math.hypot(x.x - p.x, x.z - p.z) > 35);
      const n = far.length ? far.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a)) : null;
      if (n) { this.rearming = true; this.pilot.go(n, { near: 6, why: 'circle back' }); return; }
    }
    const m = g._nearestMarket();
    this.find('DEADEND', `Stopped for “${P.why}” and nothing happened`, {
      at: [Math.round(g.player.position.x), Math.round(g.player.position.z)], speed: +g.player.speed.toFixed(2), state: g.state,
      market: [m.town?.id, Math.round(m.dist), m.inside], left: { market: g._marketLeft, barn: g._barnLeft, site: g._siteLeft, job: g._jobLeft },
    });
    this.brain.fail(P.key || `${Math.round(P.go.x)},${Math.round(P.go.z)}`, 3);
    this.rearm = 0;
    this.decideT = 0;
  }

  watch() {
    const g = this.g, d = g.dredge.data, p = g.player.position;
    for (const id of Object.keys(d.steps)) {
      if (this.seen.steps.has(id)) continue;
      this.seen.steps.add(id);
      const ch = CHAPTERS.find((c) => c.steps.some((s) => s.id === id)), arc = ARCS.find((a) => a.steps.some((s) => s.id === id));
      const s = (ch || arc)?.steps.find((x) => x.id === id);
      this.event({ t: 'step', id, text: s?.text || id, chapterTitle: ch?.title || null, arc: arc?.id || null });
    }
    for (const a of ARCS) if (d.arcs?.[a.id]?.done && !this.seen.arcs.has(a.id)) { this.seen.arcs.add(a.id); this.event({ t: 'arc', id: a.id, title: a.title }); }
    if ((d.chapter || 0) !== this.seen.chapter) { this.seen.chapter = d.chapter || 0; this.event({ t: 'chapter', n: this.seen.chapter }); }
    if (choiceOpen(d) && !this.seen.choice) { this.seen.choice = true; this.event({ t: 'choice' }); }
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { this.find('STATE', 'The truck’s position is not a number'); this.event({ t: 'abort', why: 'NaN position' }); }
    if (d.cash < 0) this.find('STATE', `Cash went negative ($${d.cash})`);
    const k = this.key();
    if (k !== this.mark.key) this.mark = { key: k, clock: this.clock, warned: false };
    const stuck = this.clock - this.mark.clock;
    if (stuck > 96 && !this.mark.warned) {
      this.mark.warned = true;
      this.find('STUCK', `No story progress for ${Math.round(stuck / 24)} game days (${this.plan?.why || 'no plan'})`);
    }
    if (stuck > 240) this.event({ t: 'abort', why: `stuck for ${Math.round(stuck / 24)} game days` });
  }

  status() {
    const g = this.g, d = g.dredge.data, { chapter, step } = current(d);
    return {
      ...this.stamp(), title: chapter?.title || (d.ending ? `ending: ${d.ending}` : 'the choice'), step: step?.text || null, plan: this.plan?.why || null,
      banner: document.getElementById('objective-text')?.textContent || '', trunk: g.trunk.count, orders: d.orders.length, ending: d.ending || null,
      drive: { km: Math.round(this.pilot.stats.metres / 100) / 10, min: Math.round(this.pilot.stats.seconds / 6) / 10, stalls: this.pilot.stats.stalls, unstuck: this.pilot.stats.unstuck },
      counts: this.counts,
    };
  }
}

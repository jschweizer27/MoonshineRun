#!/usr/bin/env node
// Turn Playwright's JSON report into a readable GitHub Actions job summary.
import fs from 'node:fs';

const file = process.argv[2] || 'artifacts/results.json';
if (!fs.existsSync(file)) {
  console.log('## SHINE playtests\n\nNo test results were produced (an earlier step failed).');
  process.exit(0);
}
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = [];
const walk = (suite, trail) => {
  const here = suite.title ? [...trail, suite.title] : trail;
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      const status = t.status === 'flaky' ? 'flaky' : t.results?.at(-1)?.status ?? 'skipped';
      const icon = { passed: '✅', flaky: '🔁', failed: '❌', timedOut: '⏱️', skipped: '⏭️', interrupted: '⚠️' }[status] || '❔';
      rows.push(`| ${icon} | ${[...here, spec.title].join(' › ').replace(/\|/g, '\\|')} | ${t.projectName} |`);
    }
  }
  for (const child of suite.suites || []) walk(child, here);
};
for (const s of report.suites || []) walk(s, []);

const st = report.stats || {};
console.log(`## 🎮 SHINE playtest results

**${st.expected ?? 0} passed** · **${st.unexpected ?? 0} failed** · ${st.flaky ?? 0} flaky · ${st.skipped ?? 0} skipped · ${((st.duration ?? 0) / 60000).toFixed(1)} min

🔁 = passed on a retry (flaky). ❌ / ⏱️ = failed or timed out.

| | Test | Suite |
|---|---|---|
${rows.join('\n')}

📸 Gameplay screenshots from this run are attached as the **gameplay-screenshots** artifact (see the run's Summary page).`);

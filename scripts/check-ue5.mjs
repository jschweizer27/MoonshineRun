#!/usr/bin/env node
// Static checks for the UE5 scaffold in ue5/. CI machines have no Unreal Engine, so this
// catches the mistakes that are checkable without it: Unreal Header Tool rules, local
// includes that don't exist, engine modules missing from Build.cs, delegate handlers
// that aren't UFUNCTIONs, unbalanced braces and a broken .uproject.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)), 'ue5');
const moduleDir = path.join(root, 'Source/MoonshineRun');
const problems = [];
const fail = (file, msg) => problems.push(`${path.relative(root, file)}: ${msg}`);

// The project file: valid JSON, our module, and the plugins the code needs.
const uprojectFile = path.join(root, 'MoonshineRun.uproject');
try {
  const project = JSON.parse(fs.readFileSync(uprojectFile, 'utf8'));
  if (!project.Modules?.some((m) => m.Name === 'MoonshineRun')) fail(uprojectFile, 'no MoonshineRun module');
  for (const plugin of ['ChaosVehiclesPlugin', 'EnhancedInput']) {
    if (!project.Plugins?.some((p) => p.Name === plugin && p.Enabled)) fail(uprojectFile, `plugin ${plugin} not enabled`);
  }
} catch (e) {
  fail(uprojectFile, `invalid JSON (${e.message})`);
}

// Engine modules each include needs, checked against Build.cs.
const buildCs = fs.readFileSync(path.join(moduleDir, 'MoonshineRun.Build.cs'), 'utf8');
const MODULE_FOR = [
  [/^(AIController|AITypes)\.h$|^BehaviorTree\//, 'AIModule'],
  [/^Navigation(System|Path)\.h$/, 'NavigationSystem'],
  [/^(EnhancedInput\w*|InputAction|InputMappingContext|InputModifiers)\.h$/, 'EnhancedInput'],
  [/^(ChaosVehicle\w*|ChaosWheeledVehicle\w*|WheeledVehiclePawn)\.h$/, 'ChaosVehicles'],
  [/^(Blueprint\/|Components\/Widget)/, 'UMG'],
];

// Strip comments and string/char literals so brace counting and keyword checks only see code.
const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/"(?:\\.|[^"\\])*"/g, '""')
  .replace(/'(?:\\.|[^'\\])'/g, "''");

const files = fs.readdirSync(moduleDir).filter((f) => /\.(h|cpp)$/.test(f));
const local = new Set(files);
for (const name of files) {
  const file = path.join(moduleDir, name);
  const src = fs.readFileSync(file, 'utf8');
  const body = code(src);
  const includes = [...src.matchAll(/^#include\s+"([^"]+)"/gm)].map((m) => m[1]);
  const base = name.replace(/\.(h|cpp)$/, '');

  for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
    const n = body.split(open).length - body.split(close).length;
    if (n !== 0) fail(file, `unbalanced ${open}${close} (${n > 0 ? '+' : ''}${n})`);
  }
  for (const inc of includes) {
    const looksLocal = /^(Moonshine|Prohibition|Shine|BT\w+_Shine)/.test(inc) && !inc.endsWith('.generated.h');
    if (looksLocal && !local.has(inc)) fail(file, `includes "${inc}", which doesn't exist`);
    for (const [pattern, mod] of MODULE_FOR) {
      if (pattern.test(inc) && !buildCs.includes(`"${mod}"`)) fail(file, `includes "${inc}" but Build.cs lacks "${mod}"`);
    }
  }

  if (name.endsWith('.h')) {
    if (!/^#pragma once/m.test(src)) fail(file, 'missing #pragma once');
    const reflected = /\b(UCLASS|USTRUCT|UENUM|UINTERFACE)\s*\(/.test(body) || /DECLARE_DYNAMIC_\w+DELEGATE/.test(body);
    if (reflected) {
      const generated = `${base}.generated.h`;
      if (includes.at(-1) !== generated) fail(file, `"${generated}" must be the last #include`);
    }
    const types = (body.match(/\b(UCLASS|USTRUCT)\s*\(/g) || []).length;
    const bodies = (body.match(/\bGENERATED_(BODY|UCLASS_BODY|USTRUCT_BODY)\s*\(/g) || []).length;
    if (types !== bodies) fail(file, `${types} UCLASS/USTRUCT but ${bodies} GENERATED_BODY()`);
  } else if (base !== 'MoonshineRun' && includes[0] !== `${base}.h`) {
    fail(file, `should include "${base}.h" first`);
  }

  // AddDynamic handlers must be UFUNCTIONs in the class header.
  for (const m of body.matchAll(/AddDynamic\(\s*this\s*,\s*&(\w+)::(\w+)\s*\)/g)) {
    const header = path.join(moduleDir, `${m[1].slice(1)}.h`);
    const h = fs.existsSync(header) ? code(fs.readFileSync(header, 'utf8')) : '';
    if (!new RegExp(`UFUNCTION\\([^)]*\\)\\s*void\\s+${m[2]}\\s*\\(`).test(h)) fail(file, `${m[2]} is bound with AddDynamic but isn't a UFUNCTION`);
  }
}

// Every class declared in a header is defined somewhere (constructors at least).
for (const name of files.filter((f) => f.endsWith('.h'))) {
  const src = code(fs.readFileSync(path.join(moduleDir, name), 'utf8'));
  for (const m of src.matchAll(/\bclass\s+MOONSHINERUN_API\s+(\w+)/g)) {
    const cls = m[1];
    const declaresCtor = new RegExp(`\\b${cls}\\s*\\(\\s*\\)\\s*;`).test(src);
    const defined = files.some((f) => f.endsWith('.cpp') && fs.readFileSync(path.join(moduleDir, f), 'utf8').includes(`${cls}::`));
    if (declaresCtor && !defined) fail(path.join(moduleDir, name), `${cls} declares a constructor that no .cpp defines`);
  }
}

if (problems.length) {
  console.error(`✗ UE5 scaffold (${problems.length} problem${problems.length > 1 ? 's' : ''}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`UE5 scaffold: ${files.length} C++ files pass static checks (the engine itself can't run in CI)`);

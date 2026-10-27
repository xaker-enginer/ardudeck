/**
 * Collect licence texts from the actual installed npm packages and Cargo.lock
 * dependencies. No network access; no licence text is guessed from an SPDX id.
 *
 * node tools/generate-third-party-notices.mjs --cargo-home=C:/path/to/.cargo
 * Optional: --report=C:/path/to/report.json
 * Includes build-only packages as a conservative superset of bundled code.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const split = arg.indexOf('=');
  if (!arg.startsWith('--') || split === -1) throw new Error(`Expected --option=value: ${arg}`);
  return [arg.slice(2, split), arg.slice(split + 1)];
}));
const cargoHome = path.resolve(args['cargo-home'] || process.env.CARGO_HOME || path.join(os.homedir(), '.cargo'));
const output = path.join(root, 'apps/desktop/resources/THIRD-PARTY-NOTICES.txt');
const packages = new Map();
const walkedModules = new Set();
const walkedPackages = new Set();
const missingCargo = [];
const runtimeWarnings = [];
const licenceFile = /^(licen[cs]es?|copying|notice|copyright|unlicense)([._ -].*)?$/i;
const excluded = new Set(['node_modules', '.git', '.hg', '.svn', 'target', 'prebuilds', 'dist', 'build', 'coverage', 'test', 'tests', '__tests__']);

function entries(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
function addBody(record, relative, body) {
  const text = body.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').trimEnd();
  if (!text.trim()) return;
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  record.texts.set(hash, { text, files: [...(record.texts.get(hash)?.files ?? []), relative].sort() });
}
function addText(record, base, file) {
  const relative = path.relative(base, file).replaceAll('\\', '/');
  if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`Licence file outside package: ${file}`);
  const data = fs.readFileSync(file);
  if (!data.includes(0)) addBody(record, relative, data.toString('utf8'));
}
function collectTexts(record, dir, current = dir, depth = 0) {
  for (const item of entries(current)) {
    const full = path.join(current, item.name);
    if (item.isFile() && licenceFile.test(item.name)) addText(record, dir, full);
    else if (item.isDirectory() && depth < 8 && !excluded.has(item.name.toLowerCase())) {
      collectTexts(record, dir, full, depth + 1);
    }
  }
}
function normalLicense(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(normalLicense).filter(Boolean).join(' OR ');
  return value?.type || '';
}
function npmPackage(dir) {
  let real;
  try { real = fs.realpathSync(dir); } catch { return; }
  if (walkedPackages.has(real)) return;
  walkedPackages.add(real);
  const manifest = path.join(real, 'package.json');
  if (!fs.existsSync(manifest)) return;
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (!pkg.name || !pkg.version) return;
  if (!pkg.name.startsWith('@ardudeck/')) {
    const id = `npm:${pkg.name}@${pkg.version}`;
    const record = packages.get(id) ?? { id, kind: 'npm', name: pkg.name, version: pkg.version, license: normalLicense(pkg.license ?? pkg.licenses), author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name || '', texts: new Map(), repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '', source: `https://registry.npmjs.org/${pkg.name}/-/${pkg.name.split('/').at(-1)}-${pkg.version}.tgz` };
    collectTexts(record, real);
    const explicit = /SEE LICEN[CS]E IN\s+(.+)/i.exec(record.license)?.[1];
    if (explicit && fs.existsSync(path.resolve(real, explicit))) addText(record, real, path.resolve(real, explicit));
    // Some small packages only include their licensing notice in the README.
    if (!record.texts.size) {
      const readme = entries(real).find((entry) => entry.isFile() && /^readme(\.|$)/i.test(entry.name));
      if (readme) {
        const file = path.join(real, readme.name);
        const text = fs.readFileSync(file, 'utf8');
        if (/(?:^|\n)#{1,6}\s+(?:licen[cs]e|copyright)\b|copyright\s+(?:\(c\)|©)/im.test(text)) addText(record, real, file);
      }
    }
    if (!record.texts.size) {
      for (const item of entries(real)) {
        if (!item.isFile() || !/\.[cm]?js$/i.test(item.name)) continue;
        const text = fs.readFileSync(path.join(real, item.name), 'utf8');
        const header = text.match(/^\s*(\/\*[\s\S]*?\*\/|(?:\/\/[^\n]*(?:\n|$))+)/)?.[1];
        if (header && /Permission is hereby granted|Redistribution and use/i.test(header)) addBody(record, `${item.name} (original licence header)`, header);
      }
    }
    packages.set(id, record);
  }
  walkNodeModules(path.join(real, 'node_modules'));
}
function walkNodeModules(dir) {
  if (!fs.existsSync(dir)) return;
  const real = fs.realpathSync(dir);
  if (walkedModules.has(real)) return;
  walkedModules.add(real);
  for (const item of entries(dir)) {
    const full = path.join(dir, item.name);
    if (item.name === '.pnpm') {
      for (const store of entries(full)) if (store.isDirectory()) walkNodeModules(path.join(full, store.name, 'node_modules'));
    } else if (item.name.startsWith('@')) {
      for (const scoped of entries(full)) npmPackage(path.join(full, scoped.name));
    } else if (!item.name.startsWith('.')) npmPackage(full);
  }
}
function field(block, name) {
  const match = block.match(new RegExp(`^${name}\\s*=\\s*"([^"\\n]*)"`, 'm'));
  return match?.[1] ?? '';
}
function cargoDependencies(lock) {
  const contents = fs.readFileSync(lock, 'utf8');
  for (const block of contents.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = field(block, 'name');
    const version = field(block, 'version');
    const source = field(block, 'source');
    if (!source.startsWith('registry+')) continue;
    const id = `cargo:${name}@${version}`;
    if (packages.has(id)) continue;
    const registries = entries(path.join(cargoHome, 'registry/src'));
    const dir = registries.map((registry) => path.join(cargoHome, 'registry/src', registry.name, `${name}-${version}`)).find((candidate) => fs.existsSync(candidate));
    if (!dir) { missingCargo.push(id); continue; }
    const manifest = fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf8').split(/^\[package\]\s*$/m)[1]?.split(/^\[/m)[0] ?? '';
    const record = { id, kind: 'cargo', name, version, license: field(manifest, 'license'), texts: new Map(), repository: field(manifest, 'repository'), source: `https://crates.io/api/v1/crates/${name}/${version}/download` };
    collectTexts(record, dir);
    const explicit = field(manifest, 'license-file');
    if (explicit && fs.existsSync(path.resolve(dir, explicit))) addText(record, dir, path.resolve(dir, explicit));
    packages.set(id, record);
  }
}

walkNodeModules(path.join(root, 'node_modules'));
for (const workspace of ['apps', 'packages', 'tools']) {
  for (const item of entries(path.join(root, workspace))) if (item.isDirectory()) walkNodeModules(path.join(root, workspace, item.name, 'node_modules'));
}
for (const crate of ['ardudeck-frame', 'ardudeck-sim-engine']) cargoDependencies(path.join(root, 'crates', crate, 'Cargo.lock'));

const supplementDir = path.join(root, 'tools/third-party-licenses');
const supplementManifest = path.join(supplementDir, 'manifest.json');
if (fs.existsSync(supplementManifest)) {
  for (const entry of JSON.parse(fs.readFileSync(supplementManifest, 'utf8'))) {
    const record = packages.get(entry.id);
    if (!record) continue;
    const file = path.resolve(supplementDir, entry.file);
    if (!file.startsWith(supplementDir + path.sep)) throw new Error('Invalid supplement path');
    const data = fs.readFileSync(file);
    if (crypto.createHash('sha256').update(data).digest('hex') !== entry.sha256) throw new Error(`Changed licence supplement: ${entry.id}`);
    addBody(record, `upstream licence: ${entry.url}${entry.basis ? ` (${entry.basis})` : ''}`, data.toString('utf8'));
  }
}

const xzRecord = packages.get('npm:xz-decompress@0.2.3');
if (xzRecord) {
  const file = path.join(root, 'node_modules/xz-decompress/dist/package/xz-decompress.js');
  const header = fs.readFileSync(file, 'utf8').match(/^\/\*![\s\S]*?\*\//)?.[0];
  if (!header) throw new Error('Expected xz-decompress third-party attribution header');
  addBody(xzRecord, 'dist/package/xz-decompress.js (original attribution header)', header);
}

let rustSysroot = args['rust-sysroot'];
if (!rustSysroot) {
  try { rustSysroot = execFileSync('rustc', ['--print', 'sysroot'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { runtimeWarnings.push('Rust sysroot not found; pass --rust-sysroot=... when including locally built Rust helpers.'); }
}
if (rustSysroot) {
  rustSysroot = path.resolve(rustSysroot);
  const rustc = path.join(rustSysroot, 'bin', process.platform === 'win32' ? 'rustc.exe' : 'rustc');
  const version = execFileSync(rustc, ['--version'], { encoding: 'utf8' }).trim().split(' ')[1];
  const record = { id: `runtime:rust@${version}`, kind: 'runtime', name: 'rust', version, license: 'See original Rust library notices and GNU runtime exception below', texts: new Map(), source: `https://github.com/rust-lang/rust/tree/${version}`, repository: 'https://github.com/rust-lang/rust' };
  for (const relative of ['share/doc/rust/COPYRIGHT-library.html', 'share/doc/COPYING.RUNTIME', 'share/doc/COPYING3', 'share/doc/README.txt']) {
    const file = path.join(rustSysroot, relative);
    if (fs.existsSync(file)) addText(record, rustSysroot, file);
    else if (relative.includes('COPYRIGHT-library')) runtimeWarnings.push(`Rust library notices absent: ${relative}`);
  }
  packages.set(record.id, record);
}

const sorted = [...packages.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'));
const texts = new Map();
for (const record of sorted) for (const [hash, value] of record.texts) {
  const entry = texts.get(hash) ?? { hash, text: value.text, references: [] };
  entry.references.push(`${record.id}: ${[...new Set(value.files)].join(', ')}`);
  texts.set(hash, entry);
}
const sections = [...texts.values()].sort((a, b) => a.hash.localeCompare(b.hash, 'en'));
const textIds = new Map(sections.map((section, i) => [section.hash, `L${String(i + 1).padStart(4, '0')}`]));
const missingText = sorted.filter((record) => !record.texts.size).map((record) => ({ id: record.id, license: record.license, source: record.source }));
const report = {
  npmPackages: sorted.filter((record) => record.kind === 'npm').length,
  cargoPackages: sorted.filter((record) => record.kind === 'cargo').length,
  uniqueTexts: sections.length,
  missingText,
  missingCargo: [...new Set(missingCargo)].sort(),
  runtimeWarnings,
  embeddedComponents: [
    { parent: 'npm:usb@2.16.0', name: 'libusb', license: 'LGPL-2.1-or-later', notice: 'usb/libusb/COPYING', sourceAsset: 'usb-2.16.0-source.zip' },
    { parent: 'Rust GNU toolchain', name: 'GNU runtime', license: 'GPL-3.0-or-later WITH GCC-exception-3.1', notice: 'COPYING3 and COPYING.RUNTIME from the used toolchain' },
  ],
  copyleftMetadata: sorted.filter((record) => /(?:^|[^A-Z])(?:A?GPL|LGPL|MPL|EPL|CDDL)/i.test(record.license)).map((record) => ({ id: record.id, license: record.license })),
};
const lines = [
  'ArduDeck RU — уведомления о сторонних компонентах / Third-party notices',
  '',
  'Составлено из установленных пакетов npm и исходников зависимостей Cargo.lock.',
  'Перечень намеренно включает инструменты сборки и тестирования: наличие в нём',
  'не означает, что каждый компонент включён в исполняемый файл.',
  'Тексты лицензий и уведомлений сохранены на языке оригинала.',
  'Поле SPDX взято из метаданных пакета и не заменяет его лицензионный текст.',
  'Одинаковые тексты объединены; ссылки Lxxxx указывают на полный текст ниже.',
  'Electron/Chromium и MediaMTX также сопровождаются отдельными лицензиями в поставке.',
  'Исходники форка: https://github.com/xaker-enginer/ardudeck',
  '',
  'IMPORTANT: usb includes libusb (LGPL-2.1-or-later); the package metadata MIT',
  'describes its JavaScript/native binding, not the entirety of the linked binary.',
  'See usb/libusb/COPYING below and the corresponding usb source archive supplied',
  'with the release. Redistribution does not restrict replacement or relinking',
  'of that library, or reverse engineering needed to debug such modifications.',
  '',
  'ПЕРЕЧЕНЬ КОМПОНЕНТОВ / COMPONENT INDEX',
  '',
];
for (const record of sorted) {
  lines.push(record.id, `  Declared license: ${record.license || '(not declared)'}`, `  Source: ${record.source}`);
  if (record.author) lines.push(`  Author (package metadata): ${record.author}`);
  if (record.repository) lines.push(`  Repository: ${record.repository}`);
  lines.push(`  Texts: ${record.texts.size ? [...record.texts.keys()].map((hash) => textIds.get(hash)).sort().join(', ') : '(no licence text included in the installed package; see source)'}`, '');
}
if (report.missingCargo.length) lines.push('Cargo.lock entries whose sources were unavailable locally:', ...report.missingCargo, '');
lines.push('ПОЛНЫЕ ТЕКСТЫ / FULL TEXTS', '');
for (const section of sections) {
  lines.push('='.repeat(78), textIds.get(section.hash), ...section.references.sort(), '-'.repeat(78), section.text, '');
}
fs.writeFileSync(output, lines.join('\n') + '\n');
if (args.report) fs.writeFileSync(path.resolve(args.report), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, output), ...report }, null, 2));
if (report.missingCargo.length) process.exitCode = 1;

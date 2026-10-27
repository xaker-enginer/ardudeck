// Сборка открытого состава ArduDeck RU для Windows x64, 27.10.2026.
// Исходные LICENSE и MODULE-EXCEPTION.md действуют без изменений.
import { existsSync, readFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Эта команда предназначена для сборки на Windows x64.');
}
for (const file of [
  'out/main/index.js',
  'out/renderer/index.html',
  'sim-engine-bin/ardudeck-sim-engine.exe',
  'frame-bin/frame_blueprint.exe',
  'resources/bin/win32/mediamtx.exe',
  'resources/bin/win32/MEDIAMTX-LICENSE',
  'resources/THIRD-PARTY-NOTICES.txt',
  '../../node_modules/electron/dist/electron.exe',
]) {
  if (!existsSync(resolve(desktop, file))) throw new Error(`Отсутствует ${file}. См. docs/BUILD-WINDOWS-RU.md.`);
}
const pkg = JSON.parse(readFileSync(resolve(desktop, 'package.json'), 'utf8'));
if (!pkg.version.includes('-ru.')) throw new Error('Нужна отдельная версия русского форка, например 0.1.2-ru.1.');
const result = spawnSync(process.execPath, [
  resolve(desktop, '../../node_modules/electron-builder/cli.js'),
  '--config', 'electron-builder.ru.cjs', '--win', 'nsis', '--x64', '--publish', 'never',
], { cwd: desktop, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status === 0) {
  // electron-updater derives the custom channel "ru" from 0.1.2-ru.1.
  // GitHub packaging otherwise emits only latest.yml.
  copyFileSync(resolve(desktop, 'release/latest.yml'), resolve(desktop, 'release/ru.yml'));
}
process.exit(result.status ?? 1);

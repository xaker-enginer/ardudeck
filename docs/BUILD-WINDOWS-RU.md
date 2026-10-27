# Сборка ArduDeck RU для Windows

Неофициальный русский форк [xaker-enginer/ardudeck](https://github.com/xaker-enginer/ardudeck).
Инструкция для версии **0.1.2-ru.1**, 27 октября 2026 года.

## Установка готовой программы

На [странице релизов форка](https://github.com/xaker-enginer/ardudeck/releases)
выберите `ArduDeck-RU-0.1.2-ru.1-win-x64-setup.exe`. Это установщик для Windows x64.
Запустите его, выберите язык установщика и каталог. Приложение называется
**ArduDeck RU**; русский интерфейс включён при первом запуске.
Другой язык можно выбрать в настройках.

Сборка не подписана сертификатом издателя, поэтому Windows может показать
предупреждение SmartScreen. Контрольная сумма находится в файле `SHA256SUMS.txt`
того же релиза. Проверка скачанного файла в PowerShell:

```powershell
Get-FileHash .\ArduDeck-RU-0.1.2-ru.1-win-x64-setup.exe -Algorithm SHA256
```

Настройки форка хранятся отдельно от официальной программы, в
`%APPDATA%\ArduDeck RU`. Обновления и описание релизов берутся из этого форка.
Схема ссылок форка — `ardudeck-ru://`; официальная `ardudeck://` не переопределяется.
Переходы со сторонних сайтов, использующих официальную схему, автоматически
не перенаправляются в русскую сборку.

## Состав и ограничения

- Исходники приложения и перевод: GPL-3.0; исходный автор — Ruben M / rubenCodeforges.
- Открытые Rust-компоненты симуляции и генерации моделей собраны из исходников
  этого же релиза. MediaMTX включён вместе с его MIT-лицензией.
- Закрытый orchestrator не включён. Групповое управление, построения и роевой SITL
  требуют этого движка и в данной поставке недоступны. Прямой MAVLink-канал
  одного аппарата от него не зависит.
- Готовые iNav SITL-бинарники и старые встроенные прошивки APM1/APM2 не входят
  в установщик. Их наличие в исходном интерфейсе не означает наличие файлов.
  ArduPilot SITL загружает свой runtime отдельно штатным способом.
- FFmpeg и дополнительные файлы прошивок загружаются при использовании
  соответствующих функций. Наличие установщика не означает полностью автономную
  работу всех карт, онлайн-сервисов и симуляторов.
- Проверка запуска и интерфейса не заменяет испытания с конкретным контроллером.

## Сборка из исходников

Нужны Windows x64, Node.js 20.19 или новее, **pnpm 9.15.1**, Git и Rust/Cargo
с рабочим Windows-компоновщиком. Используйте pnpm и `pnpm-lock.yaml`; старый
`package-lock.json` не описывает эту сборку. Состояние исходников зафиксировано
тегом `v0.1.2-ru.1`; архив исходников приложен к релизу.

```powershell
git clone --branch v0.1.2-ru.1 https://github.com/xaker-enginer/ardudeck.git
cd ardudeck
pnpm install --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js

cargo build --release --locked --manifest-path crates/ardudeck-sim-engine/Cargo.toml --bin ardudeck-sim-engine
cargo build --release --locked --manifest-path crates/ardudeck-frame/Cargo.toml --bin frame_blueprint
New-Item -ItemType Directory -Force apps/desktop/sim-engine-bin, apps/desktop/frame-bin
Copy-Item crates/ardudeck-sim-engine/target/release/ardudeck-sim-engine.exe apps/desktop/sim-engine-bin/
Copy-Item crates/ardudeck-frame/target/release/frame_blueprint.exe apps/desktop/frame-bin/

node tools/fetch-mediamtx.mjs win32 x64
node tools/generate-third-party-notices.mjs
pnpm build
node tools/i18n/verify-locale.mjs ru
node tools/i18n/verify-ru.mjs
pnpm package:ru:win
```

Команда `package:ru:win` проверяет наличие компонентов, использует
`apps/desktop/electron-builder.ru.cjs` и создаёт NSIS-установщик в
`apps/desktop/release/`. Она не публикует файлы и не пытается скачать закрытый
orchestrator. Обычная исходная команда `pnpm package` требует закрытый движок;
для этого форка используйте команду с суффиксом `:ru:win`.

При использовании GNU toolchain вместо MSVC может потребоваться
`RUSTFLAGS=-C link-self-contained=yes -C linker-flavor=ld.lld` и путь к встроенному
`rust-lld.exe`; выбор toolchain задаётся вашей установкой
Rust. Приведённые пути результатов относятся к нативной сборке без `--target`.

В дистрибутиве сохранены `LICENSE`, `MODULE-EXCEPTION.md`, уведомления Electron
и зависимости в `resources/THIRD-PARTY-NOTICES.txt`. Уведомления MediaMTX находятся
рядом с его исполняемым файлом. Юридические тексты оригинала не заменяются переводом.
К релизу дополнительно приложены `usb-2.16.0-source.zip` (исходники USB-модуля
и libusb с инструкцией пересборки) и `cargo-vendor-source.zip` (зависимости Rust
из двух Cargo.lock). Архив исходников приложения не содержит готовые бинарники
SITL и старые прошивки, исключённые из установщика.

## Выпуск в своём форке

Проверьте словарь, тесты, сборку, запуск установленной программы и наличие лицензий.
Создайте отдельный тег версии, приложите установщик, архив соответствующих исходников
и SHA-256. Укажите известные ограничения и отсутствие подписи. Автопубликация
в исходный проект не настроена; CLA оригинального проекта этим не принимается.

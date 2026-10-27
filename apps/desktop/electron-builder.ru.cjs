// Неофициальная Windows-сборка, 27.10.2026. Закрытый orchestrator не включается.
const { build } = require('./package.json');

module.exports = {
  ...build,
  electronDist: '../../node_modules/electron/dist',
  // These upstream prebuilt files have no pinned corresponding source here.
  // ArduPilot SITL still downloads its runtime through the normal application flow.
  files: [
    // Keep exclusions in the same file set: builder otherwise merges a later
    // root file set before the include patterns and re-includes those files.
    { filter: [...build.files.filter(item => typeof item === 'string'), '!resources/sitl{,/**}', '!resources/firmware/legacy{,/**}'] },
    ...build.files.filter(item => typeof item !== 'string'),
  ],
  extraResources: [
    { from: 'sim-engine-bin', to: 'sim-engine', filter: ['ardudeck-sim-engine.exe'] },
    { from: 'frame-bin', to: 'frame-blueprint', filter: ['frame_blueprint.exe'] },
    {
      from: '../..',
      to: 'licenses/ardudeck',
      filter: ['LICENSE', 'MODULE-EXCEPTION.md', 'TRANSLATION-RU.md', 'docs/BUILD-WINDOWS-RU.md'],
    },
  ],
  win: { ...build.win, target: ['nsis'] },
};

// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { expect, it } from 'vitest';
// The build helper is plain JavaScript so Node can run it without a loader.
// @ts-expect-error No separate declaration is needed for this build-only helper.
import { packageSource } from '../../scripts/package-source.mjs';

it('packages application source and notices without private game files', () => {
  const root = mkdtempSync(join(tmpdir(), 'lemmings-source-'));
  const files = [
    '.gitignore', 'LICENSE', 'README.md', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts',
    'scripts/verify-public-data.ts', 'scripts/package-source.mjs', 'scripts/package-local.mjs', 'scripts/package-windows-audio.mjs', 'scripts/package-windows-graphics.mjs', 'scripts/package-windows-game.mjs', 'scripts/package-windows-local.mjs', 'docu/LICENCE_REVIEW.md', 'docu/ANDROID_DEVICE_CHECK.md', 'docu/LEMMIX_REPLAY_IMPORT.md',
    'public/sw.js', 'public/manifest.webmanifest', 'public/favicon.ico', 'public/data/config.json',
    'public/data/README.md', 'public/data/lemmings/README.md', 'public/data/lemmings_ohNo/README.md',
    'public/data/lemmings_Holiday93/README.md', 'public/data/lemmings_Holiday94/README.md',
    'public/data/lemmings_X-Mas91/README.md', 'public/data/lemmings_X-Mas92/README.md',
    'public/icons/icon-192.png', 'public/icons/icon-512.png', 'public/icons/maskable-512.png', 'scripts/make-icons.mjs', 'public/third-party.html',
    'public/licenses/GPL-2.0.txt', 'public/licenses/LGPL-2.1.txt', 'src/main.ts', 'src/private.dat',
    'tests/unit/example.spec.ts', 'tests/integration/private.tmp.spec.ts',
    'public/data/private.dat', 'dos/lemmings/LEVEL000.DAT', 'dist/data/local-game/main.dat',
    ...['vue', 'vue-router', 'fflate', 'webaudio-tinysynth', '@vue/shared', '@vue/reactivity', '@vue/runtime-core', '@vue/runtime-dom']
      .map(name => `node_modules/${name}/LICENSE`),
  ];
  try {
    for (const file of files) {
      const path = join(root, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file);
    }
    packageSource(root, 'dist/source-code.zip');
    const archive = unzipSync(readFileSync(join(root, 'dist/source-code.zip')));
    expect(archive['src/main.ts']).toBeDefined();
    expect(archive['.gitignore']).toBeDefined();
    expect(archive['tests/unit/example.spec.ts']).toBeDefined();
    expect(archive['public/data/lemmings/README.md']).toBeDefined();
    expect(archive['docu/LEMMIX_REPLAY_IMPORT.md']).toBeDefined();
    expect(archive['scripts/package-local.mjs']).toBeDefined();
    expect(archive['scripts/package-windows-game.mjs']).toBeDefined();
    expect(archive['scripts/package-windows-local.mjs']).toBeDefined();
    expect(archive['tests/integration/private.tmp.spec.ts']).toBeUndefined();
    expect(archive['public/licenses/GPL-2.0.txt']).toBeDefined();
    expect(Object.keys(archive).some(name => /\.dat$/i.test(name) || name.startsWith('dos/'))).toBe(false);
    expect(readFileSync(join(root, 'dist/licenses/project-notice.txt'), 'utf8')).toBe('LICENSE');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

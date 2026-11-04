import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

// Bundle the application's build inputs, never the owner's DOS files. Include
// only source-like files in src and the explicit public app-shell assets.
export function packageSource(root, output) {
  const entries = {};
  const add = path => { entries[path.split(sep).join('/')] = new Uint8Array(readFileSync(join(root, path))); };
  const visitSource = dir => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.endsWith('.tmp.spec.ts')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visitSource(path);
      else if (entry.isFile() && ['.ts', '.vue', '.css', '.svg', '.png', '.md'].includes(extname(entry.name))) add(path);
    }
  };
  visitSource('src');
  visitSource('tests');
  for (const path of [
    '.gitignore', 'LICENSE', 'README.md', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts',
    'scripts/verify-public-data.ts', 'scripts/package-source.mjs', 'scripts/package-local.mjs', 'scripts/package-windows-audio.mjs', 'scripts/package-windows-graphics.mjs', 'scripts/package-windows-game.mjs', 'scripts/package-windows-local.mjs', 'docu/LICENCE_REVIEW.md', 'docu/ANDROID_DEVICE_CHECK.md', 'docu/LEMMIX_REPLAY_IMPORT.md',
    'public/sw.js', 'public/manifest.webmanifest', 'public/favicon.ico', 'public/data/config.json',
    'public/data/README.md', 'public/data/lemmings/README.md', 'public/data/lemmings_ohNo/README.md',
    'public/data/lemmings_Holiday93/README.md', 'public/data/lemmings_Holiday94/README.md',
    'public/data/lemmings_X-Mas91/README.md', 'public/data/lemmings_X-Mas92/README.md',
    'public/icons/icon-192.png', 'public/icons/icon-512.png', 'public/icons/maskable-512.png', 'scripts/make-icons.mjs', 'public/third-party.html',
    'public/licenses/GPL-2.0.txt', 'public/licenses/LGPL-2.1.txt',
  ]) add(path);
  mkdirSync(join(root, 'dist/licenses'), { recursive: true });
  writeFileSync(join(root, output), zipSync(entries, { level: 9 }));
  const notices = ['vue', 'vue-router', 'fflate', 'webaudio-tinysynth', '@vue/shared', '@vue/reactivity', '@vue/runtime-core', '@vue/runtime-dom']
    .map(name => `--- ${name} ---\n${readFileSync(join(root, 'node_modules', name, 'LICENSE'), 'utf8')}`)
    .join('\n\n');
  writeFileSync(join(root, 'dist/licenses/project-notice.txt'), readFileSync(join(root, 'LICENSE')));
  writeFileSync(join(root, 'dist/licenses/dependency-notices.txt'), notices);
  console.log(`Packaged ${Object.keys(entries).length} application source files in ${relative(root, join(root, output))}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  packageSource(process.cwd(), 'dist/source-code.zip');
}

import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const imagesDir = path.join(root, 'public', 'images');

// Exposes `virtual:png-pictures` = list of PNG files in /public/images, so new
// pictures can be added just by dropping files into that folder.
function pngPictures() {
  const VIRTUAL = 'virtual:png-pictures';
  const RESOLVED = '\0' + VIRTUAL;
  return {
    name: 'png-pictures',
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED;
    },
    load(id) {
      if (id !== RESOLVED) return;
      const files = fs.existsSync(imagesDir)
        ? fs.readdirSync(imagesDir).filter((f) => /\.png$/i.test(f)).sort()
        : [];
      return `export default ${JSON.stringify(files.map((f) => 'images/' + f))};`;
    },
    configureServer(server) {
      server.watcher.add(imagesDir);
      const onChange = (file) => {
        if (!file.startsWith(imagesDir)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [pngPictures()],
  build: { chunkSizeWarningLimit: 1200 },
});

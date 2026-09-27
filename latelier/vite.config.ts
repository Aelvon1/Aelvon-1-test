/// <reference types="vitest/config" />
import { createReadStream, cpSync, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Décodeurs des formats d'assets optionnels (glTF Draco, textures KTX2/Basis) fournis par three :
 * servis sous `/decoders/…` en développement et copiés dans `dist/decoders/` au build. Ils ne
 * sont téléchargés que si un objet charge réellement un glTF compressé ou une texture KTX2
 * (voir `src/core/assets.ts`) — tout le contenu actuel est procédural.
 */
const DECODERS: Record<string, string> = {
  draco: 'node_modules/three/examples/jsm/libs/draco/gltf',
  basis: 'node_modules/three/examples/jsm/libs/basis',
};

function threeDecoders(): Plugin {
  let outDir = 'dist';
  return {
    name: 'latelier-three-decoders',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/decoders\/(draco|basis)\/([\w.-]+)$/.exec(req.url?.split('?')[0] ?? '');
        const dir = match ? DECODERS[match[1]!] : undefined;
        if (!match || !dir) return next();
        const file = normalize(join(dir, match[2]!));
        if (!file.startsWith(normalize(dir)) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      for (const [name, dir] of Object.entries(DECODERS)) {
        if (existsSync(dir)) cpSync(dir, join(outDir, 'decoders', name), { recursive: true });
      }
    },
  };
}

// Configuration Vite : React pour l'interface, workers en modules ES,
// cible ES2022 (top-level await, champs de classe) pour Chrome/Edge/Firefox récents.
export default defineConfig({
  plugins: [react(), threeDecoders()],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 4096,
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

import { defineConfig } from 'vite';

// Relative base so the build works from any folder or GitHub Pages sub-path.
// es2022 for the top-level await that waits for the Garda car model.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});

import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

const ROOT_DIR = process.cwd();
const FRONTEND_DIR = path.resolve(ROOT_DIR, 'frontend');
const SRC_DIR = path.resolve(FRONTEND_DIR, 'src');
const PUBLIC_DIR = path.resolve(FRONTEND_DIR, 'public');
const DIST_DIR = path.resolve(FRONTEND_DIR, 'dist');

async function buildFrontend() {
  console.log('[build:frontend] Building frontend application bundle...');
  
  // Ensure output directory exists
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // 1. Bundle React application with esbuild
  await esbuild.build({
    entryPoints: [path.join(SRC_DIR, 'App.jsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    sourcemap: true,
    minify: process.env.NODE_ENV === 'production',
    outfile: path.join(DIST_DIR, 'app.js'),
  });
  console.log('[build:frontend] Bundle generated: frontend/dist/app.js');

  // 2. Copy main stylesheet
  const cssSrc = path.join(SRC_DIR, 'styles', 'app.css');
  if (fs.existsSync(cssSrc)) {
    fs.copyFileSync(cssSrc, path.join(DIST_DIR, 'app.css'));
    console.log('[build:frontend] Copied styles: frontend/dist/app.css');
  }

  // 3. Copy index.html
  const htmlSrc = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(htmlSrc)) {
    fs.copyFileSync(htmlSrc, path.join(DIST_DIR, 'index.html'));
    console.log('[build:frontend] Copied index.html: frontend/dist/index.html');
  }

  // 4. Copy static assets from frontend/public to frontend/dist
  if (fs.existsSync(PUBLIC_DIR)) {
    const assets = fs.readdirSync(PUBLIC_DIR);
    for (const asset of assets) {
      const srcFile = path.join(PUBLIC_DIR, asset);
      const destFile = path.join(DIST_DIR, asset);
      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, destFile);
      }
    }
    console.log(`[build:frontend] Copied ${assets.length} static assets from frontend/public/ to frontend/dist/`);
  }

  console.log('[build:frontend] Frontend build complete!');
}

buildFrontend().catch((err) => {
  console.error('[build:frontend] Build failed:', err);
  process.exit(1);
});

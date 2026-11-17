import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';

async function build() {
  console.log('[BUILD] Bundling frontend with esbuild...');
  const outdir = path.join(__dirname, '..', 'frontend', 'public');
  if (!fs.existsSync(outdir)) {
    fs.mkdirSync(outdir, { recursive: true });
  }

  // Copy index.html to public
  fs.copyFileSync(
    path.join(__dirname, '..', 'frontend', 'index.html'),
    path.join(outdir, 'index.html')
  );

  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, '..', 'frontend', 'src', 'index.tsx')],
    bundle: true,
    outfile: path.join(outdir, 'bundle.js'),
    minify: process.env.NODE_ENV === 'production',
    sourcemap: true,
    target: ['es2020'],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    },
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
      '.jsx': 'jsx',
      '.js': 'js',
      '.png': 'dataurl',
      '.svg': 'text'
    }
  });

  console.log('[BUILD] Frontend bundle generated successfully in frontend/public/');
}

build().catch(err => {
  console.error('[FATAL] Frontend build failed:', err);
  process.exit(1);
});

// Writes docs/backend/fixtures/*.json from src/app/core/models/golden/golden-fixtures.ts
// (runs the real TypeScript rules). Usage: npm run fixtures
import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT_DIR = 'docs/backend/fixtures';
const dir = await mkdtemp(join(tmpdir(), 'golden-'));
try {
  const bundle = join(dir, 'golden.mjs');
  await build({
    entryPoints: ['src/app/core/models/golden/golden-fixtures.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    tsconfig: 'tsconfig.json',
    logLevel: 'warning',
  });
  const { buildGoldenFixtures } = await import(pathToFileURL(bundle).href);
  for (const [name, cases] of Object.entries(buildGoldenFixtures())) {
    await writeFile(join(OUT_DIR, `${name}.json`), JSON.stringify(cases, null, 2) + '\n');
    console.log(`${OUT_DIR}/${name}.json: ${cases.length} cases`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

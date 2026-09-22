import { build } from 'esbuild'

await build({
  entryPoints: ['scripts/pairingEngine.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'node_modules/.tmp/pairing-test.mjs',
})

await import('../node_modules/.tmp/pairing-test.mjs')

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'

function resolveDeclarationSpecifier(
  filePath: string,
  specifier: string,
  emittedFiles: Set<string>,
) {
  const target = resolve(dirname(filePath), specifier)
  if (emittedFiles.has(`${target}.d.ts`)) return `${specifier}.js`
  if (emittedFiles.has(resolve(target, 'index.d.ts'))) return `${specifier}/index.js`
  return specifier
}

function addDeclarationImportExtensions(
  filePath: string,
  content: string,
  emittedFiles: Set<string>,
) {
  const replaceSpecifier = (_match: string, prefix: string, specifier: string, suffix: string) =>
    `${prefix}${resolveDeclarationSpecifier(filePath, specifier, emittedFiles)}${suffix}`

  return content
    .replace(/(\bfrom\s*['"])(\.{1,2}\/[^'"]+)(['"])/g, replaceSpecifier)
    .replace(/(\bimport\s*\(\s*['"])(\.{1,2}\/[^'"]+)(['"]\s*\))/g, replaceSpecifier)
}

function patchDeclarationImportExtensions(emittedFiles: Map<string, string>) {
  const declarationFiles = [...emittedFiles.keys()]
    .filter((filePath) => filePath.endsWith('.d.ts'))
    .map((filePath) => resolve(filePath))
  const emittedDeclarationFiles = new Set(declarationFiles)

  for (const filePath of declarationFiles) {
    const content = readFileSync(filePath, 'utf8')
    const updated = addDeclarationImportExtensions(filePath, content, emittedDeclarationFiles)
    if (updated !== content) writeFileSync(filePath, updated)
  }
}

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
  plugins: [
    react(),
    dts({
      include: ['src'],
      exclude: ['src/**/*.test.*'],
      rollupTypes: true,
      afterBuild: patchDeclarationImportExtensions,
    }),
  ],
  build: {
    lib: {
      entry: {
        'orb-ui': resolve(__dirname, 'src/index.ts'),
        adapters: resolve(__dirname, 'src/adapters/index.ts'),
        'livekit-adapter': resolve(__dirname, 'src/adapters/livekit/browser.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['livekit-client', 'react', 'react-dom', 'react/jsx-runtime'],
    },
  },
})

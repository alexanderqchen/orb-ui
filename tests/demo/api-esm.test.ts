import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { expect, test } from 'vitest'

test('deployed provider handlers load as compiled Node ESM and reject all traffic', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orb-api-esm-'))
  const routes = [
    'openai-live-session',
    'openai-realtime-token',
    'gemini-live-token',
    'pipecat-start',
  ]
  try {
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ type: 'module' }))
    for (const file of ['server/public-demo-policy', ...routes.map((route) => `api/${route}`)]) {
      const output = join(directory, `${file}.js`)
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(
        output,
        ts.transpileModule(readFileSync(`demo/${file}.ts`, 'utf8'), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
      )
    }
    const entrypoints = routes.map((route) =>
      pathToFileURL(join(directory, `api/${route}.js`)).toString(),
    )
    // Use the real Node loader: Vitest's source resolver tolerates extensionless imports.
    const script = `
      globalThis.fetch = () => { throw new Error('Unexpected upstream request'); };
      for (const entrypoint of ${JSON.stringify(entrypoints)}) {
        const handler = (await import(entrypoint)).default;
        for (const method of ['POST', 'GET']) {
          const request = new Request('https://orb-ui.com/api/provider', { method });
          request.json = () => { throw new Error('Provider routes must not read a body'); };
          const response = await handler.fetch(request);
          if (response.status !== (method === 'POST' ? 403 : 405)) throw new Error('Wrong status');
          if (response.headers.get('Cache-Control') !== 'no-store') throw new Error('Wrong cache policy');
        }
      }
      console.log('All compiled provider handlers reject traffic.');
    `
    expect(
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8',
        timeout: 10_000,
      }),
    ).toContain('All compiled provider handlers reject traffic.')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

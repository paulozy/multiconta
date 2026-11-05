import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { confereSha256, escolherZip, versaoFixada } from '../scripts/baixar-onde-cacar.mjs';

const sha = 'a'.repeat(64);
const asset = (name, extra = {}) => ({ name, digest: `sha256:${sha}`, browser_download_url: `https://github.com/paulozy/onde-cacar/releases/download/v2.9.3/${name}`, ...extra });

test('baixar Onde Caçar: escolhe o zip chrome-edge-opera e exige o SHA-256 do GitHub', () => {
  const rel = { tag_name: 'v2.9.3', assets: [asset('onde-cacar-2.9.3-firefox.zip'), asset('onde-cacar-2.9.3-chrome-edge-opera.zip')] };
  assert.deepEqual(escolherZip(rel), { nome: 'onde-cacar-2.9.3-chrome-edge-opera.zip', url: rel.assets[1].browser_download_url, sha256: sha, tag: 'v2.9.3' });
  assert.throws(() => escolherZip({ tag_name: 'v1', assets: [asset('onde-cacar-1-firefox.zip')] }), /não tem o zip/);
  assert.throws(() => escolherZip({ assets: [asset('onde-cacar-2.9.3-chrome-edge-opera.zip', { digest: null })] }), /SHA-256/);
  assert.throws(() => escolherZip({ assets: [asset('onde-cacar-2.9.3-chrome-edge-opera.zip', { browser_download_url: 'http://outro.site/x.zip' })] }), /endereço/);
});

test('baixar Onde Caçar: SHA-256 confere byte a byte', () => {
  const dados = Buffer.from('zip');
  assert.equal(confereSha256(dados, createHash('sha256').update(dados).digest('hex')), true);
  assert.equal(confereSha256(Buffer.from('outro'), createHash('sha256').update(dados).digest('hex')), false);
});

test('baixar Onde Caçar: a versão fixada no package.json (tag e SHA-256) é obrigatória', async () => {
  assert.deepEqual(versaoFixada({ ondeCacar: { tag: 'v2.9.3', sha256: sha } }), { tag: 'v2.9.3', sha256: sha });
  for (const ruim of [{}, { ondeCacar: { tag: 'latest', sha256: sha } }, { ondeCacar: { tag: 'v2.9.3', sha256: 'x' } }]) assert.throws(() => versaoFixada(ruim), /"ondeCacar"/);
  const { readFileSync } = await import('node:fs');
  assert.doesNotThrow(() => versaoFixada(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))), 'o package.json do repositório tem a versão fixada');
});

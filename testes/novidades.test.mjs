import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maisNova, procurarVersaoNova, versaoDaTag } from '../app/novidades.mjs';

test('novidades: versão do endereço da tag; outro endereço não vale', () => {
  assert.equal(versaoDaTag('https://github.com/paulozy/multiconta/releases/tag/v1.2.3'), '1.2.3');
  for (const ruim of [null, 'https://github.com/paulozy/multiconta/releases', 'https://outro.site/x/y/releases/tag/v9.9.9', 'https://github.com/a/b/releases/tag/v1.2.3?x', 'https://github.com/a/b/releases/tag/v1.2']) {
    assert.equal(versaoDaTag(ruim), null, String(ruim));
  }
});

test('novidades: comparação de versões', () => {
  assert.equal(maisNova('1.0.1', '1.0.0'), true);
  assert.equal(maisNova('1.10.0', '1.9.9'), true);
  assert.equal(maisNova('1.0.0', '1.0.0'), false);
  assert.equal(maisNova('0.9.0', '1.0.0'), false);
});

test('novidades: só avisa versão mais nova; sem rede ou resposta estranha, nada', async () => {
  const resposta = (location) => async (url, op) => {
    assert.equal(op.redirect, 'manual');
    assert.equal(url, 'https://github.com/paulozy/multiconta/releases/latest');
    return { headers: { get: (h) => (h === 'location' ? location : null) } };
  };
  assert.equal(await procurarVersaoNova('1.0.0', { buscar: resposta('https://github.com/paulozy/multiconta/releases/tag/v1.1.0') }), '1.1.0');
  assert.equal(await procurarVersaoNova('1.1.0', { buscar: resposta('https://github.com/paulozy/multiconta/releases/tag/v1.1.0') }), null);
  assert.equal(await procurarVersaoNova('1.0.0', { buscar: resposta(null) }), null);
  assert.equal(await procurarVersaoNova('1.0.0', { buscar: async () => { throw new Error('sem rede'); } }), null);
});

test('novidades: endereço relativo no location também vale; timeout não quebra', async () => {
  const relativo = async () => ({ headers: { get: () => '/paulozy/multiconta/releases/tag/v2.0.0' } });
  assert.equal(await procurarVersaoNova('1.0.0', { buscar: relativo }), '2.0.0');
  const demora = async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); };
  assert.equal(await procurarVersaoNova('1.0.0', { buscar: demora }), null);
});

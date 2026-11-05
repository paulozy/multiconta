import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conteudoDaCelula, escaparHtml, paginaAviso, URL_JOGO } from '../app/celulas.mjs';

const c = { id: 'alt1', rotulo: 'Alt 1' };

test('célula: sempre o jogo; sem login no app, ele abre na tela de entrar e a barra diz "entre na conta"', () => {
  assert.deepEqual(conteudoDaCelula(c, { sessao: 'logada' }), { url: URL_JOGO, semLogin: false });
  for (const sessao of ['sem-particao', 'sem-sessao', undefined]) {
    assert.deepEqual(conteudoDaCelula(c, { sessao }), { url: URL_JOGO, semLogin: true }, String(sessao));
  }
});

test('página de aviso: rótulo e texto escapados (nada vira HTML)', () => {
  assert.equal(escaparHtml(`<b>"x" & 'y'</b>`), '&#60;b&#62;&#34;x&#34; &#38; &#39;y&#39;&#60;/b&#62;');
  const html = decodeURIComponent(paginaAviso({ rotulo: '<script>alert(1)</script>' }, 'a < b').split(',').slice(1).join(','));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&#60;script&#62;') && html.includes('a &#60; b'));
});

import { extensoesDaConta } from '../app/celulas.mjs';

test('extensões da conta: Onde Caçar quando há cópia (copiada ou mantida) e sempre o rótulo', () => {
  assert.deepEqual(extensoesDaConta({ acao: 'copiar' }, 'O', 'R'), ['O', 'R']);
  assert.deepEqual(extensoesDaConta({ acao: 'manter', aviso: 'x' }, 'O', 'R'), ['O', 'R']);
  assert.deepEqual(extensoesDaConta({ acao: 'sem', aviso: 'x' }, 'O', 'R'), ['R']);
  assert.deepEqual(extensoesDaConta({ acao: 'copiar' }, 'O', 'R', ['E1', 'E2']), ['O', 'E1', 'E2', 'R'], 'as extras entre o Onde Caçar e o rótulo');
});

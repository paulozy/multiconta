import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acaoDaTecla, comandoValido, janelaVisivel, nickDaPagina, normalizarResumo, normalizarSalvo, retratoDaBarra, statusDaPagina } from '../app/estado.mjs';

const contas = [{ id: 'principal', rotulo: 'Principal' }, { id: 'alt1', rotulo: 'Alt 1' }, { id: 'alt2', rotulo: 'Alt 2' }];

test('estado salvo: só vale o que serve às contas atuais; som começa mudo', () => {
  assert.deepEqual(normalizarSalvo(null, contas), { janela: null, ampliada: null, mudo: { principal: true, alt1: true, alt2: true }, compacto: false, posCompacta: null });
  const s = normalizarSalvo({ janela: { x: 10, y: 20, width: 1600, height: 900, maximizada: true }, ampliada: 'alt1', mudo: { alt1: false, velha: false } }, contas);
  assert.deepEqual(s.janela, { x: 10, y: 20, width: 1600, height: 900, maximizada: true });
  assert.equal(s.ampliada, 'alt1');
  assert.deepEqual(s.mudo, { principal: true, alt1: false, alt2: true });
});

test('estado salvo: lixo, conta que saiu da lista e janela minúscula são descartados', () => {
  for (const ruim of ['texto', 42, [], { janela: { x: 'a' } }, { janela: { x: 0, y: 0, width: 100, height: 100 } }]) {
    assert.equal(normalizarSalvo(ruim, contas).janela, null, JSON.stringify(ruim));
  }
  assert.equal(normalizarSalvo({ ampliada: 'alt9' }, contas).ampliada, null);
  assert.equal(normalizarSalvo({ ampliada: { id: 'alt1' } }, contas).ampliada, null);
});

test('janela salva fora de qualquer tela (monitor desligado) não é usada', () => {
  const telas = [{ x: 0, y: 0, width: 1920, height: 1040 }];
  assert.equal(janelaVisivel({ x: 100, y: 100, width: 1200, height: 800 }, telas), true);
  assert.equal(janelaVisivel({ x: 2000, y: 0, width: 1200, height: 800 }, telas), false, 'estava no 2º monitor');
  assert.equal(janelaVisivel({ x: 1850, y: 0, width: 1200, height: 800 }, telas), false, 'só 70 px à mostra');
  assert.equal(janelaVisivel({ x: -1200, y: 0, width: 1400, height: 800 }, telas), true);
  assert.equal(janelaVisivel(null, telas), false);
});

test('teclas: Ctrl+1..N amplia a conta da posição, Ctrl+0 volta; o resto não é nosso', () => {
  const k = (key, extra = {}) => acaoDaTecla({ type: 'keyDown', control: true, key, ...extra }, contas);
  assert.deepEqual(k('1'), { acao: 'ampliar', id: 'principal' });
  assert.deepEqual(k('3'), { acao: 'ampliar', id: 'alt2' });
  assert.deepEqual(k('0'), { acao: 'grade' });
  assert.equal(k('4'), null, 'só 3 contas');
  assert.equal(k('1', { shift: true }), null);
  assert.equal(k('1', { type: 'keyUp' }), null);
  assert.equal(acaoDaTecla({ type: 'keyDown', control: false, key: '1' }, contas), null);
  assert.equal(k('r'), null);
});

test('comandos da barra: só ações e contas conhecidas', () => {
  assert.deepEqual(comandoValido({ acao: 'som', id: 'alt1' }, contas), { acao: 'som', id: 'alt1' });
  assert.deepEqual(comandoValido({ acao: 'grade', id: 'qualquer' }, contas), { acao: 'grade' });
  assert.deepEqual(comandoValido({ acao: 'atualizar', id: null }, contas), { acao: 'atualizar' });
  assert.deepEqual(comandoValido({ acao: 'config', id: 'x' }, contas), { acao: 'config' });
  assert.deepEqual(comandoValido({ acao: 'novidade' }, contas), { acao: 'novidade' });
  for (const ruim of [null, 'som', { acao: 'apagar', id: 'alt1' }, { acao: 'som', id: 'alt9' }, { acao: 'recarregar' }]) {
    assert.equal(comandoValido(ruim, contas), null, JSON.stringify(ruim));
  }
});

test('status vindo da página: só conectada, desconectada, bloqueada e sem-login', () => {
  for (const s of ['conectada', 'desconectada', 'bloqueada', 'sem-login']) assert.equal(statusDaPagina(s), s);
  for (const s of ['no-edge', 'caiu', '<img>', null]) assert.equal(statusDaPagina(s), null);
});

test('retrato da barra: uma entrada por conta, na ordem da grade', () => {
  const r = retratoDaBarra({ contas, ampliada: 'alt1', mudo: { principal: true, alt1: false }, status: { principal: 'conectada' }, nicks: { principal: 'treinadora' }, problemas: ['x'] });
  assert.deepEqual(r.contas.map((c) => [c.id, c.atalho, c.status, c.mudo, c.ampliada, c.nick]), [
    ['principal', 'Ctrl+1', 'conectada', true, false, 'treinadora'],
    ['alt1', 'Ctrl+2', 'carregando', false, true, null],
    ['alt2', 'Ctrl+3', 'carregando', true, false, null],
  ]);
  assert.deepEqual(r.problemas, ['x']);
});

test('teclas: segurar Ctrl+N não fica alternando (repetição ignorada)', () => {
  assert.equal(acaoDaTecla({ type: 'keyDown', control: true, key: '2', isAutoRepeat: true }, contas), null);
  assert.deepEqual(acaoDaTecla({ type: 'keyDown', control: true, key: '2', isAutoRepeat: false }, contas), { acao: 'ampliar', id: 'alt1' });
});

test('janela salva com a barra de título fora da tela (acima ou abaixo) não é usada', () => {
  const telas = [{ x: 0, y: 0, width: 1920, height: 1040 }];
  assert.equal(janelaVisivel({ x: 100, y: -700, width: 1200, height: 800 }, telas), false, 'topo acima da tela');
  assert.equal(janelaVisivel({ x: 100, y: 1020, width: 1200, height: 800 }, telas), false, 'topo quase no rodapé');
  assert.equal(janelaVisivel({ x: 100, y: 0, width: 1200, height: 800 }, telas), true);
  assert.equal(janelaVisivel({ x: 1900, y: 100, width: 800, height: 600 }, [...telas, { x: 1920, y: 0, width: 1920, height: 1040 }]), true, 'no 2º monitor ligado');
});

test('nick vindo da página: texto aparado e curto; o resto não conta', () => {
  assert.equal(nickDaPagina(' treinadora '), 'treinadora');
  assert.equal(nickDaPagina('x'.repeat(60)).length, 40);
  for (const n of ['', '   ', null, 5, {}]) assert.equal(nickDaPagina(n), null, String(n));
});

test('normalizarResumo: só chaves conhecidas, números finitos >= 0, textos curtos', () => {
  const r = normalizarResumo({ huntNome: '  Pikachu ', huntRegiao: 'x'.repeat(80), huntNivel: 20, centro: 'sim', nivel: 42, gold: -1, abatesH: Infinity, goldH: NaN, minutos: '12', extra: '<b>' });
  assert.deepEqual(r, { centro: false, huntNome: 'Pikachu', huntRegiao: 'x'.repeat(40), huntNivel: 20, nivel: 42, gold: null, abatesH: null, goldH: null, minutos: null });
  assert.equal(normalizarResumo(null), null);
  assert.equal(normalizarResumo('texto'), null);
  assert.equal(normalizarResumo({ lixo: 1 }), null, 'nada aproveitável');
  assert.deepEqual(normalizarResumo({ centro: true }).centro, true);
  const lixo = normalizarResumo({ gold: 1e300, nivel: 20.5, huntNivel: 3, abatesH: 12.7 });
  assert.deepEqual([lixo.gold, lixo.nivel, lixo.huntNivel, lixo.abatesH], [null, null, 3, 12.7], 'teto e níveis inteiros');
});

test('retratoDaBarra leva o resumo de cada conta (null quando não há)', () => {
  const contas = [{ id: 'a', rotulo: 'A' }, { id: 'b', rotulo: 'B' }];
  const r = retratoDaBarra({ contas, ampliada: null, mudo: {}, status: {}, nicks: {}, problemas: [], resumos: { a: { nivel: 3 } } });
  assert.deepEqual(r.contas.map((c) => c.resumo), [{ nivel: 3 }, null]);
});

test('compacto: Ctrl+M, comando da barra, estado salvo e retrato', () => {
  const contas = [{ id: 'a', rotulo: 'A' }];
  assert.deepEqual(acaoDaTecla({ type: 'keyDown', control: true, key: 'm' }, contas), { acao: 'compacto' });
  assert.deepEqual(acaoDaTecla({ type: 'keyDown', control: true, key: 'M' }, contas), { acao: 'compacto' });
  assert.equal(acaoDaTecla({ type: 'keyDown', control: true, key: 'm', isAutoRepeat: true }, contas), null);
  assert.deepEqual(comandoValido({ acao: 'compacto', id: 'x' }, contas), { acao: 'compacto' });
  const s = normalizarSalvo({ compacto: true, posCompacta: { x: -5, y: 40 } }, contas);
  assert.equal(s.compacto, true);
  assert.deepEqual(s.posCompacta, { x: -5, y: 40 });
  assert.equal(normalizarSalvo({ compacto: 'sim', posCompacta: { x: 1.5, y: 2 } }, contas).compacto, false);
  assert.equal(normalizarSalvo({ posCompacta: { x: 1.5, y: 2 } }, contas).posCompacta, null);
  assert.equal(retratoDaBarra({ contas, ampliada: null, mudo: {}, status: {}, nicks: {}, problemas: [], compacto: true }).compacto, true);
});

test('retratoDaBarra leva a versão do Onde Caçar, se está atualizando e se a abertura terminou', () => {
  const contas = [{ id: 'a', rotulo: 'A' }];
  const r = (ondeCacar) => retratoDaBarra({ contas, ampliada: null, mudo: {}, status: {}, nicks: {}, problemas: [], ondeCacar }).ondeCacar;
  assert.deepEqual(r(undefined), { versao: null, atualizando: false, pronto: false });
  assert.deepEqual(r({ versao: '2.4.2', atualizando: true, pronto: true }), { versao: '2.4.2', atualizando: true, pronto: true });
});

test('retratoDaBarra leva a versão nova do app só se for texto', () => {
  const r = (versaoNova) => retratoDaBarra({ contas: [], ampliada: null, mudo: {}, status: {}, nicks: {}, problemas: [], versaoNova }).versaoNova;
  assert.equal(r('1.1.0'), '1.1.0');
  assert.equal(r(undefined), null);
  assert.equal(r({ x: 1 }), null);
});

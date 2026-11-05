import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atualizarOndeCacar, versaoValida } from '../app/atualizar.mjs';

const ONDE = 'C:\\ext\\onde-cacar';
// sessão falsa com a API de extensões do Electron; tudo vai para o diário `log`
function sessaoFalsa(nome, log, { falhaAo = [] } = {}) {
  let carregadas = [{ id: `${nome}-onde` }, { id: `${nome}-rotulo` }];
  return {
    extensions: {
      getAllExtensions: () => [...carregadas],
      removeExtension: (id) => { carregadas = carregadas.filter((e) => e.id !== id); log.push(`${nome}: tira ${id}`); },
      loadExtension: async (dir, opcoes) => {
        assert.deepEqual(opcoes, { allowFileAccess: false });
        if (falhaAo.includes(dir)) throw new Error('manifest ruim');
        carregadas.push({ id: dir }); log.push(`${nome}: carrega ${dir}`);
        return { id: dir, version: dir === ONDE ? '2.4.2' : '1.0' };
      },
    },
  };
}
const conta = (id, log, opcoes) => ({
  id, rotulo: id.toUpperCase(), ses: sessaoFalsa(id, log, opcoes), pastaRotulo: `C:\\ext\\rotulo-${id}`,
  parar: async () => { log.push(`${id}: para`); return !opcoes?.naoPara; },
  abrirJogo: () => log.push(`${id}: abre o jogo`),
  semRotulo: () => log.push(`${id}: aviso sem rótulo`),
});
const base = (log, contas, extra = {}) => ({ decidir: async () => ({ acao: 'copiar' }), copiar: () => log.push('copia'), pastaOndeCacar: ONDE, contas, ...extra });

test('atualizar: para o jogo de todas, tira as extensões, copia, carrega de novo (Onde Caçar antes do rótulo) e abre o jogo', async () => {
  const log = [];
  const r = await atualizarOndeCacar(base(log, [conta('a', log), conta('b', log)]));
  assert.deepEqual(r, { ok: true, trocou: true, problemas: [], versao: '2.4.2' });
  assert.deepEqual(log, [
    'a: para', 'b: para', // nenhuma página do jogo roda enquanto o rótulo está fora
    'a: tira a-onde', 'a: tira a-rotulo', 'b: tira b-onde', 'b: tira b-rotulo',
    'copia',
    `a: carrega ${ONDE}`, 'a: carrega C:\\ext\\rotulo-a', 'a: abre o jogo',
    `b: carrega ${ONDE}`, 'b: carrega C:\\ext\\rotulo-b', 'b: abre o jogo',
  ]);
});

test('atualizar: sem "copiar" (conta no lançador do Edge, clone ilegível) nada é tocado', async () => {
  const log = [];
  const aviso = 'há conta aberta: a versão do clone entra quando todas forem fechadas e abertas de novo';
  assert.deepEqual(await atualizarOndeCacar(base(log, [conta('a', log)], { decidir: async () => ({ acao: 'manter', aviso }) })), { ok: false, trocou: false, problemas: [aviso], versao: null });
  const semFonte = await atualizarOndeCacar(base(log, [conta('a', log)], { decidir: async () => ({ acao: 'manter' }) }));
  assert.match(semFonte.problemas[0], /vem com o instalador/);
  const desligado = await atualizarOndeCacar(base(log, [conta('a', log)], { decidir: async () => ({ acao: 'sem' }) }));
  assert.match(desligado.problemas[0], /desligado nas configurações/);
  assert.deepEqual(log, []);
});

test('atualizar: erro ao decidir (PowerShell) sobe antes de tocar em qualquer conta', async () => {
  const log = [];
  await assert.rejects(atualizarOndeCacar(base(log, [conta('a', log)], { decidir: async () => { throw new Error('timeout'); } })), /timeout/);
  assert.deepEqual(log, []);
});

test('atualizar: cópia que falha mantém a versão anterior e as contas voltam ao jogo com ela', async () => {
  const log = [];
  const r = await atualizarOndeCacar(base(log, [conta('a', log)], { copiar: () => { throw new Error('pasta em uso'); } }));
  assert.equal(r.ok, false);
  assert.equal(r.trocou, true);
  assert.deepEqual(r.problemas, ['pasta em uso; ficou a versão anterior']);
  assert.deepEqual(log.slice(-3), [`a: carrega ${ONDE}`, 'a: carrega C:\\ext\\rotulo-a', 'a: abre o jogo']);
});

test('atualizar: conta cujo rótulo não carregou não volta ao jogo (sem trava de uma sessão por conta)', async () => {
  const log = [];
  const r = await atualizarOndeCacar(base(log, [conta('a', log, { falhaAo: ['C:\\ext\\rotulo-a'] }), conta('b', log)]));
  assert.equal(r.ok, false);
  assert.deepEqual(r.problemas, ['A: não carregou rotulo-a (manifest ruim)']);
  assert.ok(log.includes('a: aviso sem rótulo'));
  assert.ok(!log.includes('a: abre o jogo'));
  assert.ok(log.includes('b: abre o jogo'));
});

test('atualizar: Onde Caçar que não carregou em nenhuma conta: avisa, versão null, e a conta volta ao jogo com o rótulo', async () => {
  const log = [];
  const r = await atualizarOndeCacar(base(log, [conta('a', log, { falhaAo: [ONDE] })]));
  assert.deepEqual(r.problemas, ['A: não carregou onde-cacar (manifest ruim)']);
  assert.equal(r.versao, null);
  assert.deepEqual(log.slice(-2), ['a: carrega C:\\ext\\rotulo-a', 'a: abre o jogo']);
});

test('versaoValida: só texto com cara de versão', () => {
  assert.equal(versaoValida('2.4.2'), '2.4.2');
  for (const ruim of [undefined, null, 2, '<b>1</b>', '1'.repeat(21)]) assert.equal(versaoValida(ruim), null, String(ruim));
});

test('atualizar: conta que não parou fica de fora da troca (nada é tirado dela) e é avisada', async () => {
  const log = [];
  const r = await atualizarOndeCacar(base(log, [conta('a', log, { naoPara: true }), conta('b', log)]));
  assert.equal(r.ok, false);
  assert.match(r.problemas[0], /^A: não consegui parar o jogo/);
  assert.ok(!log.some((l) => l.startsWith('a: tira') || l.startsWith('a: carrega') || l === 'a: abre o jogo'));
  assert.ok(log.includes('b: abre o jogo'));
});

test('atualizar: as extensões extras voltam entre o Onde Caçar e o rótulo', async () => {
  const log = [];
  await atualizarOndeCacar(base(log, [conta('a', log)], { extras: ['C:\\ext\\extras\\tema'] }));
  assert.deepEqual(log.filter((l) => l.startsWith('a: carrega')), [`a: carrega ${ONDE}`, 'a: carrega C:\\ext\\extras\\tema', 'a: carrega C:\\ext\\rotulo-a']);
});

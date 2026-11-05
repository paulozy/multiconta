import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// a barra carrega formato.js como script comum; aqui ele roda numa VM do mesmo jeito
const ctx = {};
vm.runInNewContext(readFileSync(new URL('../app/barra/formato.js', import.meta.url), 'utf8'), ctx);
const { numero, partes } = ctx.formatoBarra;
const lista = (r) => [...partes(r)];

test('números curtos: mil, mi, bi', () => {
  const casos = [[0, '0'], [950, '950'], [999.6, '1000'], [1000, '1 mil'], [12345, '12,3 mil'], [350000, '350 mil'],
    [1240000, '1,24 mi'], [15200000, '15,2 mi'], [250000000, '250 mi'], [2100000000, '2,1 bi']];
  for (const [n, txt] of casos) assert.equal(numero(n), txt, String(n));
  for (const ruim of [-1, NaN, Infinity, null, '12']) assert.equal(numero(ruim), '—');
});

test('linha da conta: hunt, treinador, gold com ritmo e abates/h', () => {
  assert.deepEqual(lista({ huntNome: 'Pikachu', huntRegiao: 'kanto', huntNivel: 20, centro: false, nivel: 42, gold: 1240000, abatesH: 310, goldH: 52000, minutos: 12 }),
    ['🎯 Pikachu (Kanto nv 20)', '👤 42', '💰 1,24 mi +52 mil/h', '⚔ 310/h']);
});

test('linha da conta: no Centro, sessão curta sem ritmo, campos faltando', () => {
  assert.deepEqual(lista({ huntNome: 'Pikachu', centro: true, nivel: 3, gold: 10, abatesH: 999, goldH: 5, minutos: 1 }), ['🏥 no Centro', '👤 3', '💰 10']);
  assert.deepEqual(lista({ huntNome: 'Onix', huntRegiao: null, huntNivel: null, centro: false, nivel: null, gold: null }), ['🎯 Onix']);
  assert.deepEqual(lista(null), []);
});

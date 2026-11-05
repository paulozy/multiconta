import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALTURA_BARRA, calcularLayout, grade, tamanhoCompacto } from '../app/layout.mjs';

const area = (r) => r.width * r.height;

test('grade: 1 ocupa tudo, 2 lado a lado, 3 e 4 em 2×2', () => {
  const a = { x: 0, y: 32, width: 1920, height: 1000 };
  assert.deepEqual(grade(1, a), [{ x: 0, y: 32, width: 1920, height: 1000 }]);
  assert.deepEqual(grade(2, a), [{ x: 0, y: 32, width: 960, height: 1000 }, { x: 960, y: 32, width: 960, height: 1000 }]);
  assert.deepEqual(grade(4, a).map((r) => [r.x, r.y]), [[0, 32], [960, 32], [0, 532], [960, 532]]);
  assert.equal(grade(3, a).length, 3);
  assert.deepEqual(grade(0, a), []);
});

test('grade: tamanho ímpar não perde pixel (a última coluna/linha fica com a sobra)', () => {
  const a = { x: 0, y: 0, width: 1001, height: 701 };
  const g = grade(4, a);
  assert.equal(g[0].width + g[1].width, 1001);
  assert.equal(g[0].height + g[2].height, 701);
  assert.equal(g.reduce((s, r) => s + area(r), 0), 1001 * 701);
});

test('layout: barra no topo e contas embaixo dela', () => {
  const l = calcularLayout({ largura: 1600, altura: 900, n: 3 });
  assert.deepEqual(l.barra, { x: 0, y: 0, width: 1600, height: ALTURA_BARRA });
  assert.ok(l.celulas.every((c) => c.y >= ALTURA_BARRA && c.visivel));
  assert.equal(l.ampliada, null);
});

test('layout: conta ampliada ocupa a área toda e as outras ficam escondidas', () => {
  const l = calcularLayout({ largura: 1600, altura: 900, n: 3, ampliada: 1 });
  assert.deepEqual(l.celulas.map((c) => c.visivel), [false, true, false]);
  assert.deepEqual(l.celulas[1], { x: 0, y: ALTURA_BARRA, width: 1600, height: 900 - ALTURA_BARRA, visivel: true });
  assert.equal(l.ampliada, 1);
});

test('layout: índice ampliado inválido volta ao mosaico; janela minúscula não dá tamanho negativo', () => {
  for (const ampliada of [3, -1, 1.5, '1', undefined]) {
    assert.equal(calcularLayout({ largura: 800, altura: 600, n: 3, ampliada }).ampliada, null, String(ampliada));
  }
  const l = calcularLayout({ largura: 10.7, altura: 20, n: 2 });
  assert.equal(l.barra.height, 20);
  assert.ok(l.celulas.every((c) => c.height === 0 && c.width >= 0));
});

test('compacto: a barra ocupa a janela toda e nenhuma conta aparece (nem a ampliada)', () => {
  const l = calcularLayout({ largura: 1400, altura: ALTURA_BARRA, n: 3, ampliada: 1, compacto: true });
  assert.deepEqual(l.barra, { x: 0, y: 0, width: 1400, height: ALTURA_BARRA });
  assert.equal(l.celulas.length, 3);
  assert.ok(l.celulas.every((c) => !c.visivel));
  assert.equal(l.ampliada, null);
  assert.deepEqual(tamanhoCompacto(3), { width: 1400, height: ALTURA_BARRA });
  assert.equal(tamanhoCompacto(0).width, 600, 'pelo menos uma conta de largura');
  assert.equal(tamanhoCompacto(4, 1536).width, 1536, '4 contas numa tela de 1536 DIP: cabe na tela');
  assert.equal(tamanhoCompacto(4, 300.5).width, 400, 'nunca menor que 400');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { comTrava, travaAbandonada } from '../lancador/trava.mjs';

const pastaTemp = (t) => { const p = mkdtempSync(join(tmpdir(), 'multiconta-trava-')); t.after(() => rmSync(p, { recursive: true, force: true })); return p; };

test('trava: roda, devolve o resultado e solta (inclusive com erro)', (t) => {
  const arq = join(pastaTemp(t), 'abrir.trava');
  assert.equal(comTrava(arq, () => { assert.ok(existsSync(arq)); return 42; }), 42);
  assert.ok(!existsSync(arq));
  assert.throws(() => comTrava(arq, () => { throw new Error('falhou'); }), /falhou/);
  assert.ok(!existsSync(arq));
});

test('trava: segundo comando ao mesmo tempo é recusado (o caso do atalho clicado duas vezes)', (t) => {
  const arq = join(pastaTemp(t), 'abrir.trava');
  comTrava(arq, () => {
    assert.throws(() => comTrava(arq, () => assert.fail('não devia rodar')), /outro comando do lançador está rodando/);
  });
});

test('trava: sobra de processo morto ou velha demais é retomada', (t) => {
  const pasta = pastaTemp(t);
  const arq = join(pasta, 'abrir.trava');
  writeFileSync(arq, '999999');
  assert.equal(comTrava(arq, () => 'ok', { estaVivo: () => false }), 'ok');
  writeFileSync(arq, String(process.pid));
  const antigo = (Date.now() - 10 * 60_000) / 1000;
  utimesSync(arq, antigo, antigo);
  assert.equal(travaAbandonada(arq), true);
  writeFileSync(arq, String(process.pid));
  assert.equal(travaAbandonada(arq), false, 'trava nova de processo vivo vale');
  writeFileSync(arq, 'lixo');
  assert.equal(travaAbandonada(arq), true);
  assert.equal(travaAbandonada(join(pasta, 'nao-existe')), true);
});

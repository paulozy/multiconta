import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarRegistro, ignorarSaidaFechada, limparUrls } from '../app/registro.mjs';

test('registro: grava com data, cria a pasta, mostra a pilha de erros e gira em 1 MB', (t) => {
  const pasta = mkdtempSync(join(tmpdir(), 'multiconta-reg-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  const arq = join(pasta, 'sub', 'registro.log');
  const reg = criarRegistro(arq, { agora: () => new Date('2026-10-27T21:00:00Z') });
  reg('a conta', 'treinador1', 'já está em outra célula');
  reg(new Error('falhou'));
  const texto = readFileSync(arq, 'utf8');
  assert.match(texto, /^2026-10-27T21:00:00\.000Z a conta treinador1 já está em outra célula\n/);
  assert.match(texto, /Error: falhou\n\s+at /);
  writeFileSync(arq, 'x'.repeat(1024 * 1024 + 1));
  reg('novo');
  assert.ok(existsSync(`${arq}.1`));
  assert.match(readFileSync(arq, 'utf8'), /novo/);
});

test('registro: nunca lança (pasta impossível)', () => {
  assert.doesNotThrow(() => criarRegistro('\0/invalido/registro.log')('x'));
});

test('saída fechada: EPIPE é engolido, outros erros continuam subindo', () => {
  const fluxo = new EventEmitter();
  ignorarSaidaFechada([fluxo]);
  assert.doesNotThrow(() => fluxo.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })));
  assert.throws(() => fluxo.emit('error', Object.assign(new Error('outro'), { code: 'EACCES' })), /outro/);
});

test('registro: endereços saem sem a busca e o fragmento (a volta do login traz o token no endereço)', (t) => {
  assert.equal(limparUrls('Failed to load URL: https://pokeidle.io/app?sessao=abc.def&x=1 with error'), 'Failed to load URL: https://pokeidle.io/app?… with error');
  assert.equal(limparUrls('ida https://discord.com/oauth2/authorize#token=xyz e "https://a.b/c?d=e"'), 'ida https://discord.com/oauth2/authorize?… e "https://a.b/c?…"');
  assert.equal(limparUrls('sem endereço? nada muda #1'), 'sem endereço? nada muda #1');
  for (const outro of ['{"url":"https:\\/\\/pokeidle.io\\/?sessao=segredo"}', 'r=https%3A%2F%2Fpokeidle.io%2F%3Fsessao%3Dsegredo', 'pokeidle.io/?sessao=segredo&x=1', '{"sessao":"segredo"}']) {
    assert.ok(!limparUrls(outro).includes('segredo'), outro);
  }
  const pasta = mkdtempSync(join(tmpdir(), 'mc-reg-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  const arq = join(pasta, 'registro.log');
  criarRegistro(arq)('aviso:', new Error('falhou https://pokeidle.io/?sessao=segredo'));
  assert.ok(!readFileSync(arq, 'utf8').includes('segredo'));
});

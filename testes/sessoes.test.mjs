import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { estadoDasSessoes, levarSessao, pastaParticao, particao, planoParaParticao } from '../app/sessoes.mjs';
import { lerArgs } from '../app/cli.mjs';
import { chaveLS, escreverLog } from './apoio-leveldb.mjs';

const livre = () => 'livre';
function raizFalsa(t) {
  const raiz = mkdtempSync(join(tmpdir(), 'multiconta-ses-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  return { raiz, userData: join(raiz, 'electron') };
}
/** Perfil do lançador A com (ou sem) sessão do jogo. */
function contaNoA(raiz, id, { sessao = true } = {}) {
  const ls = join(raiz, 'perfis', id, 'Default', 'Local Storage');
  mkdirSync(join(ls, 'leveldb'), { recursive: true });
  writeFileSync(join(ls, 'leveldb', 'LOCK'), '');
  const ops = [{ chave: chaveLS('onde-cacar:prefs:v1'), valor: Buffer.from('{}') }];
  if (sessao) ops.push({ chave: chaveLS('sessao'), valor: Buffer.from('\x01{"token":"FICTICIO"}') });
  escreverLog(join(ls, 'leveldb', '000003.log'), [{ seq: 1, ops }]);
  // coisas do perfil que NÃO devem ir para o app
  mkdirSync(join(raiz, 'perfis', id, 'Default', 'Network'), { recursive: true });
  writeFileSync(join(raiz, 'perfis', id, 'Default', 'Network', 'Cookies'), 'x');
  return ls;
}

test('partição: nome e pasta do Electron para cada conta', () => {
  assert.equal(particao('alt1'), 'persist:alt1');
  assert.equal(pastaParticao('C:\\L\\electron', 'alt1'), join('C:\\L\\electron', 'Partitions', 'alt1'));
  assert.deepEqual(planoParaParticao('/a/Local Storage', '/p/alt1'), [{ de: '/a/Local Storage', para: join('/p/alt1', 'Local Storage') }]);
});

// o Local Storage de um perfil (aqui, o da conta no lançador do Edge) para a partição da conta
const migrar = ({ raiz, userData, id, emUso, forcar }) => levarSessao({ origem: join(raiz, 'perfis', id, 'Default', 'Local Storage'), nomeOrigem: `o perfil ${id}`, destino: pastaParticao(userData, id), emUso, forcar });

test('levarSessao: leva só o Local Storage do perfil para a raiz da partição', (t) => {
  const { raiz, userData } = raizFalsa(t);
  contaNoA(raiz, 'alt1');
  migrar({ raiz, userData, id: 'alt1', emUso: livre });
  const destino = pastaParticao(userData, 'alt1');
  assert.deepEqual(readdirSync(destino), ['Local Storage']);
  assert.deepEqual(estadoDasSessoes(userData, [{ id: 'alt1' }, { id: 'alt2' }]), { alt1: 'logada', alt2: 'sem-particao' });
});

test('levarSessao: perfil aberto no navegador, sem sessão, sem perfil ou partição já existente são recusados', (t) => {
  const { raiz, userData } = raizFalsa(t);
  contaNoA(raiz, 'alt1');
  assert.throws(() => migrar({ raiz, userData, id: 'alt1', emUso: (a) => (a.endsWith('LOCK') ? 'em-uso' : 'livre') }), /está aberto: feche as janelas dele/);
  contaNoA(raiz, 'alt2', { sessao: false });
  assert.throws(() => migrar({ raiz, userData, id: 'alt2', emUso: livre }), /não tem sessão do pokeidle\.io/);
  migrar({ raiz, userData, id: 'alt2', emUso: livre, forcar: true });
  assert.deepEqual(estadoDasSessoes(userData, [{ id: 'alt2' }]), { alt2: 'sem-sessao' });
  assert.throws(() => migrar({ raiz, userData, id: 'alt3', emUso: livre }), /não tem dados de sites/);
  migrar({ raiz, userData, id: 'alt1', emUso: livre });
  assert.throws(() => migrar({ raiz, userData, id: 'alt1', emUso: livre }), /já tem login no app/, 'nunca por cima de uma conta logada');
});

test('levarSessao: falha na cópia não deixa partição pela metade', (t) => {
  const { raiz, userData } = raizFalsa(t);
  const ls = contaNoA(raiz, 'alt1');
  const destino = pastaParticao(userData, 'alt1');
  rmSync(join(ls, 'leveldb', '000003.log'));
  assert.throws(() => levarSessao({ origem: ls, nomeOrigem: 'x', destino, emUso: livre }), /não tem sessão/);
  assert.ok(!existsSync(destino));
});

test('cli: comando, argumentos e opções; opção errada é erro', () => {
  assert.deepEqual(lerArgs(['importar', '--forcar', 'Perfil 1', 'principal']), { cmd: 'importar', resto: ['Perfil 1', 'principal'], forcar: true });
  assert.deepEqual(lerArgs(['estado']), { cmd: 'estado', resto: [], forcar: false });
  assert.throws(() => lerArgs(['importar', '--so-sessao']), /opção desconhecida: --so-sessao/);
});

test('levarSessao: partição que o app criou sem login (conta na tela de entrar) recebe o login', (t) => {
  const { raiz, userData } = raizFalsa(t);
  contaNoA(raiz, 'alt1');
  const destino = pastaParticao(userData, 'alt1');
  mkdirSync(join(destino, 'Local Storage', 'leveldb'), { recursive: true });
  writeFileSync(join(destino, 'Local Storage', 'leveldb', 'LOG'), 'da tela de entrar');
  mkdirSync(join(destino, 'Cache'), { recursive: true }); // o resto da partição fica
  migrar({ raiz, userData, id: 'alt1', emUso: livre });
  assert.deepEqual(estadoDasSessoes(userData, [{ id: 'alt1' }]), { alt1: 'logada' });
  assert.ok(existsSync(join(destino, 'Cache')));
  assert.ok(!existsSync(join(destino, 'Local Storage', 'leveldb', 'LOG')) || readFileSync(join(destino, 'Local Storage', 'leveldb', 'LOG'), 'utf8') !== 'da tela de entrar');
  assert.ok(!existsSync(join(destino, 'Local Storage.velho')));
});

test('levarSessao: substituir troca um login por outro; origem ruim não toca no anterior', (t) => {
  const { raiz, userData } = raizFalsa(t);
  contaNoA(raiz, 'alt1');
  migrar({ raiz, userData, id: 'alt1', emUso: livre });
  const destino = pastaParticao(userData, 'alt1');
  const origem = join(raiz, 'perfis', 'alt1', 'Default', 'Local Storage');
  writeFileSync(join(destino, 'Local Storage', 'marca'), 'login anterior');
  levarSessao({ origem, nomeOrigem: 'x', destino, emUso: livre, substituir: true });
  assert.ok(!existsSync(join(destino, 'Local Storage', 'marca')), 'o novo entrou');
  assert.deepEqual(estadoDasSessoes(userData, [{ id: 'alt1' }]), { alt1: 'logada' });
  writeFileSync(join(destino, 'Local Storage', 'marca'), 'login anterior');
  // origem que não serve: nada é tocado
  assert.throws(() => levarSessao({ origem: join(raiz, 'nao-existe'), nomeOrigem: 'y', destino, emUso: livre, substituir: true }), /não tem dados de sites/);
  assert.equal(readFileSync(join(destino, 'Local Storage', 'marca'), 'utf8'), 'login anterior');
});

test('levarSessao: login anterior que ficou em "Local Storage.velho" volta antes de qualquer troca (nunca é apagado)', (t) => {
  const { raiz, userData } = raizFalsa(t);
  contaNoA(raiz, 'alt1');
  migrar({ raiz, userData, id: 'alt1', emUso: livre });
  const ls = join(pastaParticao(userData, 'alt1'), 'Local Storage');
  writeFileSync(join(ls, 'marca'), 'login anterior');
  // simula a troca que não conseguiu devolver: o login ficou só no .velho
  const { renameSync } = fs;
  renameSync(ls, `${ls}.velho`);
  assert.throws(() => migrar({ raiz, userData, id: 'alt1', emUso: livre }), /já tem login no app/, 'devolvido, ele volta a proteger a conta');
  assert.equal(readFileSync(join(ls, 'marca'), 'utf8'), 'login anterior');
  assert.ok(!existsSync(`${ls}.velho`));
});

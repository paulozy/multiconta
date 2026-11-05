import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerLocalState, perfisDoEdge, resolverPerfil } from '../app/edge.mjs';

const localState = JSON.parse(readFileSync(new URL('./fixtures/local-state.json', import.meta.url), 'utf8'));

test('perfis: nome que o Edge mostra ao lado da pasta', () => {
  assert.deepEqual(perfisDoEdge(localState).slice(0, 3), [
    { pasta: 'Default', nome: 'Perfil 1' },
    { pasta: 'Profile 2', nome: 'PokeIdle 2' },
    { pasta: 'Profile 3', nome: 'Perfil 2' },
  ]);
  assert.deepEqual(perfisDoEdge({}), []);
});

test('resolver: "Perfil 2" é a pasta Profile 3 (a confusão do estudo)', () => {
  assert.equal(resolverPerfil(localState, 'Perfil 2').pasta, 'Profile 3');
  assert.equal(resolverPerfil(localState, '  perfil 2 ').pasta, 'Profile 3');
  assert.equal(resolverPerfil(localState, 'PokeIdle 2').pasta, 'Profile 2');
});

test('resolver: aceita o nome da pasta, que tem prioridade sobre o nome mostrado', () => {
  assert.equal(resolverPerfil(localState, 'Profile 2').pasta, 'Profile 2');
  assert.equal(resolverPerfil(localState, 'default').nome, 'Perfil 1');
});

test('resolver: nome desconhecido ou vazio lista os perfis', () => {
  assert.throws(() => resolverPerfil(localState, 'Perfil 3'), /não achei o perfil "Perfil 3"\. Perfis: "Perfil 1" \(Default\)/);
  assert.throws(() => resolverPerfil(localState, ''), /diga qual perfil/);
});

test('resolver: nome repetido (sem diferenciar maiúsculas) pede a pasta', () => {
  assert.throws(() => resolverPerfil(localState, 'Trabalho'), /há 2 perfis chamados "Trabalho": use a pasta/);
  assert.equal(resolverPerfil(localState, 'Profile 5').nome, 'trabalho');
});

test('lerLocalState: pasta sem Local State vira erro legível', () => {
  assert.throws(() => lerLocalState('/caminho/que/nao/existe'), /não consegui ler o Local State do Edge/);
});

test('perfis: chaves que não são pastas de perfil do Edge são ignoradas (não saem de User Data)', () => {
  const pastas = perfisDoEdge(localState).map((p) => p.pasta);
  assert.ok(!pastas.some((p) => p.includes('..') || p.includes("'")), pastas.join(' | '));
  assert.throws(() => resolverPerfil(localState, 'Mau'), /não achei o perfil "Mau"/);
  assert.throws(() => resolverPerfil(localState, 'Injeção'), /não achei/);
});

test('perfis: entrada sem nome usa a pasta; Local State sem "profile" não quebra', () => {
  assert.deepEqual(perfisDoEdge(localState).find((p) => p.pasta === 'Profile 6'), { pasta: 'Profile 6', nome: 'Profile 6' });
  assert.deepEqual(perfisDoEdge({ outra: 1 }), []);
  assert.throws(() => resolverPerfil({}, 'Perfil 1'), /Perfis: nenhum/);
});

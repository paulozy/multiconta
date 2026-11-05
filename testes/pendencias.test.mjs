import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executarPendencias, gravarPendencias, juntarPendencias, lerPendencias, normalizarPendencias } from '../app/pendencias.mjs';
import { localStorageDoPerfil, navegadoresComPerfis, perfisDoNavegador, pastaDoNavegador, navegador } from '../app/navegadores.mjs';

const pastaTemp = (t) => { const p = mkdtempSync(join(tmpdir(), 'mc-pend-')); t.after(() => rmSync(p, { recursive: true, force: true })); return p; };

test('pendências: só o que tem a forma certa; apagar sem repetição', () => {
  assert.deepEqual(normalizarPendencias(null), { importar: [], apagar: [] });
  assert.deepEqual(normalizarPendencias({
    importar: [{ navegador: 'chrome', pasta: 'Default', conta: 'alt1', extra: 1 }, { navegador: 'x', pasta: 'y', conta: '../z' }, 'lixo'],
    apagar: ['alt2', 'alt2', '..', 3],
  }), { importar: [{ navegador: 'chrome', pasta: 'Default', conta: 'alt1' }], apagar: ['alt2'] });
});

test('pendências: o último importar de uma conta vale', () => {
  const j = juntarPendencias({ importar: [{ navegador: 'edge', pasta: 'Default', conta: 'a' }], apagar: ['b'] },
    { importar: [{ navegador: 'chrome', pasta: 'Profile 1', conta: 'a' }], apagar: ['b', 'c'] });
  assert.deepEqual(j, { importar: [{ navegador: 'chrome', pasta: 'Profile 1', conta: 'a' }], apagar: ['b', 'c'] });
});

test('pendências: executa apagar antes de importar, junta erros e apaga o arquivo antes (não repete a cada abertura)', (t) => {
  const raiz = pastaTemp(t);
  assert.deepEqual(executarPendencias(raiz, { levar() { throw new Error('não'); }, apagarLogin() {} }), { feitos: [], erros: [] }, 'sem arquivo, nada');
  gravarPendencias(raiz, { importar: [{ navegador: 'edge', pasta: 'Default', conta: 'a' }, { navegador: 'edge', pasta: 'P', conta: 'b' }], apagar: ['a'] });
  const ordem = [];
  const r = executarPendencias(raiz, {
    apagarLogin: (id) => ordem.push(`apaga ${id}`),
    levar: (i) => { ordem.push(`leva ${i.conta}`); if (i.conta === 'b') { assert.ok(!existsSync(join(raiz, 'pendencias.json'))); throw new Error('o navegador está aberto'); } },
    rotuloDe: (id) => id.toUpperCase(),
  });
  assert.deepEqual(ordem, ['apaga a', 'leva a', 'leva b']);
  assert.deepEqual(r, { feitos: ['login de A apagado', 'login de A trazido do navegador'], erros: ['não consegui trazer o login de B: o navegador está aberto'] });
  assert.deepEqual(lerPendencias(raiz), { importar: [], apagar: [] });
});

// ---- navegadores --------------------------------------------------------------------------------
const env = { localAppData: 'C:\\L', appData: 'C:\\R' };
const localState = { profile: { info_cache: { Default: { name: 'Pessoal' }, 'Profile 2': { name: 'Jogo' }, '..\\fora': { name: 'x' } } } };

test('navegadores: pasta de cada um (o Opera fica no Roaming)', () => {
  assert.equal(pastaDoNavegador(navegador('chrome'), env), join('C:\\L', 'Google', 'Chrome', 'User Data'));
  assert.equal(pastaDoNavegador(navegador('opera'), env), join('C:\\R', 'Opera Software', 'Opera Stable'));
  assert.equal(pastaDoNavegador(navegador('edge'), {}), null);
});

test('navegadores: perfis do Local State e, se houver, a própria pasta como perfil (Opera antigo)', () => {
  const chrome = pastaDoNavegador(navegador('chrome'), env);
  const opera = pastaDoNavegador(navegador('opera'), env);
  const existe = (p) => [chrome, opera, join(opera, 'Local Storage')].includes(p);
  const ler = (dir) => { if (dir === chrome) return localState; throw new Error('sem Local State'); };
  assert.deepEqual(perfisDoNavegador(navegador('chrome'), env, { ler, existe }), [{ pasta: 'Default', nome: 'Pessoal' }, { pasta: 'Profile 2', nome: 'Jogo' }]);
  assert.deepEqual(perfisDoNavegador(navegador('opera'), env, { ler, existe }), [{ pasta: '', nome: 'Perfil principal' }]);
  assert.deepEqual(navegadoresComPerfis(env, { ler, existe }).map((n) => n.id), ['chrome', 'opera'], 'só os instalados com perfis');
});

test('navegadores: Local Storage só de um perfil que existe nesse navegador', () => {
  const chrome = pastaDoNavegador(navegador('chrome'), env);
  const opcoes = { ler: () => localState, existe: (p) => p === chrome };
  assert.deepEqual(localStorageDoPerfil('chrome', 'Profile 2', env, opcoes), { origem: join(chrome, 'Profile 2', 'Local Storage'), nome: 'o perfil "Jogo" do Google Chrome' });
  assert.throws(() => localStorageDoPerfil('chrome', '..\\fora', env, opcoes), /não achei esse perfil/);
  assert.throws(() => localStorageDoPerfil('firefox', 'Default', env, opcoes), /navegador desconhecido/);
});

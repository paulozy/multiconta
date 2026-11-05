import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ATALHOS_GERAIS, copiarApp, linhaDeComando, nomeDeArquivo, planoDeAtalhos, SCRIPT_ATALHOS } from '../lancador/instalar.mjs';
import { avisar, precisaPausar } from '../lancador/lancador.mjs';
import { lerConfig } from '../lancador/config.mjs';

const pastaTemp = (t) => { const p = mkdtempSync(join(tmpdir(), 'multiconta-inst-')); t.after(() => rmSync(p, { recursive: true, force: true })); return p; };
function repoFalso(raiz, versao = '1') {
  const r = join(raiz, 'repo');
  for (const d of ['lancador', 'app/rotulo', 'app/barra', 'testes', 'spikes']) mkdirSync(join(r, d), { recursive: true });
  writeFileSync(join(r, 'lancador', 'lancador.mjs'), `// v${versao}`);
  writeFileSync(join(r, 'app', 'rotulo', 'rotulo.js'), 'x');
  writeFileSync(join(r, 'app', 'barra', 'barra.js'), 'só do app Electron');
  for (const m of ['edge', 'extensoes', 'importar', 'leveldb', 'powershell', 'main']) writeFileSync(join(r, 'app', `${m}.mjs`), m);
  writeFileSync(join(r, 'testes', 'a.test.mjs'), 'x');
  writeFileSync(join(r, 'spikes', 'sonda.mjs'), 'x');
  writeFileSync(join(r, 'contas.exemplo.json'), JSON.stringify({ contas: [{ id: 'alt1', rotulo: 'Alt 1' }] }));
  writeFileSync(join(r, 'contas.json'), 'não vai para o app');
  return r;
}

test('instalar: copia só lancador, o rótulo, os módulos comuns e o exemplo (nada de testes, spikes, contas.json ou do app Electron)', (t) => {
  const raiz = pastaTemp(t);
  const app = join(raiz, 'dados', 'app');
  assert.deepEqual(copiarApp(repoFalso(raiz), app).sort(), ['app', 'contas.exemplo.json', 'lancador']);
  assert.deepEqual(readdirSync(join(app, 'app')).sort(), ['edge.mjs', 'extensoes.mjs', 'importar.mjs', 'leveldb.mjs', 'powershell.mjs', 'rotulo']);
  assert.ok(!existsSync(join(app, 'contas.json')));
});

test('instalar de novo: troca a versão sem sobras; repositório quebrado mantém a instalação', (t) => {
  const raiz = pastaTemp(t);
  const app = join(raiz, 'dados', 'app');
  copiarApp(repoFalso(raiz, '1'), app);
  rmSync(join(raiz, 'repo'), { recursive: true });
  copiarApp(repoFalso(raiz, '2'), app);
  assert.equal(readFileSync(join(app, 'lancador', 'lancador.mjs'), 'utf8'), '// v2');
  assert.deepEqual(readdirSync(join(raiz, 'dados')), ['app']);
  rmSync(join(raiz, 'repo', 'app', 'rotulo'), { recursive: true });
  assert.throws(() => copiarApp(join(raiz, 'repo'), app), /não consegui copiar o lançador/);
  assert.equal(readFileSync(join(app, 'lancador', 'lancador.mjs'), 'utf8'), '// v2');
});

test('config: a pasta de dados vem antes do código; sem contas.json em nenhuma, o exemplo', (t) => {
  const raiz = pastaTemp(t);
  const dados = join(raiz, 'dados'), app = join(raiz, 'app');
  mkdirSync(dados); mkdirSync(app);
  writeFileSync(join(app, 'contas.exemplo.json'), JSON.stringify({ contas: [{ id: 'exemplo', rotulo: 'E' }] }));
  assert.equal(lerConfig([dados, app]).contas[0].id, 'exemplo');
  writeFileSync(join(app, 'contas.json'), JSON.stringify({ contas: [{ id: 'do-app', rotulo: 'A' }] }));
  assert.equal(lerConfig([dados, app]).contas[0].id, 'do-app');
  writeFileSync(join(dados, 'contas.json'), JSON.stringify({ contas: [{ id: 'dos-dados', rotulo: 'D' }] }));
  const cfg = lerConfig([dados, app]);
  assert.equal(cfg.contas[0].id, 'dos-dados');
  assert.equal(cfg.caminho, join(dados, 'contas.json'));
});

test('atalhos do lançador: só no Iniciar, com "(Edge)" no nome (a Área de Trabalho é do app)', () => {
  const plano = planoDeAtalhos([{ id: 'principal', rotulo: 'Principal' }, { id: 'alt1', rotulo: 'Alt: 1/2' }], { node: 'C:\\node\\node.exe', script: 'C:\\L\\app\\lancador\\lancador.mjs', icone: 'C:\\edge.exe,0' });
  assert.deepEqual(plano.map((a) => `${a.pasta}/${a.nome}`), [
    'menu/PokeIdle (Edge) · todas.lnk', 'menu/PokeIdle (Edge) · fechar todas.lnk',
    'menu/PokeIdle (Edge) · Principal.lnk', 'menu/PokeIdle (Edge) · Alt- 1-2.lnk',
  ]);
  assert.deepEqual(plano.at(-1).args, ['C:\\L\\app\\lancador\\lancador.mjs', 'abrir', 'alt1', '--pausar']);
  assert.ok(plano.every((a) => a.alvo === 'C:\\node\\node.exe' && a.args.at(-1) === '--pausar'));
});
test('nome de arquivo e linha de comando do atalho', () => {
  assert.equal(nomeDeArquivo('a<b>c:d"e/f\\g|h?i*j'), 'a-b-c-d-e-f-g-h-i-j');
  assert.equal(nomeDeArquivo('fim. '), 'fim');
  assert.equal(nomeDeArquivo('...'), 'conta');
  assert.equal(linhaDeComando(['C:\\Users\\Ana Paula\\app\\lancador.mjs', 'abrir', 'alt1']), '"C:\\Users\\Ana Paula\\app\\lancador.mjs" abrir alt1');
});

test('atalhos: o script do PowerShell recebe a lista por variável, sem nome colado', () => {
  assert.match(SCRIPT_ATALHOS, /\$env:MC_ATALHOS \| ConvertFrom-Json/);
  assert.ok(!/Principal|alt1/.test(SCRIPT_ATALHOS));
});

const OPC = { node: 'n.exe', script: 's.mjs', icone: 'i' };
const nomesMenu = (plano) => plano.filter((a) => a.pasta === 'menu').map((a) => a.nome);

test('atalhos: rótulo igual a "todas" ou repetido (maiúsculas, ": /") ganha o id; nada é sobrescrito', () => {
  const plano = planoDeAtalhos([
    { id: 'a', rotulo: 'todas' }, { id: 'b', rotulo: 'Principal' }, { id: 'c', rotulo: 'principal' }, { id: 'd', rotulo: 'Alt: 1' }, { id: 'e', rotulo: 'Alt/ 1' },
  ], OPC);
  assert.deepEqual(nomesMenu(plano).slice(2), ['PokeIdle (Edge) · todas (a).lnk', 'PokeIdle (Edge) · Principal.lnk', 'PokeIdle (Edge) · principal (c).lnk', 'PokeIdle (Edge) · Alt- 1.lnk', 'PokeIdle (Edge) · Alt- 1 (e).lnk']);
  const nomes = nomesMenu(plano).map((n) => n.toLowerCase());
  assert.equal(new Set(nomes).size, nomes.length);
  assert.deepEqual(plano.find((a) => a.nome === 'PokeIdle (Edge) · todas.lnk').args, ['s.mjs', 'abrir', '--pausar'], '"todas" continua abrindo todas');
});
test('atalhos: colisão que nem o id resolve é erro', () => {
  // "y" bate com "Y"; a alternativa "y (k)" bate com o rótulo "Y (k)" de outra conta
  assert.throws(() => planoDeAtalhos([{ id: 'a', rotulo: 'Y' }, { id: 'b', rotulo: 'Y (k)' }, { id: 'k', rotulo: 'y' }], OPC), /conta k teria o mesmo nome/);
});

test('instalar: repositório dentro de uma pasta "testes" não perde os arquivos', (t) => {
  const raiz = join(pastaTemp(t), 'testes', 'multiconta');
  mkdirSync(raiz, { recursive: true });
  const app = join(raiz, '..', 'app');
  assert.deepEqual(copiarApp(repoFalso(raiz), app).sort(), ['app', 'contas.exemplo.json', 'lancador']);
  assert.ok(existsSync(join(app, 'lancador', 'lancador.mjs')));
});

test('atalhos: na Área de Trabalho o script só apaga os nomes antigos do lançador; para no primeiro erro', () => {
  assert.match(SCRIPT_ATALHOS, /\$ErrorActionPreference = 'Stop'/);
  assert.match(SCRIPT_ATALHOS, /\$env:MC_ANTIGOS \| ConvertFrom-Json/);
  assert.ok(!/Filter 'PokeIdle · \*\.lnk'/.test(SCRIPT_ATALHOS), 'nada de apagar "PokeIdle · *" do usuário');
  assert.ok(SCRIPT_ATALHOS.indexOf('$l.Save()') < SCRIPT_ATALHOS.indexOf("Where-Object { $feitos -notcontains"), 'cria antes de apagar os velhos do menu');
  assert.deepEqual(ATALHOS_GERAIS, ['PokeIdle (Edge) · todas', 'PokeIdle (Edge) · fechar todas']);
});
test('pausar: só depois de um aviso explícito (nada de adivinhar pelo texto)', () => {
  assert.equal(precisaPausar(), false);
  console.log('[alt1] aberta (Ferroada)'); // "erro" no rótulo não pausa mais
  assert.equal(precisaPausar(), false);
  avisar('[alt1] não consegui fechar o Edge desta conta');
  assert.equal(precisaPausar(), true);
});

test('linha de comando: aspas dentro do argumento são escapadas', () => {
  assert.equal(linhaDeComando(['a "b" c']), '"a \\"b\\" c"');
});

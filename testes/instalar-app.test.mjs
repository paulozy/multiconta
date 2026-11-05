import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as fs from 'node:fs';
import { montarIco, tamanhoPng } from '../app/icone/ico.mjs';
import { ambienteDoDownload, apagarApp, appRodando, atalhoDoApp, caminhos, copiarAppElectron, electronServe, instalarElectron, lerProcessosElectron, recuperarInterrompida, SCRIPT_ATALHO_APP } from '../app/instalar-app.mjs';

const pastaTemp = (t) => { const p = mkdtempSync(join(tmpdir(), 'multiconta-app-')); t.after(() => rmSync(p, { recursive: true, force: true })); return p; };
function repoFalso(raiz, versao = '1', { electron = '44.9.3', pasta = 'repo' } = {}) {
  const r = join(raiz, pasta);
  for (const d of ['app/barra', 'app/rotulo', 'app/node_modules/electron', 'lancador', 'testes', 'spikes']) mkdirSync(join(r, d), { recursive: true });
  writeFileSync(join(r, 'app', 'main.mjs'), `// v${versao}`);
  writeFileSync(join(r, 'app', 'barra', 'barra.html'), 'x');
  writeFileSync(join(r, 'app', 'node_modules', 'electron', 'lixo-do-wsl'), 'não vai');
  writeFileSync(join(r, 'lancador', 'config.mjs'), 'x');
  writeFileSync(join(r, 'app', 'rotulo', 'rotulo.js'), 'x');
  writeFileSync(join(r, 'testes', 'a.test.mjs'), 'x');
  writeFileSync(join(r, 'contas.exemplo.json'), '{}');
  writeFileSync(join(r, 'app', 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/electron': { version: electron } } }));
  return r;
}
/** Simula o Electron já baixado numa instalação (completo, como o install.js deixa). */
function comElectron(destino, { versao = '44.9.3', completo = true } = {}) {
  const e = join(destino, 'app', 'node_modules', 'electron');
  mkdirSync(join(e, 'dist'), { recursive: true });
  writeFileSync(join(e, 'package.json'), JSON.stringify({ version: versao }));
  writeFileSync(join(e, 'dist', 'electron.exe'), 'exe');
  if (completo) { writeFileSync(join(e, 'dist', 'version'), `v${versao}`); writeFileSync(join(e, 'path.txt'), 'electron.exe'); }
}

test('instalar app: só o código (sem node_modules, testes ou protótipos)', (t) => {
  const raiz = pastaTemp(t);
  const { destino } = caminhos(join(raiz, 'dados'));
  assert.equal(copiarAppElectron(repoFalso(raiz), destino), false, 'primeira vez: nada a reaproveitar');
  assert.deepEqual(readdirSync(destino).sort(), ['app'], 'nem lancador/ nem o exemplo do contas.json');
  assert.ok(!existsSync(join(destino, 'app', 'node_modules')));
});

test('reinstalar app: troca o código e reaproveita o Electron já baixado', (t) => {
  const raiz = pastaTemp(t);
  const { destino, electronExe } = caminhos(join(raiz, 'dados'));
  copiarAppElectron(repoFalso(raiz, '1'), destino);
  comElectron(destino);
  rmSync(join(raiz, 'repo'), { recursive: true });
  assert.equal(copiarAppElectron(repoFalso(raiz, '2'), destino), true);
  assert.equal(readFileSync(join(destino, 'app', 'main.mjs'), 'utf8'), '// v2');
  assert.ok(existsSync(electronExe));
  assert.deepEqual(readdirSync(join(raiz, 'dados')), ['app-electron'], 'sem .novo nem .velho');
});

test('reinstalar app: repositório quebrado mantém a instalação e o Electron', (t) => {
  const raiz = pastaTemp(t);
  const { destino, electronExe } = caminhos(join(raiz, 'dados'));
  copiarAppElectron(repoFalso(raiz), destino);
  comElectron(destino);
  rmSync(join(raiz, 'repo', 'app'), { recursive: true });
  assert.throws(() => copiarAppElectron(join(raiz, 'repo'), destino), /não consegui copiar o app/);
  assert.ok(existsSync(electronExe));
  assert.equal(readFileSync(join(destino, 'app', 'main.mjs'), 'utf8'), '// v1');
});

test('Electron: npm ci pelo npm-cli.js ao lado do node (sem shell) e o install.js', (t) => {
  const raiz = pastaTemp(t);
  const node = join(raiz, 'node', 'node.exe');
  mkdirSync(join(raiz, 'node', 'node_modules', 'npm', 'bin'), { recursive: true });
  writeFileSync(join(raiz, 'node', 'node_modules', 'npm', 'bin', 'npm-cli.js'), '');
  const chamadas = [];
  instalarElectron('C:\\app', { node, rodar: (arq, args, cwd) => chamadas.push([arq, args.slice(1), cwd]) });
  assert.deepEqual(chamadas, [
    [node, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], 'C:\\app'],
    [node, [], 'C:\\app'],
  ]);
  const comArgs = [];
  instalarElectron('C:\\app', { node, rodar: (arq, args) => comArgs.push(args) });
  assert.equal(comArgs[1][0], join('C:\\app', 'node_modules', 'electron', 'install.js'));
  assert.throws(() => instalarElectron('C:\\app', { node: join(raiz, 'outro', 'node.exe'), rodar: () => {} }), /não achei o npm/);
});

test('atalho do app e detecção do app aberto', () => {
  const { appDir, electronExe, destino } = caminhos('C:\\Users\\Ana Paula\\AppData\\Local\\PokeIdleMulticonta');
  const a = atalhoDoApp({ electronExe, appDir, raiz: 'C:\\R' });
  assert.equal(a.nome, 'PokeIdle Multiconta.lnk');
  assert.equal(a.linha, `"${appDir}"`, 'pasta do app entre aspas (o caminho tem espaço)');
  assert.equal(a.pastaTrabalho, 'C:\\R');
  assert.equal(a.icone, `${join(appDir, 'icone', 'icone.ico')},0`, 'o ícone do app, não o do Electron');
  assert.equal(appRodando([{ exe: electronExe.toUpperCase() }], destino), true);
  assert.equal(appRodando([{ exe: 'C:\\outro\\electron.exe' }, { exe: null }], destino), false);
  assert.equal(appRodando([{ exe: `${destino}-velho\\electron.exe` }], destino), false, 'pasta vizinha com nome parecido não conta');
  assert.match(SCRIPT_ATALHO_APP, /\$env:MC_ATALHO \| ConvertFrom-Json/);
});

test('reinstalar app: Electron de outra versão ou download incompleto NÃO é reaproveitado', (t) => {
  for (const [nome, prep] of [['outra versão', (d) => comElectron(d, { versao: '44.9.2' })], ['download incompleto', (d) => comElectron(d, { completo: false })]]) {
    const raiz = pastaTemp(t);
    const { destino } = caminhos(join(raiz, 'dados'));
    copiarAppElectron(repoFalso(raiz), destino);
    prep(destino);
    rmSync(join(raiz, 'repo'), { recursive: true });
    assert.equal(copiarAppElectron(repoFalso(raiz, '2'), destino), false, nome);
    assert.ok(!existsSync(join(destino, 'app', 'node_modules')), `${nome}: o velho vai embora com a instalação anterior`);
  }
});

test('electronServe: versão do pacote, dist\\version (com ou sem "v") e path.txt', (t) => {
  const raiz = pastaTemp(t);
  comElectron(raiz);
  const mod = join(raiz, 'app', 'node_modules');
  assert.equal(electronServe(mod, '44.9.3'), true);
  assert.equal(electronServe(mod, '45.0.0'), false);
  assert.equal(electronServe(mod, null), false);
  rmSync(join(mod, 'electron', 'path.txt'));
  assert.equal(electronServe(mod, '44.9.3'), false);
});

test('instalação interrompida no meio da troca: a anterior volta, com o Electron', (t) => {
  const raiz = pastaTemp(t);
  const { destino, electronExe } = caminhos(join(raiz, 'dados'));
  copiarAppElectron(repoFalso(raiz), destino);
  comElectron(destino);
  // como se a energia tivesse caído entre os dois renames: Electron em .novo, código em .velho
  mkdirSync(join(`${destino}.novo`, 'app'), { recursive: true });
  fs.renameSync(join(destino, 'app', 'node_modules'), join(`${destino}.novo`, 'app', 'node_modules'));
  fs.renameSync(destino, `${destino}.velho`);
  assert.equal(recuperarInterrompida(destino), true);
  assert.ok(existsSync(electronExe));
  assert.equal(recuperarInterrompida(destino), false, 'nada a recuperar');
  assert.equal(copiarAppElectron(join(raiz, 'repo'), destino), true, 'e a próxima instalação ainda reaproveita');
});

test('falha ao trocar (pasta em uso): a instalação anterior e o Electron ficam onde estavam', (t) => {
  const raiz = pastaTemp(t);
  const { destino, electronExe } = caminhos(join(raiz, 'dados'));
  copiarAppElectron(repoFalso(raiz, '1'), destino);
  comElectron(destino);
  const emUso = (falharEm) => ({ ...fs, renameSync: (a, b) => { if (a === falharEm) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); return fs.renameSync(a, b); } });
  assert.throws(() => copiarAppElectron(join(raiz, 'repo'), destino, emUso(destino)), /feche o app/);
  assert.ok(existsSync(electronExe) && !existsSync(`${destino}.novo`));
  assert.throws(() => copiarAppElectron(join(raiz, 'repo'), destino, emUso(`${destino}.novo`)), /a instalação anterior está em .*app-electron/);
  assert.ok(existsSync(electronExe), 'o Electron voltou para a instalação anterior');
  assert.equal(readFileSync(join(destino, 'app', 'main.mjs'), 'utf8'), '// v1');
});

test('repositório dentro de uma pasta "testes" não perde os arquivos', (t) => {
  const raiz = join(pastaTemp(t), 'testes');
  mkdirSync(raiz, { recursive: true });
  const { destino } = caminhos(join(raiz, 'dados'));
  copiarAppElectron(repoFalso(raiz, '1', { pasta: 'multiconta' }), destino);
  assert.ok(existsSync(join(destino, 'app', 'main.mjs')));
});

test('desinstalar: renomeia antes de apagar e limpa sobras; pasta em uso falha sem estragar', (t) => {
  const raiz = pastaTemp(t);
  const { destino } = caminhos(join(raiz, 'dados'));
  copiarAppElectron(repoFalso(raiz), destino);
  mkdirSync(`${destino}.velho`);
  assert.throws(() => apagarApp(destino, { ...fs, renameSync: () => { throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); } }), /EBUSY/);
  assert.ok(existsSync(join(destino, 'app', 'main.mjs')), 'nada apagado pela metade');
  apagarApp(destino);
  assert.deepEqual(readdirSync(join(raiz, 'dados')), []);
});

test('download do Electron: sem as variáveis que trocariam os checksums travados', () => {
  const env = ambienteDoDownload({ PATH: 'x', electron_use_remote_checksums: '1', NPM_CONFIG_ELECTRON_USE_REMOTE_CHECKSUMS: '1', ELECTRON_MIRROR: 'm' });
  assert.deepEqual(env, { PATH: 'x', ELECTRON_MIRROR: 'm' });
});

test('processos do Electron: saída vazia, objeto único, lista e caminho nulo', () => {
  assert.deepEqual(lerProcessosElectron(''), []);
  assert.deepEqual(lerProcessosElectron('{"ExecutablePath":"C:\\\\a\\\\electron.exe"}'), [{ exe: 'C:\\a\\electron.exe' }]);
  assert.deepEqual(lerProcessosElectron('[{"ExecutablePath":null},{"ExecutablePath":"x"}]'), [{ exe: null }, { exe: 'x' }]);
  assert.equal(appRodando([{ exe: 'C:\\L\\app-electron\\app\\x\\electron.exe' }], 'C:/L/app-electron/'), true, 'destino com barra no fim e / ');
});

test('ícone: .ico com PNGs dentro, do menor para o maior; 256 vira 0 no cabeçalho', () => {
  const png = (t) => { const b = Buffer.alloc(40); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(t, 16); b.writeUInt32BE(t, 20); b.writeUInt8(t % 251, 39); return b; };
  const ico = montarIco([png(256), png(16), png(32)]);
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 3]);
  const entradas = [0, 1, 2].map((n) => ({ lado: ico.readUInt8(6 + 16 * n), bytes: ico.readUInt32LE(14 + 16 * n), onde: ico.readUInt32LE(18 + 16 * n) }));
  assert.deepEqual(entradas.map((e) => e.lado), [16, 32, 0]);
  assert.equal(entradas[0].onde, 6 + 16 * 3);
  for (const e of entradas) assert.equal(tamanhoPng(ico.subarray(e.onde, e.onde + e.bytes)).largura, e.lado || 256);
  assert.equal(ico.length, 6 + 16 * 3 + 3 * 40);
  assert.throws(() => montarIco([Buffer.from('nada de png aqui, só texto qualquer')]), /não é um PNG/);
  const torto = png(32); torto.writeUInt32BE(16, 20);
  assert.throws(() => montarIco([torto]), /tamanho inválido/);
  assert.throws(() => montarIco([png(512)]), /tamanho inválido/);
});

test('o icone.ico do repositório é válido e traz os tamanhos pequenos e o de 256', () => {
  const ico = readFileSync(new URL('../app/icone/icone.ico', import.meta.url));
  const n = ico.readUInt16LE(4);
  const lados = Array.from({ length: n }, (_, i) => ico.readUInt8(6 + 16 * i) || 256);
  for (const l of [16, 32, 48, 256]) assert.ok(lados.includes(l), `falta ${l} px`);
});

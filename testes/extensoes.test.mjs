import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copiarExtensao, copiarOndeCacar, decidirOndeCacar, fonteOndeCacar, gerarRotulo, lerManifesto, planoOndeCacar, renomear, textoDoRotulo } from '../app/extensoes.mjs';

const pastaTemp = (t) => { const p = mkdtempSync(join(tmpdir(), 'multiconta-ext-')); t.after(() => rmSync(p, { recursive: true, force: true })); return p; };
function cloneFalso(raiz, versao) {
  const c = join(raiz, 'clone');
  mkdirSync(join(c, 'src'), { recursive: true });
  mkdirSync(join(c, 'icons'), { recursive: true });
  mkdirSync(join(c, '.git'), { recursive: true });
  writeFileSync(join(c, 'manifest.json'), JSON.stringify({ version: versao }));
  writeFileSync(join(c, 'src', '01-hook.js'), `// v${versao}`);
  writeFileSync(join(c, 'icons', '16.png'), 'png');
  writeFileSync(join(c, '.git', 'config'), 'não copiar');
  return c;
}

test('decidir Onde Caçar: copia só com clone acessível e nenhuma conta aberta', () => {
  const base = { clone: 'C:\\clone', cloneAcessivel: true, copiaExiste: true, algumaAberta: false };
  assert.equal(decidirOndeCacar(base).acao, 'copiar');
  assert.equal(decidirOndeCacar({ ...base, copiaExiste: false }).acao, 'copiar');
  const aberta = decidirOndeCacar({ ...base, algumaAberta: true });
  assert.equal(aberta.acao, 'manter');
  assert.match(aberta.aviso, /entra quando todas forem fechadas/);
  assert.equal(decidirOndeCacar({ ...base, algumaAberta: true, copiaExiste: false }).acao, 'copiar', 'sem cópia nenhuma, copia mesmo assim');
});

test('decidir Onde Caçar: clone fora do ar ou não configurado', () => {
  const base = { clone: 'C:\\clone', cloneAcessivel: false, copiaExiste: true, algumaAberta: false };
  assert.match(decidirOndeCacar(base).aviso, /usando a última cópia/);
  assert.equal(decidirOndeCacar(base).acao, 'manter');
  assert.equal(decidirOndeCacar({ ...base, copiaExiste: false }).acao, 'sem');
  assert.deepEqual(decidirOndeCacar({ clone: undefined, copiaExiste: true }), { acao: 'manter' });
  assert.match(decidirOndeCacar({ clone: undefined, copiaExiste: false }).aviso, /sem o Onde Caçar/);
});

test('copiar Onde Caçar: só manifest, src e icons; troca a versão sem sobras', (t) => {
  const raiz = pastaTemp(t);
  const destino = join(raiz, 'ext', 'onde-cacar');
  copiarOndeCacar(cloneFalso(raiz, '2.3.1'), destino);
  assert.deepEqual(readdirSync(destino).sort(), ['icons', 'manifest.json', 'src']);
  rmSync(join(raiz, 'clone'), { recursive: true });
  copiarOndeCacar(cloneFalso(raiz, '2.4.0'), destino);
  assert.equal(readFileSync(join(destino, 'src', '01-hook.js'), 'utf8'), '// v2.4.0');
  assert.deepEqual(readdirSync(join(raiz, 'ext')), ['onde-cacar']);
});

test('copiar Onde Caçar: clone quebrado mantém a cópia anterior intacta', (t) => {
  const raiz = pastaTemp(t);
  const destino = join(raiz, 'ext', 'onde-cacar');
  const clone = cloneFalso(raiz, '2.3.1');
  copiarOndeCacar(clone, destino);
  rmSync(join(clone, 'icons'), { recursive: true });
  assert.throws(() => copiarOndeCacar(clone, destino), /não consegui copiar o Onde Caçar/);
  assert.equal(readFileSync(join(destino, 'src', '01-hook.js'), 'utf8'), '// v2.3.1');
  assert.ok(!existsSync(`${destino}.novo`));
});

test('rótulo: nome escapado e modo leve conforme a conta', (t) => {
  assert.equal(textoDoRotulo('"__ROTULO__" __LEVE__', { rotulo: 'Alt "1"', leve: true }), '"Alt \\"1\\"" sim');
  assert.equal(textoDoRotulo('__LEVE__', { rotulo: 'x', leve: false }), 'nao');
  const destino = gerarRotulo(fileURLToPath(new URL('../app/rotulo', import.meta.url)), join(pastaTemp(t), 'rotulo-alt1'), { rotulo: 'Alt 1', leve: true });
  const manifest = JSON.parse(readFileSync(join(destino, 'manifest.json'), 'utf8'));
  assert.equal(manifest.name, 'PokeIdle · Alt 1');
  assert.match(readFileSync(join(destino, 'rotulo.js'), 'utf8'), /const ROTULO = "Alt 1";[\s\S]*if \('sim' === 'sim'\)/);
});

test('renomear: tenta de novo quando o Windows segura o arquivo por um instante; outros erros sobem na hora', () => {
  const erro = (code) => Object.assign(new Error(code), { code });
  let vezes = 0;
  renomear('a', 'b', { espera: 1, renomearFn: () => { if (++vezes < 3) throw erro('EPERM'); } });
  assert.equal(vezes, 3);
  vezes = 0;
  assert.throws(() => renomear('a', 'b', { espera: 1, tentativas: 4, renomearFn: () => { vezes++; throw erro('EBUSY'); } }), /EBUSY/);
  assert.equal(vezes, 4);
  vezes = 0;
  assert.throws(() => renomear('a', 'b', { espera: 1, renomearFn: () => { vezes++; throw erro('ENOENT'); } }), /ENOENT/);
  assert.equal(vezes, 1);
});

test('app: plano do Onde Caçar conforme a configuração, a fonte (dev ou instalador) e a cópia', () => {
  const base = { ativo: true, fonte: 'C:\\app\\resources\\onde-cacar', fonteLegivel: true, copiaExiste: true };
  assert.deepEqual(planoOndeCacar(base), { acao: 'copiar' });
  assert.deepEqual(planoOndeCacar({ ...base, ativo: false }), { acao: 'sem' }, 'desligado: nem a cópia entra');
  assert.deepEqual(planoOndeCacar({ ...base, fonte: null }), { acao: 'manter' });
  assert.equal(planoOndeCacar({ ...base, fonte: null, copiaExiste: false }).acao, 'sem');
  assert.match(planoOndeCacar({ ...base, fonte: null, copiaExiste: false }).aviso, /não veio nesta instalação/);
  const ilegivel = planoOndeCacar({ ...base, fonteLegivel: false });
  assert.equal(ilegivel.acao, 'manter');
  assert.match(ilegivel.aviso, /usando a última cópia/);
  assert.equal(planoOndeCacar({ ...base, fonteLegivel: false, copiaExiste: false }).acao, 'sem');
});

test('app: fonte do Onde Caçar — a pasta de desenvolvimento legível vence; ilegível, cai na do instalador com aviso', () => {
  assert.deepEqual(fonteOndeCacar({ pastaDev: 'D', devLegivel: true, embutido: 'E' }), { fonte: 'D' });
  const caiu = fonteOndeCacar({ pastaDev: 'D', devLegivel: false, embutido: 'E' });
  assert.equal(caiu.fonte, 'E');
  assert.match(caiu.aviso, /não consegui ler a pasta de desenvolvimento D/);
  assert.deepEqual(fonteOndeCacar({ pastaDev: null, devLegivel: false, embutido: 'E' }), { fonte: 'E' });
  assert.deepEqual(fonteOndeCacar({ pastaDev: 'D', devLegivel: false, embutido: null }), { fonte: 'D' }, 'sem instalador: o plano avisa que não leu');
  assert.deepEqual(fonteOndeCacar({ pastaDev: null, devLegivel: false, embutido: null }), { fonte: null });
});

test('extensão escolhida: manifest conferido; nome traduzido vira o da pasta', (t) => {
  const raiz = pastaTemp(t);
  const dir = join(raiz, 'Minha Ext');
  mkdirSync(dir);
  assert.throws(() => lerManifesto(dir), /não tem um manifest.json/);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ manifest_version: 1, name: 'x' }));
  assert.throws(() => lerManifesto(dir), /manifest_version 2 ou 3/);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: ' Tema ', version: '1.2' }));
  assert.deepEqual(lerManifesto(dir), { nome: 'Tema', versao: '1.2' });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: '__MSG_nome__' }));
  assert.deepEqual(lerManifesto(dir), { nome: 'Minha Ext', versao: null });
});

test('extensão escolhida: copiada inteira, sem .git nem node_modules, trocando a anterior', (t) => {
  const raiz = pastaTemp(t);
  const de = join(raiz, 'ext');
  for (const d of ['js', '.git', 'node_modules/x']) mkdirSync(join(de, d), { recursive: true });
  writeFileSync(join(de, 'manifest.json'), '{}');
  writeFileSync(join(de, 'js', 'a.js'), 'a');
  writeFileSync(join(de, '.git', 'config'), 'não');
  const destino = join(raiz, 'extras', 'e1');
  mkdirSync(destino, { recursive: true });
  writeFileSync(join(destino, 'velho.js'), 'sai');
  copiarExtensao(de, destino);
  assert.deepEqual(readdirSync(destino).sort(), ['js', 'manifest.json']);
  assert.ok(!existsSync(`${destino}.novo`));
});

test('rótulo: U+2028/U+2029 escapados (no JS gerado eles encerram a linha)', () => {
  const t = textoDoRotulo('const R = "__ROTULO__";', { rotulo: 'a\u2028b\u2029c', leve: false });
  assert.equal(t, 'const R = "a\\u2028b\\u2029c";');
  assert.doesNotThrow(() => new Function(t));
});

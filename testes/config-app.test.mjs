import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configPadrao, deContasJson, gravarConfigApp, lerConfigApp, novoId, validarConfigApp } from '../app/config.mjs';

const pastaTemp = (t) => { const p = mkdtempSync(join(tmpdir(), 'mc-config-')); t.after(() => rmSync(p, { recursive: true, force: true })); return p; };

test('config do app: padrões e limpeza', () => {
  assert.deepEqual(validarConfigApp({}), { contas: [], ondeCacar: true, extensoes: [], pastaDev: null });
  assert.deepEqual(validarConfigApp({ contas: [{ id: 'alt1', rotulo: '  Alt 1 ' }], ondeCacar: false, pastaDev: ' C:\\clone ' }),
    { contas: [{ id: 'alt1', rotulo: 'Alt 1', leve: true }], ondeCacar: false, extensoes: [], pastaDev: 'C:\\clone' });
});

test('config do app: erros saem todos juntos, e o limite de 4 contas vale', () => {
  const cinco = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, rotulo: `C${i}` }));
  assert.throws(() => validarConfigApp({ contas: cinco }), /até 4 por IP/);
  try {
    validarConfigApp({ contas: [{ id: 'A b', rotulo: '' }, { id: 'x', rotulo: 'X', leve: 'sim' }, { id: 'x', rotulo: 'Y' }], ondeCacar: 'sim', pastaDev: 3 });
    assert.fail('devia recusar');
  } catch (e) {
    for (const trecho of ['contas[0]: "id"', 'contas[0]: "rotulo"', 'contas[1]: "leve"', 'id "x" está repetido', '"ondeCacar"', '"pastaDev"']) assert.ok(e.message.includes(trecho), trecho);
  }
  for (const ruim of [null, [], 'x']) assert.throws(() => validarConfigApp(ruim), /esperava um objeto/);
});

test('config do app: do contas.json do lançador vêm as contas e o clone como pasta de desenvolvimento', () => {
  const cfg = deContasJson({ ondeCacar: '\\\\wsl.localhost\\clone', edge: 'C:\\edge.exe', contas: [{ id: 'principal', rotulo: 'Principal', janela: { x: 0, y: 0, w: 1, h: 1 } }, { id: 'alt1', rotulo: 'Alt 1', leve: false }] });
  assert.deepEqual(cfg, { contas: [{ id: 'principal', rotulo: 'Principal', leve: true }, { id: 'alt1', rotulo: 'Alt 1', leve: false }], ondeCacar: true, extensoes: [], pastaDev: '\\\\wsl.localhost\\clone' });
});

test('config do app: config.json vence o contas.json; sem nenhum, começa vazia; arquivo estragado é erro', (t) => {
  const raiz = pastaTemp(t);
  assert.deepEqual(lerConfigApp(raiz), { cfg: configPadrao(), origem: 'nova' });
  writeFileSync(join(raiz, 'contas.json'), JSON.stringify({ contas: [{ id: 'alt1', rotulo: 'Alt 1' }] }));
  assert.equal(lerConfigApp(raiz).origem, 'contas.json');
  gravarConfigApp(raiz, { contas: [{ id: 'nova', rotulo: 'Nova' }] });
  assert.deepEqual(lerConfigApp(raiz), { cfg: { contas: [{ id: 'nova', rotulo: 'Nova', leve: true }], ondeCacar: true, extensoes: [], pastaDev: null }, origem: 'config' });
  assert.ok(!existsSync(join(raiz, 'config.json.novo')));
  writeFileSync(join(raiz, 'config.json'), '{ruim');
  assert.throws(() => lerConfigApp(raiz), /não consegui ler config.json/);
});

test('config do app: gravar recusa configuração inválida sem estragar a que existe', (t) => {
  const raiz = pastaTemp(t);
  gravarConfigApp(raiz, { contas: [{ id: 'a', rotulo: 'A' }] });
  const antes = readFileSync(join(raiz, 'config.json'), 'utf8');
  assert.throws(() => gravarConfigApp(raiz, { contas: [{ id: 'A!', rotulo: 'A' }] }), /"id"/);
  assert.equal(readFileSync(join(raiz, 'config.json'), 'utf8'), antes);
});

test('config do app: contas.json do lançador inválido é erro (não vira configuração vazia calada)', (t) => {
  const raiz = pastaTemp(t);
  writeFileSync(join(raiz, 'contas.json'), JSON.stringify({ contas: [{ id: 'Ruim!', rotulo: 'R' }] }));
  assert.throws(() => lerConfigApp(raiz), /contas.json com problemas/);
});

test('config do app: extensões a mais (id válido e único, nome curto)', () => {
  assert.deepEqual(validarConfigApp({ extensoes: [{ id: 'tema-escuro', nome: '  Tema escuro ' }, { id: 'x' }] }).extensoes, [{ id: 'tema-escuro', nome: 'Tema escuro' }, { id: 'x', nome: 'x' }]);
  for (const ruim of [[{ id: '../x' }], [{ id: 'a' }, { id: 'a' }], 'x', Array.from({ length: 11 }, (_, i) => ({ id: `e${i}` }))]) {
    assert.throws(() => validarConfigApp({ extensoes: ruim }), /"?extensoes/, JSON.stringify(ruim).slice(0, 40));
  }
});

test('novoId: do nome, sem acento nem símbolo, único', () => {
  assert.equal(novoId('Alt Três', []), 'alt-tres');
  assert.equal(novoId('Alt Três', ['alt-tres', 'alt-tres-2']), 'alt-tres-3');
  assert.equal(novoId('!!!', []), 'conta');
  assert.equal(novoId('Um nome muito comprido demais para id', []).length <= 24, true);
});

test('pedido da tela: mantém ids conhecidos, cria ids novos sem reaproveitar, apaga as removidas', async () => {
  const { aplicarPedidoDeConfig } = await import('../app/config.mjs');
  const atual = validarConfigApp({ contas: [{ id: 'principal', rotulo: 'Principal' }, { id: 'alt1', rotulo: 'Alt 1' }], extensoes: [{ id: 'velha', nome: 'Velha' }], pastaDev: 'C:\\dev' });
  const { cfg, apagar } = aplicarPedidoDeConfig(atual, {
    contas: [{ id: 'principal', rotulo: 'Main', leve: false }, { id: null, rotulo: 'Alt 1' }, { id: 'inventado', rotulo: 'Teste' }],
    ondeCacar: false,
    extensoes: [{ id: 'velha' }, { id: 'nova', nome: 'trocado pela tela' }, { id: 'nunca-adicionada' }],
  }, { outrosIds: ['teste'], extensoesNovas: [{ id: 'nova', nome: 'Nova' }] });
  assert.deepEqual(cfg.contas, [
    { id: 'principal', rotulo: 'Main', leve: false },
    { id: 'alt-1', rotulo: 'Alt 1', leve: true }, // "alt1" foi removida: o id não volta para outra conta
    { id: 'teste-2', rotulo: 'Teste', leve: true }, // "teste" já tem pasta de login
  ]);
  assert.deepEqual(apagar, ['alt1']);
  assert.equal(cfg.ondeCacar, false);
  assert.deepEqual(cfg.extensoes, [{ id: 'velha', nome: 'Velha' }, { id: 'nova', nome: 'Nova' }]);
  assert.equal(cfg.pastaDev, 'C:\\dev', 'o que a tela não mostra fica');
  assert.throws(() => aplicarPedidoDeConfig(atual, { contas: Array.from({ length: 5 }, (_, i) => ({ rotulo: `C${i}` })) }), /até 4/);
  assert.throws(() => aplicarPedidoDeConfig(atual, { contas: [{ rotulo: '' }] }), /"rotulo"/);
});

test('config do app: nome de conta sem quebra de linha nem caractere de controle', () => {
  for (const ruim of ['a\nb', 'a\u2028b', 'a\u0007b']) assert.throws(() => validarConfigApp({ contas: [{ id: 'a', rotulo: ruim }] }), /quebra de linha/, JSON.stringify(ruim));
});

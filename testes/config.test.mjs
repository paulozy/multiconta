import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerConfig, validarConfig, MAX_CONTAS } from '../lancador/config.mjs';

const conta = (id, extra = {}) => ({ id, rotulo: `Conta ${id}`, ...extra });
const pastaTemp = (t) => { const p = mkdtempSync(join(tmpdir(), 'multiconta-')); t.after(() => rmSync(p, { recursive: true, force: true })); return p; };

test('config: preenche leve = true por padrão e respeita leve = false', () => {
  const cfg = validarConfig({ contas: [conta('alt1'), conta('alt2', { leve: false })] });
  assert.deepEqual(cfg.contas.map((c) => c.leve), [true, false]);
  assert.equal(cfg.ondeCacar, undefined);
});

test('config: guarda janela fixa e caminhos opcionais', () => {
  const cfg = validarConfig({ ondeCacar: 'C:\\clone', edge: 'C:\\edge.exe', contas: [conta('alt1', { janela: { x: 0, y: 0, w: 800, h: 600 } })] });
  assert.deepEqual(cfg.contas[0].janela, { x: 0, y: 0, w: 800, h: 600 });
  assert.equal(cfg.ondeCacar, 'C:\\clone');
  assert.equal(cfg.edge, 'C:\\edge.exe');
});

test('config: tira espaços do rótulo', () => {
  assert.equal(validarConfig({ contas: [conta('a', { rotulo: '  Alt 1 ' })] }).contas[0].rotulo, 'Alt 1');
});

test(`config: no máximo ${MAX_CONTAS} contas (limite do jogo por IP)`, () => {
  const cinco = ['a', 'b', 'c', 'd', 'e'].map((id) => conta(id));
  assert.throws(() => validarConfig({ contas: cinco }), /5 contas; o jogo libera até 4/);
  assert.equal(validarConfig({ contas: cinco.slice(0, 4) }).contas.length, 4);
});

test('config: junta todos os erros numa mensagem só', () => {
  const ruim = {
    ondeCacar: '',
    contas: [conta('Alt 1'), conta('alt2'), conta('alt2'), { id: 'x' }, conta('y', { leve: 'sim', janela: { x: 0, y: 0, w: -1, h: 10 } })],
  };
  assert.throws(() => validarConfig(ruim), (e) => {
    for (const trecho of ['"ondeCacar"', 'contas[0]: "id"', 'id "alt2" está repetido', 'contas[3]: "rotulo"', 'contas[4]: "leve"', 'contas[4]: "janela"', '5 contas']) {
      assert.ok(e.message.includes(trecho), `faltou "${trecho}" em:\n${e.message}`);
    }
    return true;
  });
});

test('config: ids que viram pasta e padrão do PowerShell são recusados', () => {
  for (const id of ['..', 'alt\\1', 'alt*', 'a b', '', 'A1', '-alt']) {
    assert.throws(() => validarConfig({ contas: [conta(id)] }), /"id" deve ter/, `aceitou "${id}"`);
  }
});

test('config: formato errado no topo', () => {
  assert.throws(() => validarConfig([]), /esperava um objeto/);
  assert.throws(() => validarConfig({}), /pelo menos uma conta/);
});

test('o contas.exemplo.json do repositório é válido e tem 4 contas', () => {
  const exemplo = JSON.parse(readFileSync(fileURLToPath(new URL('../contas.exemplo.json', import.meta.url)), 'utf8'));
  const cfg = validarConfig(exemplo, 'contas.exemplo.json');
  assert.deepEqual(cfg.contas.map((c) => c.id), ['principal', 'alt1', 'alt2', 'alt3']);
});

test('lerConfig: prefere contas.json; sem ele, usa o exemplo', (t) => {
  const pasta = pastaTemp(t);
  writeFileSync(join(pasta, 'contas.exemplo.json'), JSON.stringify({ contas: [conta('alt1')] }));
  assert.equal(lerConfig(pasta).arquivo, 'contas.exemplo.json');
  writeFileSync(join(pasta, 'contas.json'), JSON.stringify({ contas: [conta('principal')] }));
  const cfg = lerConfig(pasta);
  assert.equal(cfg.arquivo, 'contas.json');
  assert.equal(cfg.contas[0].id, 'principal');
});

test('lerConfig: JSON quebrado ou nenhum arquivo viram erro legível', (t) => {
  const pasta = pastaTemp(t);
  assert.throws(() => lerConfig(pasta), /não consegui ler contas.exemplo.json/);
  writeFileSync(join(pasta, 'contas.json'), '{ "contas": [ ');
  assert.throws(() => lerConfig(pasta), /não consegui ler contas.json/);
});

test('lerConfig: o erro diz qual arquivo tem o problema', (t) => {
  const pasta = pastaTemp(t);
  writeFileSync(join(pasta, 'contas.exemplo.json'), JSON.stringify({ contas: [] }));
  assert.throws(() => lerConfig(pasta), /^Error: contas.exemplo.json com problemas/);
});

test('config: chaves desconhecidas (erro de digitação) são recusadas', () => {
  assert.throws(() => validarConfig({ contas: [conta('a', { janelas: {} })] }), /contas\[0\]: chave desconhecida "janelas"/);
  assert.throws(() => validarConfig({ conta: [], contas: [conta('a')] }), /chave desconhecida "conta"/);
});

test('config: casos de borda de rótulo, edge, janela e itens da lista', () => {
  assert.throws(() => validarConfig({ contas: [conta('a', { rotulo: 'x'.repeat(41) })] }), /"rotulo" é obrigatório/);
  assert.equal(validarConfig({ contas: [conta('a', { rotulo: `  ${'x'.repeat(40)}  ` })] }).contas[0].rotulo.length, 40);
  assert.throws(() => validarConfig({ edge: 5, contas: [conta('a')] }), /"edge" deve ser/);
  assert.throws(() => validarConfig({ contas: [conta('a', { janela: { x: 0, y: 0, w: 1.5, h: 10 } })] }), /"janela"/);
  assert.throws(() => validarConfig({ contas: [conta('a', { janela: { x: 0, y: 0, w: 10 } })] }), /"janela"/);
  assert.throws(() => validarConfig({ contas: [null, ['x']] }), /contas\[0\]: esperava um objeto[\s\S]*contas\[1\]: esperava um objeto/);
});

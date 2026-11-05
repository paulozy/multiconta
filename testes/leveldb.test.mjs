import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chavesDaOrigem, snappy } from '../app/leveldb.mjs';
import { chaveLS, escreverLog, escreverLogPartido, escreverTabela } from './apoio-leveldb.mjs';

const pastaTemp = (t) => { const p = mkdtempSync(join(tmpdir(), 'multiconta-ldb-')); t.after(() => rmSync(p, { recursive: true, force: true })); return p; };
const nomes = (p) => [...chavesDaOrigem(p, 'https://pokeidle.io').nomes].sort();

test('snappy: literal + cópia (o caso que escondia "sessao" atrás de "sessao-hunt")', () => {
  // "sessao-hunt:x" literal (13) + cópia de 6 bytes a 13 de distância = "sessao"
  const comp = Buffer.concat([Buffer.from([19, (13 - 1) << 2]), Buffer.from('sessao-hunt:x'), Buffer.from([((6 - 4) << 2) | 1, 13])]);
  assert.equal(snappy(comp).toString(), 'sessao-hunt:xsessao');
  assert.ok(!comp.includes(Buffer.from('xsessao')), 'no arquivo comprimido a palavra não aparece inteira');
  assert.throws(() => snappy(Buffer.from([5, 0x00, 0x61])), /tamanho não bate/);
  assert.throws(() => snappy(Buffer.from([4, ((4 - 4) << 2) | 1, 9])), /referência inválida/);
});

test('tabela .ldb crua e comprimida: lê os nomes da origem e ignora outros sites', (t) => {
  for (const comprimir of [false, true]) {
    const p = pastaTemp(t);
    escreverTabela(join(p, '000005.ldb'), [
      { chave: chaveLS('cfg-economia'), seq: 3 },
      { chave: chaveLS('sessao'), seq: 4 },
      { chave: chaveLS('sessao', 'https://outro.site'), seq: 5 },
      { chave: chaveLS('sessao-hunt:treinadora'), seq: 6 },
    ], { comprimir });
    assert.deepEqual(nomes(p), ['cfg-economia', 'sessao', 'sessao-hunt:treinadora'], `comprimir=${comprimir}`);
  }
});

test('.log: WriteBatch inteiro e partido em dois pedaços', (t) => {
  const p = pastaTemp(t);
  escreverLog(join(p, '000010.log'), [{ seq: 10, ops: [{ chave: chaveLS('sessao'), valor: Buffer.from('\x01{}') }, { chave: chaveLS('id-dispositivo'), valor: Buffer.from('x') }] }]);
  assert.deepEqual(nomes(p), ['id-dispositivo', 'sessao']);
  const q = pastaTemp(t);
  escreverLogPartido(join(q, '000011.log'), 20, [{ chave: chaveLS('sessao'), valor: Buffer.alloc(300, 65) }]);
  assert.deepEqual(nomes(q), ['sessao']);
});

test('chave apagada (logout) não conta; vale a versão mais nova entre tabela e log', (t) => {
  const p = pastaTemp(t);
  escreverTabela(join(p, '000005.ldb'), [{ chave: chaveLS('sessao'), seq: 4 }]);
  escreverLog(join(p, '000010.log'), [{ seq: 50, ops: [{ chave: chaveLS('sessao') }] }]); // apagada depois
  assert.deepEqual(nomes(p), []);
  escreverLog(join(p, '000011.log'), [{ seq: 60, ops: [{ chave: chaveLS('sessao'), valor: Buffer.from('novo login') }] }]);
  assert.deepEqual(nomes(p), ['sessao']);
  const q = pastaTemp(t);
  escreverTabela(join(q, '000007.ldb'), [{ chave: chaveLS('sessao'), seq: 9, apagada: true }]);
  assert.deepEqual(nomes(q), []);
});

test('arquivo ilegível é pulado e informado; pasta inexistente não quebra', (t) => {
  const p = pastaTemp(t);
  writeFileSync(join(p, '000003.ldb'), Buffer.alloc(10));
  escreverLog(join(p, '000010.log'), [{ seq: 1, ops: [{ chave: chaveLS('sessao'), valor: Buffer.from('x') }] }]);
  const r = chavesDaOrigem(p, 'https://pokeidle.io');
  assert.deepEqual([...r.nomes], ['sessao']);
  assert.deepEqual(r.ilegiveis, ['000003.ldb']);
  assert.deepEqual([...chavesDaOrigem(join(p, 'nada'), 'https://pokeidle.io').nomes], []);
});

import { bytesDaTabela, bytesDoLog, varint as vi } from './apoio-leveldb.mjs';
import { chavesDaTabela, chavesDoLog } from '../app/leveldb.mjs';

const lit = (s) => { const b = Buffer.from(s); return Buffer.concat([Buffer.from([(b.length - 1) << 2]), b]); };

test('snappy: cópias de 2 e 4 bytes, distância > 255, sobreposta e literais longos (tags 60, 61, 63)', () => {
  const base = 'x'.repeat(300);
  // copy-1 com distância 300 (> 255): ((dist >> 8) << 5) | ((n-4) << 2) | 1
  const c1 = Buffer.concat([vi(304), Buffer.from([61 << 2, 299 & 255, 299 >> 8]), Buffer.from(base), Buffer.from([((300 >> 8) << 5) | ((4 - 4) << 2) | 1, 300 & 255])]);
  assert.equal(snappy(c1).toString(), base + 'xxxx');
  const c2 = Buffer.concat([vi(9), lit('abc'), Buffer.from([((6 - 1) << 2) | 2, 3, 0])]); // copy-2, sobreposta (dist 3 < n 6)
  assert.equal(snappy(c2).toString(), 'abcabcabc');
  const c4 = Buffer.concat([vi(6), lit('ab'), Buffer.from([((4 - 1) << 2) | 3, 2, 0, 0, 0])]); // copy-4
  assert.equal(snappy(c4).toString(), 'ababab');
  const corrida = Buffer.concat([vi(10), lit('a'), Buffer.from([((9 - 1) << 2) | 2, 1, 0])]); // "aaaa…" com dist 1
  assert.equal(snappy(corrida).toString(), 'a'.repeat(10));
  const longo = Buffer.alloc(70000, 66);
  for (const [tag, k] of [[60, 1], [61, 2], [63, 4]]) {
    const n = { 60: 200, 61: 60000, 63: longo.length }[tag]; // 1, 2 e 4 bytes de tamanho
    const tamanho = Buffer.alloc(k); tamanho.writeUIntLE(n - 1, 0, k);
    assert.equal(snappy(Buffer.concat([vi(n), Buffer.from([tag << 2]), tamanho, longo.subarray(0, n)])).length, n, `tag ${tag}`);
  }
});

test('snappy: entrada cortada ou mentirosa erra (nada de zeros em silêncio, nem alocar 4 GiB)', () => {
  assert.throws(() => snappy(Buffer.from([5, 4 << 2, 0x61, 0x62])), /cortado/, 'literal cortado');
  assert.throws(() => snappy(Buffer.concat([vi(8), lit('abcd'), Buffer.from([1])])), /cortado/, 'copy-1 sem o byte da distância');
  assert.throws(() => snappy(Buffer.concat([vi(5), lit('abcd'), Buffer.from([((8 - 4) << 2) | 1, 4])])), /passa do tamanho/, 'cópia além do tamanho');
  assert.throws(() => snappy(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x0f, 0])), /absurdo/);
  assert.throws(() => snappy(Buffer.concat([Buffer.alloc(12, 0x80), Buffer.from([1])])), /longo demais/);
});

test('tabela: prefixo comprimido com vários reinícios e vários blocos de dados', (t) => {
  const entradas = ['autoRecolhida', 'cfg-economia', 'cfg-escala', 'sessao', 'sessao-hunt:treinadora', 'tcVisto:treinadora']
    .map((nome, i) => ({ chave: chaveLS(nome), seq: i + 1 }));
  for (const opcoes of [{ intervalo: 2 }, { intervalo: 2, porBloco: 2 }, { intervalo: 1, porBloco: 1, comprimir: true }]) {
    const p = pastaTemp(t);
    escreverTabela(join(p, '000005.ldb'), entradas, opcoes);
    assert.deepEqual(nomes(p), entradas.map((_, i) => ['autoRecolhida', 'cfg-economia', 'cfg-escala', 'sessao', 'sessao-hunt:treinadora', 'tcVisto:treinadora'][i]), JSON.stringify(opcoes));
  }
});

test('log: WriteBatch que atravessa blocos de 32 KB (FIRST/MIDDLE/LAST e sobra < 7 preenchida)', (t) => {
  const p = pastaTemp(t);
  const grande = Buffer.alloc(70000, 65); // ocupa 3 blocos
  const bytes = bytesDoLog([{ seq: 1, ops: [{ chave: chaveLS('x'), valor: Buffer.alloc(32768 - 7 - 30 - 4, 66) }] }, { seq: 5, ops: [{ chave: chaveLS('sessao'), valor: grande }] }]);
  assert.ok(bytes.length > 2 * 32768);
  writeFileSync(join(p, '000010.log'), bytes);
  assert.deepEqual(nomes(p), ['sessao', 'x']);
  assert.ok([...chavesDoLog(bytes)].every((e) => !e.chave.includes(0x41)), 'só chaves, nenhum byte de valor');
});

test('nomes UTF-16, put e delete no mesmo lote, e chaves META do Chromium', (t) => {
  const p = pastaTemp(t);
  escreverLog(join(p, '000010.log'), [{ seq: 1, ops: [
    { chave: chaveLS('sessão', undefined, { utf16: true }), valor: Buffer.from('x') },
    { chave: chaveLS('temporaria'), valor: Buffer.from('x') }, { chave: chaveLS('temporaria') },
    { chave: Buffer.from('META:https://pokeidle.io'), valor: Buffer.from('x') },
    { chave: Buffer.from('VERSION'), valor: Buffer.from('1') },
  ] }]);
  assert.deepEqual(nomes(p), ['sessão']);
});

test('arquivos corrompidos: vão para ilegiveis e NÃO contam nada (nem as chaves lidas antes do defeito)', (t) => {
  const p = pastaTemp(t);
  const boa = bytesDaTabela([{ chave: chaveLS('sessao'), seq: 1 }]);
  const casos = {
    '000001.ldb': boa.subarray(0, boa.length - 1),                                  // rodapé cortado
    '000002.ldb': Buffer.concat([Buffer.alloc(60), boa.subarray(boa.length - 48)]), // rodapé ok, blocos lixo
    '000003.ldb': Buffer.alloc(10),
    '000004.log': (() => { const b = bytesDoLog([{ seq: 2, ops: [{ chave: chaveLS('sessao'), valor: Buffer.from('xxxxxxxx') }] }]); b.writeUInt16LE(200, 4); return b; })(), // registro mente o tamanho
    '000005.log': (() => { const b = bytesDoLog([{ seq: 3, ops: [{ chave: chaveLS('a'), valor: Buffer.from('x') }] }]); b[7 + 12] = 2; return b; })(), // operação desconhecida (2)
    '000006.log': Buffer.concat([bytesDoLog([{ seq: 4, ops: [{ chave: chaveLS('sessao'), valor: Buffer.from('ok') }] }]), Buffer.from([0, 0, 0, 0, 5, 0, 9, 1, 2, 3, 4, 5])]), // chave boa e depois tipo 9
  };
  for (const [f, b] of Object.entries(casos)) writeFileSync(join(p, f), b);
  const r = chavesDaOrigem(p, 'https://pokeidle.io');
  assert.deepEqual(r.ilegiveis.sort(), Object.keys(casos).sort());
  assert.deepEqual([...r.nomes], [], 'nem a "sessao" lida antes do defeito do 000006.log conta');
});

test('tabela: bloco com reinícios ou prefixo inválidos erra', () => {
  const bom = bytesDaTabela([{ chave: chaveLS('a'), seq: 1 }, { chave: chaveLS('b'), seq: 2 }], { intervalo: 2 });
  assert.equal([...chavesDaTabela(bom)].length, 2);
  const ruim = Buffer.from(bom);
  ruim[0] = 5; // 1ª entrada diz compartilhar 5 bytes sem chave anterior
  assert.throws(() => [...chavesDaTabela(ruim)], /prefixo maior/);
});

test('snappy: bloco muito repetitivo (~21x, cópias de 3 bytes que geram 64) é válido', () => {
  const ops = Array.from({ length: 100 }, () => Buffer.from([((64 - 1) << 2) | 2, 1, 0])); // 100 cópias de 64, distância 1
  const comp = Buffer.concat([vi(1 + 6400), lit('z'), ...ops]);
  assert.ok(6401 / comp.length > 20, 'razão acima de 20x');
  assert.equal(snappy(comp).toString(), 'z'.repeat(6401));
});

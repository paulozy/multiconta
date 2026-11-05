// Escreve arquivos de LevelDB no formato real, com as codificações difíceis também: prefixo
// comprimido com vários reinícios, vários blocos de dados, .log que atravessa blocos de 32 KB.
import { writeFileSync } from 'node:fs';

export const varint = (n) => { const out = []; do { let c = n % 128; n = Math.floor(n / 128); if (n) c |= 128; out.push(c); } while (n); return Buffer.from(out); };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };

/** Chave do localStorage como o Chromium grava: "_" + origem + "\0" + "\x01" + nome (ou "\x00" + UTF-16). */
export const chaveLS = (nome, origem = 'https://pokeidle.io', { utf16 = false } = {}) => (utf16
  ? Buffer.concat([Buffer.from(`_${origem}\x00\x00`, 'latin1'), Buffer.from(nome, 'utf16le')])
  : Buffer.from(`_${origem}\x00\x01${nome}`, 'latin1'));

/** Corpo de um WriteBatch. ops: [{ chave, valor? }] (sem valor = apagar). */
export const corpoDoBatch = (seq, ops) => Buffer.concat([u64(seq), u32(ops.length), ...ops.flatMap(({ chave, valor }) => (valor === undefined
  ? [Buffer.from([0]), varint(chave.length), chave]
  : [Buffer.from([1]), varint(chave.length), chave, varint(valor.length), valor]))]);

const registro = (dados, tipo) => Buffer.concat([u32(0), u16(dados.length), Buffer.from([tipo]), dados]);

/** .log como o LevelDB escreve: blocos de 32 KB, sobra < 7 bytes preenchida, registros partidos. */
export function bytesDoLog(batches) {
  const BLOCO = 32768;
  const out = [];
  let pos = 0;
  for (const { seq, ops } of batches) {
    let corpo = corpoDoBatch(seq, ops), primeiro = true;
    do {
      const resto = BLOCO - (pos % BLOCO);
      if (resto < 7) { out.push(Buffer.alloc(resto)); pos += resto; continue; }
      const cabe = resto - 7;
      const pedaco = corpo.subarray(0, cabe);
      corpo = corpo.subarray(pedaco.length);
      const ultimo = corpo.length === 0;
      const tipo = primeiro && ultimo ? 1 : primeiro ? 2 : ultimo ? 4 : 3;
      out.push(registro(pedaco, tipo)); pos += 7 + pedaco.length;
      primeiro = false;
      if (ultimo) break;
    } while (true);
  }
  return Buffer.concat(out);
}
export const escreverLog = (caminho, batches) => writeFileSync(caminho, bytesDoLog(batches));

/** Bloco de tabela com prefixo comprimido e um reinício a cada `intervalo` entradas. */
export function bloco(entradas, intervalo = 16) {
  const partes = [], reinicios = [];
  let anterior = Buffer.alloc(0), tam = 0;
  entradas.forEach(([k, v], i) => {
    let comp = 0;
    if (i % intervalo === 0) reinicios.push(tam);
    else while (comp < anterior.length && comp < k.length && anterior[comp] === k[comp]) comp++;
    const e = Buffer.concat([varint(comp), varint(k.length - comp), varint(v.length), k.subarray(comp), v]);
    partes.push(e); tam += e.length; anterior = k;
  });
  if (!reinicios.length) reinicios.push(0);
  return Buffer.concat([...partes, ...reinicios.map(u32), u32(reinicios.length)]);
}

/** Snappy só com literais (válido; inclui o literal longo, tag 60+). */
export const snappyLiteral = (b) => {
  const n = b.length - 1;
  const cab = n < 60 ? Buffer.from([n << 2]) : Buffer.concat([Buffer.from([61 << 2]), u16(n)]);
  return Buffer.concat([varint(b.length), cab, b]);
};

/**
 * Tabela .ldb. entradas: [{ chave, seq, apagada? }], em ordem. `porBloco` entradas por bloco de
 * dados (o índice ganha uma entrada por bloco); `intervalo` = reinícios dentro do bloco.
 */
export function bytesDaTabela(entradas, { comprimir = false, porBloco = Infinity, intervalo = 16 } = {}) {
  const internas = entradas.map(({ chave, seq, apagada }) => [Buffer.concat([chave, u64(seq * 256 + (apagada ? 0 : 1))]), Buffer.from('VALOR-FICTICIO')]);
  const blocos = [];
  for (let i = 0; i < internas.length; i += Math.min(porBloco, internas.length)) blocos.push(internas.slice(i, i + porBloco));
  const partes = [], indice = [];
  let pos = 0;
  for (const b of blocos) {
    const cru = bloco(b, intervalo);
    const dados = comprimir ? snappyLiteral(cru) : cru;
    partes.push(dados, Buffer.from([comprimir ? 1 : 0]), u32(0));
    indice.push([b.at(-1)[0], Buffer.concat([varint(pos), varint(dados.length)])]);
    pos += dados.length + 5;
  }
  const blocoIndice = bloco(indice), offIndice = pos;
  const meta = bloco([]), offMeta = offIndice + blocoIndice.length + 5;
  const rodape = Buffer.alloc(48);
  Buffer.concat([varint(offMeta), varint(meta.length), varint(offIndice), varint(blocoIndice.length)]).copy(rodape);
  rodape.writeBigUInt64LE(0xdb4775248b80fb57n, 40);
  return Buffer.concat([...partes, blocoIndice, Buffer.alloc(5), meta, Buffer.alloc(5), rodape]);
}
export const escreverTabela = (caminho, entradas, opcoes) => writeFileSync(caminho, bytesDaTabela(entradas, opcoes));

/** .log com um WriteBatch partido em FIRST + LAST no mesmo bloco (forma mínima). */
export function escreverLogPartido(caminho, seq, ops) {
  const corpo = corpoDoBatch(seq, ops);
  const meio = Math.floor(corpo.length / 2);
  writeFileSync(caminho, Buffer.concat([registro(corpo.subarray(0, meio), 2), registro(corpo.subarray(meio), 4)]));
}

// Leitura mínima do LevelDB do Chromium (o "Local Storage\leveldb" de um perfil), só para saber quais
// CHAVES do localStorage de uma origem existem. Valores nunca saem daqui.
//
// Por que não buscar bytes no arquivo: os blocos das tabelas (.ldb) costumam vir comprimidos com
// Snappy, e uma chave como "sessao" vira uma referência a "sessao-hunt" escrita antes; e apagar
// uma chave (logout) deixa só uma marca de "apagado" que uma busca simples confunde com a chave.
// Formatos: https://github.com/google/leveldb/blob/main/doc/table_format.md e log_format.md;
// Snappy: https://github.com/google/snappy/blob/main/format_description.txt
//
// Arquivo corrompido ou cortado ERRA (nunca devolve dado errado em silêncio). O CRC não é conferido.
// Limitação conhecida: os arquivos vêm da listagem da pasta, não do MANIFEST; um .ldb/.log velho que
// sobrou de uma falha pode fazer uma chave apagada parecer viva (por isso existe o --forcar e a
// checagem é só uma proteção antes de copiar).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const erro = (msg) => { throw new Error(`leveldb: ${msg}`); };

function varint(b, i, limite = b.length) {
  let n = 0, s = 0, c;
  do {
    if (i >= limite) erro('varint cortado');
    if (s > 63) erro('varint longo demais');
    c = b[i++];
    n += (c & 0x7f) * 2 ** s;
    s += 7;
  } while (c >= 0x80);
  return [n, i];
}

/** Descompressão Snappy (formato de bloco). */
export function snappy(b) {
  const [tam, inicio] = varint(b, 0);
  // expansão máxima do formato: uma cópia de 3 bytes gera até 64 (~21x). Acima disso (ou de 64 MiB)
  // o cabeçalho mente; sem este teto um arquivo corrompido pediria gigabytes de memória.
  if (tam > 22 * b.length + 64 || tam > 64 * 2 ** 20) erro('snappy: tamanho declarado absurdo');
  const out = Buffer.alloc(tam);
  let i = inicio, o = 0;
  const precisa = (k) => { if (i + k > b.length) erro('snappy: bloco cortado'); };
  while (i < b.length) {
    const tag = b[i++];
    const tipo = tag & 3;
    if (tipo === 0) { // literal
      let n = tag >> 2;
      if (n >= 60) { const k = n - 59; precisa(k); n = b.readUIntLE(i, k); i += k; }
      n += 1;
      precisa(n);
      if (o + n > tam) erro('snappy: literal passa do tamanho');
      b.copy(out, o, i, i + n); i += n; o += n;
      continue;
    }
    let n, dist;
    if (tipo === 1) { precisa(1); n = ((tag >> 2) & 7) + 4; dist = ((tag >> 5) << 8) | b[i]; i += 1; }
    else if (tipo === 2) { precisa(2); n = (tag >> 2) + 1; dist = b.readUInt16LE(i); i += 2; }
    else { precisa(4); n = (tag >> 2) + 1; dist = b.readUInt32LE(i); i += 4; }
    if (dist === 0 || dist > o) erro('snappy: referência inválida');
    if (o + n > tam) erro('snappy: cópia passa do tamanho');
    for (let k = 0; k < n; k++, o++) out[o] = out[o - dist]; // byte a byte: cópia sobreposta funciona
  }
  if (o !== tam) erro('snappy: tamanho não bate');
  return out;
}

/** Entradas [chave, valor] de um bloco de tabela, remontando o prefixo compartilhado. */
export function* entradasDoBloco(b) {
  if (b.length < 4) erro('bloco curto demais');
  const reinicios = b.readUInt32LE(b.length - 4);
  const fim = b.length - 4 - 4 * reinicios;
  if (fim < 0) erro('bloco: contagem de reinícios inválida');
  let i = 0, anterior = Buffer.alloc(0);
  while (i < fim) {
    let comp, ncomp, nval;
    [comp, i] = varint(b, i, fim); [ncomp, i] = varint(b, i, fim); [nval, i] = varint(b, i, fim);
    if (comp > anterior.length) erro('bloco: prefixo maior que a chave anterior');
    if (i + ncomp + nval > fim) erro('bloco: entrada passa do fim');
    const chave = Buffer.concat([anterior.subarray(0, comp), b.subarray(i, i + ncomp)]);
    i += ncomp;
    yield [chave, b.subarray(i, i + nval)];
    i += nval;
    anterior = chave;
  }
}

function lerBloco(arq, off, tam) {
  if (off + tam + 5 > arq.length) erro('bloco fora do arquivo');
  const corpo = arq.subarray(off, off + tam);
  const tipo = arq[off + tam]; // depois do bloco: 1 byte de compressão + 4 de CRC
  if (tipo === 0) return corpo;
  if (tipo === 1) return snappy(corpo);
  return erro(`bloco com compressão desconhecida (${tipo})`);
}

const MAGICO = 0xdb4775248b80fb57n;

/** Chaves internas de uma tabela .ldb: { chave, seq, vivo }. */
export function* chavesDaTabela(arq) {
  if (arq.length < 48 || arq.readBigUInt64LE(arq.length - 8) !== MAGICO) erro('tabela sem o rodapé do LevelDB');
  const rodape = arq.subarray(arq.length - 48);
  let i = 0, io, it;
  [, i] = varint(rodape, i); [, i] = varint(rodape, i); // metaindex: não interessa
  [io, i] = varint(rodape, i); [it] = varint(rodape, i);
  for (const [, handle] of entradasDoBloco(lerBloco(arq, io, it))) {
    const [o, j] = varint(handle, 0);
    const [t] = varint(handle, j);
    for (const [interna] of entradasDoBloco(lerBloco(arq, o, t))) {
      if (interna.length < 8) erro('chave interna curta demais');
      // os 8 bytes finais: (sequência << 8) | tipo, little-endian; tipo 1 = valor, 0 = apagado
      const marca = interna.subarray(interna.length - 8);
      if (marca[0] > 1) erro(`tipo de entrada desconhecido (${marca[0]})`);
      yield { chave: interna.subarray(0, interna.length - 8), seq: Number(marca.readBigUInt64LE(0) >> 8n), vivo: marca[0] === 1 };
    }
  }
}

/** Chaves gravadas num .log (WriteBatches em blocos de 32 KB, registros possivelmente partidos). */
export function* chavesDoLog(arq) {
  const BLOCO = 32768;
  let partes = null; // pedaços de um registro partido (null = nenhum em andamento)
  for (let i = 0; i < arq.length;) {
    const resto = BLOCO - (i % BLOCO);
    if (resto < 7) { i += resto; continue; } // sobra de bloco é preenchimento
    if (i + 7 > arq.length) erro('log: cabeçalho cortado');
    const tam = arq.readUInt16LE(i + 4), tipo = arq[i + 6];
    if (7 + tam > resto || i + 7 + tam > arq.length) erro('log: registro passa do bloco ou do arquivo');
    const dados = arq.subarray(i + 7, i + 7 + tam);
    i += 7 + tam;
    if (tipo === 0) continue; // preenchimento (arquivo pré-alocado)
    if (tipo === 1) { partes = null; yield* batch(dados); }
    else if (tipo === 2) partes = [dados];
    else if (tipo === 3) { if (partes) partes.push(dados); }  // meio sem começo: descartado
    else if (tipo === 4) { if (partes) { partes.push(dados); yield* batch(Buffer.concat(partes)); } partes = null; }
    else erro(`log: tipo de registro desconhecido (${tipo})`);
  }
  function* batch(b) {
    if (b.length < 12) erro('log: WriteBatch curto demais');
    let seq = Number(b.readBigUInt64LE(0));
    const n = b.readUInt32LE(8);
    let i = 12;
    for (let k = 0; k < n; k++, seq++) {
      if (i >= b.length) erro('log: WriteBatch cortado');
      const tipo = b[i++];
      if (tipo !== 0 && tipo !== 1) erro(`log: operação desconhecida (${tipo})`);
      let tam;
      [tam, i] = varint(b, i);
      if (i + tam > b.length) erro('log: chave cortada');
      const chave = b.subarray(i, i + tam); i += tam;
      if (tipo === 1) { [tam, i] = varint(b, i); if (i + tam > b.length) erro('log: valor cortado'); i += tam; }
      yield { chave, seq, vivo: tipo === 1 };
    }
  }
}

/**
 * Nomes das chaves VIVAS do localStorage de `origem` (ex.: "https://pokeidle.io") numa pasta
 * "Local Storage\leveldb". Vale a versão de maior sequência de cada chave (a mais nova).
 * Arquivo que não dá para ler (corrompido, sendo escrito) não conta NADA e vai para `ilegiveis`.
 */
export function chavesDaOrigem(pasta, origem) {
  const prefixo = Buffer.from(`_${origem}\x00`, 'latin1');
  const ultima = new Map(); // chave interna (hex) -> { seq, vivo, nome }
  const ilegiveis = [];
  let arquivos = [];
  try { arquivos = readdirSync(pasta); } catch { return { nomes: new Set(), ilegiveis }; }
  for (const f of arquivos.filter((x) => /\.(ldb|sst|log)$/.test(x))) {
    // lê o arquivo inteiro num mapa à parte e só junta se ele terminar sem erro
    const doArquivo = [];
    try {
      const arq = readFileSync(join(pasta, f));
      for (const e of f.endsWith('.log') ? chavesDoLog(arq) : chavesDaTabela(arq)) {
        if (e.chave.subarray(0, prefixo.length).equals(prefixo)) doArquivo.push(e);
      }
    } catch { ilegiveis.push(f); continue; }
    for (const { chave, seq, vivo } of doArquivo) {
      const k = chave.toString('hex');
      if ((ultima.get(k)?.seq ?? -1) < seq) ultima.set(k, { seq, vivo, nome: nomeDaChave(chave.subarray(prefixo.length)) });
    }
  }
  return { nomes: new Set([...ultima.values()].filter((e) => e.vivo).map((e) => e.nome)), ilegiveis };
}

// 1º byte: \x01 = latin1, \x00 = UTF-16
const nomeDaChave = (b) => (b[0] === 1 ? b.subarray(1).toString('latin1') : b.subarray(1).toString('utf16le'));

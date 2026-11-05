// Monta um .ico a partir de PNGs prontos (o formato aceita PNG dentro de cada entrada desde o Vista).

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Largura e altura de um PNG (cabeçalho IHDR). */
export function tamanhoPng(png) {
  if (png.length < 24 || !png.subarray(0, 8).equals(ASSINATURA_PNG) || png.toString('latin1', 12, 16) !== 'IHDR') throw new Error('não é um PNG');
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) };
}

/** PNGs (Buffers, quadrados, até 256 px) → Buffer do .ico, do menor para o maior. */
export function montarIco(pngs) {
  const itens = pngs.map((png) => ({ png, ...tamanhoPng(png) })).sort((a, b) => a.largura - b.largura);
  for (const i of itens) if (i.largura !== i.altura || i.largura > 256 || i.largura < 1) throw new Error(`tamanho inválido: ${i.largura}x${i.altura}`);
  const cab = Buffer.alloc(6 + 16 * itens.length);
  cab.writeUInt16LE(0, 0); // reservado
  cab.writeUInt16LE(1, 2); // tipo: ícone
  cab.writeUInt16LE(itens.length, 4);
  let deslocamento = cab.length;
  itens.forEach((i, n) => {
    const e = 6 + 16 * n;
    cab.writeUInt8(i.largura % 256, e); // 256 vira 0
    cab.writeUInt8(i.altura % 256, e + 1);
    cab.writeUInt16LE(1, e + 4); // planos
    cab.writeUInt16LE(32, e + 6); // bits por pixel
    cab.writeUInt32LE(i.png.length, e + 8);
    cab.writeUInt32LE(deslocamento, e + 12);
    deslocamento += i.png.length;
  });
  return Buffer.concat([cab, ...itens.map((i) => i.png)]);
}

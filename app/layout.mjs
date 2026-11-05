// Onde fica cada coisa dentro da janela: a barra no topo e as contas em mosaico logo abaixo.
// Funções puras (sem Electron), para testar no WSL.

export const ALTURA_BARRA = 50; // duas linhas por conta: estado e resumo

/** Divide a área em grade: 1 conta ocupa tudo, 2 ficam lado a lado, 3 ou 4 em 2×2. */
export function grade(n, area) {
  if (n <= 0) return [];
  const cols = n === 1 ? 1 : 2, linhas = Math.ceil(n / cols);
  const larguras = dividir(area.width, cols), alturas = dividir(area.height, linhas);
  return Array.from({ length: n }, (_, i) => {
    const c = i % cols, l = Math.floor(i / cols);
    return {
      x: area.x + larguras.slice(0, c).reduce((a, b) => a + b, 0),
      y: area.y + alturas.slice(0, l).reduce((a, b) => a + b, 0),
      width: larguras[c], height: alturas[l],
    };
  });
}

// reparte `total` pixels em `partes` sem perder sobra (a última fica com o resto)
function dividir(total, partes) {
  const base = Math.floor(total / partes);
  return Array.from({ length: partes }, (_, i) => (i === partes - 1 ? total - base * (partes - 1) : base));
}

/**
 * Posição da barra e de cada conta numa janela de `largura` × `altura` (área de conteúdo).
 * `ampliada`: índice da conta que ocupa a área toda (as outras ficam escondidas, mas seguem
 * rodando), ou null para o mosaico. `compacto`: só a barra, ocupando a janela toda.
 */
export function calcularLayout({ largura, altura, n, ampliada = null, compacto = false }) {
  const w = Math.max(0, Math.floor(largura)), h = Math.max(0, Math.floor(altura));
  // compacto: a janela é só a barra; as contas ficam escondidas (seguem rodando, como na ampliada)
  if (compacto) {
    const barra = { x: 0, y: 0, width: w, height: h };
    return { barra, celulas: Array.from({ length: n }, () => ({ x: 0, y: h, width: w, height: 0, visivel: false })), ampliada: null };
  }
  const barra = { x: 0, y: 0, width: w, height: Math.min(ALTURA_BARRA, h) };
  const area = { x: 0, y: barra.height, width: w, height: h - barra.height };
  const valida = Number.isInteger(ampliada) && ampliada >= 0 && ampliada < n;
  const celulas = valida
    ? Array.from({ length: n }, (_, i) => ({ ...area, visivel: i === ampliada }))
    : grade(n, area).map((r) => ({ ...r, visivel: true }));
  return { barra, celulas, ampliada: valida ? ampliada : null };
}

/** Área de conteúdo da janela no modo compacto: a barra com todas as contas, numa faixa que cabe
 * na largura da tela (`larguraTela`, em DIP). */
export const tamanhoCompacto = (n, larguraTela = Infinity) => ({
  width: Math.max(400, Math.min(200 + 400 * Math.max(1, n), Math.floor(larguraTela))), height: ALTURA_BARRA,
});

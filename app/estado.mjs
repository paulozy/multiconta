// Estado do app que a barra mostra e que fica gravado entre aberturas. Funções puras.

export const STATUS = ['carregando', 'conectada', 'desconectada', 'bloqueada', 'sem-login', 'caiu', 'erro'];
export const ACOES = ['ampliar', 'grade', 'som', 'recarregar', 'compacto', 'atualizar', 'config', 'novidade'];

/**
 * Lê o estado.json com desconfiança (pode estar velho, editado à mão ou de outra lista de contas).
 * Devolve só o que vale para as contas atuais: janela (a do mosaico), conta ampliada, som (mudo por
 * padrão) e o modo compacto com a posição da faixa.
 */
export function normalizarSalvo(salvo, contas) {
  const s = salvo && typeof salvo === 'object' ? salvo : {};
  const ids = contas.map((c) => c.id);
  const j = s.janela;
  const inteiro = (v) => Number.isInteger(v);
  const janela = j && ['x', 'y', 'width', 'height'].every((k) => inteiro(j[k])) && j.width >= 400 && j.height >= 300
    ? { x: j.x, y: j.y, width: j.width, height: j.height, maximizada: j.maximizada === true }
    : null;
  return {
    janela,
    ampliada: ids.includes(s.ampliada) ? s.ampliada : null,
    mudo: Object.fromEntries(ids.map((id) => [id, s.mudo?.[id] !== false])),
    compacto: s.compacto === true,
    // onde a faixa do compacto estava (só a posição: o tamanho é o da barra)
    posCompacta: Number.isInteger(s.posCompacta?.x) && Number.isInteger(s.posCompacta?.y) ? { x: s.posCompacta.x, y: s.posCompacta.y } : null,
  };
}

/**
 * A janela salva ainda dá para pegar? A barra de título (o topo) tem de estar numa tela e com pelo
 * menos 200 px à mostra na horizontal; monitor desligado ou janela "acima" da tela não valem.
 */
export function janelaVisivel(janela, telas) {
  if (!janela) return false;
  return telas.some((t) => {
    const topoNaTela = janela.y >= t.y && janela.y <= t.y + t.height - 30;
    const largura = Math.min(janela.x + janela.width, t.x + t.width) - Math.max(janela.x, t.x);
    return topoNaTela && largura >= 200;
  });
}

/** Nick informado pela página: texto curto (é só para mostrar). */
export const nickDaPagina = (n) => (typeof n === 'string' && n.trim() ? n.trim().slice(0, 40) : null);

/** Tecla → ação: Ctrl+1..4 amplia a conta da posição, Ctrl+0 volta à grade, Ctrl+M liga/desliga o
 * compacto. null = não é nossa. */
export function acaoDaTecla(entrada, contas) {
  // tecla segurada repete o keyDown: só a primeira vale (ampliar alterna e a tela piscaria)
  if (entrada?.type !== 'keyDown' || entrada.isAutoRepeat || !entrada.control || entrada.alt || entrada.shift || entrada.meta) return null;
  if (entrada.key === '0') return { acao: 'grade' };
  if (entrada.key === 'm' || entrada.key === 'M') return { acao: 'compacto' };
  const n = /^[1-9]$/.test(entrada.key ?? '') ? Number(entrada.key) : 0;
  return n >= 1 && n <= contas.length ? { acao: 'ampliar', id: contas[n - 1].id } : null;
}

/** Comando vindo da barra (página): só ações e contas conhecidas passam. */
export function comandoValido(cmd, contas) {
  if (!cmd || typeof cmd !== 'object' || !ACOES.includes(cmd.acao)) return null;
  if (['grade', 'compacto', 'atualizar', 'config', 'novidade'].includes(cmd.acao)) return { acao: cmd.acao };
  return contas.some((c) => c.id === cmd.id) ? { acao: cmd.acao, id: cmd.id } : null;
}

/** Status informado pela página (rótulo): só os que a página pode dizer ('sem-login': não se identificou). */
export const statusDaPagina = (s) => (['conectada', 'desconectada', 'bloqueada', 'sem-login'].includes(s) ? s : null);

const TEXTOS_RESUMO = ['huntNome', 'huntRegiao'];
const NUMEROS_RESUMO = ['huntNivel', 'nivel', 'gold', 'abatesH', 'goldH', 'minutos'];
const INTEIROS_RESUMO = new Set(['huntNivel', 'nivel']);
const TETO_RESUMO = 1e15; // nada do jogo passa disso; acima é lixo

/**
 * Resumo informado pela página (hunt, treinador, ritmo): só as chaves conhecidas, números finitos
 * e não negativos, textos curtos. null = nada aproveitável.
 */
export function normalizarResumo(r) {
  if (!r || typeof r !== 'object') return null;
  const out = { centro: r.centro === true };
  for (const k of TEXTOS_RESUMO) out[k] = typeof r[k] === 'string' && r[k].trim() ? r[k].trim().slice(0, 40) : null;
  for (const k of NUMEROS_RESUMO) {
    const v = r[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= TETO_RESUMO && (!INTEIROS_RESUMO.has(k) || Number.isInteger(v)) ? v : null;
  }
  return Object.entries(out).some(([k, v]) => k !== 'centro' && v !== null) || out.centro ? out : null;
}

/** O que a barra precisa desenhar. */
export function retratoDaBarra({ contas, ampliada, mudo, status, nicks, problemas, resumos = {}, compacto = false, ondeCacar = null, versaoNova = null }) {
  return {
    ampliada,
    compacto,
    versaoNova: typeof versaoNova === 'string' ? versaoNova : null,
    ondeCacar: { versao: ondeCacar?.versao ?? null, atualizando: !!ondeCacar?.atualizando, pronto: !!ondeCacar?.pronto },
    problemas: [...problemas],
    contas: contas.map((c, i) => ({
      id: c.id, rotulo: c.rotulo, atalho: `Ctrl+${i + 1}`, nick: nicks[c.id] ?? null,
      status: status[c.id] ?? 'carregando', mudo: mudo[c.id] !== false, ampliada: ampliada === c.id,
      resumo: resumos[c.id] ?? null,
    })),
  };
}

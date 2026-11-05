// Troca o Onde Caçar com o app aberto (botão da barra). Sem Electron aqui: as sessões e as páginas
// chegam de fora, para testar no WSL com falsos.

/** Versão de uma extensão (vinda do manifest), só se tiver cara de versão; senão null. */
export const versaoValida = (v) => (typeof v === 'string' && /^[\d.]{1,20}$/.test(v) ? v : null);

/**
 * Atualiza o Onde Caçar em todas as contas abertas:
 * 1. `decidir()` (o mesmo critério da abertura); sem 'copiar', nada muda e volta o motivo;
 * 2. tira o jogo de todas as células (`parar`, página em branco): sem jogo aberto, não há página
 *    rodando sem o rótulo, que é quem faz a trava de uma sessão por conta. Conta que não parou fica
 *    de fora da troca, com as extensões que tinha (segue na versão anterior até reabrir o app);
 * 3. tira as extensões de cada sessão; 4. `copiar()` traz a versão do clone (se falhar, a anterior
 *    continua no lugar);
 * 5. carrega de novo as extensões, na ordem da abertura (o Onde Caçar, as extras, o rótulo), e abre o
 *    jogo. Conta cujo rótulo não carregou NÃO volta ao jogo: vai para `semRotulo()`.
 * `contas`: [{ id, rotulo (nome), ses, pastaRotulo, parar(): Promise<boolean>, abrirJogo(), semRotulo() }].
 * Devolve { ok, trocou, problemas, versao }: trocou = as extensões foram recarregadas; versao = a do
 * Onde Caçar que carregou (null se não carregou em nenhuma conta).
 */
export async function atualizarOndeCacar({ decidir, copiar, pastaOndeCacar, extras = [], contas }) {
  const d = await decidir();
  if (d.acao !== 'copiar') {
    const motivo = d.aviso ?? (d.acao === 'sem' ? 'o Onde Caçar está desligado nas configurações' : 'não há de onde trazer o Onde Caçar: ele vem com o instalador do app');
    return { ok: false, problemas: [motivo], versao: null, trocou: false };
  }

  const problemas = [];
  const paradas = await Promise.all(contas.map((c) => c.parar()));
  contas.forEach((c, i) => { if (!paradas[i]) problemas.push(`${c.rotulo}: não consegui parar o jogo para trocar o Onde Caçar; esta conta segue na versão anterior até reabrir o app`); });
  contas = contas.filter((_c, i) => paradas[i]);
  for (const c of contas) {
    for (const ext of c.ses.extensions.getAllExtensions()) c.ses.extensions.removeExtension(ext.id);
  }
  let copiou = true;
  try { copiar(); } catch (e) { copiou = false; problemas.push(`${e.message}; ficou a versão anterior`); }

  let versao = null;
  for (const c of contas) {
    let rotuloOk = true;
    for (const dir of [pastaOndeCacar, ...extras, c.pastaRotulo]) {
      try {
        const ext = await c.ses.extensions.loadExtension(dir, { allowFileAccess: false });
        if (dir === pastaOndeCacar) versao ??= versaoValida(ext?.version);
      } catch (e) {
        problemas.push(`${c.rotulo}: não carregou ${dir.split(/[\\/]/).pop()} (${e.message})`);
        if (dir === c.pastaRotulo) rotuloOk = false;
      }
    }
    if (rotuloOk) c.abrirJogo(); else c.semRotulo();
  }
  return { ok: copiou && !problemas.length, trocou: true, problemas, versao };
}

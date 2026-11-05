// Aviso de versão nova do app: só um GET público em github.com/<repo>/releases/latest (sem API, sem
// token, sem dado nenhum do usuário). O GitHub responde redirecionando para .../releases/tag/vX.Y.Z,
// e a versão sai desse endereço. Baixar e instalar fica com a pessoa (o botão abre a página).
export const REPO_APP = 'paulozy/multiconta';
export const PAGINA_RELEASES = `https://github.com/${REPO_APP}/releases/latest`;

/** "https://github.com/<repo>/releases/tag/v1.2.3" → "1.2.3"; qualquer outra coisa → null. */
export function versaoDaTag(endereco) {
  const m = /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/tag\/v?(\d{1,4}\.\d{1,4}\.\d{1,4})$/.exec(String(endereco ?? ''));
  return m ? m[1] : null;
}

/** true se a versão `a` é mais nova que `b` (números X.Y.Z). */
export function maisNova(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

/** Versão publicada mais nova que `atual`, ou null (sem rede, sem release, ou já é a mais nova). */
export async function procurarVersaoNova(atual, { buscar = fetch } = {}) {
  try {
    const r = await buscar(PAGINA_RELEASES, { redirect: 'manual', headers: { 'user-agent': 'pokeidle-multiconta' }, signal: AbortSignal.timeout(10_000) });
    r.body?.cancel?.().catch?.(() => {}); // só o cabeçalho importa
    const local = r.headers.get('location');
    const v = local ? versaoDaTag(new URL(local, PAGINA_RELEASES).href) : null;
    return v && maisNova(v, atual) ? v : null;
  } catch { return null; }
}

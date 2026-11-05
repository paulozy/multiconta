// Decisões das travas de uma célula, separadas dos eventos do Electron para dar para testar.
// main.mjs só traduz os eventos para estas funções.
import { destino } from './navegacao.mjs';

const ORIGEM_JOGO = 'https://pokeidle.io';
const MAX_NICKS_POR_CELULA = 3; // o jogo usa um; mais que isso é página abusando da ponte
const INTERVALO_EXTERNO_MS = 2000;

const ehDoJogo = (url) => { try { return new URL(url).origin === ORIGEM_JOGO; } catch { return false; } };

/**
 * `reservas`: de criarReservas(); `abrirFora(url)`: abre no navegador do Windows.
 * Cada função recebe o `dono` (id do webContents da célula).
 */
export function criarTravas({ reservas, abrirFora, agora = Date.now }) {
  const ultimoExterno = new Map();
  const nicksDo = new Map();

  /** Link para fora: só a partir da página do jogo e no máximo um a cada 2 s por célula. */
  function externo(dono, url, paginaAtual) {
    if (destino(url) !== 'externo' || !ehDoJogo(paginaAtual)) return false;
    const t = agora();
    if (t - (ultimoExterno.get(dono) ?? -Infinity) < INTERVALO_EXTERNO_MS) return false;
    ultimoExterno.set(dono, t);
    abrirFora(url);
    return true;
  }

  return {
    /** Navegação do quadro principal (will-navigate). true = cancelar. Não mexe na reserva. */
    aoNavegar(dono, url, paginaAtual) {
      if (destino(url) === 'permitir') return false;
      externo(dono, url, paginaAtual);
      return true;
    },
    /** Redirecionamento: só o do quadro principal conta (iframes de anúncio etc. não abrem nada). */
    aoRedirecionar(dono, url, quadroPrincipal, paginaAtual) {
      if (!quadroPrincipal) return false;
      return this.aoNavegar(dono, url, paginaAtual);
    },
    /** window.open: 'allow' só para jogo/login; o resto vai (com limite) para o navegador. */
    aoAbrirJanela(dono, url, paginaAtual) {
      if (destino(url) === 'permitir') return 'allow';
      externo(dono, url, paginaAtual);
      return 'deny';
    },
    /**
     * Pedido de reserva vindo da ponte. Só o quadro principal da página do jogo reserva; pedido de
     * outra página (login do Google, iframe) responde "pode" sem guardar nada, para não prender a
     * conta de ninguém. true = pode mandar o hello.
     */
    aoReservar({ dono, nick, origemDoQuadro, quadroPrincipal }) {
      if (!quadroPrincipal || origemDoQuadro !== ORIGEM_JOGO) return true;
      if (typeof nick !== 'string' || !nick || nick.length > 40) return false;
      const meus = nicksDo.get(dono) ?? new Set();
      if (!meus.has(nick) && meus.size >= MAX_NICKS_POR_CELULA) return false;
      const ok = reservas.reservar(nick, dono);
      if (ok) { meus.add(nick); nicksDo.set(dono, meus); }
      return ok;
    },
    /** A página da célula foi trocada de verdade (did-navigate), caiu ou fechou: solta as contas. */
    aoLiberar(dono) {
      reservas.liberar(dono);
      nicksDo.delete(dono);
      ultimoExterno.delete(dono);
    },
  };
}

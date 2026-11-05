// "Uma sessão por conta" entre as células do app: o rótulo pede a reserva do nick ANTES de mandar o
// hello. Se outra célula viva já tem a conta, o hello não sai e a sessão que já estava aberta segue
// intacta (detectar depois do hello não serve: o servidor já teria pausado a mais antiga).

/** Reservas de nick por dono (o id do webContents da célula). `vivo(dono)` diz se a célula existe. */
export function criarReservas(vivo) {
  const donoDoNick = new Map();
  return {
    /** true = pode mandar o hello; false = a conta já está em outra célula viva. */
    reservar(nick, dono) {
      const atual = donoDoNick.get(nick);
      if (atual !== undefined && atual !== dono && vivo(atual)) return false;
      donoDoNick.set(nick, dono);
      return true;
    },
    /** A célula navegou ou fechou: as contas dela ficam livres. */
    liberar(dono) {
      for (const [nick, d] of donoDoNick) if (d === dono) donoDoNick.delete(nick);
    },
    donoDe: (nick) => donoDoNick.get(nick),
  };
}

/** O nick vem da página: só aceitamos texto curto e simples (é chave de mapa, nada mais). */
export const nickValido = (nick) => typeof nick === 'string' && nick.length > 0 && nick.length <= 40;

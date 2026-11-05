// Registro do app num arquivo (electron\registro.log), em vez do console: o app normalmente roda sem
// console (atalho), e quando roda preso a um terminal que já fechou, escrever no console dá EPIPE.
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const LIMITE = 1024 * 1024; // passou de 1 MB, vira registro.log.1 e começa outro

/**
 * Tira de cada endereço a busca (?…) e o fragmento (#…): a volta do login do jogo traz o token no
 * endereço (/?sessao=…), e um "Failed to load URL" do Electron o levaria para o arquivo.
 */
export const limparUrls = (texto) => texto
  .replace(/\b([a-z][a-z0-9+.-]*:\/\/[^\s?#'"<>]*)[?#][^\s'"<>]*/gi, '$1?…')
  // e o valor do parâmetro do token em qualquer outro formato (codificado, em JSON, sem esquema)
  .replace(/(sessao(?:=|%3D|\\?"\s*:\s*\\?"))[^\s&'"<>\\]+/gi, '$1…');

/** Escritor de registro em `arquivo`. Nunca lança: registro que falha não pode derrubar o app. */
export function criarRegistro(arquivo, { agora = () => new Date() } = {}) {
  return (...partes) => {
    try {
      mkdirSync(dirname(arquivo), { recursive: true });
      try { if (statSync(arquivo).size > LIMITE) renameSync(arquivo, `${arquivo}.1`); } catch { /* ainda não existe */ }
      const texto = limparUrls(partes.map((p) => (p instanceof Error ? (p.stack ?? p.message) : String(p))).join(' '));
      appendFileSync(arquivo, `${agora().toISOString()} ${texto}\n`);
    } catch { /* sem registro, segue o jogo */ }
  };
}

/** stdout/stderr fechados (EPIPE) não viram "Uncaught Exception"; outros erros seguem normais. */
export function ignorarSaidaFechada(fluxos = [process.stdout, process.stderr]) {
  for (const f of fluxos) f?.on?.('error', (e) => { if (e?.code !== 'EPIPE') throw e; });
}

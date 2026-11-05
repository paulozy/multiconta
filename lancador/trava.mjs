// Trava de arquivo para um comando por vez: dois "abrir" ao mesmo tempo (atalho clicado duas vezes)
// veriam a mesma conta fechada e abririam dois Edges, e o segundo derrubaria a sessão do primeiro.
import { closeSync, openSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs';

const VELHA_MS = 2 * 60_000;

const vivo = (pid) => {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // existe, só não é nosso
};

/** A trava em `caminho` sobrou de um processo que morreu ou é velha demais? */
export function travaAbandonada(caminho, { agora = Date.now(), estaVivo = vivo } = {}) {
  let pid;
  try { pid = Number(readFileSync(caminho, 'utf8').trim()); } catch { return true; }
  if (!Number.isInteger(pid) || pid <= 0 || !estaVivo(pid)) return true;
  try { return agora - statSync(caminho).mtimeMs > VELHA_MS; } catch { return true; }
}

/** Roda `fn` com a trava; se outro comando já a segura, erra com uma mensagem clara. */
export function comTrava(caminho, fn, opcoes) {
  let fd;
  for (let tentativa = 0; fd === undefined; tentativa++) {
    try { fd = openSync(caminho, 'wx'); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (tentativa === 0 && travaAbandonada(caminho, opcoes)) { rmSync(caminho, { force: true }); continue; }
      throw new Error('outro comando do lançador está rodando agora; espere ele terminar e tente de novo');
    }
  }
  try {
    writeSync(fd, String(process.pid));
    return fn();
  } finally {
    closeSync(fd);
    rmSync(caminho, { force: true });
  }
}

// Trazer o login de uma conta: o pokeidle.io guarda o token no localStorage, então basta a pasta
// "Local Storage" de um perfil de navegador (Chromium) ir para a partição da conta no app.
//
// A cópia vai para "<destino>.importando" e só vira "<destino>" no fim; se der erro no meio, a pasta
// temporária é apagada e dá para tentar de novo.
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { chavesDaOrigem } from './leveldb.mjs';

/**
 * true se o localStorage do pokeidle.io neste perfil tem a chave "sessao" (o login) VIVA: lida pelo
 * LevelDB de verdade (leveldb.mjs), com blocos Snappy e marcas de apagado; nada de buscar bytes.
 * Arquivo ilegível ou sobra antiga na pasta ainda podem enganar (ver leveldb.mjs): o --forcar é a saída.
 */
export function temSessaoPokeidle(pastaLocalStorage) {
  return chavesDaOrigem(join(pastaLocalStorage, 'leveldb'), 'https://pokeidle.io').nomes.has('sessao');
}

// No Windows, antivírus e indexador seguram por instantes os arquivos recém-copiados.
const TENTAR = { maxRetries: 5, retryDelay: 200 };
function renomearComPaciencia(de, para, tentativas = 5) {
  for (let i = 1; ; i++) {
    try { return renameSync(de, para); }
    catch (e) {
      if (i >= tentativas || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * i); // pausa síncrona curta
    }
  }
}

/** Copia conforme o plano, de forma atômica. Devolve o plano executado. */
export function copiarConta(plano, destino, { renomear = renomearComPaciencia } = {}) {
  const temp = `${destino}.importando`;
  rmSync(temp, { recursive: true, force: true, ...TENTAR }); // sobra de uma tentativa anterior
  try {
    for (const { de, para, pular } of plano) {
      if (!para.startsWith(destino + sep)) throw new Error(`destino fora da pasta da conta: ${para}`);
      const alvo = join(temp, para.slice(destino.length + 1));
      mkdirSync(dirname(alvo), { recursive: true });
      // caches só no primeiro nível do perfil: uma pasta "Cache" lá dentro de uma extensão fica
      cpSync(de, alvo, { recursive: true, filter: pular ? (src) => dirname(src) !== de || !pular.has(basename(src)) : undefined });
    }
    if (existsSync(destino)) throw new Error(`${destino} apareceu durante a cópia`);
    renomear(temp, destino);
  } catch (e) {
    try { rmSync(temp, { recursive: true, force: true, ...TENTAR }); } catch { /* sobra é limpa na próxima tentativa */ }
    throw new Error(`a cópia falhou e foi desfeita: ${e.message}`);
  }
  return plano;
}

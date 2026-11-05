// Login das contas no app: cada conta tem uma partição persistente do Electron
// ("persist:<id>" = pasta electron\Partitions\<id>). O login do pokeidle.io é o token no
// localStorage, então basta a pasta "Local Storage" para a conta abrir logada.
//
// Importar: de um perfil de navegador do usuário (Chromium: Edge, Chrome, Brave, Opera), com a
// origem fechada, a sessão do jogo presente (leitor de LevelDB) e cópia atômica.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { renomear } from './extensoes.mjs';
import { join } from 'node:path';
import { copiarConta, temSessaoPokeidle } from './importar.mjs';

export const pastaParticao = (userData, id) => join(userData, 'Partitions', id);
export const particao = (id) => `persist:${id}`;

/** Plano de cópia: só o Local Storage, para a raiz da partição (sem "Default", que é coisa do Edge). */
export const planoParaParticao = (localStorage, destino) => [{ de: localStorage, para: join(destino, 'Local Storage') }];

/**
 * Confere e copia o Local Storage de `origem` (pasta "Local Storage" de um perfil) para a partição.
 * `emUso(arquivo)` → 'livre' | 'em-uso' | 'nao-existe' (o LOCK do LevelDB fica preso com o Edge aberto).
 */
export function levarSessao({ origem, nomeOrigem, destino, emUso, forcar = false, substituir = false }) {
  if (!existsSync(origem)) throw new Error(`${nomeOrigem} não tem dados de sites: o pokeidle.io nunca foi aberto nele?`);
  if (emUso(join(origem, 'leveldb', 'LOCK')) === 'em-uso') {
    throw new Error(`${nomeOrigem} está aberto: feche as janelas dele no navegador e tente de novo`);
  }
  if (!forcar && !temSessaoPokeidle(origem)) throw new Error(`${nomeOrigem} não tem sessão do pokeidle.io gravada (--forcar copia mesmo assim)`);
  if (!existsSync(destino)) { copiarConta(planoParaParticao(origem, destino), destino); return; }

  // a partição já existe (o app abriu a conta, logada ou na tela de entrar): troca só o Local Storage
  // dela. Por cima de um login só com `substituir` (pedido explícito na tela); se a cópia falhar, o
  // login anterior volta.
  const ls = join(destino, 'Local Storage');
  const velho = `${ls}.velho`;
  // sobra de uma troca que não conseguiu devolver o login anterior: devolve antes de tudo, em vez de apagar
  if (existsSync(velho)) { if (existsSync(ls)) rmSync(velho, { recursive: true, force: true }); else renomear(velho, ls); }
  if (!substituir && existsSync(ls) && temSessaoPokeidle(ls)) throw new Error('esta conta já tem login no app. Para trocar, saia da conta dentro do jogo antes.');
  if (existsSync(ls)) renomear(ls, velho);
  try { copiarConta(readdirSync(origem).map((n) => ({ de: join(origem, n), para: join(ls, n) })), ls); }
  catch (e) {
    if (existsSync(velho) && !existsSync(ls)) renomear(velho, ls); // devolve o que havia
    throw e;
  }
  rmSync(velho, { recursive: true, force: true });
}

/** Estado do login de cada conta no app: 'logada' | 'sem-sessao' | 'sem-particao'. */
export function estadoDasSessoes(userData, contas) {
  return Object.fromEntries(contas.map((c) => {
    const ls = join(pastaParticao(userData, c.id), 'Local Storage');
    if (!existsSync(ls)) return [c.id, 'sem-particao'];
    return [c.id, temSessaoPokeidle(ls) ? 'logada' : 'sem-sessao'];
  }));
}

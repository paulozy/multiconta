// Navegadores (Chromium) de onde dá para trazer o login de uma conta: o pokeidle.io guarda o token no
// Local Storage, que fica numa pasta de mesmo formato em todos eles. Só lemos nomes de perfis (o
// "Local State"): nada de cookie, senha ou chave.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { lerLocalState, perfisDoEdge } from './edge.mjs';

// base: 'local' = %LOCALAPPDATA%, 'roaming' = %APPDATA% (o Opera fica no Roaming)
export const NAVEGADORES = [
  { id: 'edge', nome: 'Microsoft Edge', base: 'local', caminho: ['Microsoft', 'Edge', 'User Data'] },
  { id: 'chrome', nome: 'Google Chrome', base: 'local', caminho: ['Google', 'Chrome', 'User Data'] },
  { id: 'brave', nome: 'Brave', base: 'local', caminho: ['BraveSoftware', 'Brave-Browser', 'User Data'] },
  { id: 'opera', nome: 'Opera', base: 'roaming', caminho: ['Opera Software', 'Opera Stable'] },
  { id: 'opera-gx', nome: 'Opera GX', base: 'roaming', caminho: ['Opera Software', 'Opera GX Stable'] },
];

export const navegador = (id) => NAVEGADORES.find((n) => n.id === id) ?? null;

/** Pasta de dados do navegador, ou null sem a variável de ambiente. */
export function pastaDoNavegador(nav, { localAppData, appData }) {
  const base = nav.base === 'roaming' ? appData : localAppData;
  return base ? join(base, ...nav.caminho) : null;
}

// pasta '' = o perfil é a própria pasta de dados (o Opera antigo, sem "Default")
const RAIZ = '';

/**
 * Perfis do navegador: os do "Local State" (Edge, Chrome, Brave e o Opera novo) e, se a própria pasta
 * de dados tiver um "Local Storage", ela como perfil único (o Opera antigo). [{ pasta, nome }].
 */
export function perfisDoNavegador(nav, env, { ler = lerLocalState, existe = existsSync } = {}) {
  const dir = pastaDoNavegador(nav, env);
  if (!dir || !existe(dir)) return [];
  let perfis = [];
  try { perfis = perfisDoEdge(ler(dir)); } catch { /* sem Local State legível */ }
  if (existe(join(dir, 'Local Storage'))) perfis.push({ pasta: RAIZ, nome: 'Perfil principal' });
  return perfis;
}

/** Os navegadores instalados que têm perfis: [{ id, nome, perfis }]. */
export function navegadoresComPerfis(env, opcoes) {
  return NAVEGADORES.map((n) => ({ id: n.id, nome: n.nome, perfis: perfisDoNavegador(n, env, opcoes) })).filter((n) => n.perfis.length);
}

/**
 * Pasta "Local Storage" de um perfil, conferindo que o perfil existe mesmo nesse navegador (o pedido
 * vem da tela, e a pasta vira caminho de cópia: nada de "..\\algo").
 */
export function localStorageDoPerfil(idNavegador, pasta, env, opcoes) {
  const nav = navegador(idNavegador);
  if (!nav) throw new Error('navegador desconhecido');
  const perfil = perfisDoNavegador(nav, env, opcoes).find((p) => p.pasta === pasta);
  if (!perfil) throw new Error(`não achei esse perfil no ${nav.nome}`);
  return { origem: join(pastaDoNavegador(nav, env), perfil.pasta, 'Local Storage'), nome: `o perfil "${perfil.nome}" do ${nav.nome}` };
}

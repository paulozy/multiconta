// Perfis do Edge do usuário. A pasta de um perfil ("Default", "Profile 3") não bate com o nome que
// o Edge mostra ("Perfil 1", "Perfil 2"); o mapa fica em "User Data\Local State" →
// profile.info_cache. Só lemos nomes: nada de cookie, senha ou chave.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const pastaUserData = (localAppData) => join(localAppData, 'Microsoft', 'Edge', 'User Data');

// Pastas de perfil que o Edge cria. Qualquer outra chave do Local State é ignorada: o nome vira
// caminho de cópia e não pode sair de "User Data" (ex.: "..\\algo").
const PASTA_PERFIL = /^(Default|Profile \d+|Guest Profile)$/;

/** [{ pasta, nome }] na ordem do Local State. */
export function perfisDoEdge(localState) {
  const cache = localState?.profile?.info_cache ?? {};
  return Object.entries(cache)
    .filter(([pasta]) => PASTA_PERFIL.test(pasta))
    .map(([pasta, info]) => ({ pasta, nome: String(info?.name ?? pasta) }));
}

/**
 * Acha a pasta do perfil pelo nome que o Edge mostra (sem diferenciar maiúsculas) ou pelo nome da
 * própria pasta. Erra com a lista de perfis quando não acha ou quando o nome é ambíguo.
 */
export function resolverPerfil(localState, procurado) {
  const perfis = perfisDoEdge(localState);
  const lista = () => perfis.map((p) => `"${p.nome}" (${p.pasta})`).join(', ') || 'nenhum';
  const alvo = String(procurado ?? '').trim().toLowerCase();
  if (!alvo) throw new Error(`diga qual perfil do Edge importar. Perfis: ${lista()}`);
  const porPasta = perfis.find((p) => p.pasta.toLowerCase() === alvo);
  if (porPasta) return porPasta;
  const porNome = perfis.filter((p) => p.nome.trim().toLowerCase() === alvo);
  if (porNome.length === 1) return porNome[0];
  if (porNome.length > 1) throw new Error(`há ${porNome.length} perfis chamados "${procurado}": use a pasta. Perfis: ${lista()}`);
  throw new Error(`não achei o perfil "${procurado}". Perfis: ${lista()}`);
}

export function lerLocalState(userData) {
  try { return JSON.parse(readFileSync(join(userData, 'Local State'), 'utf8')); }
  catch (e) { throw new Error(`não consegui ler o Local State do Edge (${e.message})`); }
}

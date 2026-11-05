// Traz para o lançador uma conta já logada num perfil do Edge.
//
// - completo: copia o perfil inteiro + o Local State (que guarda a chave que decifra os cookies).
//   Foi assim com as alts, que têm perfis só do jogo.
// - só a sessão: copia apenas o "Local Storage", onde o pokeidle.io guarda o token. É o caminho da
//   conta principal: senhas, histórico e a chave do seu perfil pessoal não vão junto.
//
// A cópia em si (atômica) e a conferência da sessão ficam em app/importar.mjs, que o app também usa.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { temSessaoPokeidle } from '../app/importar.mjs';

export { copiarConta, temSessaoPokeidle } from '../app/importar.mjs';

// caches: refazem-se sozinhos e só pesam na cópia
const PULAR = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Service Worker']);

/** O que copiar, de onde para onde. */
export function planoDeImportacao({ userData, pastaPerfil, destino, soSessao }) {
  const perfil = join(userData, pastaPerfil);
  if (soSessao) return [{ de: join(perfil, 'Local Storage'), para: join(destino, 'Default', 'Local Storage') }];
  return [
    { de: join(userData, 'Local State'), para: join(destino, 'Local State') },
    { de: perfil, para: join(destino, 'Default'), pular: PULAR },
  ];
}

/**
 * Confere tudo antes de copiar. `emUso(caminho)` devolve 'livre' | 'em-uso' | 'nao-existe'
 * (no Windows é o janelas.estadoDoArquivo; nos testes, um dublê).
 */
export function conferirOrigem({ userData, pastaPerfil, nomePerfil, destino, forcar = false, emUso }) {
  const perfil = join(userData, pastaPerfil);
  if (!existsSync(perfil)) throw new Error(`a pasta do perfil "${nomePerfil}" (${pastaPerfil}) não existe`);
  if (existsSync(destino)) throw new Error(`${destino} já existe. Para importar de novo, apague essa pasta antes (ela tem o login da conta).`);
  const localStorage = join(perfil, 'Local Storage');
  if (!existsSync(localStorage)) throw new Error(`o perfil "${nomePerfil}" não tem dados de sites: o pokeidle.io nunca foi aberto nele?`);
  // o Edge segura estes arquivos enquanto o perfil está aberto
  for (const arq of [join(localStorage, 'leveldb', 'LOCK'), join(perfil, 'Network', 'Cookies')]) {
    if (emUso(arq) === 'em-uso') throw new Error(`o perfil "${nomePerfil}" está aberto no Edge: feche as janelas dele (os outros perfis podem seguir abertos) e tente de novo`);
  }
  if (!forcar && !temSessaoPokeidle(localStorage)) {
    throw new Error(`o perfil "${nomePerfil}" não tem sessão do pokeidle.io gravada. Abra o jogo nele, confira que está logado, feche a janela (o Edge grava ao fechar) e tente de novo. (--forcar copia mesmo assim)`);
  }
}

// As duas extensões de cada conta: o Onde Caçar (copiado do clone, igual para todas) e o rótulo
// (gerado do modelo em rotulo/, um por conta).
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const PARTES_ONDE_CACAR = ['manifest.json', 'src', 'icons'];

/**
 * Decide o que fazer com a cópia do Onde Caçar antes de abrir contas:
 * - 'copiar': clone acessível e nenhuma conta aberta → traz a versão do clone;
 * - 'manter': usa a cópia que já existe (com o motivo em `aviso`, se houver);
 * - 'sem': não há cópia nem clone → as contas abrem sem o Onde Caçar.
 * Com alguma conta aberta não se mexe na pasta: ela está carregada naquele Edge.
 */
export function decidirOndeCacar({ clone, cloneAcessivel, copiaExiste, algumaAberta }) {
  if (!clone) return copiaExiste ? { acao: 'manter' } : { acao: 'sem', aviso: '"ondeCacar" não está no contas.json: as contas abrem sem o Onde Caçar' };
  if (!cloneAcessivel) {
    return copiaExiste
      ? { acao: 'manter', aviso: `não consegui ler o clone em ${clone}; usando a última cópia do Onde Caçar` }
      : { acao: 'sem', aviso: `não consegui ler o clone em ${clone} e não há cópia: as contas abrem sem o Onde Caçar` };
  }
  if (algumaAberta && copiaExiste) return { acao: 'manter', aviso: 'há conta aberta: a versão do clone entra quando todas forem fechadas e abertas de novo' };
  return { acao: 'copiar' };
}

/**
 * App: de onde vem o Onde Caçar. A pasta de desenvolvimento, se configurada e legível; senão a que
 * veio no instalador (com aviso, se a de desenvolvimento estava configurada); senão a de
 * desenvolvimento mesmo (o plano abaixo avisa que não deu para ler), ou null.
 */
export function fonteOndeCacar({ pastaDev, devLegivel, embutido }) {
  if (pastaDev && devLegivel) return { fonte: pastaDev };
  if (embutido) return { fonte: embutido, ...(pastaDev ? { aviso: `não consegui ler a pasta de desenvolvimento ${pastaDev}; usando o Onde Caçar do instalador` } : {}) };
  return { fonte: pastaDev ?? null };
}

/**
 * App: o que fazer com a cópia do Onde Caçar na abertura (e no botão ⟳). `fonte` é a pasta de
 * desenvolvimento, se configurada, ou a que veio no instalador; null quando não há nenhuma.
 * - 'sem': desligado nas configurações, ou sem fonte nem cópia;
 * - 'manter': usa a cópia que já existe (com o motivo em `aviso`, se houver);
 * - 'copiar': traz a versão da fonte.
 */
export function planoOndeCacar({ ativo, fonte, fonteLegivel, copiaExiste }) {
  if (!ativo) return { acao: 'sem' };
  if (!fonte) return copiaExiste ? { acao: 'manter' } : { acao: 'sem', aviso: 'o Onde Caçar não veio nesta instalação: as contas abrem sem ele (reinstale o app para trazê-lo)' };
  if (!fonteLegivel) {
    return copiaExiste
      ? { acao: 'manter', aviso: `não consegui ler o Onde Caçar em ${fonte}; usando a última cópia` }
      : { acao: 'sem', aviso: `não consegui ler o Onde Caçar em ${fonte} e não há cópia: as contas abrem sem ele` };
  }
  return { acao: 'copiar' };
}

export const cloneAcessivel = (clone) => {
  try { return existsSync(join(clone, 'manifest.json')); } catch { return false; }
};

/** Troca a cópia do Onde Caçar pela do clone sem deixar uma pasta pela metade. */
export function copiarOndeCacar(clone, destino) {
  const novo = `${destino}.novo`, velho = `${destino}.velho`;
  rmSync(novo, { recursive: true, force: true });
  rmSync(velho, { recursive: true, force: true });
  try {
    for (const p of PARTES_ONDE_CACAR) cpSync(join(clone, p), join(novo, p), { recursive: true });
  } catch (e) {
    rmSync(novo, { recursive: true, force: true });
    throw new Error(`não consegui copiar o Onde Caçar do clone: ${e.message}`);
  }
  const tinha = existsSync(destino);
  try { if (tinha) renomear(destino, velho); }
  catch (e) {
    rmSync(novo, { recursive: true, force: true });
    throw new Error(`não consegui trocar a cópia do Onde Caçar: ${e.message}`);
  }
  try { renomear(novo, destino); }
  catch (e) {
    rmSync(novo, { recursive: true, force: true });
    try { if (tinha) renomear(velho, destino); } // devolve a cópia boa
    catch { throw new Error(`não consegui trocar a cópia do Onde Caçar (${e.message}) nem devolver a anterior, que ficou em ${velho}: feche e abra o app`); }
    throw new Error(`não consegui trocar a cópia do Onde Caçar: ${e.message}`);
  }
  // a troca já deu certo: sobra da versão velha que não sair agora sai na próxima cópia
  try { rmSync(velho, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* fica para a próxima */ }
}

// No Windows o antivírus e o indexador seguram por instantes arquivos recém-copiados: o rename
// falha com EPERM/EBUSY/EACCES e passa logo depois (o mesmo que o graceful-fs faz). A espera é
// síncrona e curta (no máximo ~0,3 s por rename): no app ela segura a janela, então fica pequena.
const PASSAGEIROS = ['EPERM', 'EBUSY', 'EACCES'];
export function renomear(de, para, { tentativas = 5, espera = 75, renomearFn = renameSync } = {}) {
  for (let i = 1; ; i++) {
    try { return renomearFn(de, para); }
    catch (e) {
      if (i >= tentativas || !PASSAGEIROS.includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, espera);
    }
  }
}

/** Texto do rótulo com o nome da conta e o modo leve; o nome vai escapado para string JS/JSON. */
export function textoDoRotulo(modelo, conta) {
  return modelo
    // JSON.stringify não escapa U+2028/U+2029, que encerram linha no JS (e um comentário com eles)
    .replaceAll('__ROTULO__', JSON.stringify(conta.rotulo).slice(1, -1).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'))
    .replaceAll('__LEVE__', conta.leve ? 'sim' : 'nao');
}

/** Gera a extensão de rótulo da conta em `destino` a partir do modelo em `pastaModelo`. */
export function gerarRotulo(pastaModelo, destino, conta) {
  mkdirSync(destino, { recursive: true });
  for (const f of ['manifest.json', 'rotulo.js']) {
    writeFileSync(join(destino, f), textoDoRotulo(readFileSync(join(pastaModelo, f), 'utf8'), conta));
  }
  return destino;
}

/**
 * Confere a pasta de uma extensão escolhida pelo usuário (descompactada, com manifest.json na raiz).
 * Devolve { nome, versao }; nome de manifesto traduzido (__MSG_x__) vira o nome da pasta.
 */
export function lerManifesto(dir) {
  let m;
  try { m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')); }
  catch { throw new Error('a pasta não tem um manifest.json legível: escolha a pasta da extensão descompactada (a que tem o manifest.json)'); }
  if (![2, 3].includes(m?.manifest_version)) throw new Error('o manifest.json não é de uma extensão do Chrome/Edge (manifest_version 2 ou 3)');
  const nome = typeof m.name === 'string' && m.name.trim() && !m.name.startsWith('__MSG_') ? m.name.trim() : basename(dir);
  return { nome: nome.slice(0, 60), versao: typeof m.version === 'string' ? m.version.slice(0, 20) : null };
}

/** Copia uma extensão inteira (sem .git nem node_modules) para `destino`, sem deixar pela metade. */
export function copiarExtensao(de, destino) {
  const novo = `${destino}.novo`;
  rmSync(novo, { recursive: true, force: true });
  try {
    cpSync(de, novo, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(src.slice(de.length)) });
  } catch (e) {
    rmSync(novo, { recursive: true, force: true });
    throw new Error(`não consegui copiar a extensão: ${e.message}`);
  }
  rmSync(destino, { recursive: true, force: true });
  renomear(novo, destino);
}

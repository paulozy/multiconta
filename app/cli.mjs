// Comandos do app que não precisam do Electron (rodam com o node.exe, no Windows):
//
//   node app/cli.mjs estado                          login de cada conta no app
//   node app/cli.mjs importar "<perfil>" <conta>      traz o login direto de um perfil do Edge
//        --forcar      copia mesmo sem achar a sessão do pokeidle.io
//   node app/cli.mjs instalar                         instala o app em %LOCALAPPDATA%\PokeIdleMulticonta\app-electron
//                                                     e cria o atalho "PokeIdle Multiconta" (rode do repositório)
//   node app/cli.mjs desinstalar                      tira o atalho e o app (logins e config.json ficam)
//
// Com o app aberto, feche-o antes: a partição de uma conta aberta está em uso.
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { lerConfigApp } from './config.mjs';
import { lerLocalState, pastaUserData, resolverPerfil } from './edge.mjs';
import { estadoDoArquivo, ps } from './powershell.mjs';
import { ambienteDoDownload, apagarApp, appRodando, atalhoDoApp, caminhos, copiarAppElectron, electronServe, instalarElectron, lerProcessosElectron, SCRIPT_ATALHO_APP, SCRIPT_PROCESSOS_ELECTRON, versaoTravada } from './instalar-app.mjs';
import { estadoDasSessoes, levarSessao, pastaParticao } from './sessoes.mjs';

const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OPCOES = new Set(['--forcar']);
export const USO = 'uso: node app/cli.mjs estado | importar [--forcar] "<perfil>" <conta> | instalar | desinstalar';

/** Separa comando, argumentos e opções; opção desconhecida é erro. */
export function lerArgs(argv) {
  const ruins = argv.filter((a) => a.startsWith('-') && !OPCOES.has(a));
  if (ruins.length) throw new Error(`opção desconhecida: ${ruins.join(', ')}\n${USO}`);
  const [cmd, ...resto] = argv.filter((a) => !a.startsWith('-'));
  return { cmd, resto, forcar: argv.includes('--forcar') };
}

const TEXTO = { logada: 'logada', 'sem-sessao': 'partição sem sessão do jogo', 'sem-particao': 'ainda sem login no app' };

const electronsAbertos = () => lerProcessosElectron(ps(SCRIPT_PROCESSOS_ELECTRON));

function instalar(raiz) {
  const { destino, appDir, electronExe } = caminhos(raiz);
  if (resolve(RAIZ_REPO).toLowerCase() === resolve(destino).toLowerCase()) throw new Error('rode o "instalar" a partir do repositório, não da cópia instalada');
  if (appRodando(electronsAbertos(), destino)) throw new Error('o app está aberto: feche a janela "PokeIdle · Multiconta" e tente de novo');
  const reaproveitou = copiarAppElectron(RAIZ_REPO, destino);
  console.log(`app copiado para ${destino}${reaproveitou ? ' (Electron da instalação anterior reaproveitado)' : ''}`);
  const versao = versaoTravada(RAIZ_REPO);
  if (!reaproveitou) {
    console.log(`baixando o Electron ${versao} (a versão travada no package-lock.json)...`);
    const env = ambienteDoDownload(process.env);
    instalarElectron(appDir, { node: process.execPath, rodar: (arq, args, cwd) => execFileSync(arq, args, { cwd, stdio: 'inherit', env }) });
    if (!electronServe(join(appDir, 'node_modules'), versao)) throw new Error(`o Electron ${versao} não ficou inteiro em ${electronExe}`);
  }
  const atalho = atalhoDoApp({ electronExe, appDir, raiz });
  ps(SCRIPT_ATALHO_APP, { ATALHO: JSON.stringify(atalho) });
  console.log(`atalho "${atalho.nome.replace(/\.lnk$/, '')}" criado na Área de Trabalho e no Iniciar`);
}

function desinstalar(raiz) {
  const { destino, appDir, electronExe } = caminhos(raiz);
  if (appRodando(electronsAbertos(), destino)) throw new Error('o app está aberto: feche e tente de novo');
  try { apagarApp(destino); }
  catch (e) { throw new Error(`não consegui apagar ${destino} (${e.code ?? e.message}): feche o app e o que estiver usando a pasta. O atalho não foi mexido.`); }
  ps(SCRIPT_ATALHO_APP, { ATALHO: JSON.stringify(atalhoDoApp({ electronExe, appDir, raiz })), REMOVER: '1' });
  console.log(`app e atalho removidos. Os logins (electron\\Partitions), o estado da janela e o config.json continuam em ${raiz}.`);
}

function principal() {
  const { cmd, resto, forcar } = lerArgs(process.argv.slice(2));
  if (!process.env.LOCALAPPDATA) throw new Error('rode no Windows com o node.exe (LOCALAPPDATA não está definido)');
  const raiz = join(process.env.LOCALAPPDATA, 'PokeIdleMulticonta');
  const userData = join(raiz, 'electron');
  const { cfg } = lerConfigApp(raiz);
  const conta = (id) => cfg.contas.find((c) => c.id === id) ?? (() => { throw new Error(`conta ${id} não está no config.json do app. Contas: ${cfg.contas.map((c) => c.id).join(', ')}`); })();
  const emUso = (arq) => estadoDoArquivo(arq);

  if (cmd === 'estado') {
    const estados = estadoDasSessoes(userData, cfg.contas);
    for (const c of cfg.contas) console.log(`[${c.id}] ${TEXTO[estados[c.id]]}`);
  } else if (cmd === 'importar') {
    if (resto.length !== 2) throw new Error(USO);
    const [nomePerfil, id] = [resto[0], conta(resto[1]).id];
    const userDataEdge = pastaUserData(process.env.LOCALAPPDATA);
    const { pasta, nome } = resolverPerfil(lerLocalState(userDataEdge), nomePerfil);
    levarSessao({ origem: join(userDataEdge, pasta, 'Local Storage'), nomeOrigem: `o perfil "${nome}" do Edge`, destino: pastaParticao(userData, id), emUso, forcar });
    console.log(`[${id}] login trazido de "${nome}". Não abra o pokeidle.io em "${nome}" com o app aberto: a sessão de um derruba a do outro.`);
  } else if (cmd === 'instalar') instalar(raiz);
  else if (cmd === 'desinstalar') desinstalar(raiz);
  else console.log(USO);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { principal(); } catch (e) { console.error(`erro: ${e.message}`); process.exitCode = 1; }
}

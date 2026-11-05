// Instala o app Electron no Windows: o código vai para %LOCALAPPDATA%\PokeIdleMulticonta\app-electron
// (o uso diário não depende do WSL nem da pasta de desenvolvimento) e o atalho "PokeIdle Multiconta"
// vai para a Área de Trabalho e o Iniciar. Logins (electron\Partitions), estado.json e config.json
// ficam fora dessa pasta: reinstalar ou desinstalar não mexe neles.
import * as fsReal from 'node:fs';
import { dirname, join, relative } from 'node:path';

export const PARTES = ['app']; // o app não usa nada de fora de app/ (o rótulo e os módulos comuns moram lá)
export const NOME_ATALHO = 'PokeIdle Multiconta';

/** Onde fica cada coisa da instalação. */
export function caminhos(raiz) {
  const destino = join(raiz, 'app-electron');
  const appDir = join(destino, 'app');
  return { destino, appDir, electronExe: join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe') };
}

// só o código: nada de node_modules, testes ou protótipos (olhando o caminho relativo ao repositório)
const soCodigo = (origem) => (src) => !/(^|[\\/])(node_modules|testes?|spikes)([\\/]|$)|\.test\.mjs$/.test(relative(origem, src));

const lerJson = (fs, arq) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return null; } };

/** Versão do Electron travada no package-lock.json do código que vai ser instalado. */
export const versaoTravada = (origem, fs = fsReal) => lerJson(fs, join(origem, 'app', 'package-lock.json'))?.packages?.['node_modules/electron']?.version ?? null;

/**
 * O Electron já baixado em `modulos` serve? Só se for da versão travada e o download tiver terminado:
 * dist\version e path.txt são gravados pelo próprio instalador do Electron no fim.
 */
export function electronServe(modulos, versao, fs = fsReal) {
  if (!versao) return false;
  const e = join(modulos, 'electron');
  if (lerJson(fs, join(e, 'package.json'))?.version !== versao) return false;
  let dist = '';
  try { dist = fs.readFileSync(join(e, 'dist', 'version'), 'utf8').trim().replace(/^v/, ''); } catch { return false; }
  return dist === versao && fs.existsSync(join(e, 'path.txt')) && fs.existsSync(join(e, 'dist', 'electron.exe'));
}

/**
 * Sobras de uma instalação interrompida (queda de energia, Ctrl+C no meio da troca): se a pasta do
 * app sumiu e a anterior ficou em ".velho", ela volta, com o Electron que tiver ficado em ".novo".
 */
export function recuperarInterrompida(destino, fs = fsReal) {
  const novo = `${destino}.novo`, velho = `${destino}.velho`;
  if (fs.existsSync(destino) || !fs.existsSync(velho)) return false;
  fs.renameSync(velho, destino);
  const modNovo = join(novo, 'app', 'node_modules'), modDestino = join(destino, 'app', 'node_modules');
  if (fs.existsSync(join(modNovo, 'electron')) && !fs.existsSync(modDestino)) fs.renameSync(modNovo, modDestino);
  return true;
}

/**
 * Copia o código para `destino` de forma atômica. O Electron da instalação anterior é reaproveitado
 * se for da versão travada e estiver inteiro; se algo falhar, a instalação anterior volta inteira.
 * Devolve true se o Electron veio da instalação anterior.
 */
export function copiarAppElectron(origem, destino, fs = fsReal) {
  const novo = `${destino}.novo`, velho = `${destino}.velho`;
  recuperarInterrompida(destino, fs);
  fs.rmSync(novo, { recursive: true, force: true });
  fs.rmSync(velho, { recursive: true, force: true });
  try {
    for (const p of PARTES) fs.cpSync(join(origem, p), join(novo, p), { recursive: true, filter: soCodigo(origem) });
  } catch (e) {
    fs.rmSync(novo, { recursive: true, force: true });
    throw new Error(`não consegui copiar o app: ${e.message}`);
  }
  const modulosVelhos = join(destino, 'app', 'node_modules'), modulosNovos = join(novo, 'app', 'node_modules');
  const reaproveitou = electronServe(modulosVelhos, versaoTravada(origem, fs), fs);
  const tinha = fs.existsSync(destino);
  // passo 1: tirar o Electron da instalação velha e afastá-la; se falhar, tudo volta como estava
  try {
    if (reaproveitou) fs.renameSync(modulosVelhos, modulosNovos);
    if (tinha) fs.renameSync(destino, velho);
  } catch (e) {
    let voltou = true;
    if (reaproveitou && fs.existsSync(modulosNovos)) { try { fs.renameSync(modulosNovos, modulosVelhos); } catch { voltou = false; } }
    if (voltou) fs.rmSync(novo, { recursive: true, force: true }); // senão o Electron ficou em .novo: a próxima vez recupera
    throw new Error(`não consegui trocar a instalação (${e.code ?? e.message}): feche o app e tente de novo${voltou ? '' : ` (o Electron ficou em ${novo})`}`);
  }
  // passo 2: a nova no lugar; se falhar, a velha volta com o Electron dela
  try { fs.renameSync(novo, destino); }
  catch (e) {
    let ondeFicou = destino;
    try {
      if (tinha) fs.renameSync(velho, destino);
      if (reaproveitou) fs.renameSync(modulosNovos, modulosVelhos);
      fs.rmSync(novo, { recursive: true, force: true });
    } catch { ondeFicou = fs.existsSync(destino) ? `${destino} (o Electron ficou em ${novo})` : velho; }
    throw new Error(`não consegui trocar a instalação: ${e.message}; a instalação anterior está em ${ondeFicou} (rodar "instalar" de novo recupera)`);
  }
  fs.rmSync(velho, { recursive: true, force: true });
  return reaproveitou;
}

/** Desinstala: renomeia primeiro (falha limpa se algo estiver em uso) e só então apaga. */
export function apagarApp(destino, fs = fsReal) {
  const apagando = `${destino}.apagando`;
  fs.rmSync(apagando, { recursive: true, force: true });
  if (fs.existsSync(destino)) fs.renameSync(destino, apagando);
  for (const p of [apagando, `${destino}.novo`, `${destino}.velho`]) fs.rmSync(p, { recursive: true, force: true });
}

// variáveis que trocariam os checksums travados no pacote pelos "remotos" no download do Electron
const VARIAVEIS_PERIGOSAS = /^(npm_config_)?electron_use_remote_checksums$/i;
export const ambienteDoDownload = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => !VARIAVEIS_PERIGOSAS.test(k)));

/**
 * Baixa o Electron da versão travada no package-lock.json (npm ci) e roda o instalador dele à mão
 * (o npm 11 não rodou o postinstall no estudo). O zip é conferido contra o checksums.json do pacote.
 * `rodar(arquivo, args, cwd)` executa um processo.
 */
export function instalarElectron(appDir, { node, rodar }) {
  const npmCli = join(dirname(node), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!fsReal.existsSync(npmCli)) throw new Error(`não achei o npm ao lado do node (${npmCli})`);
  rodar(node, [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], appDir);
  rodar(node, [join(appDir, 'node_modules', 'electron', 'install.js')], appDir);
}

/** O atalho do app: abre o electron.exe instalado com a pasta do app; trabalha na pasta de dados. */
export const atalhoDoApp = ({ electronExe, appDir, raiz }) => ({
  nome: `${NOME_ATALHO}.lnk`, alvo: electronExe, linha: `"${appDir}"`, pastaTrabalho: raiz,
  icone: `${join(appDir, 'icone', 'icone.ico')},0`, descricao: 'As contas do PokeIdle numa janela só, em mosaico',
});

/** O app instalado está aberto? (lista de { exe } dos processos electron.exe) */
export function appRodando(processos, destino) {
  const norma = (p) => p.toLowerCase().replace(/[\\/]+/g, '\\');
  const base = norma(destino).replace(/\\$/, '') + '\\';
  return processos.some(({ exe }) => typeof exe === 'string' && norma(exe).startsWith(base));
}

/** Saída do PowerShell (ConvertTo-Json) → [{ exe }]: vazia, objeto único ou lista. */
export const lerProcessosElectron = (saida) => (saida ? [].concat(JSON.parse(saida)) : []).map((p) => ({ exe: p?.ExecutablePath ?? null }));

export const SCRIPT_PROCESSOS_ELECTRON = `@(Get-CimInstance Win32_Process -Filter "name='electron.exe'" | Select-Object ExecutablePath) | ConvertTo-Json -Compress`;

// Um atalho na Área de Trabalho e outro na raiz de Iniciar\\Programas. Dados por variável de ambiente.
export const SCRIPT_ATALHO_APP = `
$ErrorActionPreference = 'Stop'
$a = $env:MC_ATALHO | ConvertFrom-Json
$pastas = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
foreach ($p in $pastas) {
  $arq = Join-Path $p $a.nome
  if ($env:MC_REMOVER -eq '1') { Remove-Item -LiteralPath $arq -Force -ErrorAction SilentlyContinue; continue }
  $l = (New-Object -ComObject WScript.Shell).CreateShortcut($arq)
  $l.TargetPath = $a.alvo; $l.Arguments = $a.linha; $l.WorkingDirectory = $a.pastaTrabalho
  $l.IconLocation = $a.icone; $l.Description = $a.descricao; $l.Save()
}
'ok'`;

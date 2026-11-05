// Instala o lançador no Windows: copia o código para %LOCALAPPDATA%\PokeIdleMulticonta\app (o uso
// diário não depende do WSL) e cria os atalhos. Os perfis das contas e o contas.json ficam fora de
// app\, então reinstalar ou desinstalar nunca mexe neles.
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

// o que vai para app\ (só o necessário para rodar)
// (o rótulo e os módulos comuns moram em app/; o resto do app Electron não vai)
export const PARTES_APP = ['lancador', 'app/rotulo', ...['edge', 'extensoes', 'importar', 'leveldb', 'powershell'].map((m) => `app/${m}.mjs`), 'contas.exemplo.json'];
// o filtro olha o caminho relativo ao repositório: um repo dentro de "C:\\testes\\" não some inteiro
const soCodigo = (origem) => (src) => !/(^|[\\/])testes?([\\/]|$)|\.test\.mjs$/.test(relative(origem, src));

/** Copia o código para `destino` sem deixar uma instalação pela metade. */
export function copiarApp(origem, destino) {
  const novo = `${destino}.novo`, velho = `${destino}.velho`;
  rmSync(novo, { recursive: true, force: true });
  rmSync(velho, { recursive: true, force: true });
  try {
    for (const p of PARTES_APP) cpSync(join(origem, p), join(novo, p), { recursive: true, filter: soCodigo(origem) });
  } catch (e) {
    rmSync(novo, { recursive: true, force: true });
    throw new Error(`não consegui copiar o lançador: ${e.message}`);
  }
  const tinha = existsSync(destino);
  if (tinha) {
    try { renameSync(destino, velho); }
    catch (e) { rmSync(novo, { recursive: true, force: true }); throw new Error(`não consegui trocar a instalação (${e.code ?? e.message}): feche as contas e o que estiver usando ${destino} e tente de novo`); }
  }
  try { renameSync(novo, destino); }
  catch (e) {
    let desfeito = true;
    if (tinha) { try { renameSync(velho, destino); } catch { desfeito = false; } }
    rmSync(novo, { recursive: true, force: true });
    throw new Error(`não consegui trocar a instalação: ${e.message}${desfeito ? '' : `; e não deu para voltar a anterior: ela está em ${velho}`}`);
  }
  rmSync(velho, { recursive: true, force: true });
  return readdirSync(destino);
}

// nome de arquivo do Windows: sem \ / : * ? " < > | e sem ponto/espaço no fim
export const nomeDeArquivo = (s) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/[. ]+$/, '').trim() || 'conta';

// O lançador do Edge é a reserva do app: os atalhos dele ficam só no Iniciar, com "(Edge)" no nome, e
// a Área de Trabalho fica para o app ("PokeIdle Multiconta"). Os nomes antigos saem da Área de Trabalho.
export const ATALHOS_GERAIS = ['PokeIdle (Edge) · todas', 'PokeIdle (Edge) · fechar todas'];
export const ATALHOS_ANTIGOS_NA_AREA = ['PokeIdle · todas', 'PokeIdle · fechar todas'];

/**
 * Atalhos a criar, todos no menu Iniciar: "todas", "fechar todas" e um por conta. Rodam o node.exe com
 * o lançador instalado e --pausar (a janela só fica aberta se houver aviso ou erro para ler).
 */
export function planoDeAtalhos(contas, { node, script, icone }) {
  const atalho = (pasta, nome, args, descricao) => ({ pasta, nome: `${nomeDeArquivo(nome)}.lnk`, alvo: node, args: [script, ...args, '--pausar'], icone, descricao });
  const gerais = [
    [ATALHOS_GERAIS[0], ['abrir'], 'Abre todas as contas do PokeIdle lado a lado'],
    [ATALHOS_GERAIS[1], ['fechar'], 'Fecha todas as contas do PokeIdle'],
  ];
  const plano = gerais.map(([n, a, d]) => atalho('menu', n, a, d));
  // o Windows não diferencia maiúsculas e o nome de arquivo perde ": / ?": rótulos podem colidir
  // entre si ou com "todas"; aí o id entra no nome, e se ainda colidir é erro (nada sobrescrito)
  const usado = (nome) => plano.some((a) => a.pasta === 'menu' && a.nome.toLowerCase() === nome.toLowerCase());
  for (const c of contas) {
    let a = atalho('menu', `PokeIdle (Edge) · ${c.rotulo}`, ['abrir', c.id], `Abre a conta ${c.rotulo} no Edge`);
    if (usado(a.nome)) a = atalho('menu', `PokeIdle (Edge) · ${c.rotulo} (${c.id})`, ['abrir', c.id], `Abre a conta ${c.rotulo} no Edge`);
    if (usado(a.nome)) throw new Error(`o atalho da conta ${c.id} teria o mesmo nome de outro (${a.nome}); mude o rótulo`);
    plano.push(a);
  }
  return plano;
}

/** Junta os argumentos numa linha de comando do Windows (aspas quando há espaço). */
export const linhaDeComando = (args) => args.map((a) => (/[\s"]/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a)).join(' ');

// Cria os .lnk com o WScript.Shell. A lista vem em JSON por variável de ambiente: nenhum nome ou
// caminho é colado no script. "menu" = Iniciar\Programas\PokeIdle Multiconta.
// Na Área de Trabalho só mexemos nos nossos dois nomes; a pasta do menu é toda nossa. Cria os novos
// primeiro e só depois apaga os .lnk do menu que não estão na lista (conta removida); erro para tudo.
export const SCRIPT_ATALHOS = `
$ErrorActionPreference = 'Stop'
$sh = New-Object -ComObject WScript.Shell
$pastas = @{ desktop = [Environment]::GetFolderPath('Desktop'); menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'PokeIdle Multiconta' }
$gerais = $env:MC_GERAIS | ConvertFrom-Json
if ($env:MC_REMOVER -eq '1') {
  foreach ($g in @($gerais) + @($env:MC_ANTIGOS | ConvertFrom-Json)) { Remove-Item -LiteralPath (Join-Path $pastas.desktop "$g.lnk") -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $pastas.menu -Recurse -Force -ErrorAction SilentlyContinue
  'ok'; return
}
New-Item -ItemType Directory -Force -Path $pastas.menu | Out-Null
# nomes antigos na Área de Trabalho (de quando o lançador era o principal): saem
foreach ($g in ($env:MC_ANTIGOS | ConvertFrom-Json)) { Remove-Item -LiteralPath (Join-Path $pastas.desktop "$g.lnk") -Force -ErrorAction SilentlyContinue }
$feitos = @(); $n = 0
foreach ($a in ($env:MC_ATALHOS | ConvertFrom-Json)) {
  $l = $sh.CreateShortcut((Join-Path $pastas[$a.pasta] $a.nome))
  $l.TargetPath = $a.alvo; $l.Arguments = $a.linha; $l.WorkingDirectory = $a.pastaTrabalho
  $l.IconLocation = $a.icone; $l.Description = $a.descricao; $l.Save()
  if ($a.pasta -eq 'menu') { $feitos += $a.nome }
  $n++
}
Get-ChildItem -LiteralPath $pastas.menu -Filter '*.lnk' | Where-Object { $feitos -notcontains $_.Name } | Remove-Item -Force
"$n"`;

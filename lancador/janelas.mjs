// Janelas e processos do Edge do lançador, pelo PowerShell (app/powershell.mjs, que o app também usa).
import { ps, psAssincrono } from '../app/powershell.mjs';

export { estadoDoArquivo, ps, psAssincrono, SCRIPT_EM_USO } from '../app/powershell.mjs';

// ---- processos das contas ---------------------------------------------------------------------
// Só o processo principal de cada Edge (os filhos têm --type=). A conta é achada pela pasta exata
// do --user-data-dir, lida da linha de comando: nada de "-like", que casaria alt2 com alt20.
export const SCRIPT_PROCESSOS = `@(Get-CimInstance Win32_Process -Filter "name='msedge.exe'" |
  Where-Object { $_.CommandLine -notlike '*--type=*' } | Select-Object ProcessId, CommandLine) | ConvertTo-Json -Compress`;

/** [{ pid, cmd }] dos Edges abertos. */
export const processosRaiz = (rodar = ps) => lerProcessos(rodar(SCRIPT_PROCESSOS));
/** O mesmo, sem travar o processo principal do app. */
export const processosRaizAssincrono = async (rodar = psAssincrono) => lerProcessos(await rodar(SCRIPT_PROCESSOS));

function lerProcessos(saida) {
  if (!saida) return [];
  // cmd null = o Windows não deixou ler (ex.: Edge aberto como administrador)
  return [].concat(JSON.parse(saida)).map((p) => ({ pid: p.ProcessId, cmd: p.CommandLine ?? null }));
}

/** Quebra uma linha de comando do Windows em argumentos (aspas agrupam e somem). */
export function argumentos(cmd) {
  const out = [];
  let atual = '', aspas = false, tem = false;
  for (const ch of cmd) {
    if (ch === '"') { aspas = !aspas; tem = true; }
    else if (/\s/.test(ch) && !aspas) { if (tem) out.push(atual); atual = ''; tem = false; }
    else { atual += ch; tem = true; }
  }
  if (tem) out.push(atual);
  return out;
}

const normalizar = (p) => p.toLowerCase().replace(/[\\/]+/g, '\\').replace(/\\$/, '');

const valoresDe = (cmd, opcao) => argumentos(cmd ?? '').filter((a) => a.startsWith(`${opcao}=`)).map((a) => a.slice(opcao.length + 1));

/** PIDs dos Edges que rodam com esta pasta de dados. */
export function pidsDaConta(processos, pastaConta) {
  const alvo = normalizar(pastaConta);
  return processos.filter(({ cmd }) => valoresDe(cmd, '--user-data-dir').some((v) => normalizar(v) === alvo)).map((p) => p.pid);
}

/** Algum Edge aberto carregou esta pasta de extensão (conta da config ou não)? */
export function pastaEmUso(processos, pastaExt) {
  const alvo = normalizar(pastaExt);
  return processos.some(({ cmd }) => valoresDe(cmd, '--load-extension').some((v) => v.split(',').some((x) => normalizar(x) === alvo)));
}

/** Edges cuja linha de comando não deu para ler: podem ser qualquer conta. */
export const ilegiveis = (processos) => processos.filter((p) => p.cmd === null).map((p) => p.pid);

const USER32 = `Add-Type -Namespace W -Name U -MemberDefinition '
  [DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);'`;

// restaura só se estiver minimizada (SW_RESTORE numa janela maximizada a tiraria do máximo).
// Responde quantas janelas achou: 0 = o Edge da conta segue vivo, mas sem janela (segundo plano).
export const SCRIPT_FOCAR = `${USER32}
$n = 0
foreach ($id in $env:MC_PIDS -split ',') {
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($p -and $p.MainWindowHandle -ne 0) {
    if ([W.U]::IsIconic($p.MainWindowHandle)) { [void][W.U]::ShowWindow($p.MainWindowHandle, 9) }
    [void][W.U]::SetForegroundWindow($p.MainWindowHandle)
    $n++
  }
}
"$n"`;

/** Quantas janelas da conta foram trazidas para frente. */
export function focarPids(pids, rodar = ps) {
  if (!pids.length) return 0;
  return ultimoNumero(rodar(SCRIPT_FOCAR, { PIDS: pids.join(',') }), 1)[0];
}

// a última linha da saída tem os números; antes dela pode vir aviso do PowerShell
function ultimoNumero(saida, quantos) {
  const linha = String(saida).trim().split(/\r?\n/).pop().trim();
  const nums = linha ? linha.split(/\s+/).map(Number) : []; // Number('') seria 0: vazio não vale
  if (nums.length !== quantos || !nums.every(Number.isInteger)) throw new Error(`resposta inesperada do PowerShell: ${saida}`);
  return nums;
}

// Fecha como o "X" da janela (o Edge grava o localStorage ao fechar a página) e só força quem não
// sair a tempo. Sem janela nenhuma e ainda vivo = segundo plano: espera 2 s e encerra.
// Responde: <processos> <forçados> <ainda vivos depois de forçar>.
export const SCRIPT_FECHAR = `
$ps = @($env:MC_PIDS -split ',' | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
$limite = (Get-Date).AddSeconds([int]$env:MC_ESPERA)
$semJanelaDesde = $null
do {
  $vivos = @($ps | Where-Object { $_.Refresh(); -not $_.HasExited })
  $comJanela = @($vivos | Where-Object { $_.MainWindowHandle -ne 0 })
  $comJanela | ForEach-Object { [void]$_.CloseMainWindow() }
  if ($vivos.Count -and -not $comJanela.Count) {
    if (-not $semJanelaDesde) { $semJanelaDesde = Get-Date }
    if (((Get-Date) - $semJanelaDesde).TotalSeconds -ge 2) { break }
  }
  if ($vivos.Count) { Start-Sleep -Milliseconds 300 }
} while ($vivos.Count -and (Get-Date) -lt $limite)
$vivos | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 300
$resto = @($vivos | Where-Object { $_.Refresh(); -not $_.HasExited })
"$($ps.Count) $($vivos.Count) $($resto.Count)"`;

/** { fechados, forcados, vivos } */
export function fecharPids(pids, { espera = 8, rodar = ps } = {}) {
  if (!pids.length) return { fechados: 0, forcados: 0, vivos: 0 };
  const [n, f, v] = ultimoNumero(rodar(SCRIPT_FECHAR, { PIDS: pids.join(','), ESPERA: espera }), 3);
  if (f > n || v > f) throw new Error(`resposta inesperada do PowerShell: ${n} ${f} ${v}`);
  return { fechados: n - f, forcados: f - v, vivos: v };
}

export const SCRIPT_AREA = `Add-Type -AssemblyName System.Windows.Forms
$a = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
"$($a.X) $($a.Y) $($a.Width) $($a.Height)"`;

/** Área útil da tela principal (sem a barra de tarefas). */
export function areaDeTrabalho(rodar = ps) {
  const [x, y, w, h] = rodar(SCRIPT_AREA).split(/\s+/).map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error('não consegui ler o tamanho da tela');
  return { x, y, w, h };
}

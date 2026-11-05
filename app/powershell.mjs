// Conversa com o Windows pelo PowerShell. Caminhos e outros valores vão por variável de ambiente
// ($env:MC_*), nunca colados no script: assim aspas, colchetes ou "*" num caminho (ex.: usuário
// "O'Brien") não quebram o comando nem viram código.
import { execFile, execFileSync } from 'node:child_process';
import { join } from 'node:path';

// caminho completo: não deixa um powershell.exe na pasta atual ser chamado no lugar do de verdade
const POWERSHELL = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

/** Roda um script do PowerShell com variáveis MC_<nome> e devolve a saída sem espaços nas pontas. */
export function ps(script, vars = {}) {
  const env = { ...process.env };
  for (const [k, v] of Object.entries(vars)) env[`MC_${k}`] = String(v);
  return execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', env }).trim();
}

/** O mesmo que ps(), sem travar quem chama (o processo principal do app) e com tempo máximo. */
export function psAssincrono(script, { timeout = 15_000 } = {}) {
  return new Promise((ok, falha) => {
    execFile(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout }, (e, saida) => (e ? falha(e) : ok(saida.trim())));
  });
}

// "em-uso" quando outro processo segura o arquivo: o Cookies o Edge abre sem compartilhar; o LOCK do
// LevelDB fica aberto, mas com trava de bytes (LockFileEx), então também tentamos travar 1 byte.
// Qualquer outra falha (caminho inválido...) sobe como erro de verdade.
export const SCRIPT_EM_USO = `
try {
  $f = [IO.File]::Open($env:MC_ARQ, 'Open', 'Read', 'ReadWrite')
  try { $f.Lock(0, 1); $f.Unlock(0, 1); 'livre' } catch [System.IO.IOException] { 'em-uso' } finally { $f.Close() }
}
catch [System.IO.FileNotFoundException], [System.IO.DirectoryNotFoundException] { 'nao-existe' }
catch [System.IO.PathTooLongException] { 'erro: caminho longo demais' }
catch [System.IO.IOException] { 'em-uso' }
catch { $e = $_.Exception; if ($e.InnerException) { $e = $e.InnerException }; 'erro: ' + $e.Message }`;

/** 'livre' | 'em-uso' | 'nao-existe' para um arquivo (o LOCK do Local Storage, o Cookies...). */
export function estadoDoArquivo(caminho, rodar = ps) {
  const r = rodar(SCRIPT_EM_USO, { ARQ: caminho });
  if (r.startsWith('erro: ')) throw new Error(`não consegui checar ${caminho}: ${r.slice(6)}`);
  if (!['livre', 'em-uso', 'nao-existe'].includes(r)) throw new Error(`resposta inesperada do PowerShell: ${r}`);
  return r;
}

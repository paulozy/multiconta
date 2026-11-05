// O Onde Caçar que vai junto no instalador: a versão FIXADA no package.json ("ondeCacar": tag e SHA-256),
// para o instalador de uma tag ser sempre o mesmo e trocar de versão ser um commit revisável. Baixa o
// zip "chrome-edge-opera" dessa release de github.com/paulozy/onde-cacar, confere o SHA-256 (o fixado,
// que também tem de bater com o "digest" que o GitHub calcula) e extrai em build/onde-cacar.
//
//   node scripts/baixar-onde-cacar.mjs              baixa a versão fixada
//   node scripts/baixar-onde-cacar.mjs fixar vX.Y.Z  troca a versão fixada (lê o SHA-256 do GitHub)
//
// No Windows usa o tar.exe do sistema (bsdtar: abre zip e recusa ".." e caminhos absolutos).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARTES_ONDE_CACAR } from '../app/extensoes.mjs';

export const REPO = 'paulozy/onde-cacar';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const AGENTE = { 'user-agent': 'pokeidle-multiconta-build' };

/** Escolhe o zip para Chrome/Edge/Opera na resposta da API de releases; exige o digest SHA-256. */
export function escolherZip(release) {
  const a = (release?.assets ?? []).find((x) => /^onde-cacar-[\d.]+-chrome-edge-opera\.zip$/.test(x?.name ?? ''));
  if (!a) throw new Error(`a release ${release?.tag_name ?? '?'} não tem o zip chrome-edge-opera`);
  const m = /^sha256:([0-9a-f]{64})$/.exec(a.digest ?? '');
  if (!m) throw new Error(`o GitHub não informou o SHA-256 de ${a.name}`);
  if (!/^https:\/\/github\.com\//.test(a.browser_download_url ?? '')) throw new Error('endereço de download inesperado');
  return { nome: a.name, url: a.browser_download_url, sha256: m[1], tag: release.tag_name };
}

/** A versão fixada no package.json: { tag, sha256 }. */
export function versaoFixada(pacote) {
  const o = pacote?.ondeCacar;
  if (!/^v\d+\.\d+\.\d+$/.test(o?.tag ?? '') || !/^[0-9a-f]{64}$/.test(o?.sha256 ?? '')) throw new Error('package.json sem "ondeCacar": { "tag": "vX.Y.Z", "sha256": "…" }');
  return { tag: o.tag, sha256: o.sha256 };
}

export const confereSha256 = (dados, esperado) => createHash('sha256').update(dados).digest('hex') === esperado;

async function release(tag) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`, { headers: { accept: 'application/vnd.github+json', ...AGENTE } });
  if (!r.ok) throw new Error(`API do GitHub respondeu ${r.status} para ${tag}`);
  return escolherZip(await r.json());
}

async function baixar() {
  const arqPacote = join(RAIZ, 'package.json');
  const fixada = versaoFixada(JSON.parse(readFileSync(arqPacote, 'utf8')));
  const zip = await release(fixada.tag);
  if (zip.sha256 !== fixada.sha256) throw new Error(`o arquivo da release ${fixada.tag} mudou (SHA-256 do GitHub ${zip.sha256}, fixado ${fixada.sha256})`);
  const d = await fetch(zip.url, { headers: AGENTE });
  if (!d.ok) throw new Error(`download respondeu ${d.status}`);
  const dados = Buffer.from(await d.arrayBuffer());
  if (!confereSha256(dados, fixada.sha256)) throw new Error(`SHA-256 de ${zip.nome} não confere com o fixado`);

  const build = join(RAIZ, 'build'), destino = join(build, 'onde-cacar'), arq = join(build, zip.nome);
  mkdirSync(build, { recursive: true });
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino);
  writeFileSync(arq, dados);
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'; // não o GNU tar do Git
  execFileSync(tar, ['-xf', arq, '-C', destino], { stdio: 'inherit' });
  rmSync(arq);
  for (const p of PARTES_ONDE_CACAR) if (!existsSync(join(destino, p))) throw new Error(`o zip não tem ${p}`);
  const versao = JSON.parse(readFileSync(join(destino, 'manifest.json'), 'utf8')).version;
  console.log(`Onde Caçar ${versao} (${zip.tag}) em build/onde-cacar, SHA-256 ${zip.sha256}`);
}

async function fixar(tag) {
  const zip = await release(tag);
  const arqPacote = join(RAIZ, 'package.json');
  const pacote = JSON.parse(readFileSync(arqPacote, 'utf8'));
  pacote.ondeCacar = { tag: zip.tag, sha256: zip.sha256 };
  writeFileSync(arqPacote, `${JSON.stringify(pacote, null, 2)}\n`);
  console.log(`package.json: Onde Caçar fixado em ${zip.tag} (SHA-256 ${zip.sha256}). Confira a release antes de fazer o commit.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, tag] = process.argv.slice(2);
  (cmd === 'fixar' ? fixar(tag) : baixar()).catch((e) => { console.error(`erro: ${e.message}`); process.exitCode = 1; });
}

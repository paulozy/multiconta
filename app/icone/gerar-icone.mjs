// Regera o icone.ico a partir do icone.svg, desenhando cada tamanho com o Edge headless (perfil
// temporário, nada do seu Edge é usado). Só é preciso rodar quando o SVG mudar; o .ico vai no git.
// Uso (Windows): node app/icone/gerar-icone.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { montarIco, tamanhoPng } from './ico.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const TAMANHOS = [16, 20, 24, 32, 40, 48, 64, 256];
const EDGE = ['ProgramFiles(x86)', 'ProgramFiles'].map((v) => join(process.env[v] ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'));

const edge = EDGE.find((e) => existsSync(e));
if (!edge) throw new Error('não achei o msedge.exe');
const tmp = mkdtempSync(join(tmpdir(), 'multiconta-icone-'));
try {
  const svg = readFileSync(join(AQUI, 'icone.svg'), 'utf8');
  const pngs = TAMANHOS.map((t) => {
    const html = join(tmp, `${t}.html`), png = join(tmp, `${t}.png`);
    writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${t}px;height:${t}px}</style>${svg}`);
    execFileSync(edge, [
      '--headless', `--user-data-dir=${join(tmp, 'perfil')}`, '--disable-gpu', '--hide-scrollbars',
      '--default-background-color=00000000', `--window-size=${t},${t}`, `--screenshot=${png}`, pathToFileURL(html).href,
    ], { stdio: 'ignore', timeout: 60_000 });
    const b = readFileSync(png);
    const { largura, altura } = tamanhoPng(b);
    if (largura !== t || altura !== t) throw new Error(`o Edge desenhou ${largura}x${altura} em vez de ${t}x${t}`);
    return b;
  });
  writeFileSync(join(AQUI, 'icone.ico'), montarIco(pngs));
  writeFileSync(join(AQUI, 'icone-256.png'), pngs.at(-1));
  console.log(`icone.ico gerado (${TAMANHOS.join(', ')} px)`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

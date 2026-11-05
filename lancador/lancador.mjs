// Lançador multiconta (a reserva do app, só para quem desenvolve): abre cada conta do PokeIdle num Edge com pasta de
// dados própria, em janela de app, lado a lado, com o Onde Caçar e o rótulo da conta. Roda no
// Windows (node.exe).
//
//   node lancador.mjs abrir [conta ...]               abre as contas (todas, se nenhuma for dada)
//   node lancador.mjs fechar [conta ...]              fecha como o "X" da janela
//   node lancador.mjs perfis                           lista os perfis do seu Edge
//   node lancador.mjs importar "<perfil>" <conta>      copia um perfil do Edge já logado
//                                                      ("Perfil 2", como o Edge mostra, ou a pasta)
//        --so-sessao   copia só o Local Storage (o token do jogo), sem o resto do perfil
//        --forcar      copia mesmo sem achar a sessão do pokeidle.io no perfil
//   node lancador.mjs extensoes <conta>                abre uma janela normal da conta, para ligar o
//                                                      modo de desenvolvedor em edge://extensions
//   node lancador.mjs instalar                         copia para %LOCALAPPDATA%\PokeIdleMulticonta\app
//                                                      e cria os atalhos (Área de Trabalho e Iniciar)
//   node lancador.mjs desinstalar                      tira os atalhos e o app\ (perfis e contas.json ficam)
//        --pausar      (usado pelos atalhos) se houver aviso ou erro, espera Enter antes de fechar
import { spawn } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lerConfig } from './config.mjs';
import { lerLocalState, pastaUserData, perfisDoEdge, resolverPerfil } from '../app/edge.mjs';
import { cloneAcessivel, copiarOndeCacar, decidirOndeCacar, gerarRotulo } from '../app/extensoes.mjs';
import { comTrava } from './trava.mjs';
import { conferirOrigem, copiarConta, planoDeImportacao } from './importar.mjs';
import { ATALHOS_ANTIGOS_NA_AREA, ATALHOS_GERAIS, copiarApp, linhaDeComando, planoDeAtalhos, SCRIPT_ATALHOS } from './instalar.mjs';
import { areaDeTrabalho, estadoDoArquivo, fecharPids, focarPids, ilegiveis, pastaEmUso, pidsDaConta, processosRaiz, ps } from './janelas.mjs';
import { avisos, lerPreferences, lerSecurePreferences, saudeCompleta } from './saude.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = join(AQUI, '..'); // contas.json e app/ (rotulo/ e os módulos comuns) ficam ao lado de lancador/
const RAIZ = join(process.env.LOCALAPPDATA ?? '', 'PokeIdleMulticonta');
const EXT = join(RAIZ, 'ext');
const EDGE_PADRAO = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_JOGO = 'https://pokeidle.io/app';
let cfg; // lido só quando o lançador roda (os testes importam o módulo sem contas.json)

const pastaPerfil = (c) => join(RAIZ, 'perfis', c.id);
const edge = () => cfg.edge ?? EDGE_PADRAO;

// ---- funções puras (testadas) ------------------------------------------------------------------
export function grade(n, area) {
  const cols = n <= 1 ? 1 : 2, linhas = Math.ceil(n / cols);
  const w = Math.floor(area.w / cols), h = Math.floor(area.h / linhas);
  return Array.from({ length: n }, (_, i) => ({ x: area.x + (i % cols) * w, y: area.y + Math.floor(i / cols) * h, w, h }));
}

/** Linha de comando do Edge de uma conta. */
export function flags({ pasta, pos, exts }) {
  return [
    `--user-data-dir=${pasta}`,
    `--app=${URL_JOGO}`,
    `--window-position=${pos.x},${pos.y}`,
    `--window-size=${pos.w},${pos.h}`,
    '--no-first-run', '--no-default-browser-check',
    // contra estrangulamento em segundo plano / janela coberta ou minimizada
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
    ...(exts.length ? [`--load-extension=${exts.join(',')}`] : []),
  ];
}

/**
 * Argumentos para abrir uma janela NORMAL dentro da instância que já roda a conta: sem --app (nada
 * de jogo, nada de hello extra) e sem flags, que a instância aberta ignora de qualquer jeito.
 */
export const argsJanelaNormal = (pastaConta) => [`--user-data-dir=${pastaConta}`, 'about:blank'];

// ---- saída ----------------------------------------------------------------------------------------
// avisar() marca que houve algo para ler: com --pausar (atalhos) a janela espera Enter antes de fechar.
let houveAviso = false;
export const avisar = (msg) => { houveAviso = true; console.log(msg); };
export const precisaPausar = () => houveAviso;

// O Edge herda a pasta de trabalho de quem o abre; uma pasta em uso não pode ser renomeada nem
// apagada no Windows. Abrir sempre a partir da pasta de dados deixa app\ livre para reinstalar.
const abrirEdge = (args) => spawn(edge(), args, { cwd: RAIZ, detached: true, stdio: 'ignore' }).unref();

// ---- comandos ------------------------------------------------------------------------------------
// um abrir por vez: dois ao mesmo tempo veriam a mesma conta fechada (ver trava.mjs)
const abrir = (ids) => comTrava(join(RAIZ, 'abrir.trava'), () => abrirAgora(ids));

function abrirAgora(ids) {
  const procs = processosRaiz();
  const contas = cfg.contas.filter((c) => !ids.length || ids.includes(c.id));
  const naoLidos = ilegiveis(procs);
  if (naoLidos.length) {
    throw new Error(`há Edge aberto cuja linha de comando o Windows não deixa ler (PID ${naoLidos.join(', ')}, talvez como administrador); pode ser uma das contas, então não abro nada. Feche esse Edge e tente de novo.`);
  }

  // Chamar o Edge de novo com a mesma pasta NÃO só traz a janela para frente: a instância que já
  // roda abre outra janela --app, que manda outro hello e derruba a sessão. Conta aberta: só focar.
  const fechadas = [];
  for (const c of contas) {
    const pids = pidsDaConta(procs, pastaPerfil(c));
    if (!pids.length) fechadas.push(c);
    else if (focarPids(pids)) console.log(`[${c.id}] já estava aberta: janela trazida para frente`);
    else avisar(`[${c.id}] o Edge desta conta segue rodando sem janela (segundo plano): rode "node lancador.mjs fechar ${c.id}" e abra de novo`);
  }
  if (!fechadas.length) return;

  // Onde Caçar: só troca a cópia se nenhum Edge a tiver carregada; se a troca falhar, usa a anterior
  const onde = join(EXT, 'onde-cacar');
  const copiaExiste = () => existsSync(join(onde, 'manifest.json'));
  let decisao = decidirOndeCacar({
    clone: cfg.ondeCacar, cloneAcessivel: cfg.ondeCacar ? cloneAcessivel(cfg.ondeCacar) : false,
    copiaExiste: copiaExiste(), algumaAberta: pastaEmUso(procs, onde),
  });
  if (decisao.acao === 'copiar') {
    try { copiarOndeCacar(cfg.ondeCacar, onde); }
    catch (e) { decisao = copiaExiste() ? { acao: 'manter', aviso: `${e.message}; usando a cópia anterior` } : { acao: 'sem', aviso: `${e.message}; as contas abrem sem o Onde Caçar` }; }
  }
  if (decisao.aviso) avisar(`atenção: ${decisao.aviso}`);

  // tudo preparado antes do primeiro spawn: um erro aqui não deixa metade das contas abertas
  const pos = grade(cfg.contas.length, areaDeTrabalho());
  const preparadas = fechadas.map((c) => {
    const exts = [...(decisao.acao === 'sem' ? [] : [onde]), gerarRotulo(join(RAIZ_REPO, 'app', 'rotulo'), join(EXT, `rotulo-${c.id}`), c)];
    return { c, args: flags({ pasta: pastaPerfil(c), pos: c.janela ?? pos[cfg.contas.indexOf(c)], exts }) };
  });
  for (const { c, args } of preparadas) {
    // confere de novo logo antes: a conta pode ter sido aberta à mão enquanto preparávamos
    if (pidsDaConta(processosRaiz(), pastaPerfil(c)).length) { avisar(`[${c.id}] foi aberta enquanto eu preparava: deixei como está`); continue; }
    if (!existsSync(pastaPerfil(c))) avisar(`[${c.id}] perfil novo: faça o login na janela que abrir`);
    else avisarSaude(c);
    abrirEdge(args);
    console.log(`[${c.id}] aberta (${c.rotulo})`);
  }
}

function fechar(ids) {
  const procs = processosRaiz();
  for (const c of cfg.contas.filter((x) => !ids.length || ids.includes(x.id))) {
    const pids = pidsDaConta(procs, pastaPerfil(c));
    if (!pids.length) { console.log(`[${c.id}] não estava aberta`); continue; }
    const { forcados, vivos } = fecharPids(pids);
    if (vivos) avisar(`[${c.id}] não consegui fechar o Edge desta conta (PID ${pids.join(', ')}): feche pelo Gerenciador de Tarefas`);
    else console.log(`[${c.id}] fechada${forcados ? ' (o Edge não saiu sozinho a tempo e foi encerrado)' : ''}`);
  }
}

// com o perfil fechado o arquivo está estável: avisa antes de abrir se o Onde Caçar vai faltar.
// É só um aviso: se não der para ler, a conta abre do mesmo jeito.
function avisarSaude(c) {
  try {
    const seguras = lerSecurePreferences(pastaPerfil(c));
    if (!seguras) return;
    // o Preferences à parte: se ele falhar, os avisos das extensões continuam valendo
    let prefs = null;
    try { prefs = lerPreferences(pastaPerfil(c)); } catch { /* suspensão fica desconhecida */ }
    for (const a of avisos(saudeCompleta(seguras, prefs, EXT), c.id)) avisar(`[${c.id}] atenção: ${a}`);
  } catch (e) {
    avisar(`[${c.id}] atenção: não deu para conferir as extensões (${e.message})`);
  }
}

// edge://extensions não abre pela linha de comando e a janela de app não tem barra de endereço.
// Só com a conta ABERTA: com ela fechada, uma janela normal seguiria a inicialização do perfil e
// poderia restaurar uma aba antiga do pokeidle.io (outra sessão).
function extensoes(id) {
  const c = cfg.contas.find((x) => x.id === id);
  if (!existsSync(pastaPerfil(c))) throw new Error(`a conta ${id} ainda não tem perfil: importe ou abra ela primeiro`);
  const pids = pidsDaConta(processosRaiz(), pastaPerfil(c));
  if (!pids.length) throw new Error(`abra a conta antes (node lancador.mjs abrir ${id}) e rode este comando de novo`);
  abrirEdge(argsJanelaNormal(pastaPerfil(c)));
  console.log(`[${id}] janela normal aberta. O Edge pode chamá-la de "Perfil 1" (nome herdado na cópia), mas é a conta ${c.rotulo}, não o seu perfil pessoal. Nela:`);
  console.log('  1. digite edge://extensions na barra de endereço');
  console.log('  2. ligue "Modo de desenvolvedor" (canto da página)');
  console.log(`  3. confira que "Onde Caçar" e "PokeIdle · ${c.rotulo}" estão ativadas`);
  console.log('  4. digite edge://settings/system e desligue as guias em suspensão (este perfil é só do jogo;');
  console.log('     ou, se preferir, adicione pokeidle.io em "nunca colocar estes sites em suspensão")');
  console.log('  5. feche só essa janela normal');
}

function instalar() {
  const app = join(RAIZ, 'app');
  if (resolve(RAIZ_REPO).toLowerCase() === resolve(app).toLowerCase()) throw new Error('rode o "instalar" a partir do repositório, não da cópia instalada');
  const arquivos = copiarApp(RAIZ_REPO, app);
  console.log(`lançador copiado para ${app} (${arquivos.join(', ')})`);
  // o contas.json mora na pasta de dados; só é trazido do repositório na primeira vez
  const dados = join(RAIZ, 'contas.json'), doRepo = join(RAIZ_REPO, 'contas.json');
  if (!existsSync(dados) && existsSync(doRepo)) {
    cpSync(doRepo, dados);
    console.log(`contas.json copiado para ${dados}`);
  } else if (existsSync(dados) && existsSync(doRepo) && readFileSync(dados, 'utf8') !== readFileSync(doRepo, 'utf8')) {
    avisar(`atenção: o contas.json do repositório é diferente do que vale (${dados}); o lançador usa o da pasta de dados. Edite esse.`);
  }
  const conf = lerConfig([RAIZ, app]);
  console.log(`contas de ${conf.caminho}: ${conf.contas.map((c) => c.id).join(', ')}`);
  if (conf.arquivo !== 'contas.json') avisar(`atenção: ainda não há contas.json; os atalhos seguem o exemplo. Crie ${dados} e rode "instalar" de novo.`);
  // fnm cria um node.exe temporário por terminal: o atalho quebraria quando a pasta sumisse
  if (/fnm_multishells/i.test(process.execPath)) avisar(`atenção: o node.exe deste terminal é temporário (${process.execPath}); instale a partir de um node fixo para os atalhos não quebrarem.`);
  const plano = planoDeAtalhos(conf.contas, { node: process.execPath, script: join(app, 'lancador', 'lancador.mjs'), icone: `${conf.edge ?? EDGE_PADRAO},0` });
  const lista = plano.map((a) => ({ ...a, linha: linhaDeComando(a.args), pastaTrabalho: RAIZ }));
  const n = ps(SCRIPT_ATALHOS, { ATALHOS: JSON.stringify(lista), GERAIS: JSON.stringify(ATALHOS_GERAIS), ANTIGOS: JSON.stringify(ATALHOS_ANTIGOS_NA_AREA) });
  console.log(`${n} atalhos criados com ${process.execPath}: ${[...new Set(plano.map((a) => a.nome.replace(/\.lnk$/, '')))].join(', ')}`);
}

function desinstalar() {
  // o app\ primeiro: se ele estiver em uso, os atalhos ficam (ainda funcionam) e o erro diz por quê
  const app = join(RAIZ, 'app');
  try { rmSync(app, { recursive: true, force: true }); }
  catch (e) { throw new Error(`não consegui apagar ${app} (${e.code ?? e.message}); feche as contas e o que estiver usando essa pasta e tente de novo. Os atalhos não foram mexidos.`); }
  ps(SCRIPT_ATALHOS, { REMOVER: '1', GERAIS: JSON.stringify(ATALHOS_GERAIS), ANTIGOS: JSON.stringify(ATALHOS_ANTIGOS_NA_AREA) });
  console.log(`atalhos e ${app} removidos. Os perfis das contas (com o login) e o contas.json continuam em ${RAIZ}.`);
}

function perfis() {
  for (const p of perfisDoEdge(lerLocalState(pastaUserData(process.env.LOCALAPPDATA)))) console.log(`${p.nome.padEnd(24)} ${p.pasta}`);
}

function importar(nomePerfil, id, { soSessao = false, forcar = false } = {}) {
  const c = cfg.contas.find((x) => x.id === id);
  const userData = pastaUserData(process.env.LOCALAPPDATA);
  const { pasta: pastaEdge, nome } = resolverPerfil(lerLocalState(userData), nomePerfil);
  const destino = pastaPerfil(c);
  conferirOrigem({ userData, pastaPerfil: pastaEdge, nomePerfil: nome, destino, forcar, emUso: (arq) => estadoDoArquivo(arq) });
  copiarConta(planoDeImportacao({ userData, pastaPerfil: pastaEdge, destino, soSessao }), destino);
  console.log(`[${id}] importado de "${nome}" (${soSessao ? 'só a sessão' : 'perfil completo'}).`);
  console.log(`[${id}] Uma vez só: abra a conta e, com ela aberta, rode "node lancador.mjs extensoes ${id}" para ligar o modo de desenvolvedor (sem ele o Edge pode desativar o Onde Caçar).`);
  console.log(`[${id}] Não abra o pokeidle.io em "${nome}" enquanto esta conta estiver aberta no lançador: a sessão de um derruba a do outro.`);
}

// ---- linha de comando ----------------------------------------------------------------------------
const USO = 'uso: node lancador.mjs abrir [conta ...] | fechar [conta ...] | perfis | importar [--so-sessao] [--forcar] "<perfil>" <conta> | extensoes <conta> | instalar | desinstalar';

// contas pedidas na linha de comando: nenhuma = todas; id desconhecido é erro (não some calado)
function contasPedidas(ids) {
  const desconhecidas = ids.filter((id) => !cfg.contas.some((c) => c.id === id));
  if (desconhecidas.length) throw new Error(`conta(s) ${desconhecidas.join(', ')} não está(ão) no ${cfg.caminho}. Contas: ${cfg.contas.map((c) => c.id).join(', ')}`);
  return ids;
}

const OPCOES = new Set(['--so-sessao', '--forcar', '--pausar']);
/** Opção digitada errado é erro: "--so-sesao" não pode virar uma cópia do perfil inteiro. */
export function conferirOpcoes(argv) {
  const ruins = argv.filter((a) => a.startsWith('-') && !OPCOES.has(a));
  if (ruins.length) throw new Error(`opção desconhecida: ${ruins.join(', ')}\n${USO}`);
}

// só age quando chamado direto (os testes importam o módulo)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const [cmd, ...resto] = argv.filter((a) => !a.startsWith('-'));
  // atalho: a janela do console só fica aberta se houver algo para ler (aviso ou erro)
  if (argv.includes('--pausar')) {
    process.on('beforeExit', () => {
      if (!precisaPausar()) return;
      houveAviso = false; // beforeExit volta a disparar depois do Enter
      process.stdout.write('\nPressione Enter para fechar esta janela.');
      process.stdin.once('data', () => process.stdin.pause());
    });
  }
  try {
    conferirOpcoes(argv);
    if (!process.env.LOCALAPPDATA) throw new Error('rode no Windows com o node.exe (LOCALAPPDATA não está definido)');
    if (cmd === 'perfis') perfis();
    else {
      cfg = lerConfig([RAIZ, RAIZ_REPO]); // pasta de dados primeiro: sobrevive a reinstalar
      if (cmd === 'abrir') abrir(contasPedidas(resto));
      else if (cmd === 'fechar') fechar(contasPedidas(resto));
      else if (cmd === 'importar') {
        if (resto.length !== 2) throw new Error(USO);
        importar(resto[0], contasPedidas([resto[1]])[0], { soSessao: argv.includes('--so-sessao'), forcar: argv.includes('--forcar') });
      } else if (cmd === 'extensoes') {
        if (resto.length !== 1) throw new Error(USO);
        extensoes(contasPedidas(resto)[0]);
      } else if (cmd === 'instalar') instalar();
      else if (cmd === 'desinstalar') desinstalar();
      else console.log(USO);
    }
  } catch (e) {
    houveAviso = true;
    console.error(`erro: ${e.message}`);
    process.exitCode = 1;
  }
}

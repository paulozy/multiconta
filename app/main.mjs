// App multiconta: as contas do PokeIdle numa janela só, em mosaico.
// Uma BaseWindow com a barra no topo e uma WebContentsView por conta, cada uma na partição
// persistente da conta ("persist:<id>"), com o Onde Caçar e o rótulo carregados como extensões.
// Travas: uma conta por célula (reserva do nick antes do hello), navegação só no jogo e no login,
// e permissões só de avisos. Barra no topo com o estado de cada conta e os controles (ampliar,
// som, recarregar; Ctrl+1..N e Ctrl+0), e o estado da janela gravado em electron\estado.json.
import { app, BaseWindow, BrowserWindow, dialog, ipcMain, Menu, screen, session, shell, webContents, WebContentsView } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aplicarPedidoDeConfig, configPadrao, gravarConfigApp, lerConfigApp, MAX_CONTAS, novoId } from './config.mjs';
import { cloneAcessivel, copiarExtensao, copiarOndeCacar, fonteOndeCacar, gerarRotulo, lerManifesto, planoOndeCacar } from './extensoes.mjs';
import { estadoDasSessoes, levarSessao, pastaParticao, particao } from './sessoes.mjs';
import { temSessaoPokeidle } from './importar.mjs';
import { localStorageDoPerfil, navegadoresComPerfis } from './navegadores.mjs';
import { executarPendencias, gravarPendencias, juntarPendencias, lerPendencias } from './pendencias.mjs';
import { estadoDoArquivo } from './powershell.mjs';
import { conteudoDaCelula, extensoesDaConta, paginaAviso, URL_JOGO } from './celulas.mjs';
import { atualizarOndeCacar, versaoValida } from './atualizar.mjs';
import { PAGINA_RELEASES, procurarVersaoNova } from './novidades.mjs';
import { calcularLayout, tamanhoCompacto } from './layout.mjs';
import { acaoDaTecla, comandoValido, janelaVisivel, nickDaPagina, normalizarResumo, normalizarSalvo, retratoDaBarra, statusDaPagina } from './estado.mjs';
import { permissaoLiberada } from './navegacao.mjs';
import { criarReservas } from './reservas.mjs';
import { criarTravas } from './travas.mjs';
import { criarRegistro, ignorarSaidaFechada } from './registro.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(process.env.LOCALAPPDATA ?? '', 'PokeIdleMulticonta');
// cópias das extensões (o Onde Caçar e o rótulo de cada conta); "ext" é do lançador do Edge, que pode
// estar aberto usando a dele
const EXT = join(RAIZ, 'ext-app');
const EXTRAS = join(EXT, 'extras'); // extensões escolhidas pelo usuário, uma pasta por id
const REPOSITORIO_ONDE_CACAR = 'https://github.com/paulozy/onde-cacar';
const ENV_NAV = { localAppData: process.env.LOCALAPPDATA, appData: process.env.APPDATA };

// os dados do Electron (partições das contas, estado da janela) moram ao lado dos perfis do A
app.setPath('userData', join(RAIZ, 'electron'));

// mensagens e avisos vão para electron\registro.log; console fechado não derruba o app
ignorarSaidaFechada();
const registrar = criarRegistro(join(RAIZ, 'electron', 'registro.log'));
process.on('warning', (w) => registrar('aviso do Node:', w));
app.setAppUserModelId('io.github.paulozy.multiconta'); // = appId do instalador (package.json): avisos do Windows saem com o nome do app

// contra estrangulamento em segundo plano / janela minimizada (as mesmas flags do lançador do Edge)
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,IntensiveWakeUpThrottling');
// só para testes de aceite (lê o contador de abates de fora); nunca no uso normal. Com ela ligada,
// qualquer programa da máquina lê os tokens: por isso o título da janela avisa, e o app instalado
// pelo instalador (empacotado) nunca a abre.
const PORTA_TESTE = !app.isPackaged && /^\d{4,5}$/.test(process.env.MULTICONTA_PORTA_TESTE ?? '') ? process.env.MULTICONTA_PORTA_TESTE : null;
if (PORTA_TESTE) app.commandLine.appendSwitch('remote-debugging-port', PORTA_TESTE);

// um app só: abrir de novo traz a janela que já existe (e a segunda cópia sai sem abrir nada)
const primeira = app.requestSingleInstanceLock();
if (!primeira) app.quit();

const seguro = { sandbox: true, contextIsolation: true, nodeIntegration: false };
const origemDe = (url) => { try { return new URL(url).origin; } catch { return null; } };

// reserva do nick (window.multiconta.reservar, no preload): só a primeira célula com a conta entra
const reservas = criarReservas((id) => { const w = webContents.fromId(id); return !!w && !w.isDestroyed(); });
const travas = criarTravas({ reservas, abrirFora: (url) => shell.openExternal(url).catch(() => {}) });
ipcMain.on('multiconta:reservar', (ev, nick) => {
  const quadro = ev.senderFrame;
  const pode = travas.aoReservar({ dono: ev.sender.id, nick, origemDoQuadro: quadro?.origin, quadroPrincipal: !!quadro && quadro === ev.sender.mainFrame });
  ev.returnValue = pode; // returnValue só ENVIA a resposta; lê-lo de volta dá undefined
  if (!pode) {
    const outro = webContents.fromId(reservas.donoDe(String(nick)) ?? -1);
    registrar(`a conta ${String(nick).slice(0, 40)} já está em outra célula: esta (${ev.sender.id}, ${ev.sender.getURL().slice(0, 60)}) não vai conectar; quem tem a conta: ${outro ? `${outro.id}, ${outro.getURL().slice(0, 60)}` : 'nenhuma célula viva'}`);
  }
});

/** Travas de uma célula do jogo: navegação, redirecionamentos, janelas novas e reservas. */
function travarCelula(wc) {
  const id = wc.id;
  wc.on('will-navigate', (ev, url) => { if (travas.aoNavegar(id, url, wc.getURL())) ev.preventDefault(); });
  wc.on('will-redirect', (ev, url, _noLugar, principalAntigo) => {
    const principal = ev.isMainFrame ?? principalAntigo; // o Electron mudou onde manda essa informação
    if (travas.aoRedirecionar(id, url, principal, wc.getURL())) ev.preventDefault();
  });
  // janela nova só para o login (Google/Discord), na mesma sessão da conta; o resto vai para fora
  wc.setWindowOpenHandler(({ url }) => (travas.aoAbrirJanela(id, url, wc.getURL()) === 'allow'
    ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } }
    : { action: 'deny' }));
  wc.on('did-create-window', (filha) => travarCelula(filha.webContents)); // a janela de login segue as mesmas regras
  // só solta a conta quando a página foi trocada de verdade (navegação cancelada não conta), caiu ou fechou
  wc.on('did-navigate', () => travas.aoLiberar(id));
  wc.on('render-process-gone', () => travas.aoLiberar(id));
  wc.on('destroyed', () => travas.aoLiberar(id));
}

/** Barra e células de aviso: não navegam nem abrem nada (nem arrastando um link para cima delas). */
function travarFixa(wc) {
  wc.on('will-navigate', (ev) => ev.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
}

/** Uma vez por partição: só avisos podem ser pedidos. */
function travarSessao(ses) {
  ses.setPermissionRequestHandler((_wc, permissao, responder, detalhes) => responder(permissaoLiberada(permissao, detalhes?.requestingUrl)));
  ses.setPermissionCheckHandler((_wc, permissao, origem) => permissaoLiberada(permissao, origem));
}
if (primeira) app.whenReady().then(async () => {
  Menu.setApplicationMenu(null); // o menu padrão do Electron (File/Edit/View) não serve para nada aqui
  // a sessão padrão (barra, avisos) não tem jogo nenhum: nega toda permissão
  session.defaultSession.setPermissionRequestHandler((_wc, _p, responder) => responder(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  // configuração estragada não pode deixar o app sem janela (e preso no "um app só"): abre sem contas e
  // avisa, sem gravar por cima do arquivo
  const avisosConfig = [];
  let cfg, configEstragado = false;
  try {
    mkdirSync(RAIZ, { recursive: true });
    const lida = lerConfigApp(RAIZ);
    cfg = lida.cfg;
    if (lida.origem === 'contas.json') { // contas trazidas do lançador: daqui em diante vale o config.json
      try { gravarConfigApp(RAIZ, cfg); } catch (e) { avisosConfig.push(`não consegui gravar o config.json: ${e.message}`); }
    }
  } catch (e) {
    cfg = configPadrao();
    configEstragado = true;
    avisosConfig.push(`${e.message.replace(/\n/g, ' ')} (o app abriu sem contas; corrija ou apague o arquivo)`);
  }
  const ARQ_ESTADO = join(app.getPath('userData'), 'estado.json');
  let salvo = {};
  try { salvo = JSON.parse(readFileSync(ARQ_ESTADO, 'utf8')); } catch { /* primeira vez ou arquivo ruim: padrões */ }
  const est = normalizarSalvo(salvo, cfg.contas);
  const status = {}, nicks = {}, resumos = {}, problemas = [...avisosConfig];
  if (!cfg.contas.length && !avisosConfig.length) problemas.push('nenhuma conta ainda: use ⚙ para adicionar');
  const celulas = []; // { c, v, ses, rotulo } na ordem do config.json (= ordem da grade e de Ctrl+1..N); ses só nas do jogo
  const ondeCacar = { versao: null, atualizando: false, pronto: false }; // o que a barra mostra no botão de atualizar
  let versaoNova = null; // do app, publicada no GitHub (só no app instalado pelo instalador)
  const contaDoWc = new Map();
  const semLogin = new Set(); // contas na tela de entrar do jogo: saem daqui quando conectam

  const TITULO = PORTA_TESTE ? `PokeIdle · Multiconta · PORTA DE TESTE ${PORTA_TESTE} ABERTA` : 'PokeIdle · Multiconta';
  const telas = screen.getAllDisplays().map((d) => d.workArea);
  const faixa = tamanhoCompacto(cfg.contas.length, screen.getPrimaryDisplay().workArea.width);
  // compacto: abre já como faixa, onde ela estava (o tamanho do mosaico fica guardado para a volta)
  const lugar = est.compacto
    ? { ...(est.posCompacta && janelaVisivel({ ...est.posCompacta, ...faixa }, telas) ? est.posCompacta : {}), ...faixa }
    : janelaVisivel(est.janela, telas) ? est.janela : { width: 1600, height: 900 };
  const janela = new BaseWindow({ ...lugar, title: TITULO, backgroundColor: '#15161a', icon: join(AQUI, 'icone', 'icone.ico') });
  if (est.compacto) { janela.setContentSize(faixa.width, faixa.height); janela.setMaximizable(false); janela.setResizable(false); }
  else if (est.janela?.maximizada) janela.maximize();

  const barra = new WebContentsView({ webPreferences: { ...seguro, preload: join(AQUI, 'barra', 'preload-barra.cjs') } });
  travarFixa(barra.webContents);
  janela.contentView.addChildView(barra);
  const atualizarBarra = () => {
    if (!barra.webContents.isDestroyed()) barra.webContents.send('barra:retrato', retratoDaBarra({ contas: cfg.contas, ampliada: est.ampliada, mudo: est.mudo, status, nicks, problemas, resumos, compacto: est.compacto, ondeCacar, versaoNova }));
  };
  const mudarStatus = (id, s) => { if (status[id] !== s) { status[id] = s; atualizarBarra(); } };

  // ---- layout, gravação e comandos: tudo pronto ANTES do primeiro await (uma tecla ou mensagem que
  // chegue enquanto as extensões carregam não pode cair no vazio nem achar nada por definir)
  const aplicar = () => {
    if (janela.isDestroyed()) return;
    const { width, height } = janela.getContentBounds();
    const ampliadaVisivel = celulas.findIndex(({ c }) => c.id === est.ampliada);
    const l = calcularLayout({ largura: width, altura: height, n: celulas.length, ampliada: ampliadaVisivel >= 0 ? ampliadaVisivel : null, compacto: est.compacto });
    barra.setBounds(l.barra);
    celulas.forEach(({ v }, i) => { v.setBounds(l.celulas[i]); v.setVisible(l.celulas[i].visivel); });
  };
  const gravarAgora = () => {
    // minimizada, o Windows pode dizer que não está maximizada: guarda o que já se sabia.
    // No compacto só a posição da faixa muda; o tamanho do mosaico fica para a volta.
    if (!janela.isDestroyed() && !janela.isMinimized()) {
      if (est.compacto) { const { x, y } = janela.getBounds(); est.posCompacta = { x, y }; }
      else est.janela = { ...janela.getNormalBounds(), maximizada: janela.isMaximized() };
    }
    try { writeFileSync(ARQ_ESTADO, JSON.stringify(est, null, 2)); } catch (e) { registrar('não consegui gravar o estado:', e); }
  };
  let gravar = null;
  const salvar = () => { clearTimeout(gravar); gravar = setTimeout(gravarAgora, 500); };

  // compacto: a janela vira a faixa da barra; as contas seguem rodando escondidas
  const areaDaTela = () => screen.getDisplayMatching(janela.getBounds()).workArea;
  // a faixa não maximiza nem muda de tamanho (só se move); cabe na largura da tela em que está
  const travarFaixa = (sim) => { janela.setMaximizable(!sim); janela.setResizable(!sim); };
  const aplicarFaixa = () => {
    const tela = areaDaTela(), t = tamanhoCompacto(cfg.contas.length, tela.width);
    const p = est.posCompacta && janelaVisivel({ ...est.posCompacta, ...t }, screen.getAllDisplays().map((d) => d.workArea)) ? est.posCompacta : janela.getBounds();
    janela.setPosition(Math.min(p.x, tela.x + tela.width - t.width), p.y);
    janela.setContentSize(t.width, t.height);
    travarFaixa(true);
  };
  const entrarCompacto = () => {
    if (!janela.isMinimized()) est.janela = { ...janela.getNormalBounds(), maximizada: janela.isMaximized() };
    est.compacto = true;
    // sair do maximizado é assíncrono no Windows: a faixa só é aplicada depois
    if (janela.isMaximized()) { janela.once('unmaximize', aplicarFaixa); janela.unmaximize(); }
    else aplicarFaixa();
    barra.webContents.focus(); // as teclas não vão para um jogo escondido
  };
  const sairCompacto = () => {
    est.compacto = false;
    if (!janela.isMinimized() && !janela.isMaximized()) { const { x, y } = janela.getBounds(); est.posCompacta = { x, y }; }
    travarFaixa(false);
    if (janela.isMaximized()) janela.unmaximize();
    janela.setBounds(est.janela && janelaVisivel(est.janela, screen.getAllDisplays().map((d) => d.workArea)) ? est.janela : { ...(est.posCompacta ?? {}), width: 1600, height: 900 });
    if (est.janela?.maximizada) janela.maximize();
  };

  let atualizar = () => {}; // definido depois de achar a cópia do Onde Caçar (antes disso o botão não faz nada)
  const executar = ({ acao, id }) => {
    const cel = celulas.find((x) => x.c.id === id);
    if (acao === 'atualizar') { atualizar(); return; }
    if (acao === 'config') { if (ondeCacar.pronto) abrirConfig(); return; } // durante a abertura, não
    if (acao === 'novidade') { if (versaoNova) shell.openExternal(PAGINA_RELEASES).catch(() => {}); return; }
    if (acao === 'compacto') { if (est.compacto) sairCompacto(); else entrarCompacto(); }
    else if (est.compacto && (acao === 'ampliar' || acao === 'grade')) {
      // da faixa: volta e mostra a conta pedida (sem alternar, que poderia desampliar)
      sairCompacto();
      if (acao === 'ampliar') est.ampliada = id;
    }
    else if (acao === 'ampliar') est.ampliada = est.ampliada === id ? null : id;
    else if (acao === 'grade') est.ampliada = null;
    else if (acao === 'som' && cel) { est.mudo[id] = !est.mudo[id]; cel.v.webContents.setAudioMuted(est.mudo[id]); }
    // durante a troca do Onde Caçar a célula está sem o rótulo: recarregar abriria o jogo sem a trava
    // fora do jogo (o login do Google ou do Discord não deu certo), recarregar volta para o jogo
    else if (acao === 'recarregar' && cel && contaDoWc.has(cel.v.webContents.id) && !ondeCacar.atualizando) {
      const wc = cel.v.webContents;
      if (origemDe(wc.getURL()) === 'https://pokeidle.io') wc.reload(); else wc.loadURL(URL_JOGO).catch(() => {});
    }
    aplicar(); atualizarBarra(); salvar();
    if (acao === 'ampliar' && cel && est.ampliada === id) cel.v.webContents.focus();
  };
  const teclas = (ev, entrada) => { const a = acaoDaTecla(entrada, cfg.contas); if (a) { ev.preventDefault(); executar(a); } };

  // a página (rótulo) diz se a conta está conectada e com que nick; só o quadro principal do jogo é ouvido
  ipcMain.on('multiconta:estado', (ev, s, nick) => {
    const id = contaDoWc.get(ev.sender.id), st = statusDaPagina(s);
    if (!id || !st || ev.senderFrame !== ev.sender.mainFrame || ev.senderFrame?.origin !== 'https://pokeidle.io') return;
    // a página diz se a conta entrou (ou está aberta em outra célula) ou se ficou na tela de entrar
    if (st === 'sem-login') semLogin.add(id); else if (st === 'conectada' || st === 'bloqueada') semLogin.delete(id);
    const n = nickDaPagina(nick);
    if (st === 'conectada' && n && nicks[id] !== n) { nicks[id] = n; atualizarBarra(); }
    mudarStatus(id, st);
  });
  ipcMain.on('multiconta:resumo', (ev, r) => {
    const id = contaDoWc.get(ev.sender.id), n = normalizarResumo(r);
    if (!id || !n || ev.senderFrame !== ev.sender.mainFrame || ev.senderFrame?.origin !== 'https://pokeidle.io') return;
    if (JSON.stringify(resumos[id]) === JSON.stringify(n)) return;
    resumos[id] = n; atualizarBarra();
  });
  ipcMain.on('barra:pronta', (ev) => { if (ev.sender === barra.webContents) atualizarBarra(); });
  ipcMain.on('barra:comando', (ev, cmd) => { if (ev.sender === barra.webContents) { const a = comandoValido(cmd, cfg.contas); if (a) executar(a); } });
  barra.webContents.on('before-input-event', teclas);
  barra.webContents.on('did-finish-load', atualizarBarra); // reforço: a barra sempre ganha o primeiro retrato
  barra.webContents.loadFile(join(AQUI, 'barra', 'barra.html'));

  // ---- tela de configuração: contas, trazer login de um navegador, extensões. Mudanças que mexem nas
  // contas abertas valem depois de reiniciar o app (o pedido de login fica em pendencias.json).
  let telaConfig = null;
  const extensoesNovas = []; // adicionadas nesta tela (a pasta já foi copiada; entram ao salvar)
  const daTela = (ev) => !!telaConfig && !telaConfig.isDestroyed() && ev.sender === telaConfig.webContents && ev.senderFrame === ev.sender.mainFrame;
  let reiniciando = false;
  const reiniciar = () => { if (reiniciando) return; reiniciando = true; app.relaunch(); janela.close(); };
  function abrirConfig() {
    if (telaConfig && !telaConfig.isDestroyed()) { telaConfig.focus(); return; }
    telaConfig = new BrowserWindow({
      parent: janela, modal: true, width: 760, height: 720, minWidth: 560, minHeight: 480, title: 'Configurações',
      backgroundColor: '#15161a', icon: join(AQUI, 'icone', 'icone.ico'), autoHideMenuBar: true,
      webPreferences: { ...seguro, preload: join(AQUI, 'config', 'preload-config.cjs') },
    });
    telaConfig.setMenu(null);
    travarFixa(telaConfig.webContents);
    telaConfig.loadFile(join(AQUI, 'config', 'config.html'));
  }
  ipcMain.handle('config:dados', (ev) => {
    if (!daTela(ev)) return null;
    const logins = estadoDasSessoes(userData, cfg.contas);
    let navegadores = [];
    try { navegadores = navegadoresComPerfis(ENV_NAV); } catch (e) { registrar('perfis dos navegadores:', e); }
    return {
      maxContas: MAX_CONTAS,
      contas: cfg.contas.map((c) => ({ id: c.id, rotulo: c.rotulo, leve: c.leve, login: logins[c.id] })),
      ondeCacar: { ativo: cfg.ondeCacar, versao: ondeCacar.versao },
      extensoes: cfg.extensoes,
      navegadores,
    };
  });
  // salvar: grava a configuração e, depois dela, os pedidos que esperam o reinício (apagar o login
  // das contas removidas; trazer o login de um navegador para a conta `importar.indice` da lista)
  ipcMain.handle('config:salvar', (ev, pedido) => {
    if (!daTela(ev) || reiniciando) return { ok: false, erro: 'pedido recusado' };
    if (configEstragado) return { ok: false, erro: 'o config.json atual está estragado (veja o aviso na barra): corrija ou apague o arquivo e abra o app de novo, para não perder as contas que estão nele' };
    try {
      const outrosIds = existsSync(join(userData, 'Partitions')) ? readdirSync(join(userData, 'Partitions')) : [];
      const { cfg: novo, apagar } = aplicarPedidoDeConfig(cfg, pedido, { outrosIds, extensoesNovas });
      let importar = [];
      if (pedido?.importar) {
        const conta = novo.contas[pedido.importar.indice];
        if (!conta) throw new Error('escolha a conta para trazer o login');
        const navegador = String(pedido.importar.navegador), pasta = String(pedido.importar.pasta ?? '');
        const { origem, nome } = localStorageDoPerfil(navegador, pasta, ENV_NAV);
        // confere já, para o erro aparecer na tela; na abertura confere de novo antes de copiar
        if (!existsSync(origem)) throw new Error(`${nome} não tem dados de sites: o pokeidle.io nunca foi aberto nele?`);
        if (estadoDoArquivo(join(origem, 'leveldb', 'LOCK')) === 'em-uso') throw new Error(`${nome} está aberto: feche as janelas dele no navegador e tente de novo`);
        if (!temSessaoPokeidle(origem)) throw new Error(`${nome} não tem login do PokeIdle gravado. Abra o jogo nele, confira que está logado e feche o navegador (ele grava ao fechar).`);
        importar = [{ navegador, pasta, conta: conta.id }];
      }
      gravarConfigApp(RAIZ, novo);
      if (apagar.length || importar.length) gravarPendencias(RAIZ, juntarPendencias(lerPendencias(RAIZ), { apagar, importar }));
      registrar(`configuração salva (${novo.contas.length} contas, ${novo.extensoes.length} extensões a mais${importar.length ? ', trazer login' : ''}); reiniciando`);
      reiniciar();
      return { ok: true };
    } catch (e) { return { ok: false, erro: e.message }; }
  });
  ipcMain.handle('config:extensao', async (ev) => {
    if (!daTela(ev)) return { erro: 'pedido recusado' };
    const r = await dialog.showOpenDialog(telaConfig, { title: 'Pasta da extensão (descompactada, com o manifest.json)', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return {};
    try {
      const { nome } = lerManifesto(r.filePaths[0]);
      const id = novoId(nome, [...cfg.extensoes, ...extensoesNovas].map((x) => x.id));
      copiarExtensao(r.filePaths[0], join(EXTRAS, id));
      const extensao = { id, nome };
      extensoesNovas.push(extensao);
      return { extensao };
    } catch (e) { return { erro: e.message }; }
  });
  ipcMain.on('config:repositorio', (ev) => { if (daTela(ev)) shell.openExternal(REPOSITORIO_ONDE_CACAR).catch(() => {}); });
  ipcMain.on('config:fechar', (ev) => { if (daTela(ev)) telaConfig.close(); });

  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) janela.on(ev, () => { aplicar(); salvar(); });
  janela.on('close', () => { clearTimeout(gravar); gravarAgora(); }); // a última mudança não se perde ao fechar
  janela.on('closed', () => app.quit());
  app.on('second-instance', () => {
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  });

  // pedidos da tela de configuração que esperavam as contas fechadas (trazer login, apagar login)
  const userData = app.getPath('userData');
  const rotuloDe = (id) => cfg.contas.find((c) => c.id === id)?.rotulo ?? id;
  const pend = executarPendencias(RAIZ, {
    rotuloDe,
    apagarLogin: (id) => {
      if (cfg.contas.some((c) => c.id === id)) throw new Error('a conta ainda está na configuração');
      rmSync(pastaParticao(userData, id), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    },
    levar: ({ navegador, pasta, conta }) => {
      if (!cfg.contas.some((c) => c.id === conta)) throw new Error('a conta não está mais na configuração');
      const { origem, nome } = localStorageDoPerfil(navegador, pasta, ENV_NAV);
      levarSessao({ origem, nomeOrigem: nome, destino: pastaParticao(userData, conta), emUso: estadoDoArquivo, substituir: true });
    },
  });
  if (pend.feitos.length) registrar(pend.feitos.join(' | '));
  problemas.push(...pend.erros);
  // extensões a mais: só as da configuração (sobra de uma adição cancelada sai)
  // (com o config.json estragado não se apaga nada: as extensões dele voltam quando ele for corrigido)
  if (!configEstragado) {
    try {
      mkdirSync(EXTRAS, { recursive: true });
      const idsExtras = new Set(cfg.extensoes.map((x) => x.id));
      for (const d of readdirSync(EXTRAS)) if (!idsExtras.has(d)) rmSync(join(EXTRAS, d), { recursive: true, force: true });
    } catch (e) { registrar('limpar extensões que saíram:', e); }
  }
  const extras = [];
  for (const x of cfg.extensoes) {
    if (existsSync(join(EXTRAS, x.id, 'manifest.json'))) extras.push(join(EXTRAS, x.id));
    else problemas.push(`a extensão ${x.nome} sumiu da pasta do app: adicione de novo em ⚙`);
  }
  const sessoes = estadoDasSessoes(userData, cfg.contas);

  // Onde Caçar: a cópia é renovada na partida a partir da pasta de desenvolvimento (se configurada)
  // ou da que veio no instalador; se a troca falhar, fica a cópia anterior
  const onde = join(EXT, 'onde-cacar');
  const embutido = app.isPackaged ? join(process.resourcesPath, 'onde-cacar') : null;
  const origemOnde = fonteOndeCacar({ pastaDev: cfg.pastaDev, devLegivel: !!cfg.pastaDev && cloneAcessivel(cfg.pastaDev), embutido: embutido && existsSync(embutido) ? embutido : null });
  const fonte = origemOnde.fonte;
  if (origemOnde.aviso) problemas.push(origemOnde.aviso);
  const copiaExiste = () => existsSync(join(onde, 'manifest.json'));
  const decidir = () => planoOndeCacar({ ativo: cfg.ondeCacar, fonte, fonteLegivel: !!fonte && cloneAcessivel(fonte), copiaExiste: copiaExiste() });
  let decisao = decidir();
  if (decisao.acao === 'copiar') {
    try { copiarOndeCacar(fonte, onde); }
    catch (e) { decisao = copiaExiste() ? { acao: 'manter', aviso: `${e.message}; usando a cópia anterior` } : { acao: 'sem', aviso: `${e.message}; sem o Onde Caçar` }; }
  }
  if (decisao.aviso) problemas.push(decisao.aviso);

  // botão "atualizar": a versão da fonte entra em todas as contas sem fechar o app
  let avisosDoOnde = decisao.aviso ? [decisao.aviso] : [];
  const trocarAvisosDoOnde = (novos) => {
    for (const a of avisosDoOnde) { const i = problemas.indexOf(a); if (i >= 0) problemas.splice(i, 1); }
    avisosDoOnde = novos;
    problemas.push(...novos);
  };
  atualizar = async () => {
    if (ondeCacar.atualizando || !ondeCacar.pronto) return; // durante a abertura as extensões ainda estão sendo carregadas
    ondeCacar.atualizando = true; atualizarBarra();
    try {
      const nada = () => {};
      const r = await atualizarOndeCacar({
        decidir: async () => decidir(),
        copiar: () => copiarOndeCacar(fonte, onde),
        pastaOndeCacar: onde,
        extras,
        contas: celulas.filter((x) => x.ses && !x.v.webContents.isDestroyed()).map(({ c, v, ses, rotulo }) => ({
          id: c.id, rotulo: c.rotulo, ses, pastaRotulo: rotulo,
          // conferido pela URL: uma ida ao about:blank abortada deixaria o jogo aberto sem o rótulo
          parar: async () => { for (let i = 0; i < 2; i++) { await v.webContents.loadURL('about:blank').catch(nada); if (v.webContents.getURL() === 'about:blank') return true; } return false; },
          abrirJogo: () => v.webContents.loadURL(URL_JOGO).catch(nada), // falha vira "erro" pelo did-fail-load
          semRotulo: () => v.webContents.loadURL(paginaAviso(c, 'O rótulo desta conta não carregou ao atualizar o Onde Caçar. Feche e abra o app; veja o registro (electron\\registro.log).'))
            .then(() => mudarStatus(c.id, 'erro'), () => mudarStatus(c.id, 'erro')),
        })),
      });
      trocarAvisosDoOnde(r.problemas); // os avisos da tentativa anterior (ou da abertura) saem; os desta entram
      if (r.trocou) ondeCacar.versao = r.versao;
      registrar(r.ok ? `Onde Caçar atualizado para ${ondeCacar.versao}` : `atualizar o Onde Caçar: ${r.problemas.join(' | ')}`);
    } catch (e) {
      registrar('atualizar o Onde Caçar:', e);
      trocarAvisosDoOnde([`não consegui atualizar o Onde Caçar: ${e.message}`]);
    } finally { ondeCacar.atualizando = false; atualizarBarra(); }
  };
  let versaoCarregada = null;

  for (const c of cfg.contas) {
    let o = conteudoDaCelula(c, { sessao: sessoes[c.id] });
    if (o.semLogin) semLogin.add(c.id);
    let ses = null, rotulo = null;
    // a partição é criada também para conta sem login: ela entra na própria célula
    if (o.url) {
      ses = session.fromPartition(particao(c.id));
      travarSessao(ses);
      // extensões ANTES de abrir o jogo: os scripts do Onde Caçar precisam entrar no document_start
      rotulo = gerarRotulo(join(AQUI, 'rotulo'), join(EXT, `rotulo-${c.id}`), c);
      for (const dir of extensoesDaConta(decisao, onde, rotulo, extras)) {
        try {
          const ext = await ses.extensions.loadExtension(dir, { allowFileAccess: false });
          if (dir === onde) versaoCarregada ??= versaoValida(ext?.version);
        } catch (e) {
          problemas.push(`${c.rotulo}: não carregou ${dir.split(/[\\/]/).pop()} (${e.message})`);
          if (dir === onde) avisosDoOnde.push(problemas.at(-1)); // sai na próxima atualização que der certo
          // sem o rótulo não há trava de "uma sessão por conta": melhor não abrir o jogo nessa célula
          if (dir === rotulo) o = { aviso: 'O rótulo desta conta não carregou, e sem ele o app não protege contra a mesma conta em duas células. Veja o registro (electron\\registro.log).' };
        }
      }
    }
    status[c.id] = !o.url ? 'erro' : semLogin.has(c.id) ? 'sem-login' : 'carregando';
    const v = new WebContentsView({ webPreferences: { ...seguro, backgroundThrottling: false, ...(o.url ? { partition: particao(c.id), preload: join(AQUI, 'preload.cjs') } : {}) } });
    const wc = v.webContents;
    if (o.url) {
      travarCelula(wc);
      contaDoWc.set(wc.id, c.id);
      // "carregando" só quando a página foi trocada de verdade (link bloqueado não conta)
      wc.on('did-navigate', () => { delete resumos[c.id]; mudarStatus(c.id, semLogin.has(c.id) ? 'sem-login' : 'carregando'); }); // números da página anterior saem
      wc.on('did-fail-load', (_e, codigo, _desc, _url, principal) => { if (principal && codigo !== -3) mudarStatus(c.id, 'erro'); }); // -3 = cancelada
      wc.on('render-process-gone', () => mudarStatus(c.id, 'caiu'));
    } else travarFixa(wc);
    // só nos testes de aceite: qual processo é o de cada conta, para medir RAM/CPU por conta
    if (PORTA_TESTE && o.url) wc.on('did-finish-load', () => {
      const arq = join(app.getPath('userData'), 'pids-teste.json');
      let pids = {};
      try { pids = JSON.parse(readFileSync(arq, 'utf8')); } catch { /* primeiro */ }
      pids[c.id] = wc.getOSProcessId();
      try { writeFileSync(arq, JSON.stringify(pids)); } catch { /* medição sem pids */ }
    });
    wc.setAudioMuted(est.mudo[c.id]);
    wc.on('before-input-event', teclas);
    wc.loadURL(o.url ?? paginaAviso(c, o.aviso));
    janela.contentView.addChildView(v);
    celulas.push({ c, v, ...(o.url ? { ses, rotulo } : {}) });
    aplicar(); atualizarBarra();
  }
  ondeCacar.versao = versaoCarregada;
  ondeCacar.pronto = true;
  if (!cfg.contas.length && !avisosConfig.length) abrirConfig(); // primeira vez: começa pela configuração
  if (app.isPackaged) { // o app pode ficar dias aberto: procura de novo a cada 24 h
    const procurar = () => procurarVersaoNova(app.getVersion()).then((v) => { if (v && v !== versaoNova) { versaoNova = v; registrar(`versão nova do app: ${v}`); atualizarBarra(); } });
    procurar();
    setInterval(procurar, 24 * 3600_000);
  }
  atualizarBarra();
  if (problemas.length) { registrar(problemas.join(' | ')); atualizarBarra(); }
});

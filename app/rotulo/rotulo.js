// Rótulo da conta: põe "<rótulo> · <nick>" no título da janela, num selo no canto da tela (só no
// lançador do Edge; no app a barra já diz qual é a conta) e nos avisos do sistema. O lançador gera uma cópia desta extensão por conta trocando a marca do
// rótulo (abaixo, em ROTULO) e a do modo leve por "sim" quando a conta pede o modo leve.
// Não lê nem guarda o token: do hello só aproveita o nick.
(function () {
  'use strict';
  const ROTULO = "__ROTULO__"; // aspas duplas: o lançador escapa o rótulo no padrão JSON
  let nick = '';
  const prefixo = () => (nick ? `${ROTULO} · ${nick}` : ROTULO);

  // nick: sai na primeira mensagem do WebSocket do jogo. Onde existe uma trava entre contas
  // (window.multiconta, no app Electron), o hello só sai se a conta não estiver aberta em outra
  // célula; senão o socket fecha sem se identificar e a outra sessão não é derrubada.
  // Dentro de um mesmo perfil (Edge), uma trava Web Lock garante que só uma aba/janela do jogo
  // se identifica: a segunda (aberta de novo pelo atalho ou à mão) não derruba a primeira.
  let temTrava = null; // null = ainda não sabemos (deixa passar)
  try {
    navigator.locks?.request('multiconta:sessao', { ifAvailable: true }, (trava) => {
      temTrava = !!trava;
      return trava ? new Promise(() => {}) : undefined; // segura até a página fechar
    });
  } catch { /* sem Web Locks */ }

  let bloqueado = false;
  let atual = null;
  const informar = (estado, quem) => { try { window.multiconta?.estado?.(estado, quem); } catch { /* sem a ponte */ } };
  const enviar = WebSocket.prototype.send;
  WebSocket.prototype.send = function (dado) {
    if (typeof dado === 'string' && dado.startsWith('{"t":"hello"')) {
      let quem = '';
      try { quem = String(JSON.parse(dado).nick || ''); } catch { /* segue */ }
      const outraAqui = temTrava === false;
      const outraCelula = quem && window.multiconta && !window.multiconta.reservar(quem);
      if (quem && (outraAqui || outraCelula)) {
        bloqueado = true; nick = `${quem} (já aberta em outro lugar)`; aplicar();
        informar('bloqueada');
        this.close();
        return undefined;
      }
      if (quem && !bloqueado) {
        nick = quem; aplicar();
        // no app, a barra mostra se a conta está conectada (no Edge não há window.multiconta).
        // Só o socket mais recente conta: um antigo fechando depois não pinta a conta de vermelho.
        atual = this;
        informar('conectada', quem);
        this.addEventListener?.('close', () => { if (atual === this) informar('desconectada'); }, { once: true });
      }
    }
    if (bloqueado) return undefined;
    return enviar.apply(this, arguments);
  };

  // no app: página do jogo que não se identificou em 12 s está na tela de entrar (conta nova, saiu da
  // conta ou o login venceu); a barra passa a dizer "entre na conta". O hello que vier depois corrige.
  if (window.multiconta) setTimeout(() => { if (!atual && !bloqueado) informar('sem-login'); }, 12000);

  // resumo para a barra do app: hunt, treinador e ritmo da sessão, lidos do Onde Caçar (que já
  // remonta o estado do jogo nesta página). Só leitura, a cada 5 s e só quando muda; nada vai para
  // o jogo. No Edge não há a ponte (window.multiconta) e nada disto roda.
  let ultimoResumo = '';
  function resumir() {
    const OC = window.__ondeCacar;
    if (bloqueado || !window.multiconta?.resumo || typeof OC?.ultimo !== 'function') return;
    try {
      const eu = OC.ultimo('estado');
      if (!eu) return;
      const h = eu.huntSlug ? (OC.ultimo('welcome')?.hunts ?? []).find((x) => x?.slug === eu.huntSlug) : null;
      const s = OC.sessao?.atual?.() ?? null;
      const daHunt = !!s && !!eu.huntSlug && s.slug === eu.huntSlug; // a sessão do Onde Caçar pode ser da hunt anterior
      const r = {
        huntNome: h?.nome ?? eu.huntSlug ?? null, huntRegiao: h?.regiao ?? h?.area ?? null, huntNivel: h?.nivel ?? null,
        centro: !!eu.noCentro, nivel: eu.level ?? null, gold: eu.gold ?? null,
        abatesH: daHunt ? s.abatesH ?? null : null, goldH: daHunt ? s.goldH ?? null : null, minutos: daHunt ? s.minutos ?? null : null,
      };
      const texto = JSON.stringify(r);
      if (texto === ultimoResumo) return;
      ultimoResumo = texto;
      window.multiconta.resumo(r);
    } catch { /* o Onde Caçar mudou por dentro: a barra fica sem o resumo */ }
  }
  if (window.multiconta) setInterval(resumir, 5000); // a ponte do app chega antes da página

  // selo no canto, para quem tem várias janelas do Edge abertas. No app (window.multiconta) não:
  // a barra já mostra cada conta e o selo cobria um pedaço da barra de ferramentas do jogo.
  const selo = document.createElement('div');
  selo.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:2147483647;pointer-events:none;'
    + 'font:600 11px system-ui;padding:2px 6px;border-radius:4px;background:#000a;color:#fff';

  // título: o jogo pode trocar o <title> quando quiser; reaplica o prefixo
  let aplicando = false;
  function aplicar() {
    if (aplicando) return;
    aplicando = true;
    const base = document.title.replace(/^\[[^\]]*\]\s*/, '');
    const novo = `[${prefixo()}] ${base || 'PokeIdle'}`;
    if (document.title !== novo) document.title = novo;
    // só escreve se mudou: trocar o texto é uma mutação, e o observador chamaria aplicar() de novo
    if (selo.textContent !== prefixo()) selo.textContent = prefixo();
    if (!window.multiconta && !selo.isConnected && document.body) document.body.append(selo);
    vigiar();
    aplicando = false;
  }

  // Observa só o <head> (onde mora o <title>), os filhos diretos do <body> (o selo) e os do <html>
  // (para notar <head>/<body> novos): o jogo mexe no resto da página o tempo todo, e um observador
  // da página inteira rodaria a cada mudança. Começa já no document_start, sem esperar o
  // DOMContentLoaded, para o título ganhar o rótulo assim que o <title> aparece.
  let obs = null, alvoHead, alvoBody;
  function vigiar() {
    if (obs && document.head === alvoHead && document.body === alvoBody) return;
    obs?.disconnect();
    obs = new MutationObserver(aplicar);
    alvoHead = document.head; alvoBody = document.body;
    if (document.documentElement) obs.observe(document.documentElement, { childList: true });
    if (alvoHead) obs.observe(alvoHead, { subtree: true, childList: true, characterData: true });
    if (alvoBody) obs.observe(alvoBody, { childList: true });
  }
  vigiar();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicar);
  else aplicar();

  // avisos: o Onde Caçar usa `new Notification(...)`; o título passa a dizer de qual conta veio
  const N = window.Notification;
  if (N) {
    const Rotulada = function (titulo, opcoes) { return new N(`[${prefixo()}] ${titulo}`, opcoes); };
    Rotulada.prototype = N.prototype;
    Object.defineProperty(Rotulada, 'permission', { get: () => N.permission });
    Rotulada.requestPermission = N.requestPermission.bind(N);
    window.Notification = Rotulada;
  }

  // modo leve (opcional, por conta): mesmo no Modo Economia a página segue com animações CSS
  // infinitas e sprites redesenhando na taxa do monitor (~140 quadros/s). Pausa só as animações
  // INFINITAS (as que têm fim seguem, e com elas os eventos animationend/transitionend de que o jogo
  // pode depender) e limita o requestAnimationFrame a ~10 quadros/s. Só muda o desenho no seu PC.
  if ('__LEVE__' === 'sim') {
    const pausarInfinitas = () => {
      for (const a of document.getAnimations?.() ?? []) {
        if (a.playState === 'running' && a.effect?.getTiming?.().iterations === Infinity) a.pause();
      }
    };
    document.addEventListener('DOMContentLoaded', pausarInfinitas);
    setInterval(pausarInfinitas, 2000);

    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window);
    // ids nossos: um quadro adiado ganha outro id do navegador, e o cancelamento do jogo tem de
    // alcançar esse também. Começam longe dos do navegador; id que não é nosso vai para o nativo.
    const pendentes = new Map();
    let seq = 1e9;
    // todos os callbacks de um mesmo quadro recebem o mesmo t: libera o quadro inteiro de uma vez
    let liberado = -1;
    window.requestAnimationFrame = (cb) => {
      if (typeof cb !== 'function') return raf(cb); // erra na hora, igual ao nativo
      const id = ++seq;
      const agendar = () => pendentes.set(id, raf((t) => {
        if (t !== liberado && t - liberado < 95) return agendar();
        pendentes.delete(id);
        liberado = t;
        cb(t);
      }));
      agendar();
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      if (pendentes.has(id)) { caf(pendentes.get(id)); pendentes.delete(id); }
      else if (id < 1e9) caf(id);
    };
  }
})();

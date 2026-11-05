// Testes do lançador e do rótulo (rodam no WSL: npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { grade } from '../lancador/lancador.mjs';

test('grade: 2 contas lado a lado, 4 em 2×2, 3 deixa um buraco', () => {
  const area = { x: 0, y: 0, w: 1920, h: 1040 };
  assert.deepEqual(grade(2, area), [{ x: 0, y: 0, w: 960, h: 1040 }, { x: 960, y: 0, w: 960, h: 1040 }]);
  assert.deepEqual(grade(4, area).map((p) => [p.x, p.y]), [[0, 0], [960, 0], [0, 520], [960, 520]]);
  assert.equal(grade(3, area).length, 3);
  assert.deepEqual(grade(1, area), [{ x: 0, y: 0, w: 1920, h: 1040 }]);
});

// ---- rótulo num DOM de mentira ----------------------------------------------------------------
function carregarRotulo({ rotulo = 'Alt 1', leve = false, locks, animacoes = [], fonteGerada, readyState = 'loading', ponte } = {}) {
  const fonte = fonteGerada ?? readFileSync(new URL('../app/rotulo/rotulo.js', import.meta.url), 'utf8')
    .replaceAll('__ROTULO__', rotulo).replaceAll('__LEVE__', leve ? 'sim' : 'nao');
  const observadores = [];
  const observados = [];
  const ouvintes = {};
  const avisos = [];
  const quadros = new Map(); // id do navegador -> callback
  const intervalos = [];
  const esperas = [];
  let idNavegador = 0;
  const elemento = () => ({ style: {}, textContent: '', isConnected: false });
  const document = {
    title: 'Pokeidle',
    readyState,
    documentElement: { nome: 'html' },
    body: { nome: 'body', filhos: [], append(e) { e.isConnected = true; this.filhos.push(e); } },
    head: { nome: 'head', append() {} },
    createElement: elemento,
    addEventListener(tipo, fn) { (ouvintes[tipo] ??= []).push(fn); },
    getAnimations: () => animacoes,
  };
  class Notification { constructor(t, o) { avisos.push(t); this.o = o; } static permission = 'granted'; static requestPermission() {} }
  class WebSocket { send(d) { this.ultimo = d; } addEventListener(t, fn) { (this.ouvintes ??= {})[t] = fn; } }
  const window = {
    Notification,
    requestAnimationFrame: (cb) => {
      if (typeof cb !== 'function') throw new TypeError('requestAnimationFrame: não é função'); // como o nativo
      quadros.set(++idNavegador, cb); return idNavegador;
    },
    cancelAnimationFrame: (id) => quadros.delete(id),
  };
  if (ponte) window.multiconta = ponte; // o preload do app roda antes da página
  const ctx = {
    window, document, WebSocket, navigator: { locks },
    setInterval: (fn, ms) => intervalos.push({ fn, ms }),
    setTimeout: (fn, ms) => esperas.push({ fn, ms }),
    MutationObserver: class {
      constructor(fn) { this.fn = fn; observadores.push(this); }
      observe(alvo, op) { observados.push({ alvo: alvo.nome, op }); }
      disconnect() { observadores.splice(observadores.indexOf(this), 1); }
    },
  };
  vm.runInNewContext(fonte, ctx);
  const dcl = () => (ouvintes.DOMContentLoaded ?? []).forEach((fn) => fn());
  if (readyState === 'loading') dcl();
  return {
    ctx, avisos, observados, intervalos, esperas, dcl,
    observadoresVivos: () => observadores.length,
    mudar() { [...observadores].forEach((o) => o.fn()); },
    // roda um quadro do "navegador" no instante t; cancelado no meio do quadro não roda (como no navegador)
    quadro(t) { for (const id of [...quadros.keys()]) { const cb = quadros.get(id); if (!cb) continue; quadros.delete(id); cb(t); } },
    pendentes: () => quadros.size,
  };
}

test('rótulo: título e aviso ganham o rótulo e, depois do hello, o nick', () => {
  const r = carregarRotulo();
  r.mudar();
  assert.equal(r.ctx.document.title, '[Alt 1] Pokeidle');
  new r.ctx.WebSocket().send('{"t":"hello","nick":"treinador1","token":"x"}');
  assert.equal(r.ctx.document.title, '[Alt 1 · treinador1] Pokeidle');
  r.ctx.document.title = 'Pokeidle - boss!';
  r.mudar();
  assert.equal(r.ctx.document.title, '[Alt 1 · treinador1] Pokeidle - boss!');
  new r.ctx.window.Notification('Hunt acabou', {});
  assert.deepEqual(r.avisos, ['[Alt 1 · treinador1] Hunt acabou']);
});

test('rótulo: aspas no nome não quebram o script', () => {
  const rotulo = JSON.stringify("Alt 'dois'").slice(1, -1);
  const r = carregarRotulo({ rotulo });
  r.mudar();
  assert.equal(r.ctx.document.title, "[Alt 'dois'] Pokeidle");
});

test('modo leve: libera todos os callbacks do mesmo quadro, no máximo ~10 quadros/s', () => {
  const r = carregarRotulo({ leve: true });
  let a = 0, b = 0;
  const laçoA = () => { a++; r.ctx.window.requestAnimationFrame(laçoA); };
  const laçoB = () => { b++; r.ctx.window.requestAnimationFrame(laçoB); };
  r.ctx.window.requestAnimationFrame(laçoA);
  r.ctx.window.requestAnimationFrame(laçoB);
  for (let t = 1000; t <= 2000; t += 7) r.quadro(t); // ~143 quadros/s por 1 s
  assert.ok(a >= 9 && a <= 11, `laço A rodou ${a} vezes`);
  assert.equal(a, b, 'os dois laços andam juntos');
  assert.ok(r.pendentes() > 0);
});

test('sem modo leve: requestAnimationFrame fica intacto', () => {
  const r = carregarRotulo({ leve: false });
  let n = 0;
  const laço = () => { n++; r.ctx.window.requestAnimationFrame(laço); };
  r.ctx.window.requestAnimationFrame(laço);
  for (let t = 0; t < 1000; t += 7) r.quadro(t);
  assert.equal(n, 143);
});

test('trava: se a conta já está em outra célula, o hello não sai e o socket fecha', () => {
  const r = carregarRotulo();
  const pedidos = [];
  r.ctx.window.multiconta = { reservar: (n) => { pedidos.push(n); return false; } };
  const ws = new r.ctx.WebSocket();
  let fechou = false; ws.close = () => { fechou = true; };
  ws.send('{"t":"hello","nick":"treinador1","token":"x"}');
  ws.send('{"t":"bloqueio.lista"}');
  assert.deepEqual(pedidos, ['treinador1']);
  assert.equal(ws.ultimo, undefined, 'nada foi enviado');
  assert.ok(fechou);
  assert.match(r.ctx.document.title, /treinador1 \(já aberta em outro lugar\)/);
});

test('trava: com a reserva concedida (ou sem trava, como no Edge), tudo segue normal', () => {
  const r = carregarRotulo();
  r.ctx.window.multiconta = { reservar: () => true };
  const ws = new r.ctx.WebSocket();
  ws.send('{"t":"hello","nick":"treinador1","token":"x"}');
  assert.equal(ws.ultimo, '{"t":"hello","nick":"treinador1","token":"x"}');
  const semTrava = carregarRotulo();
  const ws2 = new semTrava.ctx.WebSocket();
  ws2.send('{"t":"hello","nick":"treinador2","token":"x"}');
  assert.equal(ws2.ultimo, '{"t":"hello","nick":"treinador2","token":"x"}');
});

// Web Locks de mentira: um "perfil" compartilhado entre páginas
function perfil() {
  const presas = new Set();
  return {
    request(nome, _op, fn) {
      const livre = !presas.has(nome);
      if (livre) presas.add(nome);
      return Promise.resolve(fn(livre ? { name: nome } : null));
    },
  };
}

test('trava por perfil: a 2ª página do mesmo perfil não manda hello', async () => {
  const locks = perfil();
  const p1 = carregarRotulo({ locks });
  const p2 = carregarRotulo({ locks });
  await new Promise((r) => setImmediate(r));
  const ws1 = new p1.ctx.WebSocket(); ws1.close = () => {};
  const ws2 = new p2.ctx.WebSocket(); let fechou = false; ws2.close = () => { fechou = true; };
  ws1.send('{"t":"hello","nick":"treinador1","token":"x"}');
  ws2.send('{"t":"hello","nick":"treinador1","token":"x"}');
  assert.ok(ws1.ultimo, 'a 1ª página conecta');
  assert.equal(ws2.ultimo, undefined, 'a 2ª não se identifica');
  assert.ok(fechou);
});

import { argsJanelaNormal, conferirOpcoes, flags } from '../lancador/lancador.mjs';

test('flags: pasta da conta, janela de app na posição, anti-estrangulamento e extensões', () => {
  const f = flags({ pasta: 'C:\\P\\perfis\\alt1', pos: { x: 0, y: 520, w: 960, h: 520 }, exts: ['C:\\e\\onde-cacar', 'C:\\e\\rotulo-alt1'] });
  assert.equal(f[0], '--user-data-dir=C:\\P\\perfis\\alt1');
  assert.ok(f.includes('--app=https://pokeidle.io/app'));
  assert.ok(f.includes('--window-position=0,520') && f.includes('--window-size=960,520'));
  for (const x of ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']) assert.ok(f.includes(x), x);
  assert.ok(f.includes('--load-extension=C:\\e\\onde-cacar,C:\\e\\rotulo-alt1'));
  assert.ok(!f.some((a) => a.startsWith('--remote-debugging')), 'nada de porta de depuração no produto');
});

test('flags: sem extensões, sem --load-extension vazio', () => {
  assert.ok(!flags({ pasta: 'p', pos: { x: 0, y: 0, w: 1, h: 1 }, exts: [] }).some((a) => a.startsWith('--load-extension')));
});

test('opções: --estudo saiu do produto', () => {
  assert.throws(() => conferirOpcoes(['abrir', '--estudo']), /opção desconhecida: --estudo/);
  assert.deepEqual(argsJanelaNormal('C:\\p'), ['--user-data-dir=C:\\p', 'about:blank']);
});

const ALVOS_INICIAIS = [ // objetos do vm têm outro protótipo: compara via JSON
  { alvo: 'html', op: { childList: true } },
  { alvo: 'head', op: { subtree: true, childList: true, characterData: true } },
  { alvo: 'body', op: { childList: true } },
];

test('rótulo: observa só <html> (filhos), <head> e os filhos diretos do <body>, não a página inteira', () => {
  const r = carregarRotulo();
  assert.deepEqual(JSON.parse(JSON.stringify(r.observados)), ALVOS_INICIAIS);
  assert.equal(r.observadoresVivos(), 1);
  assert.equal(r.ctx.document.title, '[Alt 1] Pokeidle');
});

test('rótulo: injetado depois do DOMContentLoaded também começa (o título já ganha o rótulo)', () => {
  const r = carregarRotulo({ readyState: 'complete' });
  assert.equal(r.ctx.document.title, '[Alt 1] Pokeidle');
  assert.deepEqual(JSON.parse(JSON.stringify(r.observados)), ALVOS_INICIAIS);
});

test('rótulo: <body> trocado pelo jogo → observa o novo e põe o selo de volta', () => {
  const r = carregarRotulo();
  const velho = r.ctx.document.body;
  assert.equal(velho.filhos.length, 1, 'o selo está no body original');
  velho.filhos.forEach((e) => { e.isConnected = false; }); // saiu da página junto com o body velho
  const novo = { nome: 'body2', filhos: [], append(e) { e.isConnected = true; this.filhos.push(e); } };
  r.ctx.document.body = novo;
  r.mudar();
  assert.equal(r.observadoresVivos(), 1, 'o observador antigo foi desligado');
  assert.ok(r.observados.some((o) => o.alvo === 'body2'));
  assert.equal(novo.filhos.length, 1, 'o selo voltou, no body novo');
});

test('rótulo no app (com a ponte window.multiconta): sem selo no canto, título com o rótulo', () => {
  const r = carregarRotulo({ ponte: { reservar: () => true, estado: () => {} } });
  assert.equal(r.ctx.document.body.filhos.length, 0, 'nenhum selo no body');
  assert.equal(r.ctx.document.title, '[Alt 1] Pokeidle');
});

function ondeCacarFalso({ estado, welcome, sessao }) {
  return { ultimo: (t) => ({ estado, welcome })[t], sessao: { atual: () => sessao } };
}

test('resumo para a barra: lido do Onde Caçar a cada 5 s, enviado só quando muda', () => {
  const enviados = [];
  const r = carregarRotulo({ ponte: { reservar: () => true, estado: () => {}, resumo: (x) => enviados.push(JSON.parse(JSON.stringify(x))) } });
  const tique = r.intervalos.find((i) => i.ms === 5000);
  assert.ok(tique, 'um intervalo de 5 s');
  tique.fn();
  assert.equal(enviados.length, 0, 'sem o Onde Caçar, nada é enviado');
  const estado = { level: 42, gold: 1234567, huntSlug: 'pikachu_kanto', noCentro: false };
  const welcome = { hunts: [{ slug: 'pikachu_kanto', nome: 'Pikachu', regiao: 'kanto', nivel: 20 }] };
  r.ctx.window.__ondeCacar = ondeCacarFalso({ estado, welcome, sessao: { slug: 'pikachu_kanto', abatesH: 310, goldH: 52000, minutos: 12 } });
  tique.fn();
  assert.deepEqual(enviados, [{ huntNome: 'Pikachu', huntRegiao: 'kanto', huntNivel: 20, centro: false, nivel: 42, gold: 1234567, abatesH: 310, goldH: 52000, minutos: 12 }]);
  tique.fn();
  assert.equal(enviados.length, 1, 'igual ao anterior: não reenvia');
  estado.gold = 1240000;
  tique.fn();
  assert.equal(enviados.at(-1).gold, 1240000);
});

test('resumo: sessão de outra hunt não dá ritmo; Onde Caçar quebrado não derruba nada; sem ponte (Edge) não roda', () => {
  const enviados = [];
  const r = carregarRotulo({ ponte: { reservar: () => true, estado: () => {}, resumo: (x) => enviados.push(JSON.parse(JSON.stringify(x))) } });
  const tique = r.intervalos.find((i) => i.ms === 5000);
  r.ctx.window.__ondeCacar = ondeCacarFalso({ estado: { level: 5, gold: 10, huntSlug: 'b', noCentro: true }, welcome: null, sessao: { slug: 'a', abatesH: 99 } });
  tique.fn();
  assert.deepEqual(enviados.at(-1), { huntNome: 'b', huntRegiao: null, huntNivel: null, centro: true, nivel: 5, gold: 10, abatesH: null, goldH: null, minutos: null });
  r.ctx.window.__ondeCacar = ondeCacarFalso({ estado: { level: 5, gold: 10, noCentro: false }, welcome: null, sessao: { abatesH: 99 } });
  tique.fn();
  assert.equal(enviados.at(-1).abatesH, null, 'sem hunt (os dois slugs vazios) não há ritmo');
  r.ctx.window.__ondeCacar = { ultimo: () => { throw new Error('mudou'); } };
  assert.doesNotThrow(() => tique.fn());
  assert.equal(carregarRotulo().intervalos.length, 0, 'no Edge (sem a ponte) nem há o intervalo');
});

test('modo leve: cancelAnimationFrame alcança o quadro adiado (o callback não roda depois de cancelado)', () => {
  const r = carregarRotulo({ leve: true });
  let rodou = 0;
  r.ctx.window.requestAnimationFrame(() => {}); // um quadro qualquer marca o "liberado"
  r.quadro(1000);
  const id = r.ctx.window.requestAnimationFrame(() => { rodou++; });
  r.quadro(1007); // cedo demais: é adiado e ganha outro id do navegador
  r.ctx.window.cancelAnimationFrame(id);
  for (let t = 1014; t < 1300; t += 7) r.quadro(t);
  assert.equal(rodou, 0);
  assert.equal(r.pendentes(), 0);
});

test('modo leve: cancelar no mesmo quadro, cancelar id que já rodou e id do navegador', () => {
  const r = carregarRotulo({ leve: true });
  const raf = r.ctx.window.requestAnimationFrame, caf = r.ctx.window.cancelAnimationFrame;
  let b = 0, c = 0;
  let idB;
  raf(() => caf(idB)); // A cancela B dentro do mesmo quadro
  idB = raf(() => { b++; });
  r.quadro(1000);
  assert.equal(b, 0);
  const idC = raf(() => { c++; });
  r.quadro(1200);
  assert.equal(c, 1);
  assert.doesNotThrow(() => caf(idC), 'cancelar o que já rodou não faz nada');
  assert.ok(idC > 1e9, 'ids nossos ficam longe dos do navegador');
  assert.throws(() => raf('não é função'), TypeError);
});

test('modo leve: pausa só animações infinitas que estão rodando, a cada 2 s', () => {
  const anim = (iterations, playState = 'running') => ({ playState, pausada: false, effect: { getTiming: () => ({ iterations }) }, pause() { this.pausada = true; } });
  const animacoes = [anim(Infinity), anim(1), anim(3), anim(Infinity, 'paused'), { playState: 'running', pause() { this.pausada = true; } }];
  const r = carregarRotulo({ leve: true, animacoes });
  assert.deepEqual(animacoes.map((a) => !!a.pausada), [true, false, false, false, false]);
  assert.equal(r.intervalos.length, 1);
  assert.equal(r.intervalos[0].ms, 2000);
  const nova = anim(Infinity);
  animacoes.push(nova);
  r.intervalos[0].fn();
  assert.ok(nova.pausada);
});

test('sem modo leve: nada de pausar animações nem de intervalo', () => {
  const a = { playState: 'running', effect: { getTiming: () => ({ iterations: Infinity }) }, pause() { this.pausada = true; } };
  const r = carregarRotulo({ leve: false, animacoes: [a] });
  assert.ok(!a.pausada);
  assert.equal(r.intervalos.length, 0);
});

import { validarConfig } from '../lancador/config.mjs';
import { textoDoRotulo } from '../app/extensoes.mjs';

test('de ponta a ponta: conta sem "leve" no contas.json → rótulo gerado com o modo leve ligado', () => {
  const modelo = readFileSync(new URL('../app/rotulo/rotulo.js', import.meta.url), 'utf8');
  const quadrosEm1s = (conta) => {
    const r = carregarRotulo({ fonteGerada: textoDoRotulo(modelo, conta) });
    let n = 0;
    const laço = () => { n++; r.ctx.window.requestAnimationFrame(laço); };
    r.ctx.window.requestAnimationFrame(laço);
    for (let t = 1000; t <= 2000; t += 7) r.quadro(t);
    return { n, titulo: r.ctx.document.title };
  };
  const [padrao, semLeve] = validarConfig({ contas: [{ id: 'alt1', rotulo: 'Alt 1' }, { id: 'alt2', rotulo: 'Alt 2', leve: false }] }).contas;
  const a = quadrosEm1s(padrao);
  assert.ok(a.n >= 9 && a.n <= 11, `padrão: ${a.n} quadros`);
  assert.equal(a.titulo, '[Alt 1] Pokeidle');
  assert.equal(quadrosEm1s(semLeve).n, 143);
});

test('rótulo no app: informa conectada, desconectada (socket fechou) e bloqueada à barra', () => {
  const r = carregarRotulo();
  const estados = [];
  r.ctx.window.multiconta = { reservar: () => true, estado: (e) => estados.push(e) };
  const ws = new r.ctx.WebSocket();
  ws.send('{"t":"hello","nick":"treinador1","token":"x"}');
  ws.ouvintes.close();
  assert.deepEqual(estados, ['conectada', 'desconectada']);
  const b = carregarRotulo();
  const eb = [];
  b.ctx.window.multiconta = { reservar: () => false, estado: (e) => eb.push(e) };
  const wb = new b.ctx.WebSocket(); wb.close = () => {};
  wb.send('{"t":"hello","nick":"treinador1","token":"x"}');
  assert.deepEqual(eb, ['bloqueada']);
});

test('rótulo no Edge (sem a ponte do app): nada de informar, e nada quebra', () => {
  const r = carregarRotulo();
  const ws = new r.ctx.WebSocket();
  assert.doesNotThrow(() => ws.send('{"t":"hello","nick":"treinador1","token":"x"}'));
  r.ctx.window.multiconta = { reservar: () => true, estado: () => { throw new Error('ponte quebrada'); } };
  assert.doesNotThrow(() => new r.ctx.WebSocket().send('{"t":"hello","nick":"treinador1","token":"x"}'));
});

test('rótulo no app: manda o nick junto e ignora o fechamento de um socket antigo', () => {
  const r = carregarRotulo();
  const msgs = [];
  r.ctx.window.multiconta = { reservar: () => true, estado: (e, n) => msgs.push([e, n ?? null]) };
  const velho = new r.ctx.WebSocket();
  velho.send('{"t":"hello","nick":"treinador1","token":"x"}');
  const novo = new r.ctx.WebSocket();
  novo.send('{"t":"hello","nick":"treinador1","token":"x"}');
  velho.ouvintes.close(); // o antigo fecha depois do novo conectar: não vale
  assert.deepEqual(msgs, [['conectada', 'treinador1'], ['conectada', 'treinador1']]);
  novo.ouvintes.close();
  assert.deepEqual(msgs.at(-1), ['desconectada', null]);
});

test('rótulo no app: sem hello em 12 s, a página está na tela de entrar ("sem-login"); com hello ou bloqueada, não', () => {
  const msgs = [];
  const r = carregarRotulo({ ponte: { reservar: () => true, estado: (e) => msgs.push(e) } });
  const espera = r.esperas.find((e) => e.ms === 12000);
  espera.fn();
  assert.deepEqual(msgs, ['sem-login']);
  const c = carregarRotulo({ ponte: { reservar: () => true, estado: (e) => msgs.push(e) } });
  msgs.length = 0;
  new c.ctx.WebSocket().send('{"t":"hello","nick":"treinador1","token":"x"}');
  c.esperas.find((e) => e.ms === 12000).fn();
  assert.deepEqual(msgs, ['conectada']);
  const b = carregarRotulo({ ponte: { reservar: () => false, estado: (e) => msgs.push(e) } });
  msgs.length = 0;
  const wb = new b.ctx.WebSocket(); wb.close = () => {};
  wb.send('{"t":"hello","nick":"treinador1","token":"x"}');
  b.esperas.find((e) => e.ms === 12000).fn();
  assert.deepEqual(msgs, ['bloqueada']);
  assert.equal(carregarRotulo().esperas.length, 0, 'no Edge (sem a ponte) não há a espera');
});

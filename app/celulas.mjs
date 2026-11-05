// O que cada célula do mosaico mostra. Funções puras (sem Electron), para testar no WSL.

export const URL_JOGO = 'https://pokeidle.io/app';

export const escaparHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
// célula sem o jogo: diz de quem é e por quê
export const paginaAviso = (c, texto) => `data:text/html;charset=utf-8,${encodeURIComponent(
  `<body style="margin:0;display:grid;place-content:center;gap:8px;text-align:center;height:100vh;background:#1d1f24;color:#8b8f99;font:15px system-ui">`
  + `<b style="color:#d9dbe1;font-size:18px">${escaparHtml(c.rotulo)}</b><span>${escaparHtml(texto)}</span></body>`)}`;

/**
 * O que cada célula mostra: sempre o jogo. Conta sem login no app abre na tela de entrar do próprio
 * jogo (Discord ou e-mail e senha; o Google recusa login dentro de apps); `semLogin` deixa a barra
 * dizer isso até a conta conectar.
 */
export const conteudoDaCelula = (_c, { sessao }) => ({ url: URL_JOGO, semLogin: sessao !== 'logada' });

/** Extensões de uma conta, na ordem de carregar: o Onde Caçar (se houver cópia), as escolhidas pelo usuário e o rótulo dela. */
export const extensoesDaConta = (decisao, pastaOndeCacar, pastaRotulo, extras = []) => [...(decisao.acao === 'sem' ? [] : [pastaOndeCacar]), ...extras, pastaRotulo];

// Barra das contas: estado e resumo (hunt, treinador, ritmo) de cada uma e os botões ampliar / som / recarregar / atualizar o Onde Caçar. Todo texto entra por
// textContent (nunca vira HTML) e todo clique vira um comando que o processo principal confere.
const TEXTO = {
  carregando: 'carregando', conectada: 'conectada', desconectada: 'desconectada',
  bloqueada: 'aberta em outra célula', 'sem-login': 'entre na conta',
  caiu: 'a página caiu', erro: 'erro ao carregar',
};

// conta ainda sem login no app: entra na própria célula, menos com o Google
const DICA_LOGIN = 'entre na conta dentro da célula, com Discord ou e-mail e senha. O Google não deixa entrar dentro de apps: para conta Google, use ⚙ → Trazer login de um navegador.';

const el = (tag, props = {}, ...filhos) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...filhos); return e; };
const botao = (texto, title, acao, id) => {
  const b = el('button', { textContent: texto, title });
  b.addEventListener('click', () => window.barra.comando(acao, id));
  return b;
};

// O retrato chega a cada mudança de gold (várias vezes por minuto): só redesenha quando o que
// aparece na tela mudou, senão um clique no meio do redesenho se perde e a dica aberta some.
let desenhado = '';
function desenhar(r) {
  const visivel = JSON.stringify({ ...r, contas: r.contas.map((c) => ({ ...c, resumo: window.formatoBarra.partes(c.resumo) })) });
  if (visivel === desenhado) return;
  desenhado = visivel;
  const lista = document.getElementById('contas');
  lista.replaceChildren(...r.contas.map((c) => {
    // segunda linha: hunt, treinador e ritmo (apagada enquanto a conta não está conectada)
    const pedacos = window.formatoBarra.partes(c.resumo);
    const resumo = el('span', { className: 'resumo', title: pedacos.join('\n') },
      ...(pedacos.length ? pedacos.map((t) => el('span', { textContent: t })) : [el('span', { textContent: '—' })]));
    const topo = el('span', { className: 'topo' },
      el('span', { className: 'ponto' }),
      el('span', { className: 'nome', textContent: c.nick ? `${c.rotulo} · ${c.nick}` : c.rotulo, title: `${c.rotulo}: ${c.status === 'sem-login' ? DICA_LOGIN : TEXTO[c.status] ?? c.status}` }),
      el('span', { className: 'estado', textContent: c.status === 'conectada' ? '' : TEXTO[c.status] ?? c.status }),
      botao(c.ampliada ? '▦' : '⤢', c.ampliada ? 'Voltar ao mosaico (Ctrl+0)' : `Ampliar (${c.atalho})`, c.ampliada ? 'grade' : 'ampliar', c.id),
      botao(c.mudo ? '🔇' : '🔊', c.mudo ? 'Ligar o som desta conta' : 'Silenciar esta conta', 'som', c.id),
      botao('↻', 'Recarregar esta conta (fora do jogo, volta para ele)', 'recarregar', c.id));
    const div = el('span', { className: `conta${c.ampliada ? ' ampliada' : ''}` }, topo, resumo);
    div.dataset.status = c.status;
    return div;
  }));
  document.getElementById('grade').hidden = r.ampliada == null || r.compacto;
  const compacto = document.getElementById('compacto');
  compacto.textContent = r.compacto ? '▦ Mosaico' : '▭ Compacto';
  compacto.title = r.compacto ? 'Voltar ao mosaico com os jogos (Ctrl+M)' : 'Só esta faixa com o status das contas (Ctrl+M); os jogos seguem rodando';
  document.body.classList.toggle('modo-compacto', !!r.compacto);
  // Onde Caçar: o botão traz a versão do clone para todas as contas (recarrega as páginas)
  const atualizar = document.getElementById('atualizar');
  atualizar.disabled = r.ondeCacar.atualizando || !r.ondeCacar.pronto;
  atualizar.textContent = r.ondeCacar.atualizando ? '⟳ atualizando…' : '⟳ Onde Caçar';
  atualizar.title = `Onde Caçar ${r.ondeCacar.versao ? `v${r.ondeCacar.versao}` : '(não carregado)'}. Clique para trazer a versão do clone e recarregar todas as contas`;
  const nova = document.getElementById('novidade');
  nova.hidden = !r.versaoNova;
  nova.textContent = r.versaoNova ? `⬆ v${r.versaoNova}` : '';
  const p = document.getElementById('problemas');
  p.hidden = !r.problemas.length;
  p.textContent = r.problemas.length ? `⚠ ${r.problemas[0]}${r.problemas.length > 1 ? ` (+${r.problemas.length - 1})` : ''}` : '';
  p.title = r.problemas.join('\n');
}

document.getElementById('grade').addEventListener('click', () => window.barra.comando('grade', null));
document.getElementById('compacto').addEventListener('click', () => window.barra.comando('compacto', null));
document.getElementById('atualizar').addEventListener('click', () => window.barra.comando('atualizar', null));
document.getElementById('config').addEventListener('click', () => window.barra.comando('config', null));
document.getElementById('novidade').addEventListener('click', () => window.barra.comando('novidade', null));
window.barra.aoRetrato(desenhar);
window.barra.pronta();

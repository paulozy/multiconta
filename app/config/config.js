// Tela de configuração: contas, trazer login de um navegador e extensões. Todo texto entra por
// textContent; cada pedido vai para o processo principal, que confere e grava.
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...filhos) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...filhos); return e; };
const TEXTO_LOGIN = { logada: 'logada', 'sem-sessao': 'sem login', 'sem-particao': 'sem login' };

let dados = null;
let contas = []; // [{ id (null = nova), rotulo, leve, login }]
let extras = []; // [{ id, nome }]
let importando = null; // conta do painel "trazer login"

function mostrarErro(onde, texto) { const p = $(onde); p.hidden = !texto; p.textContent = texto ?? ''; }

function desenharContas() {
  $('contas').replaceChildren(...contas.map((c, i) => {
    const nome = el('input', { type: 'text', value: c.rotulo, maxLength: 40, placeholder: 'Nome da conta' });
    nome.addEventListener('input', () => { c.rotulo = nome.value; });
    const leve = el('input', { type: 'checkbox', checked: c.leve, title: 'Modo leve: menos animação e quadros por segundo (só no desenho; corta muito a CPU)' });
    leve.addEventListener('change', () => { c.leve = leve.checked; });
    const trazer = el('button', { className: 'secundario', textContent: 'Trazer login', disabled: !dados.navegadores.length,
      title: !dados.navegadores.length ? 'Nenhum navegador com perfis encontrado' : 'Copiar o login de um navegador em que a conta já está logada' });
    trazer.addEventListener('click', () => abrirImportar(c));
    const remover = el('button', { className: 'perigo', textContent: 'Remover', title: 'Tirar a conta do app' });
    remover.addEventListener('click', () => {
      if (c.id && c.login === 'logada' && !confirm(`Remover "${c.rotulo}"? O login dela será apagado deste PC (a conta no jogo continua existindo).`)) return;
      contas.splice(i, 1);
      if (importando === c) { importando = null; $('importar').hidden = true; }
      desenharContas();
    });
    const login = el('span', { className: `login ${c.login ?? ''}`, textContent: c.id ? TEXTO_LOGIN[c.login] ?? 'sem login' : 'nova' });
    return el('div', { className: 'conta' }, nome, el('label', { title: leve.title }, leve, 'leve'), login, trazer, remover);
  }));
  $('adicionar-conta').disabled = contas.length >= dados.maxContas;
  $('adicionar-conta').title = contas.length >= dados.maxContas ? `O jogo libera até ${dados.maxContas} contas por conexão` : '';
}

function desenharExtras() {
  $('extras').replaceChildren(...extras.map((x, i) => {
    const remover = el('button', { className: 'perigo', textContent: 'Remover' });
    remover.addEventListener('click', () => { extras.splice(i, 1); desenharExtras(); });
    return el('div', { className: 'extra' }, el('span', { textContent: x.nome }), remover);
  }));
}

function abrirImportar(c) {
  importando = c;
  $('importar').hidden = false;
  $('importar-conta').textContent = c.rotulo || 'conta nova';
  mostrarErro('importar-erro', null);
  const navs = $('importar-navegador');
  navs.replaceChildren(...dados.navegadores.map((n) => el('option', { value: n.id, textContent: n.nome })));
  const perfis = () => {
    const n = dados.navegadores.find((x) => x.id === navs.value);
    $('importar-perfil').replaceChildren(...(n?.perfis ?? []).map((p) => el('option', { value: p.pasta, textContent: p.nome })));
  };
  navs.onchange = perfis;
  perfis();
  $('importar').scrollIntoView({ behavior: 'smooth' });
}

$('importar-cancelar').addEventListener('click', () => { importando = null; $('importar').hidden = true; });
// o que está na tela (salvar e trazer login gravam tudo junto: nada do que foi editado se perde)
const pedido = (importar) => ({
  contas: contas.map(({ id, rotulo, leve }) => ({ id, rotulo: rotulo.trim(), leve })),
  ondeCacar: $('onde-cacar').checked,
  extensoes: extras,
  ...(importar ? { importar } : {}),
});
async function salvar(importar, ondeErro) {
  for (const b of [$('salvar'), $('importar-ok')]) b.disabled = true;
  const r = await window.config.salvar(pedido(importar));
  for (const b of [$('salvar'), $('importar-ok')]) b.disabled = false;
  if (!r.ok) mostrarErro(ondeErro, r.erro); // se deu certo, o app reinicia
}
$('importar-ok').addEventListener('click', () => {
  if (!importando || !contas.includes(importando)) return;
  if (importando.login === 'logada' && !confirm(`"${importando.rotulo}" já tem login no app. Trocar pelo login do navegador?`)) return;
  salvar({ indice: contas.indexOf(importando), navegador: $('importar-navegador').value, pasta: $('importar-perfil').value }, 'importar-erro');
});

$('adicionar-conta').addEventListener('click', () => {
  if (contas.length >= dados.maxContas) return;
  contas.push({ id: null, rotulo: `Conta ${contas.length + 1}`, leve: true, login: null });
  desenharContas();
});

$('adicionar-extensao').addEventListener('click', async () => {
  if (!confirm('Uma extensão aberta no jogo consegue ler o login das contas. Adicionar mesmo assim uma extensão em que você confia?')) return;
  const r = await window.config.adicionarExtensao();
  if (r?.erro) mostrarErro('erro', r.erro);
  else if (r?.extensao && !extras.some((x) => x.id === r.extensao.id)) { extras.push(r.extensao); desenharExtras(); mostrarErro('erro', null); }
});

$('repositorio').addEventListener('click', (ev) => { ev.preventDefault(); window.config.abrirRepositorio(); });
$('cancelar').addEventListener('click', () => window.config.fechar());
$('salvar').addEventListener('click', () => salvar(null, 'erro'));

(async () => {
  dados = await window.config.dados();
  contas = dados.contas.map((c) => ({ ...c }));
  extras = dados.extensoes.map((x) => ({ ...x }));
  $('onde-cacar').checked = dados.ondeCacar.ativo;
  $('onde-versao').textContent = dados.ondeCacar.versao ? `v${dados.ondeCacar.versao}` : '';
  if (!contas.length) contas.push({ id: null, rotulo: 'Conta 1', leve: true, login: null }); // primeira vez
  desenharContas();
  desenharExtras();
})();

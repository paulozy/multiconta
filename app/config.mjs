// Configuração do app em %LOCALAPPDATA%\PokeIdleMulticonta\config.json, gravada pelo próprio app (as
// telas de configuração). Quem já usava o contas.json do lançador tem as contas trazidas de lá na
// primeira abertura; quem instalou agora começa sem contas.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// O jogo libera até 4 contas por IP: o app não passa disso.
export const MAX_CONTAS = 4;
// O id vira nome de pasta (a partição da conta): só letras minúsculas, números e "-".
export const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,31}$/;

export const configPadrao = () => ({ contas: [], ondeCacar: true, extensoes: [], pastaDev: null });
// extensões a mais (escolhidas pelo usuário): copiadas para ext-app\extras\<id>
export const MAX_EXTENSOES = 10;

/**
 * Confere o config.json e devolve uma cópia limpa. Erros saem todos juntos, em português.
 * - contas: [{ id, rotulo, leve }] (até 4, ids únicos);
 * - ondeCacar: carregar o Onde Caçar nas contas (padrão: sim);
 * - extensoes: [{ id, nome }] outras extensões, adicionadas pela tela (até 10);
 * - pastaDev: pasta de onde copiar o Onde Caçar no lugar do que veio no instalador (para quem
 *   desenvolve a extensão), ou null.
 */
export function validarConfigApp(bruto, arquivo = 'config.json') {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) throw new Error(`${arquivo}: esperava um objeto`);
  const erros = [];
  const { contas = [], ondeCacar = true, extensoes = [], pastaDev = null } = bruto;
  if (!Array.isArray(contas)) erros.push('"contas" deve ser uma lista');
  else if (contas.length > MAX_CONTAS) erros.push(`"contas" tem ${contas.length} contas; o jogo libera até ${MAX_CONTAS} por IP`);
  if (typeof ondeCacar !== 'boolean') erros.push('"ondeCacar" deve ser true ou false');
  if (pastaDev !== null && (typeof pastaDev !== 'string' || !pastaDev.trim())) erros.push('"pastaDev" deve ser o caminho de uma pasta ou null');
  if (!Array.isArray(extensoes) || extensoes.length > MAX_EXTENSOES) erros.push(`"extensoes" deve ser uma lista de até ${MAX_EXTENSOES}`);
  const idsExt = new Set();
  const exts = (Array.isArray(extensoes) ? extensoes : []).map((x, i) => {
    if (!x || typeof x.id !== 'string' || !ID_VALIDO.test(x.id) || idsExt.has(x.id)) { erros.push(`extensoes[${i}]: "id" inválido ou repetido`); return null; }
    idsExt.add(x.id);
    return { id: x.id, nome: typeof x.nome === 'string' && x.nome.trim() ? x.nome.trim().slice(0, 60) : x.id };
  });

  const vistos = new Set();
  const saida = (Array.isArray(contas) ? contas : []).map((c, i) => {
    const onde = `contas[${i}]`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) { erros.push(`${onde}: esperava um objeto`); return null; }
    if (typeof c.id !== 'string' || !ID_VALIDO.test(c.id)) erros.push(`${onde}: "id" deve ter só letras minúsculas, números e "-" (ex.: "alt1")`);
    else if (vistos.has(c.id)) erros.push(`${onde}: o id "${c.id}" está repetido`);
    else vistos.add(c.id);
    if (typeof c.rotulo !== 'string' || !c.rotulo.trim() || c.rotulo.trim().length > 40) erros.push(`${onde}: "rotulo" é obrigatório (até 40 caracteres)`);
    else if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(c.rotulo)) erros.push(`${onde}: "rotulo" não pode ter quebra de linha nem caracteres de controle`);
    if (c.leve != null && typeof c.leve !== 'boolean') erros.push(`${onde}: "leve" deve ser true ou false`);
    return { id: c.id, rotulo: typeof c.rotulo === 'string' ? c.rotulo.trim() : c.rotulo, leve: c.leve ?? true };
  });
  if (erros.length) throw new Error(`${arquivo} com problemas:\n- ${erros.join('\n- ')}`);
  return { contas: saida, ondeCacar, extensoes: exts, pastaDev: pastaDev?.trim() ?? null };
}

/** Do contas.json do lançador: as contas (sem a janela do Edge) e o clone do Onde Caçar como pasta de desenvolvimento. */
export function deContasJson(bruto) {
  const contas = Array.isArray(bruto?.contas) ? bruto.contas.map((c) => ({ id: c?.id, rotulo: c?.rotulo, ...(c?.leve != null ? { leve: c.leve } : {}) })) : [];
  return validarConfigApp({ contas, ondeCacar: true, pastaDev: typeof bruto?.ondeCacar === 'string' ? bruto.ondeCacar : null }, 'contas.json');
}

/**
 * Lê a configuração de `raiz`. Devolve { cfg, origem }: 'config' (config.json), 'contas.json'
 * (trazida do lançador; o chamador grava) ou 'nova' (primeira vez, sem contas).
 * Arquivo estragado é erro: melhor avisar do que abrir com as contas sumidas.
 */
export function lerConfigApp(raiz) {
  const ler = (arq) => {
    try { return JSON.parse(readFileSync(join(raiz, arq), 'utf8')); }
    catch (e) { throw new Error(`não consegui ler ${arq}: ${e.message}`); }
  };
  if (existsSync(join(raiz, 'config.json'))) return { cfg: validarConfigApp(ler('config.json')), origem: 'config' };
  if (existsSync(join(raiz, 'contas.json'))) return { cfg: deContasJson(ler('contas.json')), origem: 'contas.json' };
  return { cfg: configPadrao(), origem: 'nova' };
}

/** Grava sem deixar o arquivo pela metade (escreve ao lado e troca). */
export function gravarConfigApp(raiz, cfg) {
  const limpa = validarConfigApp(cfg);
  const arq = join(raiz, 'config.json'), tmp = `${arq}.novo`;
  writeFileSync(tmp, `${JSON.stringify(limpa, null, 2)}\n`);
  renameSync(tmp, arq);
  return limpa;
}

/** Id novo para uma conta ou extensão, a partir do nome: "Alt Três" → "alt-tres" (único entre `usados`). */
export function novoId(nome, usados) {
  const base = String(nome ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'conta';
  const ocupados = new Set(usados);
  if (!ocupados.has(base)) return base;
  for (let n = 2; ; n++) if (!ocupados.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * O que a tela pediu, aplicado à configuração atual. Conta com id conhecido continua a mesma (mesmo
 * login); id desconhecido ou nulo vira conta nova, com id tirado do nome e que não reaproveita nem um
 * id em uso nem um de `outrosIds` (pastas de login que já existem). Extensão só entra se já estava ou
 * se acabou de ser adicionada (`extensoesNovas`). Devolve { cfg, apagar }: apagar = contas removidas
 * (o login delas sai deste PC).
 */
export function aplicarPedidoDeConfig(atual, pedido, { outrosIds = [], extensoesNovas = [] } = {}) {
  const antigos = atual.contas.map((c) => c.id);
  const usados = new Set();
  const contas = (Array.isArray(pedido?.contas) ? pedido.contas : []).map((c) => {
    let id = typeof c?.id === 'string' && antigos.includes(c.id) && !usados.has(c.id) ? c.id : null;
    id ??= novoId(c?.rotulo, [...antigos, ...usados, ...outrosIds]);
    usados.add(id);
    return { id, rotulo: c?.rotulo, leve: c?.leve !== false };
  });
  const validas = new Map([...atual.extensoes, ...extensoesNovas].map((x) => [x.id, x]));
  const extensoes = (Array.isArray(pedido?.extensoes) ? pedido.extensoes : []).filter((x) => validas.has(x?.id)).map((x) => validas.get(x.id));
  const cfg = validarConfigApp({ ...atual, contas, ondeCacar: pedido?.ondeCacar !== false, extensoes });
  return { cfg, apagar: antigos.filter((id) => !usados.has(id)) };
}

// Lê e confere o contas.json. Erros saem todos juntos, em português, para corrigir de uma vez.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// O jogo libera até 4 contas por IP: o lançador não passa disso.
export const MAX_CONTAS = 4;
// O id vira nome de pasta e entra em padrões do PowerShell: só letras minúsculas, números e "-".
const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,31}$/;

const CHAVES_TOPO = new Set(['ondeCacar', 'edge', 'contas']);
const CHAVES_CONTA = new Set(['id', 'rotulo', 'leve', 'janela']);
const sobrando = (obj, validas) => Object.keys(obj).filter((k) => !validas.has(k));

/** Confere o objeto do contas.json e devolve uma cópia com os padrões preenchidos. */
export function validarConfig(bruto, arquivo = 'contas.json') {
  const erros = [];
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) throw new Error(`${arquivo}: esperava um objeto { "contas": [...] }`);
  const { contas, ondeCacar, edge } = bruto;
  // chave desconhecida quase sempre é erro de digitação ("janelas", "rótulo")
  for (const k of sobrando(bruto, CHAVES_TOPO)) erros.push(`chave desconhecida "${k}" (válidas: ${[...CHAVES_TOPO].join(', ')})`);
  if (ondeCacar != null && (typeof ondeCacar !== 'string' || !ondeCacar.trim())) erros.push('"ondeCacar" deve ser o caminho do clone do Onde Caçar');
  if (edge != null && (typeof edge !== 'string' || !edge.trim())) erros.push('"edge" deve ser o caminho do msedge.exe');
  if (!Array.isArray(contas) || !contas.length) erros.push('"contas" deve ser uma lista com pelo menos uma conta');
  else if (contas.length > MAX_CONTAS) erros.push(`"contas" tem ${contas.length} contas; o jogo libera até ${MAX_CONTAS} por IP`);

  const vistos = new Set();
  const saida = (Array.isArray(contas) ? contas : []).map((c, i) => {
    const onde = `contas[${i}]`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) { erros.push(`${onde}: esperava um objeto`); return null; }
    for (const k of sobrando(c, CHAVES_CONTA)) erros.push(`${onde}: chave desconhecida "${k}" (válidas: ${[...CHAVES_CONTA].join(', ')})`);
    if (typeof c.id !== 'string' || !ID_VALIDO.test(c.id)) erros.push(`${onde}: "id" deve ter só letras minúsculas, números e "-" (ex.: "alt1")`);
    else if (vistos.has(c.id)) erros.push(`${onde}: o id "${c.id}" está repetido`);
    else vistos.add(c.id);
    if (typeof c.rotulo !== 'string' || !c.rotulo.trim() || c.rotulo.trim().length > 40) erros.push(`${onde}: "rotulo" é obrigatório (até 40 caracteres)`);
    if (c.leve != null && typeof c.leve !== 'boolean') erros.push(`${onde}: "leve" deve ser true ou false`);
    if (c.janela != null) {
      const j = c.janela;
      const inteiro = (v) => Number.isInteger(v);
      if (!j || !['x', 'y', 'w', 'h'].every((k) => inteiro(j[k])) || j.w <= 0 || j.h <= 0) {
        erros.push(`${onde}: "janela" deve ser { "x", "y", "w", "h" } em pixels inteiros, com w e h positivos`);
      }
    }
    return { id: c.id, rotulo: typeof c.rotulo === 'string' ? c.rotulo.trim() : c.rotulo, leve: c.leve ?? true, ...(c.janela ? { janela: c.janela } : {}) };
  });

  if (erros.length) throw new Error(`${arquivo} com problemas:\n- ${erros.join('\n- ')}`);
  return { ...(ondeCacar ? { ondeCacar } : {}), ...(edge ? { edge } : {}), contas: saida };
}

/**
 * Lê o contas.json da primeira pasta que tiver um (na ordem dada); sem nenhum, o exemplo.
 * O lançador procura primeiro na pasta de dados (sobrevive a reinstalar) e depois ao lado do código.
 */
export function lerConfig(pastas) {
  const lista = [].concat(pastas);
  const achar = (nome) => lista.map((p) => join(p, nome)).find((c) => existsSync(c));
  const caminho = achar('contas.json') ?? achar('contas.exemplo.json') ?? join(lista.at(-1), 'contas.exemplo.json');
  const arq = caminho.split(/[\\/]/).pop();
  let bruto;
  try { bruto = JSON.parse(readFileSync(caminho, 'utf8')); }
  catch (e) { throw new Error(`não consegui ler ${arq}: ${e.message}`); }
  return { arquivo: arq, caminho, ...validarConfig(bruto, arq) };
}

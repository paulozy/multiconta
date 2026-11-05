// O que a tela de configuração pede e só dá para fazer com as contas fechadas (a pasta de cada conta
// fica em uso enquanto ela está aberta): trazer o login de um navegador e apagar o login de uma conta
// removida. A tela grava o pedido em pendencias.json e reinicia o app; na abertura, antes de qualquer
// conta abrir, o app executa e apaga o arquivo.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ID_VALIDO } from './config.mjs';

const ARQ = 'pendencias.json';

/** Lê o pedido com desconfiança (só o que tem a forma certa). */
export function normalizarPendencias(bruto) {
  const p = bruto && typeof bruto === 'object' ? bruto : {};
  const importar = (Array.isArray(p.importar) ? p.importar : [])
    .filter((i) => i && typeof i.navegador === 'string' && typeof i.pasta === 'string' && typeof i.conta === 'string' && ID_VALIDO.test(i.conta))
    .map(({ navegador, pasta, conta }) => ({ navegador, pasta, conta }));
  const apagar = (Array.isArray(p.apagar) ? p.apagar : []).filter((id) => typeof id === 'string' && ID_VALIDO.test(id));
  return { importar, apagar: [...new Set(apagar)] };
}

export function lerPendencias(raiz) {
  try { return normalizarPendencias(JSON.parse(readFileSync(join(raiz, ARQ), 'utf8'))); } catch { return normalizarPendencias(null); }
}

/** Junta um pedido novo aos que já estavam (o último importar de uma conta vale). */
export function juntarPendencias(atuais, novas) {
  const a = normalizarPendencias(atuais), n = normalizarPendencias(novas);
  const contasNovas = new Set(n.importar.map((i) => i.conta));
  return {
    importar: [...a.importar.filter((i) => !contasNovas.has(i.conta)), ...n.importar],
    apagar: [...new Set([...a.apagar, ...n.apagar])],
  };
}

export const gravarPendencias = (raiz, p) => writeFileSync(join(raiz, ARQ), `${JSON.stringify(normalizarPendencias(p), null, 2)}\n`);

/**
 * Executa os pedidos e devolve { feitos, erros } (os erros vão para a barra): primeiro apaga, depois importa (apagar e
 * importar a mesma conta = trocar o login). O arquivo sai antes de executar: um pedido que derrube o
 * app não fica se repetindo a cada abertura.
 * `levar({ navegador, pasta, conta })` traz o login (lança com o motivo); `apagarLogin(id)` apaga.
 */
export function executarPendencias(raiz, { levar, apagarLogin, rotuloDe = (id) => id }) {
  const feitos = [], erros = [];
  if (!existsSync(join(raiz, ARQ))) return { feitos, erros };
  const p = lerPendencias(raiz);
  rmSync(join(raiz, ARQ), { force: true });
  for (const id of p.apagar) {
    try { apagarLogin(id); feitos.push(`login de ${rotuloDe(id)} apagado`); }
    catch (e) { erros.push(`não consegui apagar o login de ${rotuloDe(id)}: ${e.message}`); }
  }
  for (const i of p.importar) {
    try { levar(i); feitos.push(`login de ${rotuloDe(i.conta)} trazido do navegador`); }
    catch (e) { erros.push(`não consegui trazer o login de ${rotuloDe(i.conta)}: ${e.message}`); }
  }
  return { feitos, erros };
}

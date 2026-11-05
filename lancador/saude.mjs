// Saúde das extensões de uma conta, lida do "Secure Preferences" do perfil, sem abrir o Edge e sem
// porta de depuração. Só leitura: o modo de desenvolvedor fica nesse arquivo assinado (MAC) e
// editá-lo à mão seria falsificar a assinatura do Edge; quem liga é você, em edge://extensions.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Códigos de "disable_reasons" que já vimos. O 1<<24 apareceu no estudo com o modo de
// desenvolvedor desligado; o significado exato no Edge não está documentado, por isso o texto é cauteloso.
const MOTIVOS = new Map([
  [1, 'desativada à mão'],
  [1 << 24, 'desativada pelo Edge (código 16777216, visto com o modo de desenvolvedor desligado)'],
]);
const texto = (n) => MOTIVOS.get(n) ?? `desativada (código ${n})`;

/**
 * Motivos legíveis do que o Edge grava: uma lista (cada item é um motivo) ou um número antigo com
 * bits. Qualquer valor diferente de zero conta como desativada, para nunca dizer "ativa" à toa.
 */
export function motivos(disableReasons) {
  if (Array.isArray(disableReasons)) return [...new Set(disableReasons.filter((n) => n !== 0))].map(texto);
  const n = Number(disableReasons ?? 0);
  if (!n) return [];
  if (!Number.isSafeInteger(n) || n < 0) return [texto(n)];
  const bits = [];
  for (let b = 1, resto = n; resto > 0; b *= 2, resto = Math.floor(resto / 2)) if (resto % 2) bits.push(b);
  return bits.map(texto);
}

// caminho comparável: minúsculas, uma barra só, sem barra no fim
const normalizar = (p) => p.toLowerCase().replace(/[\\/]+/g, '\\').replace(/\\$/, '');

/**
 * Estado do perfil: modo de desenvolvedor e as extensões que vêm da pasta `raizExt` (as nossas,
 * carregadas pelo --load-extension). `extensoes` vazio = perfil que ainda não abriu pelo lançador.
 */
export function saudeDoPerfil(securePrefs, raizExt) {
  const raiz = `${normalizar(raizExt)}\\`; // com a barra: "ext2" não conta como "ext"
  const settings = securePrefs?.extensions?.settings ?? {};
  const extensoes = Object.values(settings)
    .filter((s) => typeof s?.path === 'string' && normalizar(s.path).startsWith(raiz))
    .map((s) => {
      const m = motivos(s.disable_reasons);
      return { pasta: s.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop(), ativa: m.length === 0, motivos: m };
    });
  return { modoDev: securePrefs?.extensions?.ui?.developer_mode === true, extensoes };
}

/**
 * O pokeidle.io está livre das guias em suspensão neste perfil? Vale qualquer um dos três jeitos
 * que o Edge grava no Preferences (sem assinatura): o recurso desligado, a exceção de descarte
 * ("[*.]pokeidle.io") ou a exceção de conteúdo de suspensão.
 * Sem isso, o Edge põe guias para dormir depois de edge.sleeping_tabs.threshold (15 min).
 */
// Padrão que cobre https://pokeidle.io (o host do jogo): "pokeidle.io", "[*.]pokeidle.io",
// "https://pokeidle.io", "https://[*.]pokeidle.io:443"... Só a parte principal da chave (as chaves de
// content settings são "principal,secundário"); "www.", "http://" e outros hosts não contam.
const PADRAO_POKEIDLE = /^(?:(?:https|\*):\/\/)?(?:\[\*\.\])?pokeidle\.io(?::443|:\*)?$/i;
const ehPokeidle = (chave) => PADRAO_POKEIDLE.test(chave.split(',')[0].trim());

export function suspensaoLiberada(prefs) {
  if (prefs?.edge?.sleeping_tabs?.enabled === false) return true;
  const excecoes = prefs?.performance_tuning?.tab_discarding?.exceptions_with_time ?? {};
  // content setting 2 = BLOCK (bloquear a suspensão); é o que aparece nos perfis em que o site foi
  // posto em "nunca colocar em suspensão". 1 (ALLOW) não conta.
  const conteudo = prefs?.profile?.content_settings?.exceptions?.sleeping_tabs ?? {};
  return Object.keys(excecoes).some(ehPokeidle)
    || Object.entries(conteudo).some(([k, v]) => ehPokeidle(k) && v?.setting === 2);
}

/** Minutos até o Edge pôr uma guia para dormir neste perfil (padrão visto no Edge 156: 900 s). */
export const minutosParaDormir = (prefs) => Math.round((Number(prefs?.edge?.sleeping_tabs?.threshold) || 900) / 60);

/**
 * Saúde completa a partir dos dois arquivos. `prefs` null (não deu para ler / não existe) =
 * suspensão desconhecida, sem aviso: melhor calar do que acusar à toa.
 */
export function saudeCompleta(securePrefs, prefs, raizExt) {
  return {
    ...saudeDoPerfil(securePrefs, raizExt),
    suspensao: prefs ? suspensaoLiberada(prefs) : undefined,
    minutos: minutosParaDormir(prefs),
  };
}

/** Avisos para mostrar antes de abrir a conta (lista vazia = tudo certo). */
export function avisos(saude, idConta) {
  const out = [];
  const desativadas = saude.extensoes.filter((e) => !e.ativa);
  for (const e of desativadas) out.push(`a extensão ${e.pasta} está desativada (${e.motivos.join(', ')})`);
  if (!saude.modoDev && saude.extensoes.length) out.push('o modo de desenvolvedor está desligado: o Edge pode desativar o Onde Caçar a qualquer momento');
  if (saude.suspensao === false) out.push(`as guias em suspensão estão ligadas para o pokeidle.io: o Edge pode pôr a conta para dormir depois de ${saude.minutos ?? 15} min sem uso`);
  if (out.length) out.push(`para arrumar: com a conta aberta, rode "node lancador.mjs extensoes ${idConta}" e siga os passos`);
  return out;
}

function lerJson(pastaConta, arquivo) {
  try { return JSON.parse(readFileSync(join(pastaConta, 'Default', arquivo), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`não consegui ler o ${arquivo} de ${pastaConta}: ${e.message}`); }
}

/** O Preferences (sem assinatura) de uma pasta de conta, ou null se o perfil ainda não existe. */
export const lerPreferences = (pastaConta) => lerJson(pastaConta, 'Preferences');

/**
 * O Secure Preferences de uma pasta de conta, ou null se o perfil ainda não existe. (Em máquina de
 * domínio o Chromium guarda as preferências protegidas no Preferences; aí não haveria avisos.)
 */
export const lerSecurePreferences = (pastaConta) => lerJson(pastaConta, 'Secure Preferences');

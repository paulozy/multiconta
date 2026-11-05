// Para onde uma célula pode ir. O jogo fica no pokeidle.io; o login usa Google ou Discord. Link para
// qualquer outro site abre no navegador padrão do Windows (fora do app, sem a sessão da conta);
// endereço que não é http(s) (file:, javascript:, protocolos de app...) é simplesmente recusado.

// pokeidle.io e subdomínios; o login do Google passa por accounts.google.<país> e accounts.youtube.com;
// o do Discord fica em discord.com (sem subdomínios: support.discord.com é outra empresa)
const permitido = (host) => host === 'pokeidle.io' || host.endsWith('.pokeidle.io')
  // só os domínios do Google por país (.com, .com.br, .co.uk, .de): "google.xyz.co" seria de qualquer um
  || /^accounts\.google\.(com(\.[a-z]{2})?|co\.[a-z]{2}|[a-z]{2})$/.test(host) || host === 'accounts.youtube.com'
  || host === 'discord.com' || host === 'www.discord.com';

/** 'permitir' (fica na célula) | 'externo' (abre no navegador) | 'bloquear'. */
export function destino(url) {
  let u;
  try { u = new URL(url); } catch { return 'bloquear'; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'bloquear';
  if (u.username || u.password) return 'bloquear'; // "https://pokeidle.io@outro.site" engana a vista
  if (u.protocol === 'https:' && permitido(u.hostname.replace(/\.$/, ''))) return 'permitir';
  return 'externo';
}

// Permissões: só avisos (os do Onde Caçar), e só pedidos pela página do jogo. Câmera, microfone,
// localização, área de transferência etc. ficam negados para todo mundo.
export function permissaoLiberada(permissao, origemOuUrl) {
  if (permissao !== 'notifications') return false;
  try { return new URL(origemOuUrl).origin === 'https://pokeidle.io'; } catch { return false; }
}

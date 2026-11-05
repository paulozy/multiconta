# PokeIdle Multiconta: desenvolvimento

Para quem mexe no código (o guia de quem só quer usar é o README.md). Instalação de desenvolvimento a
partir do repositório, com o Electron baixado pelo npm.

Abre as contas do PokeIdle numa **janela só, em mosaico**: até 4 contas lado a lado, cada uma com o
login isolado, o Onde Caçar carregado e o nome da conta na barra. Tudo roda no seu PC: nenhuma sessão,
cookie ou senha sai da máquina, e o app não guarda senha nenhuma.


## Uso diário

- Abra pelo atalho **PokeIdle Multiconta** (Área de Trabalho ou Iniciar).
- **Barra no topo**: cada conta com o estado (🟢 conectada, 🟡 carregando, 🔴 desconectada/caiu,
  🟠 aberta em outro lugar) e os botões **⤢ ampliar**, **🔇/🔊 som** e **↻ recarregar**.
- **Segunda linha de cada conta**: onde está caçando (🎯 hunt, ou 🏥 no Centro), 👤 nível do treinador,
  💰 gold com o ritmo da sessão (+…/h) e ⚔ abates/h. Vem do Onde Caçar (só leitura; o ritmo aparece
  depois de 2 min na hunt). Passe o mouse para ver a linha inteira.
- **Ctrl+1..4** amplia a conta daquela posição; **Ctrl+0** (ou "▦ Grade") volta ao mosaico.
- **Ctrl+M** (ou "▭ Compacto"): a janela vira só a faixa com o status das contas; os jogos seguem
  rodando escondidos. Ctrl+M de novo (ou "▦ Mosaico") volta ao tamanho de antes; Ctrl+1..4 volta já
  com a conta ampliada.
- Pode **minimizar a janela**: as contas seguem caçando.
- Posição da janela, conta ampliada, som de cada conta e o modo compacto ficam gravados para a próxima vez.

**Uma sessão por conta:** o jogo pausa a sessão mais antiga quando a mesma conta entra em outro lugar.
O app impede a mesma conta em duas células, mas **não enxerga o seu navegador** nem o lançador do Edge:
com o app aberto, não jogue essas contas em outro lugar.

## Contas

Use o **⚙** da barra para adicionar, renomear e remover contas, **trazer o login** de um navegador
(Edge, Chrome, Brave, Opera), ligar o Onde Caçar e adicionar outras extensões. A configuração fica em
`%LOCALAPPDATA%\PokeIdleMulticonta\config.json`, gravada pelo app (até 4 contas, o
limite do jogo por IP). Na primeira abertura, quem já tinha o `contas.json` do lançador tem as contas
trazidas de lá (o clone do `ondeCacar` vira a pasta de desenvolvimento). Isso acontece uma vez só: depois, mudanças
no `contas.json` não chegam mais ao app.

```json
{
  "contas": [
    { "id": "principal", "rotulo": "Principal", "leve": true },
    { "id": "alt1", "rotulo": "Alt 1", "leve": false }
  ],
  "ondeCacar": true,
  "pastaDev": "C:\\caminho\\do\\clone\\onde-cacar"
}
```

- `id`: letras minúsculas, números e "-"; `rotulo`: o nome que aparece na barra.
- `leve` (padrão `true`): modo leve, que pausa as animações infinitas da página e limita os quadros a
  ~10/s. Só muda o desenho no seu PC; corta muito a CPU.
- `ondeCacar` (padrão `true`): carregar o Onde Caçar nas contas.
- `pastaDev`: pasta de onde copiar o Onde Caçar no lugar da que vem no instalador (quem desenvolve a
  extensão); `null` para usar a do instalador.

**Entrar numa conta nova:** conta sem login no app abre na tela de entrar do próprio jogo, dentro da
célula (a barra diz "entre na conta"). Discord e e-mail/senha funcionam ali. O Google recusa login dentro
de apps: para conta Google, traga o login de um navegador (abaixo). Se a célula ficar presa no Google ou no
Discord, o **↻** volta para o jogo.

**Trazer o login de uma conta para o app** (com o app fechado), a partir do repositório:

```bash
node.exe app/cli.mjs importar "Perfil 2" alt2   # de um perfil do seu Edge (feche as janelas dele antes)
node.exe app/cli.mjs estado                     # login de cada conta no app
```

O nome do perfil é o que o Edge mostra (`node.exe lancador/lancador.mjs perfis` lista todos). Só a
sessão do jogo é copiada: senhas, histórico e cookies do seu perfil não vão junto.

## Atualizar

- **Onde Caçar**: deixe o código novo na pasta de desenvolvimento (`pastaDev` do `config.json`) e clique
  em **⟳ Onde Caçar** na barra: o app copia a versão nova, recarrega a extensão e reabre o jogo em todas
  as contas (cada uma reconecta). A versão carregada aparece ao passar o mouse no botão. Reabrir o app
  também traz a versão nova. O **↻** de cada conta só recarrega a página, com a versão que já estava.
- **O app**: com o app fechado, `node.exe app/cli.mjs instalar` a partir do repositório. O Electron
  (versão travada em `app/package-lock.json`) só é baixado de novo quando essa versão mudar.
- **Desinstalar**: `node.exe app/cli.mjs desinstalar`. Logins, estado e `config.json` ficam.

## Segurança

- O login de cada conta é um **token no localStorage** da partição dela
  (`%LOCALAPPDATA%\PokeIdleMulticonta\electron\Partitions\<conta>`). Quem lê essa pasta leva a conta e
  as Gemas. **Nunca** sincronize `%LOCALAPPDATA%\PokeIdleMulticonta` com OneDrive, backup na nuvem ou git.
- O app roda cada conta com sandbox, isolamento de contexto e sem Node na página; a célula só navega no
  pokeidle.io e no login (Google/Discord); outros links abrem no seu navegador; só avisos são permitidos.
- `MULTICONTA_PORTA_TESTE` abre a porta de depuração para os testes de aceite (o título avisa). Com ela
  aberta, qualquer programa do PC lê os tokens: **nunca** deixe essa variável definida no sistema.
- Registro do app: `electron\registro.log` (sem tokens).

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| "Conta aberta em outro lugar" dentro da célula | A conta está aberta em outro lugar (Edge pessoal, celular). Feche lá e clique em "Jogar aqui". |
| Célula "Sem login no app" | Traga o login (`importar`), com o app fechado. |
| Conta volta para a tela de login | O token do jogo dura 30 dias, mas o próprio jogo o renova depois da metade do prazo (pelo socket ou ao carregar a página), então conta jogada pelo menos a cada ~2 semanas não expira. Se expirar (ou "sair de todos os aparelhos", troca de senha), entre no jogo pelo Edge e importe de novo (o login do Google costuma ser recusado dentro de apps). |
| ⚠ na barra | Passe o mouse para ler; o registro tem o detalhe. |

## Reserva: lançador do Edge

`lancador/` abre cada conta numa janela separada do Edge (opção A do estudo), com os mesmos módulos.
Atalhos "PokeIdle (Edge) · …" no Iniciar. Exige, uma vez por perfil, o modo de desenvolvedor ligado e
as guias em suspensão desligadas (`node.exe lancador/lancador.mjs extensoes <conta>` mostra como).
Nunca abra a mesma conta no app e no lançador ao mesmo tempo: nenhum dos dois enxerga o outro. O
lançador usa o `contas.json`; o rótulo e os módulos comuns ele importa de `app/`.

## Gerar o instalador

No Windows (o `tar.exe` do sistema abre o zip do Onde Caçar):

```bash
npm ci --ignore-scripts
npm run pacote      # baixa o Onde Caçar fixado (conferido pelo SHA-256) e gera dist/PokeIdle-Multiconta-<versão>-instalador.exe
```

O Onde Caçar do instalador é a versão fixada em `package.json` ("ondeCacar": tag e SHA-256). Para levar
outra: `node scripts/baixar-onde-cacar.mjs fixar vX.Y.Z`, conferir a release e fazer o commit.

Publicar: subir a versão em `app/package.json` e enviar a tag `v<versão>`. O workflow
`.github/workflows/release.yml` roda os testes, gera o instalador no `windows-latest` e cria a Release com
o `.exe` e o `SHA256SUMS.txt`.

## Desenvolvimento

- Testes (no WSL): `npm test`.
- O app e o lançador rodam no Windows (`node.exe`); o código mora no WSL.

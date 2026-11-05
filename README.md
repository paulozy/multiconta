# PokeIdle Multiconta

Jogue até **4 contas do PokeIdle numa janela só**, lado a lado, cada uma com o login separado, o nome na
barra e o **Onde Caçar** já instalado. Uma barra no topo mostra, sem você precisar abrir cada jogo, onde
cada conta está caçando, o nível, o gold e o ritmo da sessão.

**Código aberto (MIT), gratuito, e tudo fica no seu PC**: o app não guarda senha, não tem servidor nem
telemetria, e nenhum login sai da sua máquina.

## Baixar e instalar (Windows)

1. Na página de [Releases](https://github.com/paulozy/multiconta/releases/latest), baixe o
   **PokeIdle-Multiconta-…-instalador.exe**.
2. Abra. O Windows deve mostrar **"O Windows protegeu o computador"**. Isso acontece porque o instalador
   não tem certificado de assinatura (é pago e caro para um projeto gratuito), não porque haja algo de
   errado. Clique em **Mais informações** → **Executar assim mesmo**. Não precisa ser administrador.
   - Com o *Controle Inteligente de Aplicativos* (Smart App Control) do Windows 11 ligado, o Windows não
     deixa abrir programas sem assinatura. Não recomendamos desligar proteções do sistema por causa disso.
3. Quer conferir que o arquivo é exatamente o gerado aqui? No PowerShell, na pasta do download:
   `Get-FileHash .\PokeIdle-Multiconta-*-instalador.exe` e compare com o `SHA256SUMS.txt` da Release.

O instalador é gerado pelo GitHub Actions, à vista de todos, a partir do código de cada versão. O Onde
Caçar que vai junto é uma [release oficial dele](https://github.com/paulozy/onde-cacar/releases) cuja
versão e SHA-256 ficam fixados no código do multiconta (`package.json`): trocar de versão é uma mudança
visível no histórico.

## Primeiros passos

- Na primeira abertura aparece a **configuração**: dê nome às contas (até 4, o limite do jogo por
  conexão) e salve. Ela abre de novo pelo **⚙** da barra.
- **Entrar nas contas:**
  - **Discord ou e-mail e senha:** entre direto na célula da conta, na tela do próprio jogo.
  - **Google:** o Google não deixa entrar dentro de apps. Entre no jogo num navegador (Edge, Chrome,
    Brave ou Opera), feche o navegador e, no **⚙**, use **Trazer login** escolhendo esse navegador e o
    perfil. O app reinicia com a conta logada.
- **Atalhos:** Ctrl+1..4 amplia uma conta, Ctrl+0 volta ao mosaico, Ctrl+M deixa só a faixa com o status
  (os jogos seguem rodando). Pode minimizar: as contas seguem caçando.

## Extensões

O **Onde Caçar** vem junto e marcado (pode desligar no ⚙). Ele é código aberto: você pode ler cada linha
em [github.com/paulozy/onde-cacar](https://github.com/paulozy/onde-cacar).

Dá para adicionar outras extensões (a pasta descompactada, com o `manifest.json`), mas **cuidado**: uma
extensão aberta no jogo consegue ler o login da conta e levar a conta e as Gemas. Só adicione o que você
confia. Algumas extensões do Chrome não funcionam aqui.

## Segurança e privacidade

- O login de cada conta é o do próprio jogo, guardado em `%LOCALAPPDATA%\PokeIdleMulticonta`. Quem tiver
  essa pasta tem as suas contas: **nunca** a sincronize com OneDrive, backup na nuvem ou envie a alguém.
- O app em si só fala com o jogo (pokeidle.io), com o login do Google/Discord quando você entra, e com o
  GitHub para saber se há versão nova (um acesso público, sem nenhum dado seu). A página do jogo carrega o
  que ela mesma carrega, e extensões extras falam com quem quiserem. Links para outros sites abrem no seu
  navegador.
- **Uma sessão por conta:** o app não deixa a mesma conta abrir em duas células. Ele não enxerga o seu
  navegador: com o app aberto, não jogue essas contas em outro lugar (o jogo derruba uma das sessões).
- Nada aqui joga por você nem passa dos limites do jogo: são as mesmas 4 contas por conexão.

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| "entre na conta" na barra | A conta está na tela de entrar: entre na célula (Discord/e-mail) ou use ⚙ → Trazer login. |
| A célula ficou na página do Google ou do Discord | Clique no ↻ da conta: ela volta para o jogo. |
| "Conta aberta em outro lugar" dentro da célula | Feche a conta onde mais ela estiver (navegador, celular) e clique em "Jogar aqui". |
| Trazer login diz que o perfil está aberto | Feche todas as janelas desse perfil no navegador (ele só grava o login ao fechar) e tente de novo. |
| ⬆ com um número na barra | Há versão nova: clique para abrir a página e baixar. |
| ⚠ na barra | Passe o mouse para ler. O registro fica em `%LOCALAPPDATA%\PokeIdleMulticonta\electron\registro.log` (sem logins). |

Desinstalar (Configurações do Windows → Aplicativos) mantém os logins e a configuração; para apagar tudo,
apague também a pasta `%LOCALAPPDATA%\PokeIdleMulticonta`.

Para quem quer mexer no código: [DESENVOLVIMENTO.md](DESENVOLVIMENTO.md).

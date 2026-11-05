## Como instalar

1. Baixe o **PokeIdle-Multiconta-…-instalador.exe** aqui embaixo, em *Assets*.
2. Abra. O Windows deve mostrar **"O Windows protegeu o computador"**: o instalador não tem certificado de
   assinatura (custa caro para um projeto gratuito), então ele ainda não tem "reputação". Clique em
   **Mais informações** → **Executar assim mesmo**. Não precisa ser administrador.
3. O app abre na tela de configuração: adicione suas contas (até 4) e salve.

**Quer conferir que o arquivo é o mesmo gerado aqui?** No PowerShell, na pasta do download:
`Get-FileHash .\PokeIdle-Multiconta-*-instalador.exe` e compare com o `SHA256SUMS.txt` desta página.

O instalador é gerado pelo GitHub Actions a partir do código desta versão (aba *Actions* do repositório),
e o Onde Caçar que vai junto é uma release oficial dele, com versão e SHA-256 fixados no código.
Código aberto, licença MIT. Tudo fica no seu PC: o app não guarda senha, e os seus logins nunca saem da
máquina (o app em si só fala com o jogo, com o login do Google/Discord quando você entra e com o GitHub,
para saber se há versão nova).

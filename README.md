# Gestor (desktop)

App do balcão, instalado como **Gestor** no Windows. **Não reimplementa tela
nenhuma**: carrega o mesmo gestor web (`gestor.alfaclubsaude.com.br`) dentro de uma
janela Electron.

A única razão de existir é a **impressão silenciosa do cupom** - navegador não
imprime sem perguntar, e o balcão imprime recibo a cada venda.

## Como o site sabe que está dentro do app

O `preload` expõe `window.alfaclubDesktop`. O `printBlob` do `amaclub-client` testa
a presença dela:

| onde roda | caminho | diálogo? |
|---|---|---|
| app desktop | bytes → ponte → `webContents.print({silent:true})` | não |
| Chrome comum | iframe + `window.print()` | sim |

🔴 **Um código, dois destinos.** Nada é duplicado, e o site continua funcionando no
navegador de quem não instalar o app.

## Rodar em desenvolvimento

```bash
cd gestor_desktop
npm install
npm start
cd gestor_desktop && npm run dist
```

## Gerar o instalador

```bash
npm run dist        # gera dist/Gestor Setup X.Y.Z.exe, sem publicar
npm run publicar    # gera E publica no GitHub Releases (auto-update)
```

Antes de publicar: `GH_TOKEN` no ambiente e `owner`/`repo` preenchidos no
`electron-builder.yml` (hoje estão como `SEU_USUARIO_OU_ORG`).

## Auto-update

`electron-updater` + GitHub Releases: o app checa ao abrir, baixa em segundo plano e
aplica ao fechar. É o que dispensa reinstalar máquina por máquina a cada versão.

🔴 Release **privada** exige token também no cliente. Se o repositório do instalador
não puder ser público, troque o `publish.provider` para `generic` apontando pra uma
URL do próprio servidor.

## Ícone

Sai da **Identidade Visual** do próprio sistema (`brand_icon_url`), não de um arquivo
solto:

```powershell
cd gestor_desktop/scripts
.\gerar-icone.ps1 -EstablishmentId 2    # ícone do estabelecimento 2 (ALFASAUDE)
.\gerar-icone.ps1                        # ícone GLOBAL
```

🔴 **Sem `-EstablishmentId` o ícone vem do global, que carrega a marca do Estab.
CLUBE.** Para o balcão normalmente se quer o estabelecimento que ATENDE, não o clube -
foi por isso que o ícone trocou de ALFA CLUB para ALFASAUDE em 19-08.

O script gera ICO com **7 resoluções** (16 a 256px): resolução única fica borrada na
barra de tarefas, porque o Windows pede 16/32/48 e escalar de 256 na hora perde os
traços finos.

🔴 **O ícone do `.exe` é ASSADO no build.** Mudou a marca na Identidade Visual? rode o
script de novo e builde. E, como o instalador é um só, todas as máquinas ficam com o
MESMO ícone - ele não se adapta por clínica.

## Impressora

Menu **Arquivo → Impressora do cupom**: lista as impressoras do Windows e fixa a
escolhida (guardada por máquina). Sem escolha, usa a padrão do sistema.

Confira o papel em **80mm** nas Preferências da impressora - muita Elgin vem de
fábrica em 58mm e corta o cupom.

## Pendências conhecidas

- ~~**Ícone**~~: feito, ver a seção abaixo.
- **Assinatura**: sem certificado, o SmartScreen avisa "editor desconhecido" na
  primeira execução (clicar em "Mais informações → Executar assim mesmo"). Some com
  certificado EV.
- O `amaclub-client/scripts/gestor.ps1` e `gestor.bat` (atalho do Chrome com
  `--kiosk-printing`) continuam válidos como alternativa sem instalar nada.

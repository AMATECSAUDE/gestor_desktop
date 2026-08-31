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

## Rodar em desenvolvimento

```bash
cd gestor_desktop
npm install
npm start
npm run publicar
cd gestor_desktop && npm run dist
```

## Quando publicar (e quando NÃO)

O app é uma janela que carrega o gestor web. Quase tudo que muda está **no site**.

| Mexeu em | Precisa | Chega no balcão |
|---|---|---|
| `amaclub-client/`, `amaclub-api/` | deploy | F5 ou reabrir o app |
| `gestor_desktop/src/` | `npm run publicar` | barra de atualização |

Regra prática: se a mudança aparece abrindo `gestor.alfaclubsaude.com.br` no
navegador, ela também aparece no app **sem publicar nada**.

## Gerar o instalador

```bash
cd gestor_desktop

# 1. SUBIR A VERSÃO no package.json (1.4.8 -> 1.4.9).
#    O updater compara versões: publicar duas vezes o mesmo número não atualiza
#    ninguém e NÃO dá erro - simplesmente nada acontece.
#
#    NUMERAÇÃO (regra do Antony): anda no ÚLTIMO dígito até o 9, e só então sobe o
#    do meio. 1.5.8 -> 1.5.9 -> 1.6.0. Nunca pular do 1.5.3 direto pro 1.6.0.

# 2. ícone + cores da marca (assados no build)
.\scripts\gerar-icone.ps1 -EstablishmentId N

# 3a. só gerar, pra testar local
npm run dist        # dist/Gestor Setup X.Y.Z.exe

# 3b. gerar E publicar no GitHub Releases
$env:GH_TOKEN = "ghp_..."
npm run publicar
```

### GH_TOKEN

Sem ele o build **completa** e só o upload falha:

```
Error: GitHub Personal Access Token is not set ... env "GH_TOKEN"
```

O instalador fica em `dist/` de qualquer jeito - dá pra instalar à mão.

Crie em <https://github.com/settings/tokens> (classic) com escopo **`repo`**
(ou só `public_repo` se o repositório do instalador for público).

```powershell
$env:GH_TOKEN = "ghp_..."     # só esta sessão do terminal
setx GH_TOKEN "ghp_..."       # persiste; vale em terminais NOVOS
```

ATENCAO - o token publica release em nome da empresa. Nunca em arquivo do
repositório (o `.gitignore` já bloqueia `.env`); vazou, revogue na mesma página.

## Auto-update

`electron-updater` + GitHub Releases. O app checa ao abrir e a cada 30 min, baixa em
segundo plano e mostra a barra no cabeçalho. **Não reinicia sozinho** - o operador
pode estar no meio de uma venda; ele clica em "Reiniciar agora", ou a instalação
acontece quando fechar o app.

CRITICO - o gatilho é uma **RELEASE publicada**, não um `git push`. O updater lê o
`latest.yml` que o electron-builder sobe junto do instalador; commit sem release não
atualiza ninguém.

CRITICO - release **privada** exige token também no cliente. Se o repositório do
instalador não puder ser público, troque o `publish.provider` para `generic`
apontando pra uma URL do próprio servidor.

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

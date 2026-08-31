const { app, BrowserWindow, WebContentsView, ipcMain, Menu, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Carrega o mesmo gestor web numa janela. Existe pela IMPRESSAO SILENCIOSA do
// cupom - navegador nao imprime sem perguntar. O front testa `window.alfaclubDesktop`
// e cai no caminho do navegador quando ela nao existe.

const { TIPOS, escolherImpressora, mapaEfetivo, sanitizar } = require('./papel');
const { print: imprimirArquivo } = require('pdf-to-printer');

// Cores assadas no build pelo `gerar-icone.ps1`. Buscar no boot atrasaria a janela
// e quebraria offline. Sem o arquivo, cai nestes defaults.
const MARCA_PADRAO = { nome: 'Gestor', primaria: '#1A5EA8', acento: '#1CB68A' };

function lerMarca() {
  try {
    const bruto = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'marca.json'), 'utf8'));

    // `||` e nao `??`: campo vazio no cadastro volta '' e passaria pelo `??`.
    return {
      nome: bruto.nome || MARCA_PADRAO.nome,
      primaria: bruto.primaria || MARCA_PADRAO.primaria,
      acento: bruto.acento || MARCA_PADRAO.acento,
    };
  } catch {
    return MARCA_PADRAO;
  }
}

const marca = lerMarca();

// `impressora` (string) e config ANTIGA, mantida so pra migracao (`mapaEfetivo`).
const store = new Store({
  defaults: { impressora: '', papeisPorImpressora: {}, url: 'https://gestor.alfaclubsaude.com.br' },
});

function papeis() {
  return mapaEfetivo({
    papeisPorImpressora: store.get('papeisPorImpressora'),
    impressora: store.get('impressora'),
  });
}

// CRITICO - Mesma medida do `titleBarOverlay`: o Windows desenha os botoes de janela
// dentro dela.
const CABECALHO_H = 40;

let janela = null;
// CRITICO - A janela virou moldura: quem tem `webContents` de conteudo e a `siteView`.
let siteView = null;
let cabecalhoView = null;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    title: 'Gestor',
    // Menu aparece no Alt.
    autoHideMenuBar: true,
    // Barra nativa fora (quem desenha e o `cabecalho.html`), mas o overlay mantem
    // os botoes de janela NATIVOS por cima dela - sem reimplementar nada.
    titleBarStyle: 'hidden',
    // Cabecalho BRANCO: o overlay tem que casar com o fundo do `cabecalho.html`,
    // senao os botoes de janela ficam numa ilha de cor. `symbolColor` escuro
    // porque minimizar/fechar em branco sobre branco somem.
    titleBarOverlay: { color: '#ffffff', symbolColor: '#1E293B', height: CABECALHO_H },
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
  });

  cabecalhoView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'cabecalho-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  cabecalhoView.webContents.loadFile(path.join(__dirname, 'cabecalho.html'));

  siteView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Conteudo REMOTO: isolamento ligado, sem Node.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  siteView.webContents.loadURL(store.get('url'));

  abrirMenuNoAlt(cabecalhoView.webContents);
  abrirMenuNoAlt(siteView.webContents);

  janela.contentView.addChildView(cabecalhoView);
  janela.contentView.addChildView(siteView);
  posicionarViews();
  janela.on('resize', posicionarViews);

  janela.maximize();
  janela.once('ready-to-show', () => janela.show());
  // CRITICO - `WebContentsView` nao dispara `ready-to-show` na janela - sem isto ela nunca
  // apareceria.
  siteView.webContents.once('did-finish-load', () => janela.show());

  // CRITICO - `blob:`/`file:` NAO vao pro `shell.openExternal` (so http(s)) - abrem em
  // janela propria, senao o clique nao faz nada.
  siteView.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:') || url.startsWith('file:')) {
      return { action: 'allow', overrideBrowserWindowOptions: janelaDeDocumento() };
    }
    shell.openExternal(url);

    return { action: 'deny' };
  });
}

function posicionarViews() {
  if (!janela || janela.isDestroyed()) return;
  const { width, height } = janela.getContentBounds();
  cabecalhoView.setBounds({ x: 0, y: 0, width, height: CABECALHO_H });
  siteView.setBounds({ x: 0, y: CABECALHO_H, width, height: Math.max(0, height - CABECALHO_H) });
}

function avisarCabecalho(dados) {
  if (cabecalhoView && !cabecalhoView.webContents.isDestroyed()) {
    cabecalhoView.webContents.send('atualizacao', dados);
  }
}

/** Opções da janela que exibe documento (PDF): visualizador do Chromium ligado. */
function janelaDeDocumento() {
  return {
    width: 900,
    height: 1000,
    autoHideMenuBar: true,
    webPreferences: { plugins: true },
  };
}

// Dentro do app nao ha aba de navegador pra onde mandar o blob. O temporario e
// apagado quando a janela fecha.
async function abrirPdf(bytes, titulo) {
  const arquivo = path.join(os.tmpdir(), `gestor-doc-${Date.now()}.pdf`);
  fs.writeFileSync(arquivo, Buffer.from(bytes));

  const visor = new BrowserWindow({ ...janelaDeDocumento(), title: titulo || 'Documento', show: false });
  visor.once('ready-to-show', () => visor.show());
  visor.on('closed', () => { fs.promises.unlink(arquivo).catch(() => {}); });
  await visor.loadURL(`file://${arquivo}`);
}

// CRITICO - Janela OCULTA e nao `display:none`: `print()` imprime um `webContents` e a
// janela `show:false` RENDERIZA - documento nao renderizado sai em branco.
// `tipo` escolhe a impressora no mapa local; vazio = padrao do Windows.
const TEMPO_LIMITE_IMPRESSAO_MS = 20000;

// `__dirname` empacotado aponta pra dentro do `app.asar`; o `asarUnpack` do
// electron-builder poe o .exe no irmao `app.asar.unpacked`. Fora do pacote o
// `replace` nao acha nada e o caminho fica igual - mesma linha serve aos dois.
const CAMINHO_SUMATRA = path
  .join(__dirname, '..', 'node_modules', 'pdf-to-printer', 'dist', 'SumatraPDF-3.4.6-32.exe')
  .replace('app.asar', 'app.asar.unpacked');

// CRITICO - NAO da pra imprimir PDF por `BrowserWindow` + `webContents.print()`.
// O Chromium abre o PDF no VISUALIZADOR (barra escura, fundo cinza, pagina reduzida
// no meio) e o que vai pro papel e a TELA DELE: tarja preta na folha inteira,
// conteudo fora do topo e desbotado. Medido em 20-08 com captura da janela oculta.
// Antes disso ele nem imprimia: sem `pageSize` explicito o Chromium pergunta o
// tamanho da pagina ao driver, a termica nao responde ("page size is empty"), ele
// invalida as configuracoes e ABORTA SEM CHAMAR O CALLBACK - front travado pra
// sempre. Passar o `pageSize` destravou, mas so trocou o travamento pela tarja.
//
// O `pdf-to-printer` embute o SumatraPDF e imprime o DOCUMENTO. Medido: 793ms.
// O binario precisa de `asarUnpack` no electron-builder - dentro do asar nao executa.
async function imprimirPdf(bytes, tipo) {
  const arquivo = path.join(os.tmpdir(), `alfaclub-cupom-${Date.now()}.pdf`);
  fs.writeFileSync(arquivo, Buffer.from(bytes));

  // Sem impressora classificada pro tipo, `printer` fica fora e o SumatraPDF usa a
  // padrao do Windows - mesmo fallback silencioso de antes.
  const impressora = escolherImpressora(papeis(), tipo || 'cupom');
  const opcoes = {
    // CRITICO - `noscale`. O padrao do SumatraPDF e `shrink`: ele ENCOLHE a pagina pra
    // caber na area imprimivel e CENTRALIZA o resto. Na bobina isso dava as duas
    // reclamacoes de 20-08 de uma vez - o cupom saia com ~35mm de papel em branco no
    // topo, e o texto de 8,5px, ja pequeno, encolhia mais e virava cinza fino
    // (o QR saia preto solido porque e imagem: e a prova de que nao era densidade
    // da termica).
    scale: 'noscale',
    // Termica nao tem cinza: ela simula com pontinhos espacados, e letra fina
    // simulada some. Preto e branco puro faz a letra sair solida.
    monochrome: true,
    // CRITICO - caminho do binario EXPLICITO. O `pdf-to-printer` reescreve
    // `app.asar` -> `app.asar.unpacked` sozinho, mas so quando `process.mainModule`
    // existe - e no Electron 34 ele e UNDEFINED (medido em 20-08). Sem isto o app
    // instalado procura o SumatraPDF DENTRO do asar, de onde o Windows nao executa:
    // nao imprime e so falha no pacote, nunca em `npm start` nem em script solto.
    sumatraPdfPath: CAMINHO_SUMATRA,
    ...(impressora ? { printer: impressora } : {}),
  };

  // CRITICO - o erro TEM que dizer o que faltou. A falha de impressao acontece na
  // maquina do cliente, sem console aberto e sem quem saiba abrir: mensagem generica
  // vira uma ida ate o balcao. Cada ramo abaixo nomeia uma causa distinta.
  if (!fs.existsSync(CAMINHO_SUMATRA)) {
    throw new Error(`Componente de impressao ausente (${CAMINHO_SUMATRA}). Reinstale o Gestor.`);
  }

  try {
    // Rede de seguranca: processo externo que nao volta nao pode prender o balcao.
    await Promise.race([
      imprimirArquivo(arquivo, opcoes),
      new Promise((_, rejeitar) => setTimeout(
        () => rejeitar(new Error(`A impressora nao respondeu em ${TEMPO_LIMITE_IMPRESSAO_MS / 1000}s (${impressora || 'padrao do Windows'}). Confira se esta ligada.`)),
        TEMPO_LIMITE_IMPRESSAO_MS,
      )),
    ]);
  } catch (erro) {
    // `execFile` devolve "Command failed" pelado; o motivo real vem no stderr.
    const detalhe = [erro?.stderr, erro?.message].filter(Boolean).join(' | ').trim();
    console.warn('[impressao]', { impressora: impressora || '(padrao do Windows)', detalhe });

    throw new Error(
      `Falha ao imprimir em "${impressora || 'impressora padrao do Windows'}". ${detalhe || 'Sem detalhe do sistema.'}`
      + (impressora ? '' : ' Nenhuma impressora foi classificada em Arquivo > Impressoras.'),
    );
  } finally {
    fs.promises.unlink(arquivo).catch(() => {});
  }
}

ipcMain.handle('imprimir-pdf', (_evento, bytes, tipo) => imprimirPdf(bytes, tipo));
ipcMain.handle('abrir-pdf', (_evento, bytes, titulo) => abrirPdf(bytes, titulo));

ipcMain.handle('listar-impressoras', async () => {
  const lista = await siteView.webContents.getPrintersAsync();

  return {
    impressoras: lista.map((i) => ({ nome: i.name, descricao: i.displayName, padrao: i.isDefault })),
    papeis: papeis(),
    tipos: TIPOS,
  };
});

ipcMain.handle('marca', () => marca);
ipcMain.handle('versao', () => app.getVersion());

// CRITICO - O gatilho e uma RELEASE no GitHub (`npm run publicar`), NAO um `git push`.
// CRITICO - Isto atualiza a CASCA. O gestor web atualiza no deploy e so precisa de F5.
// Baixa sozinho, instala NAO: o operador pode estar no meio de uma venda.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => avisarCabecalho({ estado: 'baixando', versao: info?.version, pct: 0 }));
autoUpdater.on('download-progress', (p) => avisarCabecalho({ estado: 'baixando', pct: Math.round(p?.percent ?? 0) }));
autoUpdater.on('update-downloaded', (info) => avisarCabecalho({ estado: 'pronta', versao: info?.version }));
// Sem faixa: erro de checagem silenciosa nao vai pra cara do operador.
autoUpdater.on('error', (e) => console.warn('[updater]', e?.message ?? e));

// Fecha o app, roda o instalador NSIS e reabre sozinho.
ipcMain.handle('instalar-atualizacao', () => {
  setImmediate(() => autoUpdater.quitAndInstall());

  return true;
});
ipcMain.handle('procurar-atualizacao', () => autoUpdater.checkForUpdates().catch(() => null));

// O balcao fica dias com o app aberto - so checar na abertura atrasaria um dia.
const INTERVALO_CHECAGEM_MS = 30 * 60 * 1000;

ipcMain.handle('salvar-papeis', (_evento, mapa) => {
  store.set('papeisPorImpressora', sanitizar(mapa));
  // Zera o campo antigo: deixar os dois vivos faria a migracao voltar a valer se a
  // pessoa desclassificasse todas as impressoras depois.
  store.set('impressora', '');

  return true;
});

function abrirConfiguracao() {
  const config = new BrowserWindow({
    width: 620,
    height: 520,
    parent: janela,
    modal: true,
    title: 'Impressoras',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  config.loadFile(path.join(__dirname, 'config.html'));
}

// CRITICO - Com `titleBarStyle: 'hidden'` o Windows nao desenha a barra de menu: ela
// cairia dentro da area de conteudo, que as duas `WebContentsView` cobrem. O Alt
// continua chegando ao webContents, entao ele abre o MESMO menu como popup - e por
// onde o operador acha `Arquivo > Impressoras...`.
// `soAlt` existe para o Alt de atalho (Alt+Left, Alt+F4) nao abrir o menu ao soltar.
function abrirMenuNoAlt(wc) {
  let soAlt = false;

  wc.on('before-input-event', (_evento, entrada) => {
    if (entrada.type === 'keyDown') return void (soAlt = entrada.key === 'Alt');
    if (entrada.type !== 'keyUp' || entrada.key !== 'Alt' || !soAlt) return;

    soAlt = false;
    Menu.getApplicationMenu()?.popup({ window: janela, x: 8, y: CABECALHO_H });
  });
}

function montarMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Impressoras...', click: abrirConfiguracao },
        { type: 'separator' },
        // CRITICO - `role: 'reload'` age na view FOCADA - recarregaria o cabecalho.
        { label: 'Recarregar', accelerator: 'F5', click: () => siteView?.webContents.reload() },
        { label: 'Sair', role: 'quit' },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre',
          click: () => dialog.showMessageBox(janela, {
            type: 'info',
            title: 'Sobre',
            message: 'AMA Tecnologia em Saúde',
            detail: `Versão ${app.getVersion()}`,
          }),
        },
        // Nao `...AndNotify`: a notificacao nativa duplicaria a barra do cabecalho.
        { label: 'Procurar atualizações', click: () => autoUpdater.checkForUpdates().catch(() => {}) },
      ],
    },
  ]));
}

app.whenReady().then(() => {
  montarMenu();
  criarJanela();

  // `catch` vazio: balcao sem internet na hora da checagem nao pode ver erro.
  const checar = () => autoUpdater.checkForUpdates().catch(() => {});
  checar();
  setInterval(checar, INTERVALO_CHECAGEM_MS);
});

app.on('window-all-closed', () => app.quit());

const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Gestor no desktop.
//
// O app NAO reimplementa tela nenhuma: carrega o mesmo gestor web. A unica razao
// dele existir e a IMPRESSAO SILENCIOSA do cupom - navegador nao imprime sem
// perguntar, e o balcao imprime recibo a cada venda.
//
// 🔴 O site continua funcionando igual no navegador comum. A ponte
// `window.alfaclubDesktop` (preload) so EXISTE aqui; o front testa a presenca dela
// e cai no caminho do iframe quando roda no Chrome. Um codigo, dois destinos.

const { TIPOS, escolherImpressora, mapaEfetivo, sanitizar } = require('./papel');

// `impressora` (string) e a config ANTIGA e continua no default so pra migracao -
// ver `mapaEfetivo`. O que vale hoje e `papeisPorImpressora`: { nome: tipo }.
const store = new Store({
  defaults: { impressora: '', papeisPorImpressora: {}, url: 'https://gestor.alfaclubsaude.com.br' },
});

/** Mapa impressora -> tipo, ja com a migracao da config antiga aplicada. */
function papeis() {
  return mapaEfetivo({
    papeisPorImpressora: store.get('papeisPorImpressora'),
    impressora: store.get('impressora'),
  });
}

let janela = null;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    title: 'Gestor',
    // Ícone da marca (o mesmo `brand_icon_url` que o gestor web usa). No app
    // empacotado o `electron-builder` já assa o ícone no .exe; isto vale pra janela
    // e pra barra de tarefas em desenvolvimento.
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Isolamento LIGADO: o site é conteúdo remoto e não pode tocar em Node.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  janela.maximize();
  janela.once('ready-to-show', () => janela.show());
  janela.loadURL(store.get('url'));

  // Link externo (WhatsApp, loja de app) abre no navegador do sistema, não numa
  // janela do app sem barra de endereço.
  //
  // 🔴 `blob:` e `file:` NÃO vão pro `shell.openExternal` - ele só entende http(s) e
  // devolveria erro em silêncio. O front usa a ponte `abrirPdf` dentro do app, mas
  // qualquer `window.open` de blob que sobre precisa abrir AQUI, senão o clique não
  // faz nada e parece que o sistema travou.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:') || url.startsWith('file:')) {
      return { action: 'allow', overrideBrowserWindowOptions: janelaDeDocumento() };
    }
    shell.openExternal(url);

    return { action: 'deny' };
  });
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

/**
 * ABRE um PDF numa janela do app, com o visualizador do Chromium (zoom, busca,
 * salvar e imprimir na própria barra).
 *
 * Existe pelo mesmo motivo da impressão: dentro do app não há aba de navegador pra
 * onde mandar o blob. O arquivo temporário é apagado quando a janela fecha.
 */
async function abrirPdf(bytes, titulo) {
  const arquivo = path.join(os.tmpdir(), `gestor-doc-${Date.now()}.pdf`);
  fs.writeFileSync(arquivo, Buffer.from(bytes));

  const visor = new BrowserWindow({ ...janelaDeDocumento(), title: titulo || 'Documento', show: false });
  visor.once('ready-to-show', () => visor.show());
  visor.on('closed', () => { fs.promises.unlink(arquivo).catch(() => {}); });
  await visor.loadURL(`file://${arquivo}`);
}

/**
 * Imprime um PDF em silêncio.
 *
 * 🔴 O PDF vai pra um arquivo temporário e é carregado numa janela OCULTA: o
 * `print()` do Electron imprime o conteúdo de um `webContents`, e não aceita bytes
 * soltos. A janela fica `show:false` mas RENDERIZA (ao contrário do `display:none`
 * do navegador, que sairia em branco).
 *
 * `tipo` é o papel que o DOCUMENTO pede ('cupom' para recibo e orçamento, 'a4' para
 * relatório): a impressora sai do mapa local, não de uma escolha única. Sem isso, o
 * cupom de 80mm ia pra impressora padrão do Windows - quase sempre a laser.
 *
 * `deviceName` vazio = impressora padrão do Windows, que é o fallback quando
 * ninguém configurou nada ainda.
 */
async function imprimirPdf(bytes, tipo) {
  const arquivo = path.join(os.tmpdir(), `alfaclub-cupom-${Date.now()}.pdf`);
  fs.writeFileSync(arquivo, Buffer.from(bytes));

  const oculta = new BrowserWindow({ show: false, webPreferences: { plugins: true } });

  try {
    await oculta.loadURL(`file://${arquivo}`);

    await new Promise((resolve, reject) => {
      oculta.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: escolherImpressora(papeis(), tipo || 'cupom') || undefined,
          margins: { marginType: 'none' },
        },
        (ok, motivo) => (ok ? resolve() : reject(new Error(motivo || 'impressão cancelada'))),
      );
    });
  } finally {
    // Fecha a janela e apaga o temporário mesmo se a impressão falhar - senão cada
    // recibo deixa um PDF no disco e uma janela viva.
    if (!oculta.isDestroyed()) oculta.destroy();
    fs.promises.unlink(arquivo).catch(() => {});
  }
}

ipcMain.handle('imprimir-pdf', (_evento, bytes, tipo) => imprimirPdf(bytes, tipo));
ipcMain.handle('abrir-pdf', (_evento, bytes, titulo) => abrirPdf(bytes, titulo));

ipcMain.handle('listar-impressoras', async () => {
  const lista = await janela.webContents.getPrintersAsync();

  return {
    impressoras: lista.map((i) => ({ nome: i.name, descricao: i.displayName, padrao: i.isDefault })),
    papeis: papeis(),
    tipos: TIPOS,
  };
});

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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  config.loadFile(path.join(__dirname, 'config.html'));
}

function montarMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Impressoras...', click: abrirConfiguracao },
        { type: 'separator' },
        { label: 'Recarregar', role: 'reload' },
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
            title: 'Gestor',
            message: `Gestor ${app.getVersion()}`,
            detail: 'Impressão direta do cupom na impressora do balcão.',
          }),
        },
        { label: 'Procurar atualizações', click: () => autoUpdater.checkForUpdatesAndNotify() },
      ],
    },
  ]));
}

app.whenReady().then(() => {
  montarMenu();
  criarJanela();
  // Atualização silenciosa: baixa em segundo plano e instala ao fechar o app.
  // `catch` vazio de propósito - balcão sem internet no momento da checagem não
  // pode ver caixa de erro na cara do operador.
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
});

app.on('window-all-closed', () => app.quit());

const { contextBridge, ipcRenderer } = require('electron');

// Ponte do CABECALHO, separada da do site (`preload.js`) de proposito: juntas,
// qualquer script que entrasse na pagina do gestor poderia chamar `instalar()` e
// reiniciar o balcao no meio de uma venda.
contextBridge.exposeInMainWorld('gestorCabecalho', {
  marca: () => ipcRenderer.invoke('marca'),
  versao: () => ipcRenderer.invoke('versao'),
  instalar: () => ipcRenderer.invoke('instalar-atualizacao'),
  procurar: () => ipcRenderer.invoke('procurar-atualizacao'),
  // O `_evento` fica de fora: repassa-lo vazaria um objeto do Electron pro HTML.
  aoAtualizar: (cb) => ipcRenderer.on('atualizacao', (_evento, dados) => cb(dados)),
});

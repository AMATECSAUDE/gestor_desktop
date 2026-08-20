const { contextBridge, ipcRenderer } = require('electron');

// Ponte entre o gestor web e o app.
//
// CRITICO - `contextBridge` e nao `nodeIntegration`: o site e conteudo remoto, e expor
// Node daria acesso ao disco da maquina do balcao a qualquer script que entrasse
// na pagina. A superficie e minima de proposito.
contextBridge.exposeInMainWorld('alfaclubDesktop', {
  // 2 = `imprimirPdf` aceita o tipo de papel. App na versao 1 ignora o 2o
  // argumento e imprime na impressora unica - degrada sozinho.
  versao: '2',

  // Recebe `ArrayBuffer` porque e o que o front tem em maos; mandar a URL faria o
  // app repetir a autenticacao por fora do axios.
  // `tipo`: 'cupom' (recibo, orcamento) ou 'a4' (relatorio). Sem tipo, vale cupom.
  imprimirPdf: (bytes, tipo) => ipcRenderer.invoke('imprimir-pdf', new Uint8Array(bytes), tipo),

  // Dentro do app nao existe aba de navegador: sem isto o `window.open` do blob
  // nao abriria nada e o botao pareceria quebrado.
  abrirPdf: (bytes, titulo) => ipcRenderer.invoke('abrir-pdf', new Uint8Array(bytes), titulo),

  // Só a tela de configuração do próprio app usa.
  listarImpressoras: () => ipcRenderer.invoke('listar-impressoras'),
  /** `mapa` = { [nomeDaImpressora]: 'cupom' | 'a4' }. */
  salvarPapeis: (mapa) => ipcRenderer.invoke('salvar-papeis', mapa),
  marca: () => ipcRenderer.invoke('marca'),
});

const { contextBridge, ipcRenderer } = require('electron');

// Ponte entre o gestor web e o app.
//
// 🔴 `contextBridge` e não `nodeIntegration`: o site é conteúdo remoto: expor Node
// pra ele seria dar acesso ao disco da máquina do balcão a qualquer script que
// entrasse na página.
//
// A superfície é mínima de propósito - só o que a impressão precisa. O front testa
// a presença de `window.alfaclubDesktop` e cai no caminho do navegador quando roda
// no Chrome comum.
contextBridge.exposeInMainWorld('alfaclubDesktop', {
  // 2 = `imprimirPdf` aceita o TIPO de papel. O front não precisa checar: app na
  // versão 1 ignora o segundo argumento e imprime na única impressora escolhida,
  // que é o comportamento antigo.
  versao: '2',

  /**
   * Imprime um PDF em silêncio na impressora classificada com aquele TIPO de papel
   * ('cupom' para recibo e orçamento, 'a4' para relatório). Sem tipo, vale 'cupom'.
   *
   * Recebe `ArrayBuffer` porque é o que o front tem em mãos (o blob baixado da
   * API) - mandar a URL faria o app repetir a autenticação por fora do axios.
   */
  imprimirPdf: (bytes, tipo) => ipcRenderer.invoke('imprimir-pdf', new Uint8Array(bytes), tipo),

  /**
   * ABRE o PDF numa janela do app (guia, recibo, fatura, relatório).
   *
   * Dentro do app não existe aba de navegador: sem isto o `window.open` do blob não
   * abriria nada e o botão pareceria quebrado.
   */
  abrirPdf: (bytes, titulo) => ipcRenderer.invoke('abrir-pdf', new Uint8Array(bytes), titulo),

  // Usados só pela tela de configuração do próprio app.
  listarImpressoras: () => ipcRenderer.invoke('listar-impressoras'),
  /** `mapa` = { [nomeDaImpressora]: 'cupom' | 'a4' }. */
  salvarPapeis: (mapa) => ipcRenderer.invoke('salvar-papeis', mapa),
});

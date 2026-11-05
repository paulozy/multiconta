// Ponte da tela de configuração: só pedidos que o processo principal confere (nada de Node na página).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('config', {
  dados: () => ipcRenderer.invoke('config:dados'),
  salvar: (novo) => ipcRenderer.invoke('config:salvar', novo),
  adicionarExtensao: () => ipcRenderer.invoke('config:extensao'),
  abrirRepositorio: () => ipcRenderer.send('config:repositorio'),
  fechar: () => ipcRenderer.send('config:fechar'),
});

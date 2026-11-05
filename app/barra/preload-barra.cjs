// Ponte da barra: recebe o retrato das contas e manda comandos (o processo principal confere tudo).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('barra', {
  aoRetrato: (fn) => ipcRenderer.on('barra:retrato', (_ev, retrato) => fn(retrato)),
  comando: (acao, id) => ipcRenderer.send('barra:comando', { acao: String(acao), id: id == null ? null : String(id) }),
  pronta: () => ipcRenderer.send('barra:pronta'),
});

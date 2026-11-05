// Ponte mínima entre a página do jogo e o app. Roda antes de qualquer script da página, com
// contextIsolation e sandbox: a página só enxerga window.multiconta (reservar, estado, resumo), nada de Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('multiconta', {
  // o rótulo pede antes do hello: true = pode entrar; false = a conta já está em outra célula
  reservar: (nick) => ipcRenderer.sendSync('multiconta:reservar', String(nick)),
  // 'conectada' | 'desconectada' | 'bloqueada', para a barra (o processo principal confere)
  estado: (estado, nick) => ipcRenderer.send('multiconta:estado', String(estado), nick == null ? null : String(nick)),
  // hunt, treinador e ritmo da sessão para a barra (o processo principal confere cada campo)
  resumo: (r) => ipcRenderer.send('multiconta:resumo', r),
});

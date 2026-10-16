const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('rallyDesktop',Object.freeze({
 setDisplay:windowMode=>ipcRenderer.invoke('rally:display',windowMode)
}));

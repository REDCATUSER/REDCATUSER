const {app,BrowserWindow,Menu,ipcMain}=require('electron');
const path=require('node:path');
app.whenReady().then(()=>{
  // Left Ctrl is a driving control: native Reload/Close accelerators must not
  // intercept Ctrl+R or Ctrl+W while downshifting with the throttle held.
  Menu.setApplicationMenu(null);
  const win=new BrowserWindow({icon:app.isPackaged?path.join(process.resourcesPath,'rally.ico'):path.join(__dirname,'build/icon.ico'),width:1280,height:820,minWidth:900,minHeight:640,autoHideMenuBar:true,backgroundColor:'#101716',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,autoplayPolicy:'no-user-gesture-required'}});
  ipcMain.handle('rally:display',(event,windowMode)=>{
    if(event.sender!==win.webContents||!['windowed','fullscreen'].includes(windowMode))throw new Error('Mode d’affichage invalide.');
    win.setFullScreen(windowMode==='fullscreen');return windowMode;
  });
  win.loadFile('src/index.html');
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
});
app.on('window-all-closed',()=>app.quit());

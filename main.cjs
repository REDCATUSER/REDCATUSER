const {app,BrowserWindow,Menu}=require('electron');
app.whenReady().then(()=>{
  // Left Ctrl is a driving control: native Reload/Close accelerators must not
  // intercept Ctrl+R or Ctrl+W while downshifting with the throttle held.
  Menu.setApplicationMenu(null);
  const win=new BrowserWindow({width:1280,height:820,minWidth:900,minHeight:640,autoHideMenuBar:true,backgroundColor:'#101716',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.loadFile('src/index.html');
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
});
app.on('window-all-closed',()=>app.quit());

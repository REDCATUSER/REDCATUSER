const {app,BrowserWindow}=require('electron');
app.whenReady().then(()=>{const win=new BrowserWindow({width:1280,height:820,minWidth:900,minHeight:640,autoHideMenuBar:true,backgroundColor:'#101a20',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});win.loadFile('src/index.html');win.webContents.setWindowOpenHandler(()=>({action:'deny'}));});
app.on('window-all-closed',()=>app.quit());

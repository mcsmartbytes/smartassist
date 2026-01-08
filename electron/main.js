const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let mainWindow;
let tray;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: 'default',
    title: 'SmartAssist'
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Load from the deployed URL or local build
    mainWindow.loadURL('https://smartassist-recorder.netlify.app');
  }

  // Handle window close - minimize to tray instead
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function createTray() {
  // Create a simple tray icon
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAABd0lEQVR4nO2WvUoDQRSFv4gWPoKFhY2Nf4WFjb6Cj2BhZWFjY2dnYWFhYWFnYSEIFoKghYWIYCH4ACKCICiCf4iNYuHCLEyWzWZ3J7vZLHjgwMLMnXvOzJ3Zgen8t8kCM8A2cA9YQA/wBFwBB8BqVMFLwA3gvsS+AzaBBWA+imAJHoDnEOcBsAosAItAdQKCl4HbGH4fsCQJzgOXwBPwVuL8GNiSBGcAZwrXzgC/G3gE2pLgQoW7Y/iVfL4pCXYqfMMEz4G7QCfy7VEAr4EuJBfmvSeAF6CbXwi4AAaRnE8j3hfoSgKriEALOEJyXiUIvwA6kkCT8P4BegKdSHAvjO8L9CQBhwS/eN8X6EsCdonwQ4GeJDAawvdUwjNVi94J5f8G3gG8zxZYRqI5jN8JOKU3pW8F+HYo0IsKECb8AdCPVFrD+L3AUJTQ8Wj8APB6Er4TyTUKdKGCYcIbgEGkcoDE+C7AIOCUegPwCjiRbM4nkgAAAABJRU5ErkJggg=='
  );

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open SmartAssist',
      click: () => mainWindow.show()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('SmartAssist');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

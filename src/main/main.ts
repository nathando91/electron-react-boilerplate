/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain, netLog } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import WebSocket from 'ws';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.maximize();

  // mainWindow.loadURL(resolveHtmlPath('index.html'));
  mainWindow.loadURL('https://www.fantasy.top/marketplace');

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  // Open DevTools for debugging (optional)
  mainWindow.webContents.openDevTools();

  const ses = mainWindow.webContents.session;
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.startsWith('wss://www.walletlink.org/rpc')) {
      log.info('WebSocket Connection:', JSON.stringify({ details, callback }));
      const socket = new WebSocket(details.url, {});
      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: 'HostSession',
            id: 1,
            sessionId: 'c8da4ea353bf2342384f9d638c69b74d',
            sessionKey:
              'e9f510246b8e391f35951e553715dcef457fdb6a0f52b7ed57a13c298994fdd4',
          }),
        );
        console.log('WebSocket Opened');
      };

      socket.onmessage = async (event) => {
        const { type }: any = JSON.parse(String(event.data) || '{}');
        if (type == 'OK') {
          await socket.send(
            JSON.stringify({
              type: 'IsLinked',
              id: 2,
              sessionId: 'c8da4ea353bf2342384f9d638c69b74d',
            }),
          );

          await socket.send(
            JSON.stringify({
              type: 'GetSessionConfig',
              id: 3,
              sessionId: 'c8da4ea353bf2342384f9d638c69b74d',
            }),
          );
        }

        if (type == 'GetSessionConfigOK' || event.data == 'h') {
          await socket.send(JSON.stringify('h'));
        }
      };

      socket.onclose = () => {
        console.log('rpcWebSocket Closed');
      };

      socket.onerror = (err) => {
        console.log('rpcWebSocket err', err);
      };
      // }
    }

    if (details.url.startsWith('wss://api.fantasy.top/v1/graphql')) {
      const socketMain = new WebSocket('wss://api.fantasy.top/v1/graphql', [
        'graphql-ws',
      ]);
      socketMain.onopen = () => {
        socketMain.send(
          JSON.stringify({
            type: 'connection_init',
            payload: {
              headers: {
                Authorization:
                  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIweDM0RjM5QzM5NjZCZThjQ0Q2ODgwMjkxZDBBM2UwNUEwNjhhQ2VBMjMiLCJpYXQiOjE3MTQ1ODk0OTcsImV4cCI6MTcxNDYzMjY5NywiaHR0cHM6Ly9oYXN1cmEuaW8vand0L2NsYWltcyI6eyJ4LWhhc3VyYS1hbGxvd2VkLXJvbGVzIjpbInVzZXIiXSwieC1oYXN1cmEtZGVmYXVsdC1yb2xlIjoidXNlciIsIngtaGFzdXJhLXJvbGUiOiJ1c2VyIiwieC1oYXN1cmEtdXNlci1pZCI6IjB4MzRGMzlDMzk2NkJlOGNDRDY4ODAyOTFkMEEzZTA1QTA2OGFDZUEyMyJ9fQ.H89umUqkUNaZIO0dRR5KQ_5xNTHUjLVQsox-ow6GGlI',
              },
            },
          }),
        );

        console.log('WebSocket Opened');
      };

      socketMain.onmessage = (event) => {
        console.log('Message from server:', event.data);
        const { type }: any = JSON.parse(String(event.data) || '{}');
        console.log('Message from server  typetype:', type);

        if (type == 'ping') {
          socketMain.send(
            JSON.stringify({ type: 'pong', payload: { message: 'keepalive' } }),
          );
        }
      };

      socketMain.onclose = () => {
        console.log('WebSocket Closed');
      };

      socketMain.onerror = (err) => {
        console.log('WebSocket err', err);
      };
      // }
    }
    callback({ cancel: false });
  });

  ses.webRequest.onCompleted((details) => {
    if (details.url.startsWith('ws://') || details.url.startsWith('wss://')) {
      // log.info('WebSocket Response:', details.webContents);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);

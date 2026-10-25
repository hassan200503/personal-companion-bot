import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createLogger } from "@companion/core";
import { ipcChannels, type AppInfo } from "../shared/ipc";

const logger = createLogger({ level: "info" });
const sessionTokens = new Map<number, string>();
let mainWindow: BrowserWindow | null = null;

function assertTrustedSender(event: IpcMainInvokeEvent, suppliedToken: unknown): void {
  const expectedToken = sessionTokens.get(event.sender.id);
  const frameUrl = event.senderFrame?.url ?? "";
  const allowedFrame =
    frameUrl.startsWith("file://") || frameUrl.startsWith("http://localhost:5173/");

  if (
    expectedToken === undefined ||
    typeof suppliedToken !== "string" ||
    suppliedToken !== expectedToken ||
    !allowedFrame
  ) {
    throw new Error("Unauthorized IPC call");
  }
}

function registerIpc(): void {
  ipcMain.handle(ipcChannels.appInfo, (event, suppliedToken: unknown): AppInfo => {
    assertTrustedSender(event, suppliedToken);

    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? "unknown",
      platform: process.platform
    };
  });
}

async function createWindow(): Promise<void> {
  const sessionToken = randomUUID();
  const window = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: "Companion",
    webPreferences: {
      preload: join(__dirname, "../preload/index"),
      additionalArguments: [`--companion-session-token=${sessionToken}`],
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  mainWindow = window;
  sessionTokens.set(window.webContents.id, sessionToken);

  const webContentsId = window.webContents.id;

  window.on("closed", () => {
    sessionTokens.delete(webContentsId);
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl !== undefined) {
    await window.loadURL(devServerUrl);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  logger.info("desktop window created", {
    renderer: devServerUrl === undefined ? "file" : "dev"
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.kkc36.companion");
  registerIpc();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch((error: unknown) => {
        logger.error("failed to recreate desktop window", { error });
      });
    }
  });
}).catch((error: unknown) => {
  logger.error("failed to start desktop app", { error });
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

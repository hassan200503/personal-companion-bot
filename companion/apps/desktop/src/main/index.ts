import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createLogger,
  isStorageError,
  openCompanionDatabase,
  type CompanionDatabase,
  type Logger
} from "@companion/core";
import { ipcChannels, type AppInfo } from "../shared/ipc";
import { createDesktopCredentialStore, createDesktopKeyProtector } from "./storage/adapters";

app.setName("Companion");

let logger: Logger = createLogger({ level: "info" });
const sessionTokens = new Map<number, string>();
let mainWindow: BrowserWindow | null = null;
let companionDatabase: CompanionDatabase | null = null;

function configureFileLogging(): void {
  const logFile = join(app.getPath("userData"), "logs", "companion.log");

  try {
    mkdirSync(dirname(logFile), { recursive: true });
  } catch {
    return;
  }

  logger = createLogger({
    level: "info",
    sink: (line) => {
      console.log(line);

      try {
        appendFileSync(logFile, `${line}\n`, "utf8");
      } catch {
        // Logging must never take down the app.
      }
    }
  });
}

async function openStorage(): Promise<void> {
  try {
    companionDatabase = await openCompanionDatabase({
      userDataDir: app.getPath("userData"),
      keyProtector: createDesktopKeyProtector(),
      logger
    });
  } catch (error) {
    logger.error("encrypted storage could not be opened", {
      code: isStorageError(error) ? error.code : "unknown"
    });
  }
}

async function checkCredentialStore(): Promise<void> {
  try {
    const providerIds = await createDesktopCredentialStore(logger).listProviderIds();
    logger.info("credential store available", { providerCount: providerIds.length });
  } catch (error) {
    logger.warn("credential store unavailable", {
      code: isStorageError(error) ? error.code : "unknown"
    });
  }
}

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
  configureFileLogging();
  await openStorage();
  await checkCredentialStore();
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

app.on("before-quit", () => {
  companionDatabase?.close();
  companionDatabase = null;
});

import { contextBridge, ipcRenderer } from "electron";
import { ipcChannels, type AppInfo } from "../shared/ipc";

const tokenPrefix = "--companion-session-token=";
const tokenArgument = process.argv.find((argument) => argument.startsWith(tokenPrefix));
const sessionToken = tokenArgument?.slice(tokenPrefix.length) ?? "";

const api = Object.freeze({
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke(ipcChannels.appInfo, sessionToken)
});

contextBridge.exposeInMainWorld("companion", api);

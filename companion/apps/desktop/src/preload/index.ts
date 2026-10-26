import { contextBridge, ipcRenderer } from "electron";
import { ipcChannels, type AppInfo } from "../shared/ipc";

const tokenPrefix = "--companion-session-token=";
const tokenArgument = process.argv.find((argument) => argument.startsWith(tokenPrefix));
const sessionToken = tokenArgument?.slice(tokenPrefix.length) ?? "";

const api = Object.freeze({
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke(ipcChannels.appInfo, sessionToken),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(ipcChannels.appOpenExternal, sessionToken, url),
  onboardingGetState: () : Promise<unknown> => ipcRenderer.invoke(ipcChannels.onboardingGetState, sessionToken),
  onboardingRun: () : Promise<unknown> => ipcRenderer.invoke(ipcChannels.onboardingRun, sessionToken),
  chatListConversations: () : Promise<unknown[]> => ipcRenderer.invoke(ipcChannels.chatListConversations, sessionToken),
  chatCreateConversation: (title?: string) : Promise<unknown> => ipcRenderer.invoke(ipcChannels.chatCreateConversation, sessionToken, title),
  chatGetConversation: (id: string) : Promise<unknown> => ipcRenderer.invoke(ipcChannels.chatGetConversation, sessionToken, id),
  chatSendMessage: (conversationId: string, content: string) : Promise<unknown> =>
    ipcRenderer.invoke(ipcChannels.chatSendMessage, sessionToken, conversationId, content),
  privacyExport: () : Promise<unknown> => ipcRenderer.invoke(ipcChannels.privacyExport, sessionToken),
  privacyDeleteAll: () : Promise<unknown> => ipcRenderer.invoke(ipcChannels.privacyDeleteAll, sessionToken),
  privacyBackupStatus: (backupDir?: string) : Promise<unknown> => ipcRenderer.invoke(ipcChannels.privacyBackupStatus, sessionToken, backupDir),
  providersCatalog: () : Promise<unknown> => ipcRenderer.invoke(ipcChannels.providersCatalog, sessionToken),
  credentialsList: () : Promise<string[]> => ipcRenderer.invoke(ipcChannels.credentialsList, sessionToken),
  credentialsValidate: (providerId: string, apiKey: string) : Promise<unknown> => ipcRenderer.invoke(ipcChannels.credentialsValidate, sessionToken, providerId, apiKey),
  credentialsSet: (providerId: string, apiKey: string) : Promise<unknown> => ipcRenderer.invoke(ipcChannels.credentialsSet, sessionToken, providerId, apiKey),
  credentialsDelete: (providerId: string) : Promise<unknown> => ipcRenderer.invoke(ipcChannels.credentialsDelete, sessionToken, providerId),
  providersAddCustom: (config: { name: string; baseUrl: string; model: string }, apiKey: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.providersAddCustom, sessionToken, config, apiKey),
});

contextBridge.exposeInMainWorld("companion", api);


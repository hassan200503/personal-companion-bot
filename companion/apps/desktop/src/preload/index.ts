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
  providersDiscoverModels: (providerId: string, apiKey: string): Promise<unknown> =>
    ipcRenderer.invoke(ipcChannels.providersDiscoverModels, sessionToken, providerId, apiKey),
  credentialsList: () : Promise<string[]> => ipcRenderer.invoke(ipcChannels.credentialsList, sessionToken),
  credentialsValidate: (providerId: string, apiKey: string) : Promise<unknown> => ipcRenderer.invoke(ipcChannels.credentialsValidate, sessionToken, providerId, apiKey),
  credentialsSet: (providerId: string, apiKey: string, model?: string) : Promise<unknown> => ipcRenderer.invoke(ipcChannels.credentialsSet, sessionToken, providerId, apiKey, model),
  credentialsDelete: (providerId: string) : Promise<unknown> => ipcRenderer.invoke(ipcChannels.credentialsDelete, sessionToken, providerId),
  providersAddCustom: (config: { name: string; baseUrl: string; model: string }, apiKey: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.providersAddCustom, sessionToken, config, apiKey),
  osListTools: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.osListTools, sessionToken),
  osExecuteTool: (toolName: string, input: unknown, confirmationHash?: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.osExecuteTool, sessionToken, toolName, input, confirmationHash),
  osTryCommand: (text: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.osTryCommand, sessionToken, text),
  osConfirmTool: (actionHash: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.osConfirmTool, sessionToken, actionHash),
  voiceStart: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.voiceStart, sessionToken),
  voiceStop: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.voiceStop, sessionToken),
  memoryGetProfile: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.memoryGetProfile, sessionToken),
  memorySetProfile: (profile: unknown): Promise<unknown> => ipcRenderer.invoke(ipcChannels.memorySetProfile, sessionToken, profile),
  onVoiceTranscript: (cb: (payload: { text: string; final: boolean }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { text: string; final: boolean }) => cb(payload);
    ipcRenderer.on(ipcChannels.voiceTranscript, handler);
    return () => ipcRenderer.removeListener(ipcChannels.voiceTranscript, handler);
  },
});

contextBridge.exposeInMainWorld("companion", api);


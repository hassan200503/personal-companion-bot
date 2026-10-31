import { contextBridge, ipcRenderer } from "electron";
import { ipcChannels, type AppInfo } from "../shared/ipc";

type VoiceEventPayload = {
  type: string;
  state?: string;
  engine?: string;
  error?: string;
  code?: string;
  text?: string;
  final?: boolean;
  confidence?: number;
  voice?: string;
  synthesis?: unknown[];
  recognitionLanguages?: unknown[];
};

const tokenPrefix = "--companion-session-token=";
const tokenArgument = process.argv.find((argument) => argument.startsWith(tokenPrefix));
const sessionToken = tokenArgument?.slice(tokenPrefix.length) ?? "";

const api = Object.freeze({
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke(ipcChannels.appInfo, sessionToken),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(ipcChannels.appOpenExternal, sessionToken, url),
  openSettings: (uri: string): Promise<void> => ipcRenderer.invoke(ipcChannels.appOpenSettings, sessionToken, uri),
  getStartup: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.appGetStartup, sessionToken),
  setStartup: (enabled: boolean): Promise<unknown> => ipcRenderer.invoke(ipcChannels.appSetStartup, sessionToken, enabled),
  onboardingGetState: () : Promise<unknown> => ipcRenderer.invoke(ipcChannels.onboardingGetState, sessionToken),
  onboardingRun: () : Promise<unknown> => ipcRenderer.invoke(ipcChannels.onboardingRun, sessionToken),
  onboardingSetPreset: (preset: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.onboardingSetPreset, sessionToken, preset),
  onboardingGetVoiceGuide: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.onboardingGetVoiceGuide, sessionToken),
  onboardingSetVoiceGuide: (progress: unknown): Promise<unknown> => ipcRenderer.invoke(ipcChannels.onboardingSetVoiceGuide, sessionToken, progress),
  chatListConversations: () : Promise<unknown[]> => ipcRenderer.invoke(ipcChannels.chatListConversations, sessionToken),
  chatCreateConversation: (title?: string) : Promise<unknown> => ipcRenderer.invoke(ipcChannels.chatCreateConversation, sessionToken, title),
  chatGetConversation: (id: string) : Promise<unknown> => ipcRenderer.invoke(ipcChannels.chatGetConversation, sessionToken, id),
  chatSendMessage: (conversationId: string, content: string, channel?: 'voice' | 'text') : Promise<unknown> =>
    ipcRenderer.invoke(ipcChannels.chatSendMessage, sessionToken, conversationId, content, channel),
  chatAbort: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.chatAbort, sessionToken),
  chatDeleteConversation: (id: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.chatDeleteConversation, sessionToken, id),
  appCheckUpdates: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.appCheckUpdates, sessionToken),
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
  osExecuteTool: (toolName: string, input: unknown, confirmationHash?: string, source?: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.osExecuteTool, sessionToken, toolName, input, confirmationHash, source),
  osTryCommand: (text: string, source?: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.osTryCommand, sessionToken, text, source),
  osConfirmTool: (actionHash: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.osConfirmTool, sessionToken, actionHash),
  osRejectTool: (actionHash: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.osRejectTool, sessionToken, actionHash),
  voiceStart: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.voiceStart, sessionToken),
  voiceStop: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.voiceStop, sessionToken),
  voiceTranscribe: (audio: string, mimeType: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.voiceTranscribe, sessionToken, audio, mimeType),
  voiceSpeak: (text: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.voiceSpeak, sessionToken, text),
  voiceListVoices: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.voiceListVoices, sessionToken),
  personaGet: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.personaGet, sessionToken),
  personaSet: (state: unknown): Promise<unknown> => ipcRenderer.invoke(ipcChannels.personaSet, sessionToken, state),
  personaCalibrationAnswer: (step: string, answer: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.personaCalibrationAnswer, sessionToken, step, answer),
  personaProactive: (conversationId?: string, recentQuestions?: string[]): Promise<unknown> => ipcRenderer.invoke(ipcChannels.personaProactive, sessionToken, conversationId, recentQuestions),
  memoryGetProfile: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.memoryGetProfile, sessionToken),
  memorySetProfile: (profile: unknown): Promise<unknown> => ipcRenderer.invoke(ipcChannels.memorySetProfile, sessionToken, profile),
  memoryClearProfile: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.memoryClearProfile, sessionToken),
  memoryGetOwner: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.memoryGetOwner, sessionToken),
  memorySetOwner: (owner: unknown): Promise<unknown> => ipcRenderer.invoke(ipcChannels.memorySetOwner, sessionToken, owner),
  memoryListProposed: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.memoryListProposed, sessionToken),
  memoryApprove: (id: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.memoryApprove, sessionToken, id),
  memoryReject: (id: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.memoryReject, sessionToken, id),
  emailGetConfig: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.emailGetConfig, sessionToken),
  emailSetConfig: (config: unknown): Promise<unknown> => ipcRenderer.invoke(ipcChannels.emailSetConfig, sessionToken, config),
  emailTestConnection: (config?: unknown): Promise<unknown> => ipcRenderer.invoke(ipcChannels.emailTestConnection, sessionToken, config),
  emailClearConfig: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.emailClearConfig, sessionToken),
  permissionsList: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.permissionsList, sessionToken),
  permissionsGrant: (permission: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.permissionsGrant, sessionToken, permission),
  auditList: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.auditList, sessionToken),
  voiceGetSettings: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.voiceGetSettings, sessionToken),
  voiceSetSettings: (settings: unknown): Promise<unknown> => ipcRenderer.invoke(ipcChannels.voiceSetSettings, sessionToken, settings),
  voiceStopSpeaking: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.voiceStopSpeaking, sessionToken),
  voiceSpeakChunks: (text: string): Promise<unknown> => ipcRenderer.invoke(ipcChannels.voiceSpeakChunks, sessionToken, text),
  onVoiceTranscript: (cb: (payload: { text: string; final: boolean; engine?: string; confidence?: number }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { text: string; final: boolean; engine?: string; confidence?: number }) => cb(payload);
    ipcRenderer.on(ipcChannels.voiceTranscript, handler);
    return () => ipcRenderer.removeListener(ipcChannels.voiceTranscript, handler);
  },
  onVoiceEvent: (cb: (payload: VoiceEventPayload) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: VoiceEventPayload) => cb(payload);
    ipcRenderer.on(ipcChannels.voiceEvent, handler);
    return () => ipcRenderer.removeListener(ipcChannels.voiceEvent, handler);
  },
  onProactiveAlert: (cb: (payload: { id: string; topic: string; message: string; reason: string; channel: string }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { id: string; topic: string; message: string; reason: string; channel: string }) => cb(payload);
    ipcRenderer.on(ipcChannels.proactiveAlert, handler);
    return () => ipcRenderer.removeListener(ipcChannels.proactiveAlert, handler);
  },
});

contextBridge.exposeInMainWorld("companion", api);


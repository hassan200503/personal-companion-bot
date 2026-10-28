export interface AppInfo {
  appVersion: string;
  electronVersion: string;
  platform: string;
}

export interface OnboardingState {
  currentStep: string | null;
  completed: Record<string, { timestamp: number; outcome: string }>;
  failed: Record<string, { timestamp: number; code: string; message: string }>;
  startedAt: number | null;
  completedAt: number | null;
  preset: string | null;
}

export interface ConversationSummary {
  id: string;
  title?: string;
  messageCount: number;
  updatedAt: string;
}

export interface ChatMessageDTO {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export const ipcChannels = {
  appInfo: 'app:getInfo',
  appOpenExternal: 'app:openExternal',
  onboardingGetState: 'onboarding:getState',
  onboardingRun: 'onboarding:run',
  chatListConversations: 'chat:listConversations',
  chatCreateConversation: 'chat:createConversation',
  chatSendMessage: 'chat:sendMessage',
  chatGetConversation: 'chat:getConversation',
  privacyExport: 'privacy:export',
  privacyDeleteAll: 'privacy:deleteAll',
  privacyBackupStatus: 'privacy:backupStatus',
  providersCatalog: 'providers:catalog',
  providersDiscoverModels: 'providers:discoverModels',
  credentialsList: 'credentials:list',
  credentialsValidate: 'credentials:validate',
  credentialsSet: 'credentials:set',
  credentialsDelete: 'credentials:delete',
  providersAddCustom: 'providers:addCustom',
  osListTools: 'os:listTools',
  osExecuteTool: 'os:executeTool',
  osTryCommand: 'os:tryCommand',
  osConfirmTool: 'os:confirmTool',
  voiceStart: 'voice:start',
  voiceStop: 'voice:stop',
  voiceTranscript: 'voice:transcript',
  memoryGetProfile: 'memory:getProfile',
  memorySetProfile: 'memory:setProfile',
  memoryClearProfile: 'memory:clearProfile',
  memoryGetOwner: 'memory:getOwner',
  memorySetOwner: 'memory:setOwner',
} as const;

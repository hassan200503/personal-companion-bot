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
  credentialsList: 'credentials:list',
  credentialsValidate: 'credentials:validate',
  credentialsSet: 'credentials:set',
  credentialsDelete: 'credentials:delete',
  providersAddCustom: 'providers:addCustom',
} as const;

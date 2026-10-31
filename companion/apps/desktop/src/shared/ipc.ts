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
  appOpenSettings: 'app:openSettings',
  appCheckUpdates: 'app:checkUpdates',
  appGetStartup: 'app:getStartup',
  appSetStartup: 'app:setStartup',
  onboardingGetState: 'onboarding:getState',
  onboardingRun: 'onboarding:run',
  onboardingSetPreset: 'onboarding:setPreset',
  onboardingGetVoiceGuide: 'onboarding:getVoiceGuide',
  onboardingSetVoiceGuide: 'onboarding:setVoiceGuide',
  chatListConversations: 'chat:listConversations',
  chatCreateConversation: 'chat:createConversation',
  chatSendMessage: 'chat:sendMessage',
  chatAbort: 'chat:abort',
  chatGetConversation: 'chat:getConversation',
  chatDeleteConversation: 'chat:deleteConversation',
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
  osRejectTool: 'os:rejectTool',
  voiceStart: 'voice:start',
  voiceStop: 'voice:stop',
  voiceTranscribe: 'voice:transcribe',
  voiceTranscript: 'voice:transcript',
  voiceEvent: 'voice:event',
  voiceSpeak: 'voice:speak',
  voiceListVoices: 'voice:listVoices',
  voiceGetSettings: 'voice:getSettings',
  voiceSetSettings: 'voice:setSettings',
  voiceStopSpeaking: 'voice:stopSpeaking',
  personaGet: 'persona:get',
  personaSet: 'persona:set',
  personaCalibrationAnswer: 'persona:calibrationAnswer',
  personaProactive: 'persona:proactive',
  memoryGetProfile: 'memory:getProfile',
  memorySetProfile: 'memory:setProfile',
  memoryClearProfile: 'memory:clearProfile',
  memoryGetOwner: 'memory:getOwner',
  memorySetOwner: 'memory:setOwner',
  memoryListProposed: 'memory:listProposed',
  memoryApprove: 'memory:approve',
  memoryReject: 'memory:reject',
  emailGetConfig: 'email:getConfig',
  emailSetConfig: 'email:setConfig',
  emailTestConnection: 'email:testConnection',
  emailClearConfig: 'email:clearConfig',
  permissionsList: 'permissions:list',
  permissionsGrant: 'permissions:grant',
  proactiveAlert: 'proactive:alert',
  voiceSpeakChunks: 'voice:speakChunks',
  auditList: 'audit:list',
} as const;

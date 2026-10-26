import type { AppInfo } from "../shared/ipc";

declare global {
  interface Window {
    companion: {
      getInfo(): Promise<AppInfo>;
      openExternal(url: string): Promise<void>;
      onboardingGetState(): Promise<any>;
      onboardingRun(): Promise<any>;
      chatListConversations(): Promise<any[]>;
      chatCreateConversation(title?: string): Promise<any>;
      chatGetConversation(id: string): Promise<any>;
      chatSendMessage(conversationId: string, content: string): Promise<any>;
      privacyExport(): Promise<any>;
      privacyDeleteAll(): Promise<any>;
      privacyBackupStatus(backupDir?: string): Promise<any>;
      providersCatalog(): Promise<any>;
      credentialsList(): Promise<string[]>;
      credentialsValidate(providerId: string, apiKey: string): Promise<any>;
      credentialsSet(providerId: string, apiKey: string): Promise<any>;
      credentialsDelete(providerId: string): Promise<any>;
      providersAddCustom(config: { name: string; baseUrl: string; model: string }, apiKey: string): Promise<any>;
    };
  }
}

export {};

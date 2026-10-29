import type { AppInfo } from "../shared/ipc";

declare global {
  interface SpeechRecognitionEventLike extends Event {
    results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string; confidence: number } } };
    resultIndex: number;
  }

  interface SpeechRecognitionLike {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
  }

  interface SpeechRecognitionConstructor {
    new(): SpeechRecognitionLike;
  }

  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    companion: {
      getInfo(): Promise<AppInfo>;
      openExternal(url: string): Promise<void>;
      getStartup(): Promise<any>;
      setStartup(enabled: boolean): Promise<any>;
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
      providersDiscoverModels(providerId: string, apiKey: string): Promise<any>;
      credentialsList(): Promise<string[]>;
      credentialsValidate(providerId: string, apiKey: string): Promise<any>;
      credentialsSet(providerId: string, apiKey: string, model?: string): Promise<any>;
      credentialsDelete(providerId: string): Promise<any>;
      providersAddCustom(config: { name: string; baseUrl: string; model: string }, apiKey: string): Promise<any>;
       osListTools(): Promise<any>;
        osExecuteTool(toolName: string, input: unknown, confirmationHash?: string, source?: string): Promise<any>;
        osTryCommand(text: string, source?: string): Promise<any>;
        osConfirmTool(actionHash: string): Promise<any>;
        osRejectTool(actionHash: string): Promise<any>;
        voiceStart(): Promise<any>;
        voiceStop(): Promise<any>;
        memoryGetProfile(): Promise<any>;
        memorySetProfile(profile: unknown): Promise<any>;
        memoryClearProfile(): Promise<any>;
        memoryGetOwner(): Promise<any>;
        memorySetOwner(owner: unknown): Promise<any>;
        auditList(): Promise<any>;
        voiceGetSettings(): Promise<any>;
        voiceSetSettings(settings: unknown): Promise<any>;
        voiceStopSpeaking(): Promise<any>;
        appCheckUpdates(): Promise<any>;
        chatDeleteConversation(id: string): Promise<any>;
        onVoiceTranscript(cb: (payload: { text: string; final: boolean }) => void): () => void;
    };
  }
}

export {};

export interface AppInfo {
  appVersion: string;
  electronVersion: string;
  platform: string;
}

export const ipcChannels = {
  appInfo: "app:getInfo"
} as const;

import type { AppInfo } from "../shared/ipc";

declare global {
  interface Window {
    companion: {
      getInfo(): Promise<AppInfo>;
    };
  }
}

export {};

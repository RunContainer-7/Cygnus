export type CygnusUpdateState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "manual"
  | "error";

export type CygnusUpdateStatus = {
  state: CygnusUpdateState;
  currentVersion: string;
  version?: string;
  percent?: number;
  message?: string;
  manualUrl?: string;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
};

export type CygnusUpdateResult = {
  ok: boolean;
  error?: string;
};

export type CygnusUpdaterApi = {
  getStatus: () => Promise<CygnusUpdateStatus>;
  check: () => Promise<CygnusUpdateStatus>;
  download: () => Promise<CygnusUpdateResult>;
  install: () => Promise<CygnusUpdateResult>;
  openDownload: () => Promise<void>;
  onStatus: (callback: (status: CygnusUpdateStatus) => void) => () => void;
};

declare global {
  interface Window {
    cygnusUpdater?: CygnusUpdaterApi;
  }
}

export {};

export type ProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  label?: string;
};

export type FileEntry = {
  path: string;
  size: number;
  content?: string;
};

export type ToolEvent = {
  name: string;
  ok: boolean;
  path?: string;
  message: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  tools?: ToolEvent[];
  error?: string;
};

export type ProjectMeta = {
  id: string;
  name: string;
  createdAt: string;
};

export type ProjectData = ProjectMeta & {
  files: FileEntry[];
  chat: ChatMessage[];
};

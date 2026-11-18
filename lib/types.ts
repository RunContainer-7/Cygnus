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

export type ToolKind = "file" | "agent" | "reasoning" | "test" | "blueprint" | "web" | "ask";

export type ToolEvent = {
  name: string;
  ok: boolean;
  path?: string;
  message: string;
  detail?: string;
  kind?: ToolKind;
};

export type ReasoningNode = {
  depth: number;
  text: string;
  label?: string;
};

export type BlueprintTask = {
  id: string;
  title: string;
  status: "pending" | "active" | "done";
};

export type AgentName = "web_researcher" | "expert" | "catalyst";

export type AgentRun = {
  id: string;
  agent: AgentName;
  task: string;
  status: "running" | "done" | "error";
  summary?: string;
};

export type AskPrompt = {
  id: string;
  question: string;
  options?: string[];
  allowFreeText?: boolean;
  status: "pending" | "answered" | "cancelled";
  answer?: string;
  error?: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  tools?: ToolEvent[];
  reasoning?: ReasoningNode[];
  blueprint?: BlueprintTask[];
  agents?: AgentRun[];
  asks?: AskPrompt[];
  activity?: string;
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

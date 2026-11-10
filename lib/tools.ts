import {
  deleteFileSafe,
  listFiles,
  readFileSafe,
  writeFileSafe,
} from "./workspace";

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or replace a file in the project. Always send the complete file contents, never a diff or a fragment.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Project-relative path, for example index.html or app.js.",
          },
          content: {
            type: "string",
            description: "The complete contents of the file.",
          },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the project so you can edit it accurately.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Project-relative path of the file to read.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List every file in the project with its size.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file that should no longer exist in the project.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Project-relative path of the file to delete.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
];

export type ToolResult = {
  ok: boolean;
  message: string;
  display: string;
  path?: string;
};

export async function runTool(
  projectId: string,
  name: string,
  rawArguments: string,
): Promise<ToolResult> {
  let args: Record<string, unknown> = {};
  if (rawArguments && rawArguments.trim()) {
    try {
      const parsed = JSON.parse(rawArguments);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {
          ok: false,
          message: "Tool arguments must be a JSON object.",
          display: "Bad tool arguments",
        };
      }
      args = parsed as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        message: "The tool arguments were not valid JSON. Retry with a valid object.",
        display: "Bad tool arguments",
      };
    }
  }

  try {
    if (name === "write_file") {
      const filePath = typeof args.path === "string" ? args.path.trim() : "";
      const content = typeof args.content === "string" ? args.content : "";
      if (!filePath) {
        return { ok: false, message: "write_file requires a path.", display: "Missing path" };
      }
      if (!content.trim()) {
        return {
          ok: false,
          message: "write_file requires the complete file contents.",
          display: "Empty file content",
          path: filePath,
        };
      }
      const bytes = await writeFileSafe(projectId, filePath, content);
      return {
        ok: true,
        message: `Wrote ${bytes} bytes to ${filePath}.`,
        display: `Wrote ${filePath}`,
        path: filePath,
      };
    }

    if (name === "read_file") {
      const filePath = typeof args.path === "string" ? args.path.trim() : "";
      if (!filePath) {
        return { ok: false, message: "read_file requires a path.", display: "Missing path" };
      }
      const content = await readFileSafe(projectId, filePath);
      return {
        ok: true,
        message: content,
        display: `Read ${filePath}`,
        path: filePath,
      };
    }

    if (name === "list_files") {
      const files = await listFiles(projectId);
      return {
        ok: true,
        message:
          files.length === 0
            ? "The project is empty."
            : files.map((file) => `${file.path} (${file.size} bytes)`).join("\n"),
        display:
          files.length === 0 ? "Listed files (empty)" : `Listed ${files.length} files`,
      };
    }

    if (name === "delete_file") {
      const filePath = typeof args.path === "string" ? args.path.trim() : "";
      if (!filePath) {
        return { ok: false, message: "delete_file requires a path.", display: "Missing path" };
      }
      await deleteFileSafe(projectId, filePath);
      return {
        ok: true,
        message: `Deleted ${filePath}.`,
        display: `Deleted ${filePath}`,
        path: filePath,
      };
    }

    return {
      ok: false,
      message: `Unknown tool "${name}". Use write_file, read_file, list_files or delete_file.`,
      display: `Unknown tool ${name}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool failed.";
    return { ok: false, message: `Error: ${message}`, display: message, path: undefined };
  }
}

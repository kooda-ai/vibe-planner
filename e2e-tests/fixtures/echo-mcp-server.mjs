/**
 * A tiny stdio MCP server used by the end-to-end tests.
 *
 * It exposes a single `echo` tool, which is enough to prove the pipeline end to
 * end: stdio spawn → tool discovery → agent tool call → result. Run it with
 * `node e2e-tests/fixtures/echo-mcp-server.mjs`.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "echo-fixture", version: "1.0.0" });

server.registerTool(
  "echo",
  {
    description: "Echoes the given text back to the caller.",
    inputSchema: { text: z.string() },
  },
  async ({ text }) => ({
    content: [{ type: "text", text: `echo: ${text}` }],
  }),
);

await server.connect(new StdioServerTransport());

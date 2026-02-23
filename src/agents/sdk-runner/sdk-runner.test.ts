import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EmbeddedPiRunResult } from "../pi-embedded-runner/types.js";

// Mock the SDK module before importing sdk-runner
const mockQuery = vi.fn();
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
  createSdkMcpServer: vi.fn(() => ({
    type: "sdk",
    name: "test-server",
    instance: {},
  })),
  tool: vi.fn((name: string, desc: string, schema: unknown, handler: unknown) => ({
    name,
    description: desc,
    inputSchema: schema,
    handler,
  })),
}));

// Mock the blocked patterns loader
vi.mock("./blocked-patterns.js", () => ({
  loadExecApprovalBlockedPatterns: vi.fn(() => ["rm -rf /", "shutdown", "killall"]),
}));

// Mock the MCP servers builder
vi.mock("./mcp-servers.js", () => ({
  buildSdkMcpServers: vi.fn(async () => undefined),
}));

// Mock workspace resolution
vi.mock("../workspace-run.js", () => ({
  resolveRunWorkspaceDir: vi.fn(() => ({
    workspaceDir: "/tmp/test-workspace",
    usedFallback: false,
    agentId: "main",
    agentIdSource: "default",
  })),
  redactRunIdentifier: vi.fn((s: string) => s?.substring(0, 8) ?? ""),
}));

// Mock bootstrap context
vi.mock("../bootstrap-files.js", () => ({
  resolveBootstrapContextForRun: vi.fn(async () => ({ contextFiles: [] })),
  makeBootstrapWarn: vi.fn(() => vi.fn()),
}));

// Mock agent scope
vi.mock("../agent-scope.js", () => ({
  resolveSessionAgentIds: vi.fn(() => ({
    defaultAgentId: "main",
    sessionAgentId: "main",
  })),
}));

// Mock heartbeat
vi.mock("../../auto-reply/heartbeat.js", () => ({
  resolveHeartbeatPrompt: vi.fn(() => undefined),
}));

// Mock docs path
vi.mock("../docs-path.js", () => ({
  resolveOpenClawDocsPath: vi.fn(async () => null),
}));

// Mock system prompt builder
vi.mock("../cli-runner/helpers.js", () => ({
  buildSystemPrompt: vi.fn(() => "You are a helpful assistant."),
}));

import { runSdkAgent, type SdkRunnerParams } from "../sdk-runner.js";

function createMockParams(overrides?: Partial<SdkRunnerParams>): SdkRunnerParams {
  return {
    sessionId: "test-session-123",
    sessionFile: "/tmp/test-session.json",
    workspaceDir: "/tmp/test-workspace",
    prompt: "Hello, world!",
    provider: "claude-sdk",
    model: "sonnet",
    timeoutMs: 30000,
    runId: "test-run-1",
    ...overrides,
  };
}

/** Create an async generator that yields SDK messages */
async function* mockSdkMessages(messages: Array<Record<string, unknown>>) {
  for (const msg of messages) {
    yield msg;
  }
}

describe("sdk-runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns EmbeddedPiRunResult with text from result message", async () => {
    mockQuery.mockReturnValue(
      mockSdkMessages([
        {
          type: "system",
          subtype: "init",
          session_id: "sdk-session-abc",
          model: "claude-sonnet-4-5",
        },
        {
          type: "result",
          subtype: "success",
          result: "Hello! How can I help?",
          is_error: false,
          duration_ms: 1234,
          duration_api_ms: 1000,
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      ]),
    );

    const result: EmbeddedPiRunResult = await runSdkAgent(createMockParams());

    expect(result.payloads).toBeDefined();
    expect(result.payloads![0].text).toBe("Hello! How can I help?");
    expect(result.meta.agentMeta?.sessionId).toBe("sdk-session-abc");
    expect(result.meta.agentMeta?.provider).toBe("claude-sdk");
    expect(result.meta.agentMeta?.model).toBe("sonnet");
    expect(result.meta.agentMeta?.usage?.input).toBe(100);
    expect(result.meta.agentMeta?.usage?.output).toBe(50);
    expect(result.meta.durationMs).toBeGreaterThan(0);
  });

  it("extracts text from assistant messages when no result text", async () => {
    mockQuery.mockReturnValue(
      mockSdkMessages([
        {
          type: "system",
          subtype: "init",
          session_id: "sdk-session-def",
        },
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "I found the answer." }],
          },
        },
        {
          type: "result",
          subtype: "success",
          is_error: false,
          duration_ms: 500,
          duration_api_ms: 400,
          num_turns: 1,
          total_cost_usd: 0.005,
          usage: {
            input_tokens: 50,
            output_tokens: 25,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      ]),
    );

    const result = await runSdkAgent(createMockParams());
    // result.result is undefined so it falls back to accumulated assistant text
    expect(result.payloads![0].text).toBe("I found the answer.");
  });

  it("resolves model aliases correctly", async () => {
    mockQuery.mockReturnValue(
      mockSdkMessages([
        { type: "system", subtype: "init", session_id: "s1" },
        {
          type: "result",
          subtype: "success",
          result: "ok",
          is_error: false,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      ]),
    );

    await runSdkAgent(createMockParams({ model: "opus" }));

    const calledOptions = mockQuery.mock.calls[0][0].options;
    expect(calledOptions.model).toBe("claude-opus-4-6");
  });

  it("throws FailoverError on API authentication failure", async () => {
    mockQuery.mockReturnValue(
      mockSdkMessages([
        { type: "system", subtype: "init", session_id: "s1" },
        {
          type: "assistant",
          message: { content: [] },
          error: "authentication_failed",
        },
        {
          type: "result",
          subtype: "error_during_execution",
          is_error: true,
          errors: ["Authentication failed"],
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      ]),
    );

    await expect(runSdkAgent(createMockParams())).rejects.toThrow("Authentication failed");
  });

  it("throws FailoverError on rate limit", async () => {
    mockQuery.mockReturnValue(
      mockSdkMessages([
        { type: "system", subtype: "init", session_id: "s1" },
        {
          type: "assistant",
          message: { content: [] },
          error: "rate_limit",
        },
        {
          type: "result",
          subtype: "error_during_execution",
          is_error: true,
          errors: ["Rate limit exceeded"],
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      ]),
    );

    await expect(runSdkAgent(createMockParams())).rejects.toThrow("Rate limit exceeded");
  });

  it("returns empty payloads when no text produced", async () => {
    mockQuery.mockReturnValue(
      mockSdkMessages([
        { type: "system", subtype: "init", session_id: "s1" },
        {
          type: "result",
          subtype: "success",
          result: "",
          is_error: false,
          usage: {
            input_tokens: 10,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      ]),
    );

    const result = await runSdkAgent(createMockParams());
    expect(result.payloads).toBeUndefined();
  });

  it("handles timeout via AbortController", async () => {
    // Simulate a long-running query that gets aborted
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    mockQuery.mockReturnValue(
      (async function* () {
        yield { type: "system", subtype: "init", session_id: "s1" };
        throw abortError;
      })(),
    );

    await expect(runSdkAgent(createMockParams({ timeoutMs: 100 }))).rejects.toThrow(
      "SDK session timed out",
    );
  });

  it("uses bypassPermissions mode", async () => {
    mockQuery.mockReturnValue(
      mockSdkMessages([
        { type: "system", subtype: "init", session_id: "s1" },
        {
          type: "result",
          subtype: "success",
          result: "done",
          is_error: false,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      ]),
    );

    await runSdkAgent(createMockParams());

    const calledOptions = mockQuery.mock.calls[0][0].options;
    expect(calledOptions.permissionMode).toBe("bypassPermissions");
    expect(calledOptions.allowDangerouslySkipPermissions).toBe(true);
    expect(calledOptions.canUseTool).toBeDefined();
  });

  it("canUseTool blocks dangerous bash commands", async () => {
    mockQuery.mockReturnValue(
      mockSdkMessages([
        { type: "system", subtype: "init", session_id: "s1" },
        {
          type: "result",
          subtype: "success",
          result: "done",
          is_error: false,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      ]),
    );

    await runSdkAgent(createMockParams());

    // Extract the canUseTool callback
    const canUseTool = mockQuery.mock.calls[0][0].options.canUseTool;
    expect(canUseTool).toBeDefined();

    // Test blocked command
    const blockedResult = await canUseTool(
      "Bash",
      { command: "rm -rf /" },
      {
        signal: new AbortController().signal,
        toolUseID: "test-tool-1",
      },
    );
    expect(blockedResult.behavior).toBe("deny");

    // Test allowed command
    const allowedResult = await canUseTool(
      "Bash",
      { command: "ls -la" },
      {
        signal: new AbortController().signal,
        toolUseID: "test-tool-2",
      },
    );
    expect(allowedResult.behavior).toBe("allow");

    // Test non-bash tool (always allowed)
    const readResult = await canUseTool(
      "Read",
      { file_path: "/etc/passwd" },
      {
        signal: new AbortController().signal,
        toolUseID: "test-tool-3",
      },
    );
    expect(readResult.behavior).toBe("allow");
  });

  it("passes resume session ID when provided", async () => {
    mockQuery.mockReturnValue(
      mockSdkMessages([
        { type: "system", subtype: "init", session_id: "resumed-session" },
        {
          type: "result",
          subtype: "success",
          result: "continued",
          is_error: false,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      ]),
    );

    await runSdkAgent(createMockParams({ sdkSessionId: "previous-session-id" }));

    const calledOptions = mockQuery.mock.calls[0][0].options;
    expect(calledOptions.resume).toBe("previous-session-id");
  });
});

describe("sdk-runner stress", () => {
  it("runs 50 consecutive queries without errors", async () => {
    const results: EmbeddedPiRunResult[] = [];

    for (let i = 0; i < 50; i++) {
      mockQuery.mockReturnValue(
        mockSdkMessages([
          { type: "system", subtype: "init", session_id: `session-${i}` },
          {
            type: "result",
            subtype: "success",
            result: `Response ${i}`,
            is_error: false,
            usage: {
              input_tokens: 10 + i,
              output_tokens: 5 + i,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
          },
        ]),
      );

      const result = await runSdkAgent(
        createMockParams({
          runId: `stress-${i}`,
          prompt: `Query ${i}`,
        }),
      );
      results.push(result);
    }

    expect(results).toHaveLength(50);
    for (let i = 0; i < 50; i++) {
      expect(results[i].payloads![0].text).toBe(`Response ${i}`);
      expect(results[i].meta.agentMeta?.sessionId).toBe(`session-${i}`);
    }
  });
});

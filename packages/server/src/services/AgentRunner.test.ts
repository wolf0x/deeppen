import { describe, it, expect, vi } from "vitest";

vi.mock("deepagents", () => ({
  createDeepAgent: vi.fn(),
}));

vi.mock("@langchain/core/messages", () => ({
  SystemMessage: class SystemMessage {
    constructor(public opts: any) {}
  },
}));

const { createChatModel } = await import("./AgentRunner.js");

describe("createChatModel", () => {
  it("creates Anthropic model", () => {
    const model = createChatModel({
      id: "test",
      name: "Claude",
      provider: "anthropic",
      apiKey: "test-key",
      modelId: "claude-sonnet-4-6",
      maxTokens: 4096,
      temperature: 0,
    });
    expect(model).toBeDefined();
  });

  it("creates OpenAI model", () => {
    const model = createChatModel({
      id: "test",
      name: "GPT",
      provider: "openai",
      apiKey: "test-key",
      modelId: "gpt-4o",
      maxTokens: 4096,
      temperature: 0,
    });
    expect(model).toBeDefined();
  });

  it("creates DeepSeek model", () => {
    const model = createChatModel({
      id: "test",
      name: "DeepSeek",
      provider: "deepseek",
      apiKey: "test-key",
      modelId: "deepseek-chat",
      maxTokens: 4096,
      temperature: 0,
    });
    expect(model).toBeDefined();
  });

  it("creates Ollama model", () => {
    const model = createChatModel({
      id: "test",
      name: "Llama",
      provider: "ollama",
      modelId: "llama3.1",
      maxTokens: 4096,
      temperature: 0,
    });
    expect(model).toBeDefined();
  });

  it("creates OpenRouter model", () => {
    const model = createChatModel({
      id: "test",
      name: "OpenRouter",
      provider: "openrouter",
      apiKey: "test-key",
      modelId: "anthropic/claude-sonnet-4",
      maxTokens: 4096,
      temperature: 0,
    });
    expect(model).toBeDefined();
  });

  it("throws for unsupported provider", () => {
    expect(() => createChatModel({
      id: "test",
      name: "Bad",
      provider: "unsupported" as any,
      modelId: "test",
      maxTokens: 4096,
      temperature: 0,
    })).toThrow("Unsupported provider");
  });
});

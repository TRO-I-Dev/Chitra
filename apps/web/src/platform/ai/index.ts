/**
 * AI provider abstraction. The renderer only ever sees the
 * `AiProvider` interface; concrete providers live in sibling files.
 *
 * Three providers ship out of the box:
 *   - OpenAI (chat completions, BYO key)
 *   - Anthropic (messages, BYO key)
 *   - Ollama (local, no key — just a base URL)
 *
 * All providers expose a single `complete()` method that takes a system
 * prompt + user prompt and returns a string. JSON-mode is requested via
 * the `responseFormat: "json"` option; providers that don't support a
 * native JSON mode just append a "respond with JSON only" suffix.
 */
import * as secrets from "../secrets.js";
import { OpenAiProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { OllamaProvider } from "./ollama.js";

export type AiProviderId = "openai" | "anthropic" | "ollama";

export interface AiCompleteRequest {
  system: string;
  user: string;
  /** Hint to the provider to emit valid JSON. */
  responseFormat?: "text" | "json";
  /** Max tokens — provider clamps to its own ceiling. */
  maxTokens?: number;
  /** Sampling temperature, 0..1. */
  temperature?: number;
}

export interface AiProvider {
  readonly id: AiProviderId;
  readonly label: string;
  complete(req: AiCompleteRequest): Promise<string>;
}

/** Returns the configured provider, or `null` when no credential exists.
 *  Order of preference: explicit choice (TODO future), then OpenAI,
 *  Anthropic, Ollama in that order. */
export async function getActiveProvider(): Promise<AiProvider | null> {
  const openai = await secrets.get({ key: "ai-openai-key" });
  if (openai.value) return new OpenAiProvider(openai.value);
  const anthropic = await secrets.get({ key: "ai-anthropic-key" });
  if (anthropic.value) return new AnthropicProvider(anthropic.value);
  const ollama = await secrets.get({ key: "ai-ollama-url" });
  if (ollama.value) return new OllamaProvider(ollama.value);
  return null;
}

/** True when at least one provider has a credential stored. */
export async function hasAnyProvider(): Promise<boolean> {
  return (await getActiveProvider()) !== null;
}

export type { OpenAiProvider, AnthropicProvider, OllamaProvider };

import type { AiCompleteRequest, AiProvider } from "./index.js";

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;
  readonly label = "Anthropic";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "claude-3-5-sonnet-latest",
  ) {}

  async complete(req: AiCompleteRequest): Promise<string> {
    const user =
      req.responseFormat === "json"
        ? `${req.user}\n\nRespond with valid JSON only — no prose, no fences.`
        : req.user;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        // Anthropic supports CORS from browser clients only when this
        // header is sent (see their dashboard "Allow web access" docs).
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 1200,
        temperature: req.temperature ?? 0.4,
        system: req.system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const block = json.content?.find((b) => b.type === "text");
    return block?.text ?? "";
  }
}

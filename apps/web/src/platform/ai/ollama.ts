import type { AiCompleteRequest, AiProvider } from "./index.js";

export class OllamaProvider implements AiProvider {
  readonly id = "ollama" as const;
  readonly label = "Ollama (local)";

  constructor(
    private readonly baseUrl: string,
    private readonly model: string = "llama3.2",
  ) {}

  async complete(req: AiCompleteRequest): Promise<string> {
    const root = this.baseUrl.replace(/\/+$/, "");
    const body: Record<string, unknown> = {
      model: this.model,
      stream: false,
      options: { temperature: req.temperature ?? 0.4 },
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    };
    if (req.responseFormat === "json") body["format"] = "json";

    const res = await fetch(`${root}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { message?: { content?: string } };
    return json.message?.content ?? "";
  }
}

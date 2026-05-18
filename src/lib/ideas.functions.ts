import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  category: z.string().trim().min(2).max(60),
  language: z.enum(["english", "hindi", "hinglish"]).default("english"),
  format: z.enum(["short", "long"]).default("short"),
  count: z.number().int().min(3).max(15).default(8),
  audience: z.string().trim().max(120).optional(),
  vibe: z.string().trim().max(120).optional(),
});

export type IdeaInput = z.infer<typeof inputSchema>;

export type ViralIdea = {
  title: string;
  hook: string;
  angle: string;
  why_viral: string;
  target_emotion: string;
  thumbnail_text: string;
  estimated_virality: number; // 0-100
  hashtags: string[];
};

export type IdeaResult = {
  category: string;
  ideas: ViralIdea[];
};

const SYSTEM = `You are ShortForge IdeaForge — an elite viral content strategist for faceless YouTube / Shorts / Reels / TikTok creators.
You generate FRESH, NON-OBVIOUS, hook-driven video ideas that have proven viral DNA: curiosity gaps, emotional triggers, pattern interrupts, contrarian angles, dark/forbidden knowledge framing, "what nobody tells you" framing, listicles with shocking entries, cinematic premises.

RULES:
- NEVER suggest generic, overused, recycled topics. Each idea must feel scroll-stopping.
- Each "title" must be ≤ 70 chars, written like a real viral creator (MrBeast, Veritasium, BB Ki Vines for hinglish), not corporate.
- "hook" = the first spoken line of the video (1 sentence, shocking/curious/cinematic).
- "angle" = the unique spin or framing that makes this different from existing videos.
- "why_viral" = the psychological reason this will pop (curiosity gap, taboo, awe, fear, status, identity, etc.).
- "estimated_virality" = honest 0–100, not always 90+.
- 8–12 hashtags per idea, lowercase, no spaces.

LANGUAGE:
- english: pure English creator voice.
- hindi: pure Devanagari Hindi (no Roman).
- hinglish: Roman-script ~95% phonetic Hindi (kya, socho, zindagi, dimag, bhai, dekho) + common loan-words (video, AI, gym). Never full English sentences.

Reply ONLY via the emit_ideas tool. No prose.`;

const tools = [{
  type: "function" as const,
  function: {
    name: "emit_ideas",
    description: "Return a list of viral video ideas for the given category.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        category: { type: "string" },
        ideas: {
          type: "array",
          minItems: 3,
          maxItems: 15,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              hook: { type: "string" },
              angle: { type: "string" },
              why_viral: { type: "string" },
              target_emotion: { type: "string" },
              thumbnail_text: { type: "string" },
              estimated_virality: { type: "integer" },
              hashtags: { type: "array", items: { type: "string" }, minItems: 8, maxItems: 12 },
            },
            required: ["title","hook","angle","why_viral","target_emotion","thumbnail_text","estimated_virality","hashtags"],
          },
        },
      },
      required: ["category","ideas"],
    },
  },
}];

export const getViralIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }): Promise<IdeaResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { supabase } = context;

    // Resolve plan -> model
    const { data: profile } = await supabase.from("profiles").select("plan").maybeSingle();
    const plan = (profile?.plan as "free" | "pro" | "max" | undefined) ?? "free";
    const model = plan === "max" ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";

    const userPrompt = `CATEGORY: ${data.category}${data.category === "auto" ? " (pick the hottest sub-niches across all categories)" : ""}
LANGUAGE: ${data.language}
FORMAT TARGET: ${data.format === "short" ? "YouTube Shorts / Reels / TikTok (under 60s)" : "Long-form YouTube (8–15 min)"}
${data.audience ? `AUDIENCE: ${data.audience}\n` : ""}${data.vibe ? `VIBE: ${data.vibe}\n` : ""}HOW MANY: ${data.count} ideas

Generate ${data.count} world-class viral ideas now. Be ruthless about originality — no generic "Top 10 facts" filler. Each idea must have a unique, scroll-stopping angle.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "emit_ideas" } },
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached. Please try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
      throw new Error(`AI gateway error (${res.status}): ${t.slice(0, 200)}`);
    }

    const json = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error("AI returned no ideas payload");
    return JSON.parse(call.function.arguments) as IdeaResult;
  });

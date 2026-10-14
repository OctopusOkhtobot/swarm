import { useState } from "react";
import type { Lang } from "./copy";

type Line = { en: string; ar: string };

type Plaque = {
  id: string;
  name: string;
  house: string;
  year: string;
  use: Line;
  portrait: string;
  code: string;
};

const plaques: Plaque[] = [
  {
    id: "grok",
    name: "Grok",
    house: "xAI",
    year: "2023",
    use: { en: "Code, search, and tools on the xAI API.", ar: "كود وبحث وأدوات على واجهة xAI." },
    portrait: "/cards/grok.jpg",
    code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

const reply = await client.chat.completions.create({
  model: "grok-4.7",
  messages: [{ role: "user", content: "Explain the diagram." }],
});`,
  },
  {
    id: "claude",
    name: "Claude",
    house: "Anthropic",
    year: "2023",
    use: { en: "Long documents and careful agents.", ar: "مستندات طويلة ووكلاء دقيقون." },
    portrait: "/cards/claude.jpg",
    code: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const message = await client.messages.create({
  model: "claude-sonnet-5-5",
  max_tokens: 512,
  messages: [{ role: "user", content: "Summarize this brief." }],
});`,
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    house: "OpenAI",
    year: "2022",
    use: { en: "A response from the Responses API.", ar: "رد عبر واجهة Responses." },
    portrait: "/cards/chatgpt.jpg",
    code: `import OpenAI from "openai";

const client = new OpenAI();

const response = await client.responses.create({
  model: "gpt-5.4",
  input: "Draft the release note.",
});`,
  },
  {
    id: "gemini",
    name: "Gemini",
    house: "Google",
    year: "2023",
    use: { en: "Text and images in one call.", ar: "نص وصورة في طلب واحد." },
    portrait: "/cards/gemini.jpg",
    code: `import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: "gemini-3.8-flash",
  contents: "Plan the evening.",
});`,
  },
  {
    id: "llama",
    name: "Llama",
    house: "Meta",
    year: "2023",
    use: { en: "An open weight you can run yourself.", ar: "وزن مفتوح تستطيع تشغيله بنفسك." },
    portrait: "/cards/llama.jpg",
    code: `from transformers import pipeline

pipe = pipeline(
    "text-generation",
    model="meta-llama/Llama-3.3-70B-Instruct",
)
print(pipe("Write a haiku about rain.", max_new_tokens=40)[0]["generated_text"])`,
  },
  {
    id: "copilot",
    name: "Copilot",
    house: "GitHub",
    year: "2021",
    use: { en: "A model call beside the repository.", ar: "طلب نموذج بجانب المستودع." },
    portrait: "/cards/copilot.jpg",
    code: `const response = await fetch(
  "https://models.github.ai/inference/chat/completions",
  {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.GITHUB_TOKEN}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4.1",
      messages: [{ role: "user", content: "Explain this diff." }],
    }),
  },
);`,
  },
  {
    id: "mistral",
    name: "Mistral",
    house: "Mistral AI",
    year: "2023",
    use: { en: "A European model for language work.", ar: "نموذج أوروبي لأعمال اللغة." },
    portrait: "/cards/mistral.jpg",
    code: `import { Mistral } from "@mistralai/mistralai";

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

const chat = await client.chat.complete({
  model: "mistral-large-latest",
  messages: [{ role: "user", content: "Translate this clause." }],
});`,
  },
];

export function CardSalon({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState<string | null>(null);
  const plaque = plaques.find((item) => item.id === open) ?? null;
  const close = lang === "ar" ? "إغلاق" : "Close";
  return (
    <section className="salon" aria-label={lang === "ar" ? "بطاقات" : "Cards"}>
      <ul className="salon-grid">
        {plaques.map((item) => (
          <li key={item.id}>
            <button type="button" className="plaque" onClick={() => setOpen(item.id)}>
              <img src={item.portrait} alt="" />
              <span className="roman">{item.name}</span>
              <em>{item.house}</em>
            </button>
          </li>
        ))}
      </ul>
      {plaque ? (
        <article className="folio">
          <img src={plaque.portrait} alt="" />
          <div>
            <p className="roman folio-kicker">{plaque.house}</p>
            <h2 className="roman">{plaque.name}</h2>
            <p className="folio-facts">
              <span>{plaque.year}</span>
              <span>{lang === "ar" ? plaque.use.ar : plaque.use.en}</span>
            </p>
            <pre className="codex">
              <code>{plaque.code}</code>
            </pre>
            <button type="button" className="ghost" onClick={() => setOpen(null)}>
              {close}
            </button>
          </div>
        </article>
      ) : null}
    </section>
  );
}

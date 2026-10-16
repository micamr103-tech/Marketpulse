/**
 * Mock Ollama server — used only to verify the LLM code path without the real
 * binary installed. Start: node server/mock-ollama.mjs
 */
import http from "node:http";

const VERDICT = {
  probabilityUp: 68.4,
  confidence: 74,
  headline: "AI capex cycle is still compounding faster than estimates",
  summary:
    "Coverage is dominated by supply agreements rather than product news, which points to revenue that is contracted but not yet in estimates. The read-through is a persistent upward bias for the next two weeks, tempered by valuation.",
  drivers: [
    { title: "Supply agreements dominate", detail: "3 of 4 read articles reference multi-year supply deals", impact: "positive", weight: 0.82 },
    { title: "Estimates still catching up", detail: "Guidance language unchanged while street numbers rise", impact: "positive", weight: 0.64 },
    { title: "Valuation is the offset", detail: "Multiple has expanded 18% in three months", impact: "negative", weight: 0.41 },
  ],
  risks: ["A single guidance miss resets the whole narrative quickly", "Positioning is crowded on the long side"],
  articleSentiment: [
    { i: 0, score: 0.82, why: "Record backlog and raised capacity guidance" },
    { i: 1, score: 0.61, why: "New hyperscaler contract confirmed" },
    { i: 2, score: -0.44, why: "Regulator opens an antitrust review" },
    { i: 3, score: 0.35, why: "Supply constraints easing into next quarter" },
  ],
  horizonNote: "next 10 trading days",
};

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/tags") {
        return res.end(
          JSON.stringify({ models: [{ name: "llama3.1:latest" }, { name: "nomic-embed-text:latest" }] })
        );
      }
      if (req.url === "/api/chat") {
        console.log("mock-ollama: chat request, prompt bytes =", body.length);
        return res.end(JSON.stringify({ message: { content: JSON.stringify(VERDICT) }, done: true }));
      }
      res.statusCode = 404;
      res.end("{}");
    });
  })
  .listen(11434, () => console.log("mock ollama on :11434"));
/**
 * Validates the on-device sentiment model outside the browser.
 * transformers.js uses the same ONNX runtime in both environments, so a pass
 * here means the model itself is sound; CORS on the model CDN is checked
 * separately in the browser.
 */
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

const MODEL = process.argv[2] || "Xenova/distilbert-base-uncased-finetuned-sst-2-english";

console.log(`loading ${MODEL} …`);
const t0 = Date.now();
const clf = await pipeline("text-classification", MODEL, { dtype: "q8" });
console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const tests = [
  "Nvidia beats quarterly estimates and raises guidance on record AI demand",
  "Tesla sinks as chip sell-off deepens on hot inflation data",
  "Analysts upgrade the stock citing strong backlog growth",
  "Company faces regulatory probe and lawsuits over pricing",
  "Stock slips modestly in early trading",
  "Fed signals rate hike as inflation runs hot",
  "Company announces $10 billion buyback and record dividend",
];

const t1 = Date.now();
for (const s of tests) {
  const r = await clf(s);
  const polarity = r[0].label === "POSITIVE" ? r[0].score : -r[0].score;
  const agree = s.match(/beat|upgrade|buyback|record/i) ? "POS" : s.match(/sink|probe|lawsuit|inflation|hot/i) ? "NEG" : "?";
  console.log(`  ${polarity >= 0 ? "POS" : "NEG"} ${polarity.toFixed(3)}  (expected ~${agree})  ${s.slice(0, 56)}`);
}
console.log(`inference: ${Date.now() - t1}ms for ${tests.length} headlines`);

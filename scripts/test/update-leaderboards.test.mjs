import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatSnapshot, groupLabs, labName, minLabReleases, parseCsv } from "../update-leaderboards.mjs";

const header = "Model,Display name,eci,eci_ci_low,eci_ci_high,date,Organization";
const csv = (...lines) => parseCsv([header, ...lines].join("\n"));

describe("labName", () => {
  test("merges lab aliases onto one name", () => {
    for (const org of ["Google", "Google DeepMind", "DeepMind", "google research"]) assert.equal(labName(org), "Google DeepMind");
    for (const org of ["Meta", "Meta AI", "Facebook", "Facebook AI Research"]) assert.equal(labName(org), "Meta");
    for (const org of ["Alibaba", "Qwen", "Alibaba Cloud"]) assert.equal(labName(org), "Alibaba");
    assert.equal(labName("Mistral AI"), "Mistral");
    assert.equal(labName("Z.ai (Zhipu AI)"), "Z.ai");
    assert.equal(labName("Microsoft Research"), "Microsoft");
  });

  test("keeps unknown labs as written", () => {
    assert.equal(labName("Thinking Machines"), "Thinking Machines");
    assert.equal(labName("  Reflection "), "Reflection");
  });

  test("credits joint releases to the first organization listed", () => {
    assert.equal(labName("Google DeepMind,Google"), "Google DeepMind");
    assert.equal(labName("DeepSeek,Peking University"), "DeepSeek");
    assert.equal(labName("Hugging Face,ServiceNow,Nvidia,BigCode"), "Hugging Face");
  });

  test("falls back to well-known model families when the organization is missing", () => {
    assert.equal(labName("", "PaLM 2-L"), "Google DeepMind");
    assert.equal(labName("", "Qwen2.5-Coder-14B"), "Alibaba");
    assert.equal(labName(undefined, "o3-mini"), "OpenAI");
    assert.equal(labName("", "Palmyra X"), "");
    assert.equal(labName("", "open_llama_7b"), "");
    assert.equal(labName("", "vicuna-13b-v1.1"), "");
  });
});

describe("groupLabs", () => {
  const rows = csv(
    "GPT-5,GPT-5,150.0,,,2025-08-07,OpenAI",
    "GPT-4 (Mar 2023),GPT-4 (Mar 2023),121.87,118.06,125.35,2023-03-14,OpenAI",
    "GPT-5 mini,GPT-5 mini,146.08,144.51,147.6,2025-08-07,OpenAI",
    "Gemini 3 Pro,Gemini 3 Pro,152.89,151.2,154.6,2025-11-18,Google DeepMind",
    "Gemini 2.0 Flash (Feb 2025),Gemini 2.0 Flash (Feb 2025),130.1,128,132,2025-02-05,\"Google DeepMind,Google\"",
    "Gemini 3.1 Flash-Lite,Gemini 3.1 Flash-Lite,144.9,143,146.8,2026-03-03,Google",
    "PaLM 2-L,PaLM 2-L,114.08,110,118,2023-05-17,",
    "Llama 3,Llama 3,120,118,122,2024-04-18,Meta AI",
    "Llama 4,Llama 4,130,128,132,2025-04-05,Meta AI",
    "Thinker,Thinker,140,138,142,2025-01-01,Thinking Machines",
    "Thinker 2,Thinker 2,141,139,143,,Thinking Machines",
    "Thinker 3,Thinker 3,,,,2025-06-01,Thinking Machines"
  );

  test("groups every release by normalized lab, oldest first", () => {
    const labs = groupLabs(rows);
    const google = labs.find((lab) => lab.org === "Google DeepMind");
    assert.deepEqual(google?.models.map((item) => item.model), [
      "PaLM 2-L", "Gemini 2.0 Flash (Feb 2025)", "Gemini 3 Pro", "Gemini 3.1 Flash-Lite"
    ]);
    const openai = labs.find((lab) => lab.org === "OpenAI");
    assert.deepEqual(openai?.models.map((item) => item.date), ["2023-03-14", "2025-08-07", "2025-08-07"]);
  });

  test("orders same-day releases by score and keeps compact rounded fields", () => {
    const openai = groupLabs(rows).find((lab) => lab.org === "OpenAI");
    assert.deepEqual(openai?.models, [
      { model: "GPT-4 (Mar 2023)", date: "2023-03-14", eci: 121.9, low: 118.1, high: 125.3 },
      { model: "GPT-5 mini", date: "2025-08-07", eci: 146.1, low: 144.5, high: 147.6 },
      { model: "GPT-5", date: "2025-08-07", eci: 150 }
    ]);
  });

  test(`drops labs with fewer than ${minLabReleases} scored, dated releases`, () => {
    const orgs = groupLabs(rows).map((lab) => lab.org);
    assert.ok(!orgs.includes("Meta"), "two releases");
    assert.ok(!orgs.includes("Thinking Machines"), "one release has no date and one has no score");
    assert.deepEqual(groupLabs(rows, new Map(), 2).map((lab) => lab.org).sort(), ["Google DeepMind", "Meta", "OpenAI"]);
  });

  test("orders labs by their best score", () => {
    assert.deepEqual(groupLabs(rows).map((lab) => lab.org), ["Google DeepMind", "OpenAI"]);
  });

  test("fills a missing organization or date from model metadata", () => {
    const metadata = new Map([
      ["Thinker 2", { model_group: "Thinker 2", organization: "Thinking Machines", date: "2025-03-01" }],
      ["Mystery", { model_group: "Mystery", organization: "Meta AI", date: "2025-09-09" }]
    ]);
    const labs = groupLabs([...rows, ...csv("Mystery,Mystery,133,131,135,,")], metadata, 2);
    assert.deepEqual(labs.find((lab) => lab.org === "Thinking Machines")?.models.map((item) => item.date), ["2025-01-01", "2025-03-01"]);
    assert.deepEqual(labs.find((lab) => lab.org === "Meta")?.models.map((item) => item.model), ["Llama 3", "Llama 4", "Mystery"]);
  });

  test("keeps one entry per model, the higher score", () => {
    const labs = groupLabs([...rows, ...csv("GPT-5,GPT-5,151.04,149,153,2025-08-07,OpenAI")]);
    const gpt5 = labs.find((lab) => lab.org === "OpenAI")?.models.filter((item) => item.model === "GPT-5");
    assert.deepEqual(gpt5, [{ model: "GPT-5", date: "2025-08-07", eci: 151, low: 149, high: 153 }]);
  });
});

describe("formatSnapshot", () => {
  test("writes one lab release per line and round-trips", () => {
    const snapshot = {
      generatedAt: "2026-11-11T00:00:00.000Z",
      epoch: {
        benchmarks: [{ id: "eci", rows: [{ model: "A", score: 1 }] }],
        labs: [{ org: "Lab \"Q\"", models: [{ model: "Model, \"1\"", date: "2026-01-01", eci: 150.5, low: 149, high: 152 }, { model: "B\\2", date: "2026-02-01", eci: 151 }] }]
      }
    };
    const text = formatSnapshot(snapshot);
    assert.deepEqual(JSON.parse(text), snapshot);
    assert.ok(text.endsWith("}\n"));
    assert.match(text, /^ {10}\{ "model": "Model, \\"1\\"", "date": "2026-01-01", "eci": 150.5, "low": 149, "high": 152 \},$/m);
    assert.match(text, /^ {10}\{ "model": "B\\\\2", "date": "2026-02-01", "eci": 151 \}$/m);
    assert.match(text, /^ {12}"model": "A",$/m, "other blocks stay pretty-printed");
  });
});

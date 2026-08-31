// Fetches the latest AI-related launches from Product Hunt and regenerates data.json.
// Runs unattended from GitHub Actions. Requires PRODUCT_HUNT_TOKEN as an env var.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const TOKEN = process.env.PRODUCT_HUNT_TOKEN;
const DATA_PATH = new URL("../data.json", import.meta.url);
const MAX_PAGES = 5;
const PAGE_SIZE = 20;
const MAX_AGE_DAYS = 90;
const MAX_TOOLS = 300;
const TRANSLATE_DELAY_MS = 350;

const TOPIC_TO_CATEGORY = [
  [/design/i, "design"],
  [/voice|speech/i, "voix"],
  [/audio|music/i, "audio"],
  [/fintech|finance/i, "finance"],
  [/writing|copywriting/i, "ecriture"],
  [/video/i, "video"],
  [/marketing|advertising|seo/i, "marketing"],
  [/productivity/i, "productivite"],
  [/developer|no-code|api/i, "dev"],
  [/photo|graphics|image/i, "image"],
  [/chatbot|assistant/i, "chatbot"],
  [/analytics|data/i, "data"],
];

function categoriesFromTopics(topicNames) {
  const set = new Set();
  for (const name of topicNames) {
    for (const [re, cat] of TOPIC_TO_CATEGORY) {
      if (re.test(name)) set.add(cat);
    }
  }
  if (set.size === 0) set.add("autre");
  return [...set];
}

async function fetchPage(after) {
  const query = `
    query ($after: String) {
      posts(topic: "artificial-intelligence", order: NEWEST, first: ${PAGE_SIZE}, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            name
            tagline
            url
            website
            createdAt
            thumbnail { url }
            topics { edges { node { name } } }
          }
        }
      }
    }
  `;

  const res = await fetch("https://api.producthunt.com/v2/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query, variables: { after } }),
  });

  if (!res.ok) {
    throw new Error(`Product Hunt API error: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Product Hunt API errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data.posts;
}

async function fetchLatest() {
  const collected = [];
  let after = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { pageInfo, edges } = await fetchPage(after);
    for (const { node } of edges) {
      const topicNames = (node.topics?.edges || []).map((e) => e.node.name);
      collected.push({
        id: `ph-${node.id}`,
        name: node.name,
        tagline: node.tagline,
        tagline_fr: null,
        logo: node.thumbnail?.url || null,
        url: node.website || node.url,
        categories: categoriesFromTopics(topicNames),
        pricing: "a-verifier",
        pricing_note: "Non confirme automatiquement, verifier sur le site avant de renseigner une carte.",
        no_credit_card: null,
        source: "producthunt",
        source_url: node.url,
        launched_at: node.createdAt,
      });
    }
    if (!pageInfo.hasNextPage) break;
    after = pageInfo.endCursor;
  }
  return collected;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Free, keyless translation API. Only called for taglines not already cached
// from a previous run, to stay well within the anonymous daily quota.
async function translateToFrench(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|fr`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory error: ${res.status}`);
  const json = await res.json();
  const translated = json?.responseData?.translatedText;
  if (!translated || /MYMEMORY WARNING|INVALID/i.test(translated)) {
    throw new Error("MyMemory translation unavailable");
  }
  return translated;
}

async function attachTranslations(fetched, existingById) {
  for (const tool of fetched) {
    if (!tool.tagline) continue;
    const prev = existingById.get(tool.id);
    if (prev && prev.tagline_fr && prev.tagline === tool.tagline) {
      tool.tagline_fr = prev.tagline_fr;
      continue;
    }
    try {
      tool.tagline_fr = await translateToFrench(tool.tagline);
    } catch {
      tool.tagline_fr = prev?.tagline_fr || null;
    }
    await sleep(TRANSLATE_DELAY_MS);
  }
}

function loadExisting() {
  if (!existsSync(DATA_PATH)) return [];
  try {
    const raw = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
    return raw.tools || [];
  } catch {
    return [];
  }
}

function mergeTools(existing, fetched) {
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const tool of fetched) {
    const prev = byId.get(tool.id);
    if (prev && prev.pricing_manual) {
      byId.set(tool.id, { ...tool, pricing: prev.pricing, pricing_note: prev.pricing_note, no_credit_card: prev.no_credit_card, pricing_manual: true });
    } else {
      byId.set(tool.id, { ...tool, youtube: prev?.youtube ?? null });
    }
  }
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  return [...byId.values()]
    .filter((t) => t.source === "seed" || !t.launched_at || new Date(t.launched_at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.launched_at || 0) - new Date(a.launched_at || 0))
    .slice(0, MAX_TOOLS);
}

async function main() {
  if (!TOKEN) {
    console.error("PRODUCT_HUNT_TOKEN missing, skipping fetch (keeping existing data.json).");
    return;
  }
  const existing = loadExisting();
  const existingById = new Map(existing.map((t) => [t.id, t]));
  const fetched = await fetchLatest();
  await attachTranslations(fetched, existingById);
  const merged = mergeTools(existing, fetched);

  writeFileSync(
    DATA_PATH,
    JSON.stringify({ updated_at: new Date().toISOString(), tools: merged }, null, 2) + "\n"
  );
  console.log(`data.json updated: ${merged.length} outils (dont ${fetched.length} vus lors de ce scan).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const CATEGORY_LABELS = {
  design: "Design",
  voix: "Voix",
  audio: "Audio",
  finance: "Finance",
  ecriture: "Ecriture",
  video: "Video",
  marketing: "Marketing",
  productivite: "Productivite",
  dev: "Dev",
  image: "Image",
  chatbot: "Chatbot",
  data: "Data",
  autre: "Autre",
};

const PRICING_LABELS = {
  freemium: "Freemium",
  gratuit: "Gratuit",
  payant: "Payant",
  "a-verifier": "A verifier",
};

const PRICING_TITLES = {
  freemium: "Gratuit, avec des options payantes en plus.",
  gratuit: "Entierement gratuit.",
  payant: "Payant des le depart.",
  "a-verifier": "Prix pas encore confirme : verifiez sur le site officiel avant de vous inscrire.",
};

const state = {
  tools: [],
  activeTags: new Set(),
  query: "",
};

const $grid = document.getElementById("grid");
const $tagbar = document.getElementById("tagbar");
const $search = document.getElementById("search");
const $resultMeta = document.getElementById("result-meta");
const $emptyState = document.getElementById("empty-state");
const $scanStatus = document.getElementById("scan-status");
const $modal = document.getElementById("modal");
const $modalBody = document.getElementById("modal-body");
const $modalTitle = document.getElementById("modal-title");
const $modalClose = document.getElementById("modal-close");

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function pricingSlug(p) {
  return (p || "a-verifier").toLowerCase().replace(/[^a-z]/g, "-");
}

function isNew(launchedAt) {
  if (!launchedAt) return false;
  const days = (Date.now() - new Date(launchedAt).getTime()) / 86400000;
  return days <= 4;
}

function relativeScanTime(iso) {
  if (!iso) return "jamais encore scanne";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "scan : a l'instant";
  if (mins < 60) return `scan : il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `scan : il y a ${hours} h`;
  return `scan : il y a ${Math.round(hours / 24)} j`;
}

function buildTagbar(tools) {
  const counts = {};
  tools.forEach((t) => (t.categories || []).forEach((c) => (counts[c] = (counts[c] || 0) + 1)));
  const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  $tagbar.innerHTML = "";
  const allChip = makeChip("Tout", null, tools.length);
  $tagbar.appendChild(allChip);
  cats.forEach((c) => $tagbar.appendChild(makeChip(CATEGORY_LABELS[c] || c, c, counts[c])));
}

function makeChip(label, value, count) {
  const btn = document.createElement("button");
  btn.className = "tag-chip" + (value === null && state.activeTags.size === 0 ? " active" : "");
  btn.type = "button";
  btn.innerHTML = `${label}<span class="count">${count}</span>`;
  btn.addEventListener("click", () => {
    if (value === null) {
      state.activeTags.clear();
    } else if (state.activeTags.has(value)) {
      state.activeTags.delete(value);
    } else {
      state.activeTags.add(value);
    }
    render();
  });
  if (value !== null) btn.dataset.value = value;
  return btn;
}

function syncChipStates() {
  document.querySelectorAll(".tag-chip").forEach((chip) => {
    const v = chip.dataset.value;
    if (!v) {
      chip.classList.toggle("active", state.activeTags.size === 0);
    } else {
      chip.classList.toggle("active", state.activeTags.has(v));
    }
  });
}

function filteredTools() {
  const q = state.query.trim().toLowerCase();
  return state.tools.filter((t) => {
    const matchesTag =
      state.activeTags.size === 0 || (t.categories || []).some((c) => state.activeTags.has(c));
    if (!matchesTag) return false;
    if (!q) return true;
    const hay = `${t.name} ${t.tagline_fr || ""} ${t.tagline || ""} ${(t.categories || []).join(" ")}`.toLowerCase();
    return hay.includes(q);
  });
}

function cardHTML(t) {
  const pSlug = pricingSlug(t.pricing);
  const pLabel = PRICING_LABELS[pSlug] || "A verifier";
  const pTitle = PRICING_TITLES[pSlug] || "";
  const tags = (t.categories || []).map((c) => `<span>${CATEGORY_LABELS[c] || c}</span>`).join("");
  const demoHref = t.youtube
    ? null
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(t.name + " demo")}`;
  const tagline = t.tagline_fr || t.tagline || "";
  const initial = (t.name || "?").trim().charAt(0).toUpperCase();
  const logo = t.logo
    ? `<img class="card-logo js-logo" src="${esc(t.logo)}" data-fallback="${esc(initial)}" alt="" loading="lazy">`
    : `<div class="card-logo-fallback">${esc(initial)}</div>`;

  return `
    <article class="card" data-id="${esc(t.id)}">
      <div class="card-top">
        <div class="card-id">
          ${logo}
          <h2 class="card-name" title="${esc(t.name)}">${esc(t.name)}</h2>
        </div>
        ${isNew(t.launched_at) ? '<span class="badge-new">NOUVEAU</span>' : ""}
      </div>
      <p class="card-tagline">${esc(tagline)}</p>
      <div class="card-badges">
        <span class="pill pricing-${pSlug}" title="${esc(pTitle)}">${pLabel}</span>
        ${t.no_credit_card ? '<span class="pill no-cb" title="Pas de carte bancaire demandee pour essayer.">sans CB</span>' : ""}
      </div>
      <div class="card-tags">${tags}</div>
      <div class="card-actions">
        ${
          t.youtube
            ? `<button class="js-play" data-yt="${esc(t.youtube)}" data-name="${esc(t.name)}">&#9654; demo</button>`
            : `<a href="${esc(demoHref)}" target="_blank" rel="noopener">&#9654; chercher une demo</a>`
        }
        <a href="${esc(t.url)}" target="_blank" rel="noopener" title="Ouvre le site officiel de l'outil">&#8599; site officiel</a>
      </div>
    </article>
  `;
}

function render() {
  syncChipStates();
  const list = filteredTools();
  $resultMeta.textContent = `${list.length} outil${list.length > 1 ? "s" : ""} affiche${list.length > 1 ? "s" : ""} sur ${state.tools.length} suivis`;
  $grid.innerHTML = list.map(cardHTML).join("");
  $emptyState.hidden = list.length !== 0;

  $grid.querySelectorAll(".js-play").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.yt, btn.dataset.name));
  });

  $grid.querySelectorAll(".js-logo").forEach((img) => {
    img.addEventListener(
      "error",
      () => {
        const fallback = document.createElement("div");
        fallback.className = "card-logo-fallback";
        fallback.textContent = img.dataset.fallback || "?";
        img.replaceWith(fallback);
      },
      { once: true }
    );
  });
}

function extractYoutubeId(value) {
  if (!value) return null;
  const match = value.match(/(?:youtu\.be\/|v=|embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : value;
}

function openModal(ytValue, name) {
  const id = extractYoutubeId(ytValue);
  $modalTitle.textContent = name;
  $modalBody.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1" title="Demo ${name}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  $modal.hidden = false;
}

function closeModal() {
  $modal.hidden = true;
  $modalBody.innerHTML = "";
}

$modalClose.addEventListener("click", closeModal);
$modal.addEventListener("click", (e) => {
  if (e.target === $modal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

$search.addEventListener("input", (e) => {
  state.query = e.target.value;
  render();
});

async function init() {
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    const data = await res.json();
    state.tools = (data.tools || []).sort(
      (a, b) => new Date(b.launched_at || 0) - new Date(a.launched_at || 0)
    );
    $scanStatus.textContent = relativeScanTime(data.updated_at);
    buildTagbar(state.tools);
    render();
  } catch (err) {
    $scanStatus.textContent = "erreur de chargement";
    $emptyState.hidden = false;
    $emptyState.textContent = "Impossible de charger data.json pour le moment.";
  }
}

init();

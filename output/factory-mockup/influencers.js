const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const brand = new URLSearchParams(location.search).get("brand") || "kokoro";
const aliceReferences = [
  `/pool-images/${brand}/alice-lifestyle/01.jpg`,
  `/pool-images/${brand}/alice-lifestyle/05.jpg`,
  `/pool-images/${brand}/alice-lifestyle/08.jpg`,
  `/pool-images/${brand}/alice-crying/03.jpg`,
];
const scenes = [
  "Alice leaving a small neighbourhood gym after work, sitting on a bench tying her shoes, candid phone photo, lightly tired but composed, ordinary fluorescent and evening light.",
  "Alice eating a late solo dinner at a small neighbourhood restaurant after work, coat on the chair, natural candid phone photo, warm practical light, no posing.",
  "Alice standing in a supermarket aisle after work deciding what to make for dinner, basket in one hand, ordinary overhead light, slightly distracted but not visibly upset.",
  "Alice on a crowded evening train looking out of the window with headphones around her neck, authentic commuter snapshot, mixed cool train light and city reflections.",
  "Alice taking a quiet lunch alone at a café near the office, laptop closed for once, candid photograph from across the table, realistic midday window light.",
  "Alice sitting on the office stairwell for five private minutes between meetings, work badge and tote bag visible, phone-camera realism, restrained expression.",
  "Alice at a laundromat on Sunday morning reading while the machines run, ordinary clothes, imperfect framing, soft grey daylight.",
  "Alice cooking a simple dinner in a small lived-in kitchen, one hand resting on the counter, tired after work but not performing sadness.",
  "Alice browsing a bookstore after work with her tote bag on one shoulder, candid aisle photograph, warm shop lighting and natural skin texture.",
  "Alice walking home in light rain with an umbrella and gym bag, city pavement reflections, believable phone-camera motion blur.",
  "Alice waiting alone at an airport gate after a delayed work trip, shoes tucked under the chair, practical overhead light, quietly drained.",
  "Alice at a messy desk just after everyone else has left the office, packing her bag, sunset through the window, natural unposed photograph.",
];
const identityPresets = [
  {
    name: "Maya",
    age: "late 20s",
    life: "Works in hospitality with changing shifts, lives with a flatmate, often eats late after work and looks energetic even when she is emotionally spent.",
    tension: "She is warm and socially capable, but after taking care of customers and coworkers all day she has no language left for what she feels.",
  },
  {
    name: "Leah",
    age: "early 30s",
    life: "Works remotely in client operations, lives alone, and spends most days switching between video calls without properly leaving the apartment.",
    tension: "She is organized for everyone else but becomes restless and self-critical when the laptop finally closes.",
  },
  {
    name: "Nora",
    age: "late 30s",
    life: "Manages a small team and helps care for a parent, so her calendar is full of other people's needs before her own.",
    tension: "She rarely breaks down; she simply goes quiet, sleeps badly, and tells herself she should be able to handle more.",
  },
];

const assets = [
  ...Array.from({ length: 10 }, (_, index) => ({
    pool: "alice-lifestyle",
    number: String(index + 1).padStart(2, "0"),
    url: `/pool-images/${brand}/alice-lifestyle/${String(index + 1).padStart(2, "0")}.jpg`,
    generated: false,
  })),
  ...Array.from({ length: 10 }, (_, index) => ({
    pool: "alice-crying",
    number: String(index + 1).padStart(2, "0"),
    url: `/pool-images/${brand}/alice-crying/${String(index + 1).padStart(2, "0")}.jpg`,
    generated: false,
  })),
];

async function api(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || `Request failed (${response.status})`);
    return json;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The image request took too long. Check the server before trying again.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value || "");
  return node.innerHTML;
}

function toast(message) {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  $("#toastStack").append(item);
  setTimeout(() => item.remove(), 3000);
}

function renderBank() {
  $("#bankCount").textContent = `${assets.length} Alice photo${assets.length === 1 ? "" : "s"}`;
  $("#alicePhotoCount").textContent = assets.length;
  $("#imageGrid").innerHTML = assets.map((asset, index) => `
    <button class="bank-image" data-asset="${index}" aria-label="Open Alice photo ${index + 1}">
      <img src="${asset.url}" alt="" loading="${index < 10 ? "eager" : "lazy"}">
      <span>Alice · ${asset.generated ? "new draft" : String(index + 1).padStart(2, "0")}</span>
    </button>`).join("");
  $$("[data-asset]", $("#imageGrid")).forEach((button) => button.addEventListener("click", () => openImage(Number(button.dataset.asset))));
}

function openImage(index, title = "Alice", description = "A reusable Alice photograph for a real moment in the campaign.") {
  const asset = assets[index];
  if (!asset) return;
  $("#lightboxImage").src = asset.url;
  $("#lightboxImage").alt = `${title} image`;
  $("#imageType").textContent = asset.generated ? "New generated draft" : "Alice reference";
  $("#imageTitle").textContent = title;
  $("#imageDescription").textContent = description;
  $("#imageModal").hidden = false;
}

function pickScene() {
  const current = $("#scenePrompt").value;
  const choices = scenes.filter((scene) => scene !== current);
  return choices[Math.floor(Math.random() * choices.length)] || scenes[0];
}

function finalPrompt() {
  const situation = $("#scenePrompt").value.trim();
  return `Create a new vertical phone photograph using the attached approved Alice identity references. Preserve the same recognizable woman: facial proportions, green-grey eyes, young-adult age, natural blonde hair, and realistic skin texture.

Scene: ${situation}

Alice is a capable full-time working woman who holds things together in public and only slowly notices how depleted she is. Keep her expression natural for the situation — she does not need to look sad, cry, or face the camera. Use believable phone-camera imperfection, practical available light, ordinary lived-in surroundings, and an authentic social-media photograph feeling. Portrait 2:3 composition with some calm negative space for editable carousel copy. No typography, watermark, logo, app screen, product phone, beauty-ad polish, glamour pose, melodrama, or change of identity.`;
}

function identityPrompt() {
  const name = $("#influencerName").value.trim() || "New influencer";
  const age = $("#influencerAge").value;
  const life = $("#influencerLife").value.trim();
  const tension = $("#influencerTension").value.trim();
  return `Create a candidate identity portrait for ${name}, a woman in her ${age}.

Her real life: ${life}
What she holds in: ${tension}

Create a believable candid vertical phone photograph that could become the first reference for a recurring social-media narrator. She is in an ordinary environment connected to her day, wearing normal contemporary clothes, with natural skin texture and a distinct but non-model-like face. The feeling should be specific, grounded, and quietly human — not a stock wellness image. Portrait 2:3, practical available light, imperfect framing, no typography, no watermark, no logo, no app screen, no glamour pose, no influencer luxury cues, and no beauty-ad retouching.`;
}

function syncAlicePrompt() {
  $("#finalPrompt").value = finalPrompt();
}

function syncIdentityPrompt() {
  $("#identityPrompt").value = identityPrompt();
}

function openVariation(lucky = false) {
  if (lucky) $("#scenePrompt").value = pickScene();
  syncAlicePrompt();
  $("#variationModal").hidden = false;
}

function openNewInfluencer() {
  syncIdentityPrompt();
  $("#newInfluencerModal").hidden = false;
}

async function generateAlice() {
  const button = $("#generateAlice");
  button.disabled = true;
  button.textContent = "Creating draft…";
  $("#aliceGenerationState").classList.add("show");
  try {
    const result = await api("/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand,
        personaSlug: "alice",
        prompt: $("#finalPrompt").value,
        references: aliceReferences,
      }),
    }, 140000);
    assets.unshift({ pool: result.pool, number: "new", url: result.url, generated: true });
    renderBank();
    $("#variationModal").hidden = true;
    openImage(0, "Alice — new draft", "Generated from four approved identity references. Review it before treating it as an approved Alice reference.");
    toast("New Alice draft saved to her photo bank");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Generate one draft";
    $("#aliceGenerationState").classList.remove("show");
  }
}

function addIdentityDraft({ name, url }) {
  const card = document.createElement("article");
  card.className = "cast-card";
  card.innerHTML = `
    <img src="${url}" alt="${escapeHtml(name)} identity draft">
    <div class="cast-copy">
      <span class="pill">draft · needs approval</span>
      <h3>${escapeHtml(name)}</h3>
      <p>First identity image created. Accept more reference angles before using this person throughout a campaign.</p>
      <button class="btn" type="button">Review draft</button>
    </div>`;
  card.querySelector("button").addEventListener("click", () => {
    $("#lightboxImage").src = url;
    $("#lightboxImage").alt = `${name} identity draft`;
    $("#imageType").textContent = "New influencer draft";
    $("#imageTitle").textContent = name;
    $("#imageDescription").textContent = "This is one candidate identity image, not yet an approved recurring character.";
    $("#imageModal").hidden = false;
  });
  $("#castGrid").insertBefore(card, $("#newInfluencerCard"));
}

async function generateIdentity() {
  syncIdentityPrompt();
  const button = $("#generateIdentity");
  const name = $("#influencerName").value.trim() || "New influencer";
  button.disabled = true;
  button.textContent = "Creating identity…";
  $("#identityGenerationState").classList.add("show");
  try {
    const result = await api("/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand,
        personaSlug: name,
        prompt: $("#identityPrompt").value,
        references: [],
      }),
    }, 140000);
    addIdentityDraft({ name, url: result.url });
    $("#newInfluencerModal").hidden = true;
    toast(`${name} identity draft saved for review`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Create identity draft";
    $("#identityGenerationState").classList.remove("show");
  }
}

async function loadGenerated() {
  try {
    const data = await api(`/api/influencers?brand=${encodeURIComponent(brand)}`);
    const urls = Array.isArray(data.generated?.["alice-generated"]) ? data.generated["alice-generated"] : [];
    urls.reverse().forEach((url) => {
      if (!assets.some((asset) => asset.url === url)) assets.unshift({ pool: "alice-generated", number: "new", url, generated: true });
    });
    renderBank();
  } catch {
    renderBank();
  }
}

$("#mobileMenu").addEventListener("click", () => $("#side").classList.toggle("open"));
$("#createVariation").addEventListener("click", () => openVariation(false));
$("#editAlice").addEventListener("click", () => openVariation(false));
$("#feelingLucky").addEventListener("click", () => openVariation(true));
$("#bankLucky").addEventListener("click", () => openVariation(true));
$("#surpriseAgain").addEventListener("click", () => {
  $("#scenePrompt").value = pickScene();
  syncAlicePrompt();
});
$("#scenePrompt").addEventListener("input", syncAlicePrompt);
$("#generateAlice").addEventListener("click", generateAlice);
$("#newInfluencer").addEventListener("click", openNewInfluencer);
$("#newInfluencerCard").addEventListener("click", openNewInfluencer);
["influencerName", "influencerAge", "influencerLife", "influencerTension"].forEach((id) => {
  $(`#${id}`).addEventListener("input", syncIdentityPrompt);
  $(`#${id}`).addEventListener("change", syncIdentityPrompt);
});
$("#surpriseIdentity").addEventListener("click", () => {
  const current = $("#influencerName").value;
  const choices = identityPresets.filter((item) => item.name !== current);
  const preset = choices[Math.floor(Math.random() * choices.length)] || identityPresets[0];
  $("#influencerName").value = preset.name;
  $("#influencerAge").value = preset.age;
  $("#influencerLife").value = preset.life;
  $("#influencerTension").value = preset.tension;
  syncIdentityPrompt();
});
$("#generateIdentity").addEventListener("click", generateIdentity);

$$("[data-close]").forEach((button) => button.addEventListener("click", () => {
  const modal = document.getElementById(button.dataset.close);
  if (modal) modal.hidden = true;
}));

$$(".modal").forEach((modal) => modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.hidden = true;
}));

$("#copyVariationPrompt").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#finalPrompt").value);
    toast("Alice prompt copied");
  } catch {
    $("#finalPrompt").select();
    toast("Prompt selected. Press Ctrl+C to copy it.");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") $$(".modal").forEach((modal) => { modal.hidden = true; });
});

syncAlicePrompt();
syncIdentityPrompt();
loadGenerated();

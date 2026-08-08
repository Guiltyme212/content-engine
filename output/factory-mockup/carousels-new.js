const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  brand: new URLSearchParams(location.search).get("brand") || "kokoro",
  brands: [],
  posts: [],
  picks: { posts: {} },
  post: null,
  decks: [],
  slides: {},
  postIndex: 0,
  slideIndex: 0,
  mode: "review",
  filter: "all",
  assetTab: "suggested",
  aspect: "9:16",
  themeSets: null,
  saveTimer: null,
  decisionLocked: false,
};

async function api(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || `Request failed (${response.status})`);
    return json;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The request took too long. Try again.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toast(message) {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  $("#toastStack").append(item);
  setTimeout(() => item.remove(), 2600);
}

function isApproved(id) {
  return Boolean(state.picks.posts?.[id]?.done);
}

function approvedCount() {
  return state.posts.filter((post) => isApproved(post.id)).length;
}

function currentDeck() {
  return state.decks[state.slideIndex];
}

function currentSlideState() {
  return state.slides[currentDeck()?.n];
}

function currentCandidate() {
  const deck = currentDeck();
  const slideState = currentSlideState();
  return deck && slideState ? deck.candidates[slideState.candidate] : null;
}

function defaultText(deck) {
  return {
    t: deck.text,
    x: 50,
    y: deck.role === "hook" ? 34 : 42,
    fs: deck.role === "hook" ? 22 : 19,
    fw: 700,
    sw: 0.15,
    width: 88,
    font: "TikTok Sans",
    color: "#ffffff",
    sc: "#000000",
    bg: "none",
    bgColor: "#ffffff",
  };
}

function setTextContent(inner, value) {
  if (inner) inner.textContent = value || "";
}

function applyTextStyle(element, inner, text, surface) {
  if (!element || !text) return;
  const referenceWidth = 326;
  const surfaceWidth = surface?.getBoundingClientRect().width || referenceWidth;
  const scale = Math.max(0.62, Math.min(1.45, surfaceWidth / referenceWidth));
  element.style.left = `${text.x}%`;
  element.style.top = `${text.y}%`;
  element.style.width = `${text.width ?? 88}%`;
  element.style.fontFamily = `"${text.font || "TikTok Sans"}", sans-serif`;
  element.style.fontWeight = String(text.fw ?? 700);
  element.style.fontVariationSettings = `"opsz" 36, "wght" ${text.fw ?? 700}`;
  element.style.fontSize = `${(Number(text.fs || 19) * scale).toFixed(2)}px`;
  element.style.color = text.color || "#ffffff";
  element.style.webkitTextStroke = `${Number(text.sw ?? 0.15)}em ${text.sc || "#000000"}`;
  if (inner) {
    inner.style.backgroundColor = text.bg === "white" ? (text.bgColor || "#ffffff") : text.bg === "black" ? "#111111" : "transparent";
  }
}

function applyAspect() {
  $("#postStack").dataset.aspect = state.aspect;
  $("#editorCanvas").dataset.aspect = state.aspect;
  $("#aspectValue").textContent = state.aspect;
  $$("button[data-aspect]").forEach((button) => button.classList.toggle("active", button.dataset.aspect === state.aspect));
}

function setLoading() {
  $("#postList").innerHTML = Array.from({ length: 8 }, () => `
    <div class="post-row">
      <span class="post-number skeleton">00</span>
      <span class="post-name"><strong class="skeleton">Loading post</strong><span class="skeleton">campaign item</span></span>
    </div>`).join("");
  $("#reviewImage").removeAttribute("src");
  $("#reviewCard").classList.add("skeleton");
  setTextContent($("#reviewTextInner"), "");
}

function renderBrands() {
  const select = $("#brandSelect");
  select.innerHTML = "";
  state.brands.forEach((brand) => {
    const option = document.createElement("option");
    option.value = brand.key;
    option.textContent = `${brand.name}${brand.status === "draft" ? " (draft)" : ""}`;
    option.disabled = !brand.hasCampaign;
    option.selected = brand.key === state.brand;
    select.append(option);
  });
  const active = state.brands.find((brand) => brand.key === state.brand);
  if (active) {
    $("#sideBrandName").textContent = active.name;
    const fallback = active.name.slice(0, 1).toUpperCase();
    const logo = active.logo || "";
    [
      ["#sideBrandAvatar", "#sideBrandLogo", "#sideBrandFallback"],
      ["#topBrandAvatar", "#topBrandLogo", "#topBrandFallback"],
    ].forEach(([avatarSelector, logoSelector, fallbackSelector]) => {
      const avatar = $(avatarSelector);
      const image = $(logoSelector);
      $(fallbackSelector).textContent = fallback;
      avatar.classList.toggle("has-logo", Boolean(logo));
      if (logo) {
        image.src = logo;
        image.alt = `${active.name} logo`;
      } else {
        image.removeAttribute("src");
        image.alt = "";
      }
    });
  }
}

function renderProgress() {
  const done = approvedCount();
  $("#approvedCount").textContent = done;
  $("#campaignCount").textContent = state.posts.length;
  $("#queueBadge").textContent = state.posts.length;
  $("#progressBar").style.width = `${state.posts.length ? (done / state.posts.length) * 100 : 0}%`;
}

function filteredPosts() {
  if (state.filter === "approved") return state.posts.filter((post) => isApproved(post.id));
  if (state.filter === "open") return state.posts.filter((post) => !isApproved(post.id));
  return state.posts;
}

function renderQueue() {
  const list = $("#postList");
  const posts = filteredPosts();
  list.innerHTML = "";
  if (!posts.length) {
    list.innerHTML = `<div class="empty-state"><div><h2>No posts here</h2><p>Change the filter to see the rest of the campaign.</p></div></div>`;
    return;
  }
  posts.forEach((post) => {
    const button = document.createElement("button");
    button.className = `post-row${post.id === state.post?.id ? " active" : ""}${isApproved(post.id) ? " done" : ""}`;
    button.innerHTML = `
      <span class="post-number">${String(post.id).padStart(2, "0")}</span>
      <span class="post-name"><strong>${escapeHtml(post.topic)}</strong><span>${escapeHtml(post.slides[0]?.text || "")}</span></span>
      <span class="post-state">${isApproved(post.id) ? "✓" : ""}</span>`;
    button.addEventListener("click", () => openPost(post.id));
    list.append(button);
  });
}

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = value == null ? "" : String(value);
  return span.innerHTML;
}

async function boot() {
  setLoading();
  try {
    const [brandData, campaignData, pickData] = await Promise.all([
      api("/api/brands"),
      api(`/api/campaign?brand=${encodeURIComponent(state.brand)}`),
      api(`/api/picks?brand=${encodeURIComponent(state.brand)}`),
    ]);
    state.brands = Array.isArray(brandData.brands) ? brandData.brands : [];
    state.posts = Array.isArray(campaignData.campaign?.posts) ? campaignData.campaign.posts : [];
    state.picks = pickData.picks?.posts ? pickData.picks : { posts: {} };
    renderBrands();
    renderProgress();
    $("#campaignTitle").textContent = `The month · ${state.brands.find((brand) => brand.key === state.brand)?.name || state.brand}`;
    if (!state.posts.length) throw new Error("This campaign has no posts yet.");
    const next = state.posts.find((post) => !isApproved(post.id)) || state.posts[0];
    await openPost(next.id);
  } catch (error) {
    showFatal(error.message);
  }
}

function showFatal(message) {
  $("#workspace").innerHTML = `
    <div class="error-state panel"><div><h2>Campaign could not load</h2><p>${escapeHtml(message)}</p><button class="btn primary" id="retryBoot">Try again</button></div></div>`;
  $("#retryBoot")?.addEventListener("click", () => location.reload());
}

async function openPost(id) {
  const nextPost = state.posts.find((post) => post.id === id);
  if (!nextPost) return;
  state.post = nextPost;
  state.postIndex = state.posts.findIndex((post) => post.id === id);
  state.slideIndex = 0;
  state.mode = "review";
  $("#campaignPage").classList.remove("queue-open");
  $("#queueToggle").setAttribute("aria-expanded", "false");
  showMode("review");
  renderQueue();
  $("#reviewCard").classList.add("skeleton");
  setTextContent($("#reviewTextInner"), "");
  try {
    const result = await api("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: state.brand, postId: id }),
    });
    state.decks = Array.isArray(result.slides) ? result.slides : [];
    state.slides = {};
    const saved = state.picks.posts?.[id]?.slides || {};
    state.aspect = state.picks.posts?.[id]?.aspect || "9:16";
    state.decks.forEach((deck) => {
      const prior = saved[deck.n];
      let candidate = prior ? deck.candidates.findIndex((item) => item.file === prior.file) : 0;
      if (candidate < 0 && prior?.url) {
        deck.candidates.unshift({ file: prior.file, url: prior.url, restored: true });
        candidate = 0;
      }
      state.slides[deck.n] = {
        candidate: Math.max(0, candidate),
        text: Array.isArray(prior?.texts) && prior.texts.length ? { ...defaultText(deck), ...prior.texts[0] } : defaultText(deck),
      };
    });
    $("#reviewCard").classList.remove("skeleton");
    renderEverything();
  } catch (error) {
    $("#reviewCard").classList.remove("skeleton");
    setTextContent($("#reviewTextInner"), "This post could not be matched.");
    $("#slideWhy").textContent = error.message;
  }
}

function renderEverything() {
  renderQueue();
  renderProgress();
  renderReview();
  renderInspector();
  if (state.mode === "edit") renderEditor();
}

function renderReview() {
  if (!state.decks.length) return;
  const deck = currentDeck();
  const slideState = currentSlideState();
  const candidate = currentCandidate();
  $("#reviewImage").src = candidate?.url || "";
  $("#reviewImage").alt = `${state.post.topic}, slide ${state.slideIndex + 1}`;
  setTextContent($("#reviewTextInner"), slideState.text.t);
  applyAspect();
  requestAnimationFrame(() => applyTextStyle($("#reviewText"), $("#reviewTextInner"), slideState.text, $("#reviewCard")));
  $("#reviewLabel").textContent = `Slide ${state.slideIndex + 1} of ${state.decks.length} · ${deck.role}`;
  const dots = $("#reviewDots");
  dots.innerHTML = "";
  state.decks.forEach((_, index) => {
    const button = document.createElement("button");
    button.className = index === state.slideIndex ? "active" : "";
    button.setAttribute("aria-label", `Go to slide ${index + 1}`);
    button.addEventListener("click", () => {
      state.slideIndex = index;
      renderEverything();
    });
    dots.append(button);
  });
  renderPeekCards();
}

function postCoverUrl(post) {
  const saved = state.picks.posts?.[post?.id]?.slides;
  const first = saved ? saved[Object.keys(saved).sort((a, b) => Number(a) - Number(b))[0]] : null;
  if (first?.url) return first.url;
  const number = String(((Number(post?.id) || 1) - 1) % 10 + 1).padStart(2, "0");
  return `/pool-images/${state.brand}/alice-lifestyle/${number}.jpg`;
}

function renderPeekCards() {
  if (!state.post) return;
  const after = [...state.posts.slice(state.postIndex + 1), ...state.posts.slice(0, state.postIndex)];
  $("#peekImageNear").src = postCoverUrl(after[0] || state.post);
  $("#peekImageFar").src = postCoverUrl(after[1] || after[0] || state.post);
}

function renderInspector() {
  if (!state.post || !state.decks.length) return;
  const deck = currentDeck();
  const candidate = currentCandidate();
  $("#postStatus").textContent = isApproved(state.post.id) ? "Approved" : "Ready to review";
  $("#postStatus").className = `eyebrow${isApproved(state.post.id) ? " good" : ""}`;
  $("#postTitle").textContent = state.post.topic;
  $("#postSubtitle").textContent = `Post ${state.post.id} of ${state.posts.length} · ${state.decks.length} slides`;
  $("#slideWhy").textContent = candidate?.why || (deck.source?.startsWith("pool:") ? `Chosen from ${deck.source.slice(5).replaceAll("-", " ")}.` : "Matched from the image library by meaning.");
  $("#postCaption").textContent = state.post.caption || "No caption yet.";
  $("#postSong").textContent = state.post.song || "Choose a sound when posting.";
  $("#postTags").innerHTML = (state.post.hashtags || []).map((tag) => `<span class="pill">#${escapeHtml(tag)}</span>`).join("");
  $("#footerApprove").textContent = isApproved(state.post.id) ? "Approved ✓" : "Approve post";
}

function moveSlide(direction) {
  if (!state.decks.length) return;
  state.slideIndex = (state.slideIndex + direction + state.decks.length) % state.decks.length;
  renderEverything();
}

function nextPost(skipApproved = false) {
  const ordered = [...state.posts.slice(state.postIndex + 1), ...state.posts.slice(0, state.postIndex + 1)];
  return ordered.find((post) => !skipApproved || !isApproved(post.id));
}

async function savePost(done = isApproved(state.post.id)) {
  const slides = {};
  state.decks.forEach((deck) => {
    const slideState = state.slides[deck.n];
    const candidate = deck.candidates[slideState.candidate];
    if (!candidate) return;
    slides[deck.n] = {
      file: candidate.file,
      url: candidate.url,
      texts: [{ ...slideState.text }],
    };
  });
  const entry = { done, aspect: state.aspect, slides, updatedAt: new Date().toISOString() };
  state.picks.posts[state.post.id] = entry;
  renderProgress();
  renderQueue();
  await api("/api/picks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brand: state.brand, postId: state.post.id, done, aspect: state.aspect, slides }),
  });
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    savePost().catch(() => toast("Edits are visible here, but the server did not save them."));
  }, 500);
}

async function approveCurrent() {
  if (!state.post) return;
  try {
    await savePost(true);
    toast(`Post ${state.post.id} approved`);
    const next = nextPost(true);
    if (next && next.id !== state.post.id) await openPost(next.id);
    else renderEverything();
  } catch (error) {
    toast(error.message);
  }
}

function passCurrent() {
  const next = nextPost(false);
  if (next) openPost(next.id);
}

function showMode(mode) {
  state.mode = mode;
  const editing = mode === "edit";
  $("#reviewStage").hidden = editing;
  $("#editorStage").hidden = !editing;
  $("#reviewInspector").hidden = editing;
  $("#editInspector").hidden = !editing;
  $("#backToReview").hidden = !editing;
  $("#doneEditing").hidden = !editing;
  $("#footerApprove").hidden = editing;
  $("#crumb").textContent = editing ? "/ edit post" : "/ monthly campaign";
  $("#inspector").classList.toggle("open", editing);
}

function enterEdit() {
  if (!state.decks.length) return;
  showMode("edit");
  renderEditor();
}

function exitEdit() {
  showMode("review");
  renderEverything();
}

function renderEditor() {
  const deck = currentDeck();
  const slideState = currentSlideState();
  const candidate = currentCandidate();
  $("#editorImage").src = candidate?.url || "";
  $("#editorImage").alt = `${state.post.topic}, slide ${state.slideIndex + 1}`;
  setTextContent($("#editorTextInner"), slideState.text.t);
  applyAspect();
  requestAnimationFrame(() => applyTextStyle($("#editorText"), $("#editorTextInner"), slideState.text, $("#editorCanvas")));
  $("#copyField").value = slideState.text.t;
  $("#textSize").value = slideState.text.fs;
  $("#textSizeValue").textContent = `${slideState.text.fs}px`;
  $("#fontFamily").value = slideState.text.font || "TikTok Sans";
  $("#textWeight").value = slideState.text.fw;
  $("#textWeightValue").textContent = slideState.text.fw;
  $("#textColor").value = slideState.text.color;
  $("#textColorValue").textContent = slideState.text.color;
  $("#textColorHex").textContent = slideState.text.color;
  $("#textStroke").value = slideState.text.sw;
  $("#strokeValue").textContent = `${Math.round(slideState.text.sw * slideState.text.fs)}px`;
  $("#strokeColor").value = slideState.text.sc;
  $("#strokeColorValue").textContent = slideState.text.sc;
  $("#strokeColorHex").textContent = slideState.text.sc;
  $$("[data-bg]").forEach((button) => button.classList.toggle("active", button.dataset.bg === slideState.text.bg));
  $("#editPostTitle").textContent = state.post.topic;
  $("#editSlideLabel").textContent = `Slide ${state.slideIndex + 1} of ${state.decks.length} · ${deck.role}`;

  const rail = $("#slideRail");
  rail.innerHTML = "";
  state.decks.forEach((item, index) => {
    const data = state.slides[item.n];
    const image = item.candidates[data.candidate];
    const button = document.createElement("button");
    button.className = `rail-slide${index === state.slideIndex ? " active" : ""}`;
    button.innerHTML = `<img src="${image?.url || ""}" alt=""><span>${index + 1}</span>`;
    button.addEventListener("click", () => {
      state.slideIndex = index;
      state.assetTab = "suggested";
      renderEverything();
    });
    rail.append(button);
  });
  renderAssetPanel();
}

function setAssetTab(tab) {
  state.assetTab = tab;
  $$(".asset-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.assets === tab));
  renderAssetPanel();
}

function renderAssetPanel() {
  const panel = $("#assetPanel");
  const deck = currentDeck();
  const slideState = currentSlideState();
  $("#assetSource").textContent = state.assetTab[0].toUpperCase() + state.assetTab.slice(1);
  if (state.assetTab === "suggested") {
    panel.innerHTML = `<div class="asset-grid">${deck.candidates.map((item, index) => `
      <button class="asset${index === slideState.candidate ? " active" : ""}" data-candidate="${index}">
        <img src="${item.url}" alt="Suggested image ${index + 1}">
        ${item.url?.startsWith("/library-images/") ? `<span class="asset-delete" data-delete="${index}" role="button" tabindex="0" title="Delete from the whole library" aria-label="Delete this image from the whole library">×</span>` : ""}
      </button>`).join("")}</div>`;
    $$("[data-candidate]", panel).forEach((button) => button.addEventListener("click", (event) => {
      if (event.target.closest("[data-delete]")) return;
      slideState.candidate = Number(button.dataset.candidate);
      renderEverything();
      scheduleSave();
    }));
    $$("[data-delete]", panel).forEach((badge) => badge.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteLibraryImage(Number(badge.dataset.delete));
    }));
    return;
  }

  if (state.assetTab === "uploads") {
    panel.innerHTML = `
      <div class="asset-note">Your uploaded media. Images tagged to a slide on the <a href="./media.html?brand=${encodeURIComponent(state.brand)}">Brand media page</a> lead that slide automatically — this list lets you place any upload anywhere.</div>
      <div class="asset-grid" id="uploadsGrid" style="margin-top:8px"></div>
      <div class="asset-note" id="uploadsEmpty" hidden>No uploads yet. Add product shots or before/afters on the <a href="./media.html?brand=${encodeURIComponent(state.brand)}">Brand media page</a>.</div>`;
    renderUploadsGrid(panel);
    return;
  }

  if (state.assetTab === "alice") {
    const aliceAssets = ["alice-lifestyle", "alice-crying"].flatMap((pool) => Array.from({ length: 10 }, (_, index) => ({
      pool,
      number: String(index + 1).padStart(2, "0"),
    })));
    panel.innerHTML = `<div class="asset-note" style="margin-bottom:8px">One Alice bank. Pick the moment that fits this line — no forced cover/emotional category.</div>
      <div class="asset-grid">${aliceAssets.map((item, index) =>
        `<button class="asset" data-alice="${item.pool}/${item.number}"><img src="/pool-images/${state.brand}/${item.pool}/${item.number}.jpg" alt="Alice option ${index + 1}"></button>`
      ).join("")}</div>`;
    $$("[data-alice]", panel).forEach((button) => button.addEventListener("click", () => {
      const [pool, number] = button.dataset.alice.split("/");
      const url = `/pool-images/${state.brand}/${pool}/${number}.jpg`;
      deck.candidates.unshift({ file: `${pool}/${number}.jpg`, url });
      slideState.candidate = 0;
      renderEverything();
      scheduleSave();
    }));
    return;
  }

  if (state.assetTab === "library") {
    panel.innerHTML = `
      <div class="asset-note">Choose a visual world, then the matcher selects images that still fit this slide's meaning.</div>
      <button class="btn" id="browseThemes" style="width:100%;margin-top:8px">Browse visual worlds</button>`;
    $("#browseThemes").addEventListener("click", openThemeModal);
    return;
  }

  panel.innerHTML = `
    <div class="asset-note">Prepare a textless portrait image from this slide's meaning. Alice identity references are attached only when the slide belongs to her.</div>
    <button class="btn primary" id="prepareGeneration" style="width:100%;margin-top:8px">Prepare image prompt</button>`;
  $("#prepareGeneration").addEventListener("click", openGenerateModal);
}

async function renderUploadsGrid(panel) {
  if (!state.mediaItems) {
    try {
      const data = await api(`/api/media?brand=${encodeURIComponent(state.brand)}`);
      state.mediaItems = Array.isArray(data.items) ? data.items : [];
    } catch (error) {
      toast(error.message);
      state.mediaItems = [];
    }
  }
  if (state.assetTab !== "uploads") return;               // the operator moved on mid-fetch
  const grid = $("#uploadsGrid", panel);
  const empty = $("#uploadsEmpty", panel);
  if (!grid) return;
  empty.hidden = state.mediaItems.length > 0;
  grid.innerHTML = state.mediaItems.map((item, index) => `
    <button class="asset" data-upload="${index}" title="${escapeHtml(item.label || "your upload")}">
      <img src="${item.url}" alt="${escapeHtml(item.label || `Upload ${index + 1}`)}">
      ${item.slides?.length ? `<span class="asset-slides">→ ${item.slides.join(", ")}</span>` : ""}
    </button>`).join("");
  $$("[data-upload]", grid).forEach((button) => button.addEventListener("click", () => {
    const item = state.mediaItems[Number(button.dataset.upload)];
    if (!item) return;
    const deck = currentDeck();
    deck.candidates.unshift({ file: `media/${item.file}`, url: item.url, uploaded: true });
    currentSlideState().candidate = 0;
    state.assetTab = "suggested";
    renderEverything();
    scheduleSave();
    toast("Your upload is now on this slide");
  }));
}

// Deleting is library-wide on purpose: an irrelevant scraped image should never be
// offered again — on any slide, for any brand. Pool/generated images are exempt.
async function deleteLibraryImage(index) {
  const deck = currentDeck();
  const target = deck.candidates[index];
  if (!target?.url?.startsWith("/library-images/")) return;
  if (!window.confirm("Delete this image from the whole library? It disappears from every slide and every brand.")) return;
  try {
    await api("/api/library/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: target.file }),
    });
    state.decks.forEach((item) => {
      const slideState = state.slides[item.n];
      const at = item.candidates.findIndex((candidate) => candidate.file === target.file && candidate.url === target.url);
      if (at === -1) return;
      item.candidates.splice(at, 1);
      if (slideState.candidate > at) slideState.candidate -= 1;
      slideState.candidate = Math.max(0, Math.min(slideState.candidate, Math.max(0, item.candidates.length - 1)));
    });
    state.themeSets = null;
    toast("Image deleted from the library");
    renderEverything();
    scheduleSave();
  } catch (error) {
    toast(error.message);
  }
}

async function openThemeModal() {
  $("#themeModal").hidden = false;
  const grid = $("#themeGrid");
  if (!state.themeSets) {
    grid.innerHTML = Array.from({ length: 9 }, () => `<div class="theme-card skeleton" style="height:126px"></div>`).join("");
    try {
      const data = await api("/api/image-library");
      state.themeSets = Array.isArray(data.sets) ? data.sets.filter((set) => Array.isArray(set.images)) : [];
    } catch (error) {
      grid.innerHTML = `<div class="error-state" style="grid-column:1/-1"><div><h2>Visual worlds could not load</h2><p>${escapeHtml(error.message)}</p><button class="btn" id="retryThemes">Try again</button></div></div>`;
      $("#retryThemes")?.addEventListener("click", () => {
        state.themeSets = null;
        openThemeModal();
      });
      return;
    }
  }
  if (!state.themeSets.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div><h2>No image sets yet</h2><p>Add a set to the library and it will appear here.</p></div></div>`;
    return;
  }
  grid.innerHTML = state.themeSets.map((set) => `
    <button class="theme-card" data-theme="${set.id}">
      <span class="theme-images">${set.images.slice(0, 3).map((image) => `<img src="${image.url}" alt="">`).join("")}</span>
      <strong>${escapeHtml(set.label)}</strong><span>${set.count} images</span>
    </button>`).join("");
  $$("[data-theme]", grid).forEach((button) => button.addEventListener("click", () => applyTheme(button.dataset.theme)));
}

async function applyTheme(theme) {
  const deck = currentDeck();
  $("#themeModal").hidden = true;
  toast("Matching this slide inside the selected visual world");
  try {
    const result = await api("/api/match/slide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: state.brand, text: deck.text, theme }),
    });
    if (!Array.isArray(result.candidates) || !result.candidates.length) throw new Error("No matching images were found in this set.");
    deck.candidates = result.candidates;
    state.slides[deck.n].candidate = 0;
    state.assetTab = "suggested";
    renderEverything();
    scheduleSave();
  } catch (error) {
    toast(error.message);
  }
}

function generationPrompt() {
  const deck = currentDeck();
  const alice = state.assetTab === "alice" || ["hook", "trust"].includes(deck.role);
  const subject = alice
    ? "Use the approved Alice reference identity. Preserve her face, age, blonde hair, eye color, and natural phone-photo realism. Put her in a specific ordinary environment that expresses this line without requiring her to cry, pose, or look at the camera."
    : "Do not include a recognizable person or face. Use an authentic everyday object, place, or detail that expresses the line indirectly.";
  return `Create a textless vertical social carousel background for this line: "${state.slides[deck.n].text.t}"\n\n${subject}\n\nPortrait 2:3 composition, natural phone-camera imperfection, believable light, no logos, no typography, no watermark, and enough calm space for editable text near ${state.slides[deck.n].text.y < 45 ? "the upper middle" : "the lower middle"}.`;
}

function openGenerateModal() {
  $("#generatePrompt").value = generationPrompt();
  $("#generateModal").hidden = false;
}

async function generateCarouselImage() {
  const button = $("#generateCarousel");
  const deck = currentDeck();
  const alice = state.assetTab === "alice" || ["hook", "trust"].includes(deck.role);
  const references = alice ? [
    `/pool-images/${state.brand}/alice-lifestyle/01.jpg`,
    `/pool-images/${state.brand}/alice-lifestyle/05.jpg`,
    `/pool-images/${state.brand}/alice-lifestyle/08.jpg`,
    `/pool-images/${state.brand}/alice-crying/03.jpg`,
  ] : [];
  button.disabled = true;
  button.textContent = "Creating draft…";
  $("#carouselGenerationState").classList.add("show");
  try {
    const result = await api("/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand: state.brand,
        personaSlug: alice ? "alice" : "carousel-background",
        prompt: $("#generatePrompt").value,
        references,
      }),
    }, 140000);
    deck.candidates.unshift({ file: `${result.pool}/${result.url.split("/").pop()}`, url: result.url, generated: true });
    currentSlideState().candidate = 0;
    state.assetTab = "suggested";
    $("#generateModal").hidden = true;
    renderEverything();
    scheduleSave();
    toast("New image draft added to this slide");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Generate one draft";
    $("#carouselGenerationState").classList.remove("show");
  }
}

function bindTextDrag() {
  const element = $("#editorText");
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  element.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-resize]")) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    element.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  element.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const canvas = $("#editorCanvas").getBoundingClientRect();
    const text = currentSlideState().text;
    text.x = Math.max(8, Math.min(92, text.x + ((event.clientX - lastX) / canvas.width) * 100));
    text.y = Math.max(8, Math.min(92, text.y + ((event.clientY - lastY) / canvas.height) * 100));
    lastX = event.clientX;
    lastY = event.clientY;
    applyTextStyle(element, $("#editorTextInner"), text, $("#editorCanvas"));
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    scheduleSave();
  };
  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
}

function bindTextResize() {
  $$("[data-resize]").forEach((handle) => {
    let resizing = false;
    let startX = 0;
    let startWidth = 0;
    let startCenter = 0;
    handle.addEventListener("pointerdown", (event) => {
      resizing = true;
      startX = event.clientX;
      startWidth = Number(currentSlideState().text.width || 88);
      startCenter = Number(currentSlideState().text.x || 50);
      handle.setPointerCapture(event.pointerId);
      event.stopPropagation();
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!resizing) return;
      const canvas = $("#editorCanvas").getBoundingClientRect();
      const direction = handle.dataset.resize === "right" ? 1 : -1;
      const delta = ((event.clientX - startX) / canvas.width) * 100;
      const width = Math.max(24, Math.min(96, startWidth + delta * direction * 2));
      const widthDelta = width - startWidth;
      const text = currentSlideState().text;
      text.width = width;
      text.x = Math.max(width / 2, Math.min(100 - width / 2, startCenter + (widthDelta / 2) * (handle.dataset.resize === "right" ? 1 : -1)));
      applyTextStyle($("#editorText"), $("#editorTextInner"), text, $("#editorCanvas"));
    });
    const release = () => {
      if (!resizing) return;
      resizing = false;
      scheduleSave();
    };
    handle.addEventListener("pointerup", release);
    handle.addEventListener("pointercancel", release);
  });
}

const SHARED_STYLE_PROPS = ["fs", "fw", "sw", "font", "color", "sc", "bg", "bgColor"];

function updateTextStyle(property, value) {
  if ($("#applyAllText").checked) {
    Object.values(state.slides).forEach((slide) => { slide.text[property] = value; });
  } else {
    currentSlideState().text[property] = value;
  }
  renderEditor();
  scheduleSave();
}

// Ticking the box is itself the action: the current slide's style is pushed to every
// slide right away — not only the properties touched afterwards. Text content and
// position stay per-slide (lines differ in length and placement).
function syncStyleToAllSlides() {
  const source = currentSlideState()?.text;
  if (!source) return;
  Object.values(state.slides).forEach((slide) => {
    SHARED_STYLE_PROPS.forEach((property) => { slide.text[property] = source[property]; });
  });
  renderEditor();
  scheduleSave();
  toast("This slide's text style now applies to every slide");
}

function resetReviewCard() {
  const card = $("#reviewCard");
  card.classList.remove("dragging");
  card.style.transform = "";
  card.style.opacity = "";
  $("#keepStamp").style.opacity = "0";
  $("#passStamp").style.opacity = "0";
}

function animateDecision(direction) {
  const card = $("#reviewCard");
  const dx = direction === "right" ? window.innerWidth : -window.innerWidth;
  card.classList.remove("dragging");
  card.style.transition = "transform 220ms ease, opacity 220ms ease";
  card.style.transform = `translateX(${dx}px) rotate(${direction === "right" ? 18 : -18}deg)`;
  card.style.opacity = "0";
  return new Promise((resolve) => setTimeout(resolve, 225));
}

function bindReviewSwipe() {
  const card = $("#reviewCard");
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  card.addEventListener("pointerdown", (event) => {
    if (state.mode !== "review" || state.decisionLocked || event.target.closest("button")) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    dx = 0;
    card.classList.add("dragging");
    card.setPointerCapture(event.pointerId);
  });
  card.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    dx = event.clientX - startX;
    const dy = (event.clientY - startY) * .12;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
    $("#keepStamp").style.opacity = String(Math.max(0, Math.min(1, dx / 105)));
    $("#passStamp").style.opacity = String(Math.max(0, Math.min(1, -dx / 105)));
  });
  const release = async () => {
    if (!dragging) return;
    dragging = false;
    if (Math.abs(dx) < 84) {
      resetReviewCard();
      return;
    }
    state.decisionLocked = true;
    const direction = dx > 0 ? "right" : "left";
    await animateDecision(direction);
    try {
      if (direction === "right") await approveCurrent();
      else passCurrent();
    } finally {
      state.decisionLocked = false;
      resetReviewCard();
      card.style.transition = "";
    }
  };
  card.addEventListener("pointerup", release);
  card.addEventListener("pointercancel", () => {
    dragging = false;
    resetReviewCard();
  });
}

$("#brandSelect").addEventListener("change", (event) => {
  const brand = event.target.value;
  if (brand === state.brand) return;
  location.href = `./carousels-new.html?brand=${encodeURIComponent(brand)}`;
});

$("#reviewPrev").addEventListener("click", () => moveSlide(-1));
$("#reviewNext").addEventListener("click", () => moveSlide(1));
$("#editPost").addEventListener("click", enterEdit);
$("#approvePost").addEventListener("click", approveCurrent);
$("#footerApprove").addEventListener("click", approveCurrent);
$("#passPost").addEventListener("click", passCurrent);
$("#backToReview").addEventListener("click", exitEdit);
$("#doneEditing").addEventListener("click", exitEdit);
$("#mobileMenu").addEventListener("click", () => $("#side").classList.toggle("open"));
$("#queueToggle").addEventListener("click", () => {
  const open = $("#campaignPage").classList.toggle("queue-open");
  $("#queueToggle").setAttribute("aria-expanded", String(open));
});
$("#queueScrim").addEventListener("click", () => {
  $("#campaignPage").classList.remove("queue-open");
  $("#queueToggle").setAttribute("aria-expanded", "false");
});

$$(".queue-filter button").forEach((button) => button.addEventListener("click", () => {
  state.filter = button.dataset.filter;
  $$(".queue-filter button").forEach((item) => item.classList.toggle("active", item === button));
  renderQueue();
}));

$$(".asset-tabs button").forEach((button) => button.addEventListener("click", () => setAssetTab(button.dataset.assets)));

$("#copyField").addEventListener("input", (event) => {
  currentSlideState().text.t = event.target.value;
  setTextContent($("#editorTextInner"), event.target.value);
  scheduleSave();
});

$("#textSize").addEventListener("input", (event) => {
  const size = Number(event.target.value);
  updateTextStyle("fs", size);
});

$("#applyAllText").addEventListener("change", (event) => {
  if (event.target.checked) syncStyleToAllSlides();
});
$("#fontFamily").addEventListener("change", (event) => updateTextStyle("font", event.target.value));
$("#textWeight").addEventListener("input", (event) => updateTextStyle("fw", Number(event.target.value)));
$("#textColor").addEventListener("input", (event) => updateTextStyle("color", event.target.value));
$("#textStroke").addEventListener("input", (event) => updateTextStyle("sw", Number(event.target.value)));
$("#strokeColor").addEventListener("input", (event) => updateTextStyle("sc", event.target.value));
$$("[data-bg]").forEach((button) => button.addEventListener("click", () => updateTextStyle("bg", button.dataset.bg)));
$$("button[data-aspect]").forEach((button) => button.addEventListener("click", () => {
  state.aspect = button.dataset.aspect;
  applyAspect();
  requestAnimationFrame(() => {
    applyTextStyle($("#editorText"), $("#editorTextInner"), currentSlideState().text, $("#editorCanvas"));
  });
  scheduleSave();
}));

$$("[data-position]").forEach((button) => button.addEventListener("click", () => {
  currentSlideState().text.y = Number(button.dataset.position);
  renderEverything();
  scheduleSave();
}));

$$("[data-close]").forEach((button) => button.addEventListener("click", () => {
  const modal = document.getElementById(button.dataset.close);
  if (modal) modal.hidden = true;
}));

$$(".modal").forEach((modal) => modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.hidden = true;
}));

$("#copyPrompt").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#generatePrompt").value);
    toast("Prompt copied");
  } catch {
    $("#generatePrompt").select();
    toast("Prompt selected. Press Ctrl+C to copy it.");
  }
});
$("#generateCarousel").addEventListener("click", generateCarouselImage);

// ── whole-script paste: hook, bodies, CTA in one box, one line per slide ──
$("#openScript").addEventListener("click", () => {
  if (!state.decks.length) return;
  $("#scriptText").value = state.decks.map((deck) => state.slides[deck.n].text.t).join("\n");
  $("#scriptHint").textContent = `This post has ${state.decks.length} slides — line 1 is the hook, the last line is the closer/CTA.`;
  $("#scriptModal").hidden = false;
  $("#scriptText").focus();
});
$("#applyScript").addEventListener("click", () => {
  const lines = $("#scriptText").value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) { toast("The script is empty"); return; }
  state.decks.forEach((deck, index) => {
    if (index >= lines.length) return;
    deck.text = lines[index];
    state.slides[deck.n].text.t = lines[index];
  });
  $("#scriptModal").hidden = true;
  renderEverything();
  scheduleSave();
  if (lines.length < state.decks.length) toast(`Applied to the first ${lines.length} slides — the rest kept their text`);
  else if (lines.length > state.decks.length) toast(`Applied — ${lines.length - state.decks.length} extra line${lines.length - state.decks.length > 1 ? "s" : ""} ignored`);
  else toast("Script applied to all slides");
});

document.addEventListener("keydown", (event) => {
  if (!$("#themeModal").hidden || !$("#generateModal").hidden || !$("#scriptModal").hidden) {
    if (event.key === "Escape") $$(".modal").forEach((modal) => { modal.hidden = true; });
    return;
  }
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
  if (state.mode === "review") {
    if (event.key === "ArrowUp") moveSlide(-1);
    if (event.key === "ArrowDown" || event.key === " ") moveSlide(1);
    if (event.key === "ArrowLeft") passCurrent();
    if (event.key === "ArrowRight") approveCurrent();
    if (event.key.toLowerCase() === "e") enterEdit();
  } else if (event.key === "Escape") {
    exitEdit();
  }
});

bindTextDrag();
bindTextResize();
bindReviewSwipe();
boot();

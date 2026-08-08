// account-switcher.js — the bottom-left workspace switcher, shared by every page.
// One tenant roster (/api/brands), one persisted choice (localStorage cf:brand), one way to
// switch: navigate to the same page with ?brand=<key>, which every workspace already reads.
// Self-contained on purpose (injects its own styles) so adding it to a page is one script tag.
(() => {
  const STORAGE_KEY = "cf:brand";
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("brand");
  if (fromUrl) {
    try { localStorage.setItem(STORAGE_KEY, fromUrl); } catch { /* private mode */ }
  }
  const current = fromUrl || (() => {
    try { return localStorage.getItem(STORAGE_KEY) || "kokoro"; } catch { return "kokoro"; }
  })();

  const style = document.createElement("style");
  style.textContent = `
    .cf-account{position:fixed;left:14px;bottom:14px;z-index:240;font-family:inherit}
    .cf-account-pill{display:flex;align-items:center;gap:9px;min-width:168px;max-width:230px;padding:8px 12px 8px 8px;
      border:1px solid rgba(23,23,21,.14);border-radius:14px;background:#fff;cursor:pointer;
      box-shadow:0 6px 20px rgba(23,23,21,.13);transition:box-shadow .15s,transform .15s;text-align:left}
    .cf-account-pill:hover{transform:translateY(-1px);box-shadow:0 9px 26px rgba(23,23,21,.17)}
    .cf-avatar{width:30px;height:30px;flex:0 0 30px;border-radius:9px;overflow:hidden;display:grid;place-items:center;
      background:#eceae4;font-size:13px;font-weight:800;color:#4d4a42}
    .cf-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .cf-account-pill .cf-copy{min-width:0;flex:1}
    .cf-account-pill .cf-copy b{display:block;font-size:12.5px;color:#171715;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cf-account-pill .cf-copy span{display:block;font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#8b887e;margin-top:1px}
    .cf-account-pill .cf-caret{color:#8b887e;font-size:10px;flex:0 0 auto;transition:transform .18s}
    .cf-account.open .cf-caret{transform:rotate(180deg)}
    .cf-account-menu{position:absolute;left:0;bottom:calc(100% + 8px);min-width:212px;padding:6px;border:1px solid rgba(23,23,21,.14);
      border-radius:14px;background:#fff;box-shadow:0 14px 38px rgba(23,23,21,.2);display:none}
    .cf-account.open .cf-account-menu{display:block}
    .cf-account-menu .cf-menu-label{padding:7px 10px 5px;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#8b887e}
    .cf-account-item{display:flex;align-items:center;gap:9px;width:100%;padding:7px 9px;border:0;border-radius:10px;background:transparent;
      cursor:pointer;text-align:left;font-family:inherit}
    .cf-account-item:hover{background:#f4f2ec}
    .cf-account-item b{display:block;font-size:12.5px;color:#171715}
    .cf-account-item span{display:block;font-size:10px;color:#8b887e;margin-top:1px}
    .cf-account-item .cf-check{margin-left:auto;color:#e2634d;font-weight:800}
    @media(max-width:760px){.cf-account{left:10px;bottom:10px}.cf-account-pill{min-width:0;max-width:190px}}
    /* the switcher replaces the static brand chip some sidebars carried */
    .side-footer .brand-mini{display:none}
  `;
  document.head.append(style);

  const root = document.createElement("div");
  root.className = "cf-account";
  root.innerHTML = `
    <button class="cf-account-pill" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Switch workspace">
      <span class="cf-avatar"></span>
      <span class="cf-copy"><b>Loading…</b><span>workspace</span></span>
      <span class="cf-caret" aria-hidden="true">▲</span>
    </button>
    <div class="cf-account-menu" role="menu" aria-label="Workspaces">
      <div class="cf-menu-label">Switch workspace</div>
      <div class="cf-menu-list"></div>
    </div>`;

  const avatar = (brand) => {
    const holder = document.createElement("span");
    holder.className = "cf-avatar";
    if (brand.logo) {
      const img = document.createElement("img");
      img.src = brand.logo;
      img.alt = "";
      img.onerror = () => { img.remove(); holder.textContent = brand.name.slice(0, 1).toUpperCase(); };
      holder.append(img);
    } else {
      holder.textContent = brand.name.slice(0, 1).toUpperCase();
    }
    return holder;
  };

  const switchTo = (key) => {
    try { localStorage.setItem(STORAGE_KEY, key); } catch { /* private mode */ }
    const next = new URLSearchParams(location.search);
    next.set("brand", key);
    location.href = `${location.pathname}?${next.toString()}${location.hash}`;
  };

  async function boot() {
    let brands = [];
    try {
      const response = await fetch("/api/brands");
      brands = (await response.json()).brands || [];
    } catch { return; /* no server, no switcher */ }
    if (!brands.length) return;
    const active = brands.find((brand) => brand.key === current) || brands[0];

    const pill = root.querySelector(".cf-account-pill");
    pill.querySelector(".cf-avatar").replaceWith(avatar(active));
    pill.querySelector(".cf-copy b").textContent = active.name;
    pill.addEventListener("click", () => {
      const open = root.classList.toggle("open");
      pill.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (event) => {
      if (!root.contains(event.target)) {
        root.classList.remove("open");
        pill.setAttribute("aria-expanded", "false");
      }
    });

    const list = root.querySelector(".cf-menu-list");
    brands.forEach((brand) => {
      const item = document.createElement("button");
      item.className = "cf-account-item";
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.append(avatar(brand));
      const copy = document.createElement("span");
      copy.innerHTML = `<b></b><span></span>`;
      copy.querySelector("b").textContent = brand.name;
      copy.querySelector("span").textContent = brand.status === "draft" ? "draft workspace" : (brand.hasCampaign ? "campaign ready" : "no campaign yet");
      item.append(copy);
      if (brand.key === active.key) {
        const check = document.createElement("span");
        check.className = "cf-check";
        check.textContent = "✓";
        item.append(check);
      }
      item.addEventListener("click", () => { if (brand.key !== active.key) switchTo(brand.key); });
      list.append(item);
    });

    document.body.append(root);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

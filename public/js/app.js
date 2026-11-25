/**
 * Shared frontend utilities for the University ERP Portal.
 * Provides HttpOnly cookie API client, GET caching with mutation invalidation,
 * lazy script/Chart.js loading, skeletons, and shared portal shell.
 */

window.ERP = (() => {
  let currentUserData = null;
  const responseCache = new Map();
  const inflightGets = new Map();
  const loadedScripts = new Map();

  function invalidateCache(prefix = "") {
    if (!prefix) {
      responseCache.clear();
      return;
    }
    for (const key of responseCache.keys()) {
      if (key.startsWith(prefix)) responseCache.delete(key);
    }
  }

  async function api(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    const res = await fetch(path, {
      ...options,
      method,
      headers,
      credentials: "same-origin",
    });
    const text = await res.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: text };
    }
    if (res.status === 401) {
      if (window.location.pathname !== "/") {
        window.location.href = "/";
      }
      throw new Error(payload.error || "Session expired. Please sign in again.");
    }
    if (!res.ok) {
      throw new Error(payload.error || `Request failed (${res.status})`);
    }
    if (method !== "GET") {
      invalidateCache();
    }
    return payload;
  }

  function withAbortSignal(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) {
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (val) => {
          signal.removeEventListener("abort", onAbort);
          resolve(val);
        },
        (err) => {
          signal.removeEventListener("abort", onAbort);
          reject(err);
        }
      );
    });
  }

  function cachedApi(path, { ttlMs = 30000, signal = null, force = false } = {}) {
    if (!force) {
      const hit = responseCache.get(path);
      if (hit && Date.now() - hit.ts < ttlMs) {
        return withAbortSignal(Promise.resolve(hit.data), signal);
      }
    }
    let reqPromise = inflightGets.get(path);
    if (!reqPromise) {
      reqPromise = api(path)
        .then((data) => {
          responseCache.set(path, { data, ts: Date.now() });
          return data;
        })
        .finally(() => {
          inflightGets.delete(path);
        });
      inflightGets.set(path, reqPromise);
    }
    return withAbortSignal(reqPromise, signal);
  }

  function loadScript(src) {
    if (loadedScripts.has(src)) return loadedScripts.get(src);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loadedScripts.delete(src);
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(script);
    });
    loadedScripts.set(src, promise);
    return promise;
  }

  function loadChartJs() {
    if (window.Chart) return Promise.resolve();
    return loadScript("https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js");
  }

  function loadProfileWidget() {
    if (window.renderProfileView) return Promise.resolve();
    return loadScript("/js/profile-widget.js");
  }

  function renderSkeleton(container, variant = "table") {
    if (!container) return;
    if (variant === "cards") {
      container.innerHTML = `
        <div class="row g-3 mb-4">
          ${Array.from({ length: 4 }, () => `<div class="col-6 col-md-3"><div class="skeleton-box skeleton-card"></div></div>`).join("")}
        </div>
        <div class="card panel-card p-4">
          <div class="skeleton-box skeleton-line sm mb-3"></div>
          <div class="skeleton-box" style="height: 220px;"></div>
        </div>`;
      return;
    }
    container.innerHTML = `
      <div class="card panel-card p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="skeleton-box skeleton-line" style="width: 180px; margin: 0;"></div>
          <div class="skeleton-box skeleton-line" style="width: 120px; margin: 0;"></div>
        </div>
        ${Array.from({ length: 5 }, () => `<div class="skeleton-box skeleton-line"></div>`).join("")}
      </div>`;
  }

  function createTabRunner(container, tabHandlers) {
    let activeController = null;
    let activeId = 0;

    return async function switchTab(tabId, { skeleton = "table" } = {}) {
      if (activeController) activeController.abort();
      activeController = new AbortController();
      const callId = ++activeId;
      const handler = tabHandlers[tabId];
      if (!handler) return;

      renderSkeleton(container, tabId === "overview" ? "cards" : skeleton);
      try {
        await handler(activeController.signal);
      } catch (err) {
        if (err?.name === "AbortError" || callId !== activeId) return;
        container.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message || "Failed to load section.")}</div>`;
      }
    };
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message, type = "success") {
    let container = document.getElementById("erp-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "erp-toast-container";
      container.className = "toast-container position-fixed bottom-0 end-0 p-3";
      container.style.zIndex = "1080";
      document.body.appendChild(container);
    }
    const bgClass =
      type === "danger"
        ? "text-bg-danger"
        : type === "warning"
        ? "text-bg-warning"
        : "text-bg-success";
    const toastEl = document.createElement("div");
    toastEl.className = `toast align-items-center ${bgClass} border-0`;
    toastEl.setAttribute("role", "alert");
    toastEl.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>`;
    container.appendChild(toastEl);
    const toast = new bootstrap.Toast(toastEl, { delay: 3500 });
    toast.show();
    toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
  }

  async function requireAuth(expectedRole) {
    try {
      const me = await api("/api/me");
      currentUserData = me;
      const role = me.profile.role;
      if (expectedRole && role !== expectedRole) {
        window.location.href = `/${role}.html`;
        return null;
      }
      return me;
    } catch {
      window.location.href = "/";
      return null;
    }
  }

  function tabStorageKey() {
    return `erp_tab_${window.location.pathname || "/"}`;
  }

  function getInitialTab(navItems) {
    const hashTab = window.location.hash.replace(/^#/, "");
    if (hashTab && navItems.some((n) => n.id === hashTab)) return hashTab;
    try {
      const saved = sessionStorage.getItem(tabStorageKey());
      if (saved && navItems.some((n) => n.id === saved)) return saved;
    } catch {
      // Ignore storage errors
    }
    return navItems[0]?.id || "overview";
  }

  async function logout() {
    invalidateCache();
    try {
      sessionStorage.removeItem(tabStorageKey());
    } catch {
      // Ignore storage errors
    }
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      window.location.href = "/";
    }
  }

  function renderShell({ title, roleLabel, navItems, onTabChange, user, initialTab }) {
    const sidebarNav = document.getElementById("sidebar-nav");
    const userBadge = document.getElementById("topbar-user");
    const pageTitle = document.getElementById("topbar-title");
    const roleBadge = document.getElementById("sidebar-role-badge");
    const activeTab = initialTab || getInitialTab(navItems);
    const activeItem = navItems.find((n) => n.id === activeTab);

    try {
      sessionStorage.setItem(tabStorageKey(), activeTab);
    } catch {
      // Ignore storage errors
    }
    if (window.location.hash !== `#${activeTab}`) {
      history.replaceState(null, "", `#${activeTab}`);
    }

    if (roleBadge) roleBadge.textContent = roleLabel;
    if (pageTitle) pageTitle.textContent = activeItem?.label || title;
    if (userBadge && user?.profile) {
      const fullName =
        `${user.profile.first_name || ""} ${user.profile.last_name || ""}`.trim() ||
        user.profile.username ||
        user.profile.email;
      userBadge.textContent = fullName;
    }

    const setActiveVisual = (tabId) => {
      if (!sidebarNav) return;
      sidebarNav.querySelectorAll(".nav-link").forEach((l) => {
        l.classList.toggle("active", l.getAttribute("data-tab") === tabId);
      });
      const item = navItems.find((n) => n.id === tabId);
      if (pageTitle && item) pageTitle.textContent = item.label;
      try {
        sessionStorage.setItem(tabStorageKey(), tabId);
      } catch {
        // Ignore storage errors
      }
    };

    if (sidebarNav) {
      sidebarNav.innerHTML = navItems
        .map(
          (item) => `
          <a href="#${escapeHtml(item.id)}" class="nav-link ${item.id === activeTab ? "active" : ""}" data-tab="${escapeHtml(item.id)}">
            <i class="bi ${escapeHtml(item.icon)}"></i>
            <span>${escapeHtml(item.label)}</span>
          </a>`
        )
        .join("");

      sidebarNav.querySelectorAll(".nav-link").forEach((link) => {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          const tabId = link.getAttribute("data-tab");
          setActiveVisual(tabId);
          if (window.location.hash !== `#${tabId}`) {
            history.pushState(null, "", `#${tabId}`);
          }
          closeMobileSidebar();
          onTabChange(tabId);
        });
      });

      window.addEventListener("hashchange", () => {
        const nextTab = window.location.hash.replace(/^#/, "");
        if (!nextTab || !navItems.some((n) => n.id === nextTab)) return;
        setActiveVisual(nextTab);
        onTabChange(nextTab);
      });
    }

    const toggleBtn = document.getElementById("sidebar-toggle");
    const backdrop = document.getElementById("erp-backdrop");
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        document.getElementById("erp-sidebar")?.classList.toggle("show");
        backdrop?.classList.toggle("show");
      };
    }
    if (backdrop) {
      backdrop.onclick = closeMobileSidebar;
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.onclick = logout;

    const notifBtn = document.querySelector('[aria-label="Notifications"]');
    if (notifBtn) {
      notifBtn.addEventListener("click", () => loadNotifications(true));
    }

    // Defer initial notifications fetch so overview data & charts load first
    const schedule = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));
    schedule(() => loadNotifications(false));
  }

  function closeMobileSidebar() {
    document.getElementById("erp-sidebar")?.classList.remove("show");
    document.getElementById("erp-backdrop")?.classList.remove("show");
  }

  async function loadNotifications(force = false) {
    const listEl = document.getElementById("notif-list");
    const countEl = document.getElementById("notif-count");
    if (!listEl || !countEl) return;
    try {
      const items = await cachedApi("/api/notifications", { ttlMs: 20000, force });
      const unread = items.filter((n) => !n.is_read).length;
      countEl.textContent = unread > 0 ? unread : "";
      countEl.style.display = unread > 0 ? "inline-block" : "none";

      if (items.length === 0) {
        listEl.innerHTML = `<div class="p-3 text-muted small text-center">No notifications</div>`;
        return;
      }
      listEl.innerHTML = items
        .slice(0, 15)
        .map(
          (n) => `
          <div class="dropdown-item py-2 border-bottom text-wrap ${n.is_read ? "opacity-75" : "fw-semibold"}"
               style="cursor:pointer" data-notif-id="${n.id}">
            <div class="small">${escapeHtml(n.title)}</div>
            <div class="small text-muted">${escapeHtml(n.message)}</div>
          </div>`
        )
        .join("");

      listEl.querySelectorAll("[data-notif-id]").forEach((el) => {
        el.addEventListener("click", async () => {
          const id = el.getAttribute("data-notif-id");
          await api(`/api/notifications/${id}/read`, { method: "PATCH" });
          loadNotifications(true);
        });
      });
    } catch {
      // Ignore notification fetch failures silently
    }
  }

  function paginate(items, page = 1, pageSize = 25) {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    return {
      rows: items.slice(start, start + pageSize),
      page: safePage,
      totalPages,
      total,
    };
  }

  function pageSizeOptions(selected = 25, sizes = [10, 25, 50, 100]) {
    return sizes
      .map((n) => `<option value="${n}" ${Number(selected) === n ? "selected" : ""}>${n} / page</option>`)
      .join("");
  }

  function sortRows(rows, getVal, dir = "asc") {
    if (!getVal || !dir) return rows;
    const mult = dir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      const emptyA = va === null || va === undefined || va === "";
      const emptyB = vb === null || vb === undefined || vb === "";
      if (emptyA && emptyB) return 0;
      if (emptyA) return 1;
      if (emptyB) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult;
      const na = Number(va);
      const nb = Number(vb);
      if (
        typeof va !== "boolean" &&
        typeof vb !== "boolean" &&
        !Number.isNaN(na) &&
        !Number.isNaN(nb) &&
        String(va).trim() !== "" &&
        String(vb).trim() !== ""
      ) {
        return (na - nb) * mult;
      }
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" }) * mult;
    });
  }

  function renderDataTable(container, {
    title,
    headerMetaHtml = "",
    addLabel,
    onAdd,
    exportFn,
    columns,
    rows,
    filters = [],
    onAction,
    searchPlaceholder = "Search...",
    defaultPageSize = 25,
    pageSizes = [10, 25, 50, 100, 250],
    defaultSort = null,
    emptyMessage = "No records found",
    cardClass = "card panel-card p-3 p-md-4",
  }) {
    if (!container) return;
    let query = "";
    let page = 1;
    let pageSize = defaultPageSize;
    const filterState = {};
    let sortCol = defaultSort?.col ?? -1;
    let sortDir = defaultSort?.dir ?? "";

    const resolvedFilters = filters.map((f) => {
      const opts = f.options
        ? f.options
        : sortRows(
            [...new Set(rows.map((r) => f.getValue(r)).filter((v) => v !== null && v !== undefined && String(v).trim() !== ""))].map(String),
            (x) => x,
            "asc"
          );
      return { ...f, options: opts };
    });

    const sortableCols = columns
      .map((c, idx) => ({ col: c, idx }))
      .filter(({ col }) => typeof col.sortValue === "function");

    container.innerHTML = `
      <div class="${cardClass}">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h5 class="fw-bold mb-0">${escapeHtml(title)}</h5>
            ${headerMetaHtml ? `<div class="mt-1">${headerMetaHtml}</div>` : ""}
          </div>
          <div class="d-flex flex-wrap align-items-center gap-2">
            <input type="search" data-dt="search" class="form-control form-control-sm" style="width: 210px;" placeholder="${escapeHtml(searchPlaceholder)}">
            ${exportFn ? `<button type="button" data-dt="export" class="btn btn-outline-success btn-sm"><i class="bi bi-download me-1"></i>CSV</button>` : ""}
            ${addLabel ? `<button type="button" data-dt="add" class="btn btn-primary btn-sm"><i class="bi bi-plus-lg me-1"></i>${escapeHtml(addLabel)}</button>` : ""}
          </div>
        </div>
        ${(resolvedFilters.length > 0 || sortableCols.length > 0) ? `
          <div class="d-flex flex-wrap align-items-center gap-2 mb-3 pb-2 border-bottom">
            ${resolvedFilters.map((f) => `
              <select class="form-select form-select-sm" style="width: auto; max-width: 200px;" data-dt-filter="${escapeHtml(f.id)}" aria-label="Filter by ${escapeHtml(f.label)}">
                <option value="">All ${escapeHtml(f.label)}</option>
                ${f.options.map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join("")}
              </select>`).join("")}
            ${sortableCols.length > 0 ? `
              <select class="form-select form-select-sm" style="width: auto; max-width: 220px;" data-dt="sort-select" aria-label="Sort by">
                <option value="">Sort: Default Order</option>
                ${sortableCols.map(({ col, idx }) => `
                  <option value="${idx}:asc" ${sortCol === idx && sortDir === "asc" ? "selected" : ""}>Sort: ${escapeHtml(col.label)} (Asc)</option>
                  <option value="${idx}:desc" ${sortCol === idx && sortDir === "desc" ? "selected" : ""}>Sort: ${escapeHtml(col.label)} (Desc)</option>
                `).join("")}
              </select>` : ""}
            <button type="button" data-dt="reset" class="btn btn-outline-secondary btn-sm d-none">
              <i class="bi bi-arrow-counterclockwise me-1"></i>Reset
            </button>
          </div>` : ""}
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-2">
            <thead>
              <tr>
                ${columns.map((c, idx) => typeof c.sortValue === "function"
                  ? `<th data-dt-th="${idx}" style="cursor:pointer; user-select:none; white-space:nowrap;" title="Click to sort by ${escapeHtml(c.label)}">
                      ${escapeHtml(c.label)} <i class="bi bi-arrow-down-up small text-muted ms-1" data-dt-icon="${idx}"></i>
                    </th>`
                  : `<th>${escapeHtml(c.label)}</th>`).join("")}
              </tr>
            </thead>
            <tbody data-dt="body"></tbody>
          </table>
        </div>
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2">
          <small data-dt="info" class="text-muted"></small>
          <div class="d-flex align-items-center gap-2">
            <select data-dt="page-size" class="form-select form-select-sm" style="width: auto;" aria-label="Rows per page">
              ${pageSizeOptions(pageSize, pageSizes)}
            </select>
            <div data-dt="pager" class="btn-group btn-group-sm"></div>
          </div>
        </div>
      </div>`;

    const q = (sel) => container.querySelector(sel);
    const addBtn = q('[data-dt="add"]');
    const exportBtn = q('[data-dt="export"]');
    const searchEl = q('[data-dt="search"]');
    const sortSelect = q('[data-dt="sort-select"]');
    const resetBtn = q('[data-dt="reset"]');
    const sizeEl = q('[data-dt="page-size"]');
    const tbody = q('[data-dt="body"]');
    const infoEl = q('[data-dt="info"]');
    const pagerEl = q('[data-dt="pager"]');

    if (onAdd && addBtn) addBtn.onclick = onAdd;
    if (exportFn && exportBtn) exportBtn.onclick = () => exportFn(getProcessed());

    if (onAction) {
      tbody.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (btn && tbody.contains(btn)) onAction(btn);
      });
    }

    function getProcessed() {
      let list = rows;
      for (const f of resolvedFilters) {
        const val = filterState[f.id];
        if (val) {
          list = list.filter((r) => String(f.getValue(r) ?? "") === val);
        }
      }
      if (query) {
        const needle = query.toLowerCase();
        list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(needle));
      }
      if (sortCol >= 0 && sortDir && columns[sortCol]?.sortValue) {
        list = sortRows(list, columns[sortCol].sortValue, sortDir);
      }
      return list;
    }

    function syncIndicators() {
      container.querySelectorAll("[data-dt-icon]").forEach((icon) => {
        const idx = Number(icon.dataset.dtIcon);
        if (idx === sortCol && sortDir === "asc") {
          icon.className = "bi bi-sort-up small text-primary ms-1";
        } else if (idx === sortCol && sortDir === "desc") {
          icon.className = "bi bi-sort-down small text-primary ms-1";
        } else {
          icon.className = "bi bi-arrow-down-up small text-muted ms-1";
        }
      });
      if (sortSelect) {
        sortSelect.value = sortCol >= 0 && sortDir ? `${sortCol}:${sortDir}` : "";
      }
      if (resetBtn) {
        const hasFilters = Object.values(filterState).some(Boolean);
        const hasCustomSort = sortCol !== (defaultSort?.col ?? -1) || sortDir !== (defaultSort?.dir ?? "");
        resetBtn.classList.toggle("d-none", !(query || hasFilters || hasCustomSort));
      }
    }

    function draw() {
      const processed = getProcessed();
      const paged = paginate(processed, page, pageSize);
      page = paged.page;
      if (paged.rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}" class="text-center text-muted py-4">${escapeHtml(emptyMessage)}</td></tr>`;
      } else {
        tbody.innerHTML = paged.rows
          .map((row) => `<tr>${columns.map((c) => `<td>${c.render(row)}</td>`).join("")}</tr>`)
          .join("");
      }
      infoEl.textContent = `Showing ${paged.rows.length} of ${paged.total} records (Page ${paged.page}/${paged.totalPages})`;
      pagerEl.innerHTML = `
        <button type="button" class="btn btn-outline-secondary" ${paged.page <= 1 ? "disabled" : ""} data-dt-pg="prev">Prev</button>
        <button type="button" class="btn btn-outline-secondary" ${paged.page >= paged.totalPages ? "disabled" : ""} data-dt-pg="next">Next</button>`;
      pagerEl.querySelector('[data-dt-pg="prev"]').onclick = () => { page--; draw(); };
      pagerEl.querySelector('[data-dt-pg="next"]').onclick = () => { page++; draw(); };
      syncIndicators();
    }

    container.querySelectorAll("[data-dt-filter]").forEach((sel) => {
      sel.addEventListener("change", () => {
        filterState[sel.dataset.dtFilter] = sel.value;
        page = 1;
        draw();
      });
    });

    container.querySelectorAll("[data-dt-th]").forEach((th) => {
      th.addEventListener("click", () => {
        const idx = Number(th.dataset.dtTh);
        if (sortCol !== idx) {
          sortCol = idx;
          sortDir = "asc";
        } else if (sortDir === "asc") {
          sortDir = "desc";
        } else {
          sortCol = -1;
          sortDir = "";
        }
        page = 1;
        draw();
      });
    });

    if (sortSelect) {
      sortSelect.addEventListener("change", () => {
        if (!sortSelect.value) {
          sortCol = -1;
          sortDir = "";
        } else {
          const [idxStr, dir] = sortSelect.value.split(":");
          sortCol = Number(idxStr);
          sortDir = dir;
        }
        page = 1;
        draw();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        query = "";
        if (searchEl) searchEl.value = "";
        Object.keys(filterState).forEach((k) => { filterState[k] = ""; });
        container.querySelectorAll("[data-dt-filter]").forEach((sel) => { sel.value = ""; });
        sortCol = defaultSort?.col ?? -1;
        sortDir = defaultSort?.dir ?? "";
        page = 1;
        draw();
      });
    }

    sizeEl.addEventListener("change", (e) => {
      pageSize = Number(e.target.value) || defaultPageSize;
      page = 1;
      draw();
    });

    searchEl.addEventListener("input", (e) => {
      query = e.target.value;
      page = 1;
      draw();
    });

    draw();
  }

  function confirmAction({
    title = "Confirm Action",
    message = "Are you sure you want to proceed?",
    detail = "",
    confirmText = "Yes, Delete",
    variant = "danger",
  } = {}) {
    return new Promise((resolve) => {
      let modalEl = document.getElementById("erpConfirmModal");
      if (!modalEl) {
        modalEl = document.createElement("div");
        modalEl.id = "erpConfirmModal";
        modalEl.className = "modal fade";
        modalEl.tabIndex = -1;
        modalEl.setAttribute("aria-hidden", "true");
        modalEl.innerHTML = `
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 shadow">
              <div class="modal-header border-0 pb-1">
                <h5 class="modal-title fw-bold d-flex align-items-center gap-2" id="erp-confirm-title"></h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" id="erp-confirm-close"></button>
              </div>
              <div class="modal-body pt-2">
                <p class="mb-2" id="erp-confirm-msg"></p>
                <div class="alert alert-light border small fw-semibold py-2 px-3 mb-2 d-none" id="erp-confirm-detail"></div>
                <div class="small text-muted">This action cannot be undone.</div>
              </div>
              <div class="modal-footer border-0 pt-0">
                <button type="button" class="btn btn-light" data-bs-dismiss="modal" id="erp-confirm-cancel">Cancel</button>
                <button type="button" class="btn btn-danger" id="erp-confirm-ok"></button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modalEl);
      }

      const titleEl = modalEl.querySelector("#erp-confirm-title");
      const msgEl = modalEl.querySelector("#erp-confirm-msg");
      const detailEl = modalEl.querySelector("#erp-confirm-detail");
      const closeBtn = modalEl.querySelector("#erp-confirm-close");
      const cancelBtn = modalEl.querySelector("#erp-confirm-cancel");
      const okBtn = modalEl.querySelector("#erp-confirm-ok");

      titleEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill text-${escapeHtml(variant)}"></i><span>${escapeHtml(title)}</span>`;
      msgEl.textContent = message;
      if (detail) {
        detailEl.textContent = detail;
        detailEl.classList.remove("d-none");
      } else {
        detailEl.textContent = "";
        detailEl.classList.add("d-none");
      }
      okBtn.className = `btn btn-${variant}`;
      okBtn.textContent = confirmText;

      if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
        const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          okBtn.removeEventListener("click", onOk);
          modalEl.removeEventListener("hidden.bs.modal", onHidden);
          modalEl.removeEventListener("shown.bs.modal", onShown);
          resolve(result);
        };
        const onOk = () => {
          finish(true);
          bsModal.hide();
        };
        const onHidden = () => finish(false);
        const onShown = () => cancelBtn.focus();

        okBtn.addEventListener("click", onOk);
        modalEl.addEventListener("hidden.bs.modal", onHidden);
        modalEl.addEventListener("shown.bs.modal", onShown);
        bsModal.show();
        return;
      }

      let settled = false;
      const backdropEl = document.createElement("div");
      backdropEl.className = "modal-backdrop fade show";
      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        modalEl.classList.remove("show");
        modalEl.style.display = "none";
        backdropEl.remove();
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        closeBtn?.removeEventListener("click", onCancel);
        modalEl.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onEsc);
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onBackdrop = (e) => { if (e.target === modalEl) cleanup(false); };
      const onEsc = (e) => { if (e.key === "Escape") cleanup(false); };

      document.body.appendChild(backdropEl);
      modalEl.style.display = "block";
      modalEl.classList.add("show");
      cancelBtn.focus();
      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      closeBtn?.addEventListener("click", onCancel);
      modalEl.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onEsc);
    });
  }

  function exportCsv(filename, headers, rows) {
    const escapeCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      headers.map(escapeCell).join(","),
      ...rows.map((r) => r.map(escapeCell).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function statusBadge(status) {
    const map = {
      approved: "bg-success",
      present: "bg-success",
      rejected: "bg-danger",
      absent: "bg-danger",
      pending: "bg-warning text-dark",
      late: "bg-warning text-dark",
    };
    const cls = map[status] || "bg-secondary";
    return `<span class="badge ${cls} text-capitalize">${escapeHtml(status)}</span>`;
  }

  return {
    api,
    cachedApi,
    invalidateCache,
    loadScript,
    loadChartJs,
    loadProfileWidget,
    renderSkeleton,
    createTabRunner,
    escapeHtml,
    showToast,
    requireAuth,
    logout,
    getInitialTab,
    renderShell,
    paginate,
    pageSizeOptions,
    sortRows,
    renderDataTable,
    confirmAction,
    exportCsv,
    statusBadge,
    getUserData: () => currentUserData,
  };
})();

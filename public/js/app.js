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

  async function logout() {
    invalidateCache();
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      window.location.href = "/";
    }
  }

  function renderShell({ title, roleLabel, navItems, onTabChange, user }) {
    const sidebarNav = document.getElementById("sidebar-nav");
    const userBadge = document.getElementById("topbar-user");
    const pageTitle = document.getElementById("topbar-title");
    const roleBadge = document.getElementById("sidebar-role-badge");

    if (roleBadge) roleBadge.textContent = roleLabel;
    if (pageTitle) pageTitle.textContent = title;
    if (userBadge && user?.profile) {
      const fullName =
        `${user.profile.first_name || ""} ${user.profile.last_name || ""}`.trim() ||
        user.profile.username ||
        user.profile.email;
      userBadge.textContent = fullName;
    }

    if (sidebarNav) {
      sidebarNav.innerHTML = navItems
        .map(
          (item, idx) => `
          <a href="#" class="nav-link ${idx === 0 ? "active" : ""}" data-tab="${escapeHtml(item.id)}">
            <i class="bi ${escapeHtml(item.icon)}"></i>
            <span>${escapeHtml(item.label)}</span>
          </a>`
        )
        .join("");

      sidebarNav.querySelectorAll(".nav-link").forEach((link) => {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          sidebarNav.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
          link.classList.add("active");
          const tabId = link.getAttribute("data-tab");
          const item = navItems.find((n) => n.id === tabId);
          if (pageTitle && item) pageTitle.textContent = item.label;
          closeMobileSidebar();
          onTabChange(tabId);
        });
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

  function confirmAction({
    title = "Confirm Action",
    message = "Are you sure you want to proceed?",
    detail = "",
    confirmText = "Yes, Delete",
    variant = "danger",
  } = {}) {
    return new Promise((resolve) => {
      if (typeof bootstrap === "undefined" || !bootstrap.Modal) {
        resolve(window.confirm([message, detail].filter(Boolean).join("\n")));
        return;
      }
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
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
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
    renderShell,
    paginate,
    pageSizeOptions,
    confirmAction,
    exportCsv,
    statusBadge,
    getUserData: () => currentUserData,
  };
})();

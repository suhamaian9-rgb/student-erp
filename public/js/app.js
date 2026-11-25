/**
 * Shared frontend utilities for the University ERP Portal.
 * All authentication and API requests use same-origin HttpOnly session cookies.
 */

window.ERP = (() => {
  let currentUserData = null;

  async function api(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    const res = await fetch(path, {
      ...options,
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
    return payload;
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

    loadNotifications();
  }

  function closeMobileSidebar() {
    document.getElementById("erp-sidebar")?.classList.remove("show");
    document.getElementById("erp-backdrop")?.classList.remove("show");
  }

  async function loadNotifications() {
    const listEl = document.getElementById("notif-list");
    const countEl = document.getElementById("notif-count");
    if (!listEl || !countEl) return;
    try {
      const items = await api("/api/notifications");
      const unread = items.filter((n) => !n.is_read).length;
      countEl.textContent = unread > 0 ? unread : "";
      countEl.style.display = unread > 0 ? "inline-block" : "none";

      if (items.length === 0) {
        listEl.innerHTML = `<div class="p-3 text-muted small text-center">No notifications</div>`;
        return;
      }
      listEl.innerHTML = items
        .slice(0, 8)
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
          loadNotifications();
        });
      });
    } catch {
      // Ignore notification fetch failures silently
    }
  }

  function paginate(items, page = 1, pageSize = 10) {
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
    escapeHtml,
    showToast,
    requireAuth,
    logout,
    renderShell,
    paginate,
    exportCsv,
    statusBadge,
    getUserData: () => currentUserData,
  };
})();

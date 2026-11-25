/**
 * OopsBox-style interactive parallax & multi-situation error handler (CSP-safe).
 */
(() => {
  const container = document.getElementById("error-container");

  if (container) {
    window.addEventListener("mousemove", (e) => {
      const x = -e.clientX / 6;
      const y = -e.clientY / 6;
      container.style.backgroundPosition = `${x}px ${y}px, ${x + 24}px ${y + 24}px, ${x * 0.5}px ${y * 0.5}px, ${x * 0.5}px ${y * 0.5}px`;
    });

    window.addEventListener("deviceorientation", (e) => {
      if (e.gamma == null || e.beta == null) return;
      const x = e.gamma / 3;
      const y = e.beta / 3;
      container.style.backgroundPosition = `${x}px ${y}px, ${x + 24}px ${y + 24}px, 0 0, 0 0`;
    });
  }

  const backBtn = document.getElementById("btn-go-back");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      if (window.history.length > 1) window.history.back();
      else window.location.href = "/";
    });
  }

  const SITUATIONS = {
    "400": {
      title: "400 — Bad Request | University ERP",
      headline: "Oops! That request looks scrambled",
      desc: "The server couldn't understand the request parameters. Double-check your input and try again.",
    },
    "401": {
      title: "401 — Session Expired | University ERP",
      headline: "Hold on! Sign in required",
      desc: "Your session has expired or you are not signed in yet. Please sign in with your university credentials to continue.",
    },
    "403": {
      title: "403 — Access Denied | University ERP",
      headline: "Restricted Area! Access denied",
      desc: "You don't have permission to open this portal or resource. If you think this is a mistake, contact the administrator.",
    },
    "404": {
      title: "404 — Page Not Found | University ERP",
      headline: "Oops! Page not found",
      desc: "The page you were looking for doesn't exist. You may have mistyped the address or the page may have moved.",
    },
    "500": {
      title: "500 — Server Error | University ERP",
      headline: "Whoa! Something broke on our end",
      desc: "Our servers hit an unexpected bump while processing your request. Please try again in a moment.",
    },
    "503": {
      title: "503 — Maintenance | University ERP",
      headline: "Scheduled Maintenance in Progress",
      desc: "The University ERP portal is briefly offline for upgrades. Everything will be back online shortly.",
    },
  };

  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get("code");
  if (codeParam && SITUATIONS[codeParam]) {
    const info = SITUATIONS[codeParam];
    document.title = info.title;
    const codeEl = document.getElementById("error-code");
    const headEl = document.getElementById("error-headline");
    const descEl = document.getElementById("error-desc");
    if (codeEl) codeEl.textContent = codeParam;
    if (headEl) headEl.textContent = info.headline;
    if (descEl) descEl.textContent = info.desc;

    document.querySelectorAll(".situation-pill").forEach((pill) => {
      pill.classList.toggle("active", pill.dataset.code === codeParam);
    });
  }
})();

/**
 * Login & Forgot-Password controller (externalized for strict CSP).
 */
(() => {
  const alertBox = document.getElementById("login-alert");
  const loginForm = document.getElementById("login-form");
  const loginBtn = document.getElementById("login-btn");
  const pwInput = document.getElementById("password");
  const togglePw = document.getElementById("toggle-pw");
  const forgotForm = document.getElementById("forgot-form");

  if (togglePw && pwInput) {
    togglePw.addEventListener("click", () => {
      pwInput.type = pwInput.type === "password" ? "text" : "password";
    });
  }

  function showAlert(el, msg, type = "danger") {
    if (!el) return;
    el.className = `alert alert-${type}`;
    el.textContent = msg;
    el.classList.remove("d-none");
  }

  function goToPortal(role) {
    if (role === "admin") window.location.href = "/admin.html";
    else if (role === "teacher") window.location.href = "/teacher.html";
    else window.location.href = "/student.html";
  }

  (async () => {
    try {
      const res = await fetch("/api/me", { credentials: "same-origin" });
      if (res.ok) {
        const me = await res.json();
        if (me?.profile?.role) goToPortal(me.profile.role);
      }
    } catch {
      // Not signed in
    }
  })();

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      alertBox?.classList.add("d-none");
      const identifier = document.getElementById("identifier").value.trim();
      const password = pwInput.value;
      const remember = document.getElementById("remember-me").checked;

      if (!identifier || !password) {
        showAlert(alertBox, "Please enter both username/email and password.");
        return;
      }

      loginBtn.disabled = true;
      loginBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Signing in...`;

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ identifier, password, remember }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Invalid credentials.");
        goToPortal(data.role);
      } catch (err) {
        showAlert(alertBox, err.message || "Invalid username/email or password.");
        loginBtn.disabled = false;
        loginBtn.innerHTML = `<i class="bi bi-box-arrow-in-right me-1"></i> Sign In`;
      }
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const forgotAlert = document.getElementById("forgot-alert");
      const email = document.getElementById("reset-email").value.trim();
      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to process request.");
        showAlert(forgotAlert, data.message, "success");
      } catch (err) {
        showAlert(forgotAlert, err.message);
      }
    });
  }
})();

/**
 * Login & Forgot-Password controller (externalized for strict CSP).
 */
(() => {
  const alertBox = document.getElementById("login-alert");
  const loginForm = document.getElementById("login-form");
  const loginBtn = document.getElementById("login-btn");
  const idInput = document.getElementById("identifier");
  const pwInput = document.getElementById("password");
  const togglePw = document.getElementById("toggle-pw");
  const authCard = document.getElementById("auth-card");
  const mascot = document.getElementById("mascot-buddy");
  const hero = document.getElementById("auth-hero");
  const pupilLeft = document.getElementById("pupil-left");
  const pupilRight = document.getElementById("pupil-right");

  // Playful hero parallax on mouse move
  if (hero) {
    hero.addEventListener("mousemove", (e) => {
      const rect = hero.getBoundingClientRect();
      const dx = (e.clientX - rect.left) / rect.width - 0.5;
      const dy = (e.clientY - rect.top) / rect.height - 0.5;
      hero.querySelectorAll(".hero-shape").forEach((el, idx) => {
        const depth = (idx + 1) * 8;
        el.style.transform = `translate(${dx * depth}px, ${dy * depth}px)`;
      });
    });
  }

  // Mascot eye tracking & password-cover reactions
  function updatePupils(offsetX, offsetY) {
    if (!pupilLeft || !pupilRight) return;
    pupilLeft.setAttribute("cx", String(45 + offsetX));
    pupilLeft.setAttribute("cy", String(52 + offsetY));
    pupilRight.setAttribute("cx", String(75 + offsetX));
    pupilRight.setAttribute("cy", String(52 + offsetY));
  }

  if (idInput) {
    idInput.addEventListener("input", () => {
      const len = Math.min(idInput.value.length, 24);
      updatePupils(-2.5 + (len / 24) * 5, 2);
    });
    idInput.addEventListener("focus", () => {
      mascot?.classList.remove("cover-eyes", "peek-eye");
      updatePupils(0, 2);
    });
    idInput.addEventListener("blur", () => updatePupils(0, 0));
  }

  if (pwInput) {
    pwInput.addEventListener("focus", () => {
      mascot?.classList.add("cover-eyes");
      mascot?.classList.toggle("peek-eye", pwInput.type === "text");
    });
    pwInput.addEventListener("blur", () => {
      setTimeout(() => {
        if (document.activeElement !== togglePw) {
          mascot?.classList.remove("cover-eyes", "peek-eye");
        }
      }, 80);
    });
  }

  const refreshIcons = () => {
    if (window.lucide) window.lucide.createIcons();
  };
  refreshIcons();

  if (togglePw && pwInput) {
    togglePw.addEventListener("click", () => {
      const show = pwInput.type === "password";
      pwInput.type = show ? "text" : "password";
      togglePw.innerHTML = `<i data-lucide="${show ? "eye-off" : "eye"}"></i>`;
      refreshIcons();
      mascot?.classList.add("cover-eyes");
      mascot?.classList.toggle("peek-eye", show);
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
        if (authCard) {
          authCard.classList.remove("auth-shake");
          void authCard.offsetWidth;
          authCard.classList.add("auth-shake");
        }
        loginBtn.disabled = false;
        loginBtn.innerHTML = `<i data-lucide="log-in" class="me-1"></i> Sign In`;
        refreshIcons();
      }
    });
  }
})();

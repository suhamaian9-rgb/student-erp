/**
 * Password Reset controller (externalized for strict CSP).
 */
(() => {
  const alertEl = document.getElementById("reset-alert");
  const resetForm = document.getElementById("reset-form");
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token") || "";

  // Scrub recovery token from URL bar immediately after reading it
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname);
  }

  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = document.getElementById("new-password").value;
      const confirm = document.getElementById("confirm-password").value;
      if (pw !== confirm) {
        alertEl.className = "alert alert-danger";
        alertEl.textContent = "Passwords do not match.";
        alertEl.classList.remove("d-none");
        return;
      }
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken, password: pw }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Reset failed.");
        alertEl.className = "alert alert-success";
        alertEl.textContent = "Password updated! Redirecting to sign in...";
        alertEl.classList.remove("d-none");
        setTimeout(() => (window.location.href = "/"), 2000);
      } catch (err) {
        alertEl.className = "alert alert-danger";
        alertEl.textContent = err.message;
        alertEl.classList.remove("d-none");
      }
    });
  }
})();

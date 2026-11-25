/**
 * Shared profile view & edit component for Admin, Teacher, and Student portals.
 */

window.renderProfileView = function renderProfileView(container, userData, onUpdated) {
  const p = userData.profile;
  const r = userData.role_record || {};
  const esc = ERP.escapeHtml;

  let roleExtraHtml = "";
  if (p.role === "teacher") {
    roleExtraHtml = `
      <div class="col-md-6">
        <label class="form-label text-muted small">Employee ID</label>
        <input type="text" class="form-control" value="${esc(r.employee_id || "—")}" disabled>
      </div>
      <div class="col-md-6">
        <label class="form-label text-muted small">Department</label>
        <input type="text" class="form-control" value="${esc(r.departments?.name || "—")}" disabled>
      </div>`;
  } else if (p.role === "student") {
    roleExtraHtml = `
      <div class="col-md-4">
        <label class="form-label text-muted small">Roll Number</label>
        <input type="text" class="form-control" value="${esc(r.roll_number || "—")}" disabled>
      </div>
      <div class="col-md-4">
        <label class="form-label text-muted small">Course</label>
        <input type="text" class="form-control" value="${esc(r.courses?.name || "—")}" disabled>
      </div>
      <div class="col-md-4">
        <label class="form-label text-muted small">Academic Session</label>
        <input type="text" class="form-control" value="${esc(r.academic_sessions?.name || "—")}" disabled>
      </div>`;
  }

  container.innerHTML = `
    <div class="card panel-card p-4" style="max-width: 780px;">
      <h5 class="fw-bold mb-3"><i data-lucide="user-circle" class="me-2 text-primary"></i>My Profile</h5>
      <form id="profile-edit-form" class="row g-3">
        <div class="col-md-6">
          <label class="form-label">First Name</label>
          <input type="text" id="prof-first" class="form-control" value="${esc(p.first_name)}" required>
        </div>
        <div class="col-md-6">
          <label class="form-label">Last Name</label>
          <input type="text" id="prof-last" class="form-control" value="${esc(p.last_name)}" required>
        </div>
        <div class="col-md-6">
          <label class="form-label">Email</label>
          <input type="email" class="form-control" value="${esc(p.email)}" disabled>
        </div>
        <div class="col-md-3">
          <label class="form-label">Gender</label>
          <select id="prof-gender" class="form-select">
            <option value="M" ${p.gender === "M" ? "selected" : ""}>Male</option>
            <option value="F" ${p.gender === "F" ? "selected" : ""}>Female</option>
            <option value="O" ${p.gender === "O" ? "selected" : ""}>Other</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label">Phone</label>
          <input type="text" id="prof-phone" class="form-control" value="${esc(p.phone)}">
        </div>
        <div class="col-12">
          <label class="form-label">Address</label>
          <textarea id="prof-address" class="form-control" rows="2">${esc(p.address)}</textarea>
        </div>
        ${roleExtraHtml}
        <div class="col-12 pt-2">
          <button type="submit" class="btn btn-primary">Save Profile Changes</button>
        </div>
      </form>
    </div>`;

  document.getElementById("profile-edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const updated = await ERP.api("/api/me", {
        method: "PUT",
        body: JSON.stringify({
          first_name: document.getElementById("prof-first").value.trim(),
          last_name: document.getElementById("prof-last").value.trim(),
          gender: document.getElementById("prof-gender").value,
          phone: document.getElementById("prof-phone").value.trim(),
          address: document.getElementById("prof-address").value.trim(),
        }),
      });
      userData.profile = updated;
      ERP.showToast("Profile updated successfully!");
      if (onUpdated) onUpdated();
    } catch (err) {
      ERP.showToast(err.message, "danger");
    }
  });
};

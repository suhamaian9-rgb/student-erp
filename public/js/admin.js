/**
 * Admin / HOD Dashboard Controller.
 * Covers: Overview + Charts, Departments, Courses, Sessions & Semesters,
 * Subjects, Teachers, Students, Enrollments, Attendance View, Exams & Results,
 * Leave Approvals, Feedback Replies, In-App Notifications, and Profile.
 */

(async () => {
  const statsBoot = ERP.cachedApi("/api/admin/stats").catch(() => null);
  const userData = await ERP.requireAuth("admin");
  if (!userData) return;

  const main = document.getElementById("main-content");
  const esc = ERP.escapeHtml;
  const modalEl = document.getElementById("adminModal");
  const modal = new bootstrap.Modal(modalEl);
  const modalTitle = document.getElementById("adminModalTitle");
  const modalBody = document.getElementById("adminModalBody");

  const navItems = [
    { id: "overview", label: "Overview", icon: "layout-dashboard" },
    { id: "departments", label: "Departments", icon: "building-2" },
    { id: "courses", label: "Courses", icon: "book-open" },
    { id: "sessions", label: "Sessions & Semesters", icon: "calendar-range" },
    { id: "subjects", label: "Subjects", icon: "book-marked" },
    { id: "enrollments", label: "Enrollments", icon: "clipboard-list" },
    { id: "teachers", label: "Teachers", icon: "briefcase" },
    { id: "students", label: "Students", icon: "users" },
    { id: "attendance", label: "Attendance Reports", icon: "check-square" },
    { id: "results", label: "Exams & Results", icon: "award" },
    { id: "leaves", label: "Leave Applications", icon: "calendar-x" },
    { id: "feedback", label: "Feedback", icon: "message-square" },
    { id: "notifications", label: "Send Notice", icon: "megaphone" },
    { id: "profile", label: "My Profile", icon: "user-circle" },
  ];

  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.show();
  }

  function renderTableWithSearch(opts) {
    ERP.renderDataTable(main, opts);
  }

  // 1. OVERVIEW
  async function loadOverview(signal, prefetched = null) {
    const data = prefetched || (await ERP.cachedApi("/api/admin/stats", { signal }));
    if (signal?.aborted) return;
    const c = data.counts;
    const cards = [
      { label: "Total Students", val: c.students, icon: "users", bg: "bg-primary-subtle text-primary" },
      { label: "Total Teachers", val: c.teachers, icon: "briefcase", bg: "bg-success-subtle text-success" },
      { label: "Courses", val: c.courses, icon: "book-open", bg: "bg-info-subtle text-info" },
      { label: "Subjects", val: c.subjects, icon: "book-marked", bg: "bg-warning-subtle text-warning" },
      { label: "Pending Leaves", val: c.pending_leaves, icon: "calendar-x", bg: "bg-danger-subtle text-danger" },
      { label: "Attendance Sessions", val: c.attendance_sessions, icon: "check-square", bg: "bg-secondary-subtle text-secondary" },
    ];

    main.innerHTML = `
      <div class="row g-3 mb-4">
        ${cards
          .map(
            (card) => `
          <div class="col-6 col-md-4 col-xl-2">
            <div class="card stat-card p-3 h-100">
              <div class="d-flex align-items-center justify-content-between mb-2">
                <div class="stat-icon ${card.bg}"><i class="bi ${card.icon}"></i></div>
                <span class="fs-4 fw-bold">${card.val}</span>
              </div>
              <div class="small text-muted fw-medium">${esc(card.label)}</div>
            </div>
          </div>`
          )
          .join("")}
      </div>
      <div class="row g-3">
        <div class="col-lg-6">
          <div class="card panel-card p-3 p-md-4 h-100">
            <h6 class="fw-bold mb-3">Students & Subjects per Course</h6>
            <canvas id="chart-courses" height="180"></canvas>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card panel-card p-3 p-md-4 h-100">
            <h6 class="fw-bold mb-3">Attendance Sessions per Subject</h6>
            <canvas id="chart-subjects" height="180"></canvas>
          </div>
        </div>
      </div>`;

    await ERP.loadChartJs();
    if (signal?.aborted) return;
    const courseCanvas = document.getElementById("chart-courses");
    const subjectCanvas = document.getElementById("chart-subjects");
    if (!courseCanvas || !subjectCanvas) return;

    new Chart(courseCanvas, {
      type: "bar",
      data: {
        labels: data.course_chart.map((x) => x.code || x.course),
        datasets: [
          { label: "Students", data: data.course_chart.map((x) => x.students), backgroundColor: "#2563eb" },
          { label: "Subjects", data: data.course_chart.map((x) => x.subjects), backgroundColor: "#10b981" },
        ],
      },
      options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });

    new Chart(subjectCanvas, {
      type: "bar",
      data: {
        labels: data.subject_chart.map((x) => x.subject),
        datasets: [
          { label: "Attendance Sessions", data: data.subject_chart.map((x) => x.sessions), backgroundColor: "#6366f1" },
        ],
      },
      options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  // 2. DEPARTMENTS
  async function loadDepartments(signal) {
    const rows = await ERP.cachedApi("/api/admin/departments", { signal });
    const showForm = (item = null) => {
      openModal(item ? "Edit Department" : "Add Department", `
        <form id="dept-form" class="row g-3">
          <div class="col-md-8"><label class="form-label">Department Name</label><input class="form-control" id="d-name" value="${esc(item?.name || "")}" required></div>
          <div class="col-md-4"><label class="form-label">Code</label><input class="form-control" id="d-code" value="${esc(item?.code || "")}" required></div>
          <div class="col-12"><label class="form-label">Description</label><textarea class="form-control" id="d-desc" rows="2">${esc(item?.description || "")}</textarea></div>
          <div class="col-12 text-end"><button class="btn btn-primary" type="submit">Save Department</button></div>
        </form>`);
      document.getElementById("dept-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          await ERP.api("/api/admin/departments", {
            method: item ? "PUT" : "POST",
            body: JSON.stringify({
              id: item?.id,
              name: document.getElementById("d-name").value.trim(),
              code: document.getElementById("d-code").value.trim().toUpperCase(),
              description: document.getElementById("d-desc").value.trim(),
            }),
          });
          modal.hide();
          ERP.showToast("Department saved!");
          loadDepartments();
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };

    renderTableWithSearch({
      title: "Departments",
      addLabel: "Add Department",
      onAdd: () => showForm(),
      rows,
      columns: [
        { label: "Code", sortValue: (r) => r.code || "", render: (r) => `<span class="badge bg-secondary">${esc(r.code)}</span>` },
        { label: "Name", sortValue: (r) => r.name || "", render: (r) => `<strong>${esc(r.name)}</strong>` },
        { label: "Description", render: (r) => esc(r.description || "—") },
        {
          label: "Actions",
          render: (r) => `
            <button class="btn btn-sm btn-outline-primary me-1" data-edit="${r.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${r.id}">Delete</button>`,
        },
      ],
      onAction: async (b) => {
        if (b.dataset.edit) return showForm(rows.find((x) => x.id == b.dataset.edit));
        if (b.dataset.del) {
          const item = rows.find((x) => x.id == b.dataset.del);
          const ok = await ERP.confirmAction({
            title: "Delete Department",
            message: "Are you sure you want to delete this department?",
            detail: item ? `${item.code} — ${item.name}` : "",
          });
          if (!ok) return;
          try {
            await ERP.api(`/api/admin/departments?id=${b.dataset.del}`, { method: "DELETE" });
            ERP.showToast("Department deleted");
            loadDepartments();
          } catch (err) { ERP.showToast(err.message, "danger"); }
        }
      },
    });
  }

  // 3. COURSES
  async function loadCourses(signal) {
    const [rows, depts] = await Promise.all([
      ERP.cachedApi("/api/admin/courses", { signal }),
      ERP.cachedApi("/api/admin/departments", { signal }),
    ]);
    const showForm = (item = null) => {
      openModal(item ? "Edit Course" : "Add Course", `
        <form id="course-form" class="row g-3">
          <div class="col-md-6"><label class="form-label">Course Name</label><input class="form-control" id="c-name" value="${esc(item?.name || "")}" required></div>
          <div class="col-md-3"><label class="form-label">Code</label><input class="form-control" id="c-code" value="${esc(item?.code || "")}" required></div>
          <div class="col-md-3"><label class="form-label">Years</label><input type="number" min="1" max="6" class="form-control" id="c-years" value="${item?.duration_years || 4}" required></div>
          <div class="col-12"><label class="form-label">Department</label>
            <select class="form-select" id="c-dept" required>
              ${depts.map((d) => `<option value="${d.id}" ${item?.department_id === d.id ? "selected" : ""}>${esc(d.name)} (${esc(d.code)})</option>`).join("")}
            </select>
          </div>
          <div class="col-12 text-end"><button class="btn btn-primary" type="submit">Save Course</button></div>
        </form>`);
      document.getElementById("course-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          await ERP.api("/api/admin/courses", {
            method: item ? "PUT" : "POST",
            body: JSON.stringify({
              id: item?.id,
              name: document.getElementById("c-name").value.trim(),
              code: document.getElementById("c-code").value.trim().toUpperCase(),
              duration_years: Number(document.getElementById("c-years").value),
              department_id: Number(document.getElementById("c-dept").value),
            }),
          });
          modal.hide();
          ERP.showToast("Course saved!");
          loadCourses();
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };

    renderTableWithSearch({
      title: "Courses",
      addLabel: "Add Course",
      onAdd: () => showForm(),
      rows,
      filters: [
        { id: "department", label: "Department", getValue: (r) => r.departments?.name },
      ],
      columns: [
        { label: "Code", sortValue: (r) => r.code || "", render: (r) => `<span class="badge bg-primary">${esc(r.code)}</span>` },
        { label: "Course Name", sortValue: (r) => r.name || "", render: (r) => `<strong>${esc(r.name)}</strong>` },
        { label: "Department", sortValue: (r) => r.departments?.name || "", render: (r) => esc(r.departments?.name || "—") },
        { label: "Duration", sortValue: (r) => Number(r.duration_years) || 0, render: (r) => `${r.duration_years} yrs` },
        {
          label: "Actions",
          render: (r) => `
            <button class="btn btn-sm btn-outline-primary me-1" data-edit="${r.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${r.id}">Delete</button>`,
        },
      ],
      onAction: async (b) => {
        if (b.dataset.edit) return showForm(rows.find((x) => x.id == b.dataset.edit));
        if (b.dataset.del) {
          const item = rows.find((x) => x.id == b.dataset.del);
          const ok = await ERP.confirmAction({
            title: "Delete Course",
            message: "Are you sure you want to delete this course?",
            detail: item ? `${item.code} — ${item.name}` : "",
          });
          if (!ok) return;
          try {
            await ERP.api(`/api/admin/courses?id=${b.dataset.del}`, { method: "DELETE" });
            ERP.showToast("Course deleted");
            loadCourses();
          } catch (err) { ERP.showToast(err.message, "danger"); }
        }
      },
    });
  }

  // 4. SESSIONS & SEMESTERS
  async function loadSessions(signal) {
    const [sessions, semesters] = await Promise.all([
      ERP.cachedApi("/api/admin/sessions", { signal }),
      ERP.cachedApi("/api/admin/semesters", { signal }),
    ]);

    main.innerHTML = `
      <div class="row g-4">
        <div class="col-lg-6">
          <div class="card panel-card p-3 p-md-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="fw-bold mb-0">Academic Sessions</h5>
              <button id="add-sess-btn" class="btn btn-primary btn-sm"><i data-lucide="plus" class="me-1"></i>Add Session</button>
            </div>
            <div class="table-responsive">
              <table class="table table-hover align-middle">
                <thead><tr><th>Name</th><th>Start</th><th>End</th><th>Actions</th></tr></thead>
                <tbody>
                  ${sessions.map((s) => `
                    <tr>
                      <td><strong>${esc(s.name)}</strong> ${s.is_current ? '<span class="badge bg-success">Current</span>' : ""}</td>
                      <td>${esc(s.start_date)}</td><td>${esc(s.end_date)}</td>
                      <td><button class="btn btn-sm btn-outline-danger" data-del-sess="${s.id}">Delete</button></td>
                    </tr>`).join("") || `<tr><td colspan="4" class="text-center text-muted">No sessions</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card panel-card p-3 p-md-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="fw-bold mb-0">Semesters</h5>
              <button id="add-sem-btn" class="btn btn-primary btn-sm"><i data-lucide="plus" class="me-1"></i>Add Semester</button>
            </div>
            <div class="table-responsive">
              <table class="table table-hover align-middle">
                <thead><tr><th>Semester</th><th>Session</th><th>Dates</th><th>Actions</th></tr></thead>
                <tbody>
                  ${semesters.map((sm) => `
                    <tr>
                      <td><strong>${esc(sm.name)}</strong> (#${sm.semester_number})</td>
                      <td>${esc(sm.academic_sessions?.name || "—")}</td>
                      <td class="small">${esc(sm.start_date)} to ${esc(sm.end_date)}</td>
                      <td><button class="btn btn-sm btn-outline-danger" data-del-sem="${sm.id}">Delete</button></td>
                    </tr>`).join("") || `<tr><td colspan="4" class="text-center text-muted">No semesters</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById("add-sess-btn").onclick = () => {
      openModal("Add Academic Session", `
        <form id="sess-form" class="row g-3">
          <div class="col-12"><label class="form-label">Session Name</label><input class="form-control" id="s-name" placeholder="e.g. 2026-2027" required></div>
          <div class="col-md-6"><label class="form-label">Start Date</label><input type="date" class="form-control" id="s-start" required></div>
          <div class="col-md-6"><label class="form-label">End Date</label><input type="date" class="form-control" id="s-end" required></div>
          <div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="s-curr" checked><label class="form-check-label" for="s-curr">Current Session</label></div></div>
          <div class="col-12 text-end"><button class="btn btn-primary" type="submit">Save Session</button></div>
        </form>`);
      document.getElementById("sess-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          await ERP.api("/api/admin/sessions", {
            method: "POST",
            body: JSON.stringify({
              name: document.getElementById("s-name").value.trim(),
              start_date: document.getElementById("s-start").value,
              end_date: document.getElementById("s-end").value,
              is_current: document.getElementById("s-curr").checked,
            }),
          });
          modal.hide();
          ERP.showToast("Session added!");
          loadSessions();
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };

    document.getElementById("add-sem-btn").onclick = () => {
      openModal("Add Semester", `
        <form id="sem-form" class="row g-3">
          <div class="col-md-6"><label class="form-label">Session</label>
            <select class="form-select" id="sm-sess" required>${sessions.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-4"><label class="form-label">Semester Name</label><input class="form-control" id="sm-name" placeholder="Fall 2026" required></div>
          <div class="col-md-2"><label class="form-label">Number</label><input type="number" min="1" max="12" class="form-control" id="sm-num" value="1" required></div>
          <div class="col-md-6"><label class="form-label">Start Date</label><input type="date" class="form-control" id="sm-start" required></div>
          <div class="col-md-6"><label class="form-label">End Date</label><input type="date" class="form-control" id="sm-end" required></div>
          <div class="col-12 text-end"><button class="btn btn-primary" type="submit">Save Semester</button></div>
        </form>`);
      document.getElementById("sem-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          await ERP.api("/api/admin/semesters", {
            method: "POST",
            body: JSON.stringify({
              session_id: Number(document.getElementById("sm-sess").value),
              name: document.getElementById("sm-name").value.trim(),
              semester_number: Number(document.getElementById("sm-num").value),
              start_date: document.getElementById("sm-start").value,
              end_date: document.getElementById("sm-end").value,
              is_current: true,
            }),
          });
          modal.hide();
          ERP.showToast("Semester added!");
          loadSessions();
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };

    main.querySelectorAll("[data-del-sess]").forEach((b) => (b.onclick = async () => {
      const item = sessions.find((x) => x.id == b.dataset.delSess);
      const ok = await ERP.confirmAction({
        title: "Delete Academic Session",
        message: "Are you sure you want to delete this academic session?",
        detail: item ? `${item.name} (${item.start_date} to ${item.end_date})` : "",
      });
      if (!ok) return;
      try { await ERP.api(`/api/admin/sessions?id=${b.dataset.delSess}`, { method: "DELETE" }); ERP.showToast("Session deleted"); loadSessions(); }
      catch (err) { ERP.showToast(err.message, "danger"); }
    }));
    main.querySelectorAll("[data-del-sem]").forEach((b) => (b.onclick = async () => {
      const item = semesters.find((x) => x.id == b.dataset.delSem);
      const ok = await ERP.confirmAction({
        title: "Delete Semester",
        message: "Are you sure you want to delete this semester?",
        detail: item ? `${item.name} — ${item.academic_sessions?.name || ""}` : "",
      });
      if (!ok) return;
      try { await ERP.api(`/api/admin/semesters?id=${b.dataset.delSem}`, { method: "DELETE" }); ERP.showToast("Semester deleted"); loadSessions(); }
      catch (err) { ERP.showToast(err.message, "danger"); }
    }));
  }

  // 5. SUBJECTS
  async function loadSubjects(signal) {
    const [rows, courses, semesters, teachers] = await Promise.all([
      ERP.cachedApi("/api/admin/subjects", { signal }),
      ERP.cachedApi("/api/admin/courses", { signal }),
      ERP.cachedApi("/api/admin/semesters", { signal }),
      ERP.cachedApi("/api/admin/teachers", { signal }),
    ]);

    const showForm = (item = null) => {
      openModal(item ? "Edit Subject" : "Add Subject", `
        <form id="sub-form" class="row g-3">
          <div class="col-md-6"><label class="form-label">Subject Name</label><input class="form-control" id="sb-name" value="${esc(item?.name || "")}" required></div>
          <div class="col-md-3"><label class="form-label">Code</label><input class="form-control" id="sb-code" value="${esc(item?.code || "")}" required></div>
          <div class="col-md-3"><label class="form-label">Credits</label><input type="number" min="1" max="10" class="form-control" id="sb-cred" value="${item?.credits || 3}" required></div>
          <div class="col-md-4"><label class="form-label">Course</label>
            <select class="form-select" id="sb-course" required>${courses.map((c) => `<option value="${c.id}" ${item?.course_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-4"><label class="form-label">Semester</label>
            <select class="form-select" id="sb-sem"><option value="">— Optional —</option>${semesters.map((s) => `<option value="${s.id}" ${item?.semester_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-4"><label class="form-label">Assigned Teacher</label>
            <select class="form-select" id="sb-teach"><option value="">— Unassigned —</option>${teachers.map((t) => `<option value="${t.id}" ${item?.teacher_id === t.id ? "selected" : ""}>${esc(t.profiles?.first_name)} ${esc(t.profiles?.last_name)}</option>`).join("")}</select>
          </div>
          <div class="col-12 text-end"><button class="btn btn-primary" type="submit">Save Subject</button></div>
        </form>`);
      document.getElementById("sub-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          await ERP.api("/api/admin/subjects", {
            method: item ? "PUT" : "POST",
            body: JSON.stringify({
              id: item?.id,
              name: document.getElementById("sb-name").value.trim(),
              code: document.getElementById("sb-code").value.trim().toUpperCase(),
              credits: Number(document.getElementById("sb-cred").value),
              course_id: Number(document.getElementById("sb-course").value),
              semester_id: document.getElementById("sb-sem").value ? Number(document.getElementById("sb-sem").value) : null,
              teacher_id: document.getElementById("sb-teach").value ? Number(document.getElementById("sb-teach").value) : null,
            }),
          });
          modal.hide();
          ERP.showToast("Subject saved!");
          loadSubjects();
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };

    renderTableWithSearch({
      title: "Subjects",
      addLabel: "Add Subject",
      onAdd: () => showForm(),
      rows,
      filters: [
        { id: "course", label: "Course", getValue: (r) => r.courses?.name },
        { id: "semester", label: "Semester", getValue: (r) => r.semesters?.name },
        { id: "credits", label: "Credits", getValue: (r) => (r.credits != null ? `${r.credits} Credits` : "") },
      ],
      columns: [
        { label: "Code", sortValue: (r) => r.code || "", render: (r) => `<span class="badge bg-info text-dark">${esc(r.code)}</span>` },
        { label: "Subject Name", sortValue: (r) => r.name || "", render: (r) => `<strong>${esc(r.name)}</strong>` },
        { label: "Course", sortValue: (r) => r.courses?.name || "", render: (r) => esc(r.courses?.name || "—") },
        { label: "Teacher", sortValue: (r) => r.teachers?.profiles ? `${r.teachers.profiles.first_name} ${r.teachers.profiles.last_name}` : "Unassigned", render: (r) => r.teachers?.profiles ? esc(`${r.teachers.profiles.first_name} ${r.teachers.profiles.last_name}`) : "Unassigned" },
        { label: "Credits", sortValue: (r) => Number(r.credits) || 0, render: (r) => r.credits },
        {
          label: "Actions",
          render: (r) => `
            <button class="btn btn-sm btn-outline-primary me-1" data-edit="${r.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${r.id}">Delete</button>`,
        },
      ],
      onAction: async (b) => {
        if (b.dataset.edit) return showForm(rows.find((x) => x.id == b.dataset.edit));
        if (b.dataset.del) {
          const item = rows.find((x) => x.id == b.dataset.del);
          const ok = await ERP.confirmAction({
            title: "Delete Subject",
            message: "Are you sure you want to delete this subject?",
            detail: item ? `${item.code} — ${item.name}` : "",
          });
          if (!ok) return;
          try { await ERP.api(`/api/admin/subjects?id=${b.dataset.del}`, { method: "DELETE" }); ERP.showToast("Subject deleted"); loadSubjects(); }
          catch (err) { ERP.showToast(err.message, "danger"); }
        }
      },
    });
  }

  // 5b. ENROLLMENTS
  async function loadEnrollments(signal) {
    const rows = await ERP.cachedApi("/api/admin/enrollments", { signal });
    const showForm = async () => {
      const [students, subjects, semesters] = await Promise.all([
        ERP.cachedApi("/api/admin/students"),
        ERP.cachedApi("/api/admin/subjects"),
        ERP.cachedApi("/api/admin/semesters"),
      ]);
      openModal("Enroll Student in Subject", `
        <form id="enr-form" class="row g-3">
          <div class="col-md-6"><label class="form-label">Student</label>
            <select class="form-select" id="enr-stud" required>
              ${students.map((s) => `<option value="${s.id}">${esc(s.roll_number)} — ${esc(s.profiles?.first_name)} ${esc(s.profiles?.last_name)}</option>`).join("")}
            </select>
          </div>
          <div class="col-md-6"><label class="form-label">Subject</label>
            <select class="form-select" id="enr-sub" required>
              ${subjects.map((sb) => `<option value="${sb.id}">${esc(sb.code)} — ${esc(sb.name)}</option>`).join("")}
            </select>
          </div>
          <div class="col-12"><label class="form-label">Semester (Optional)</label>
            <select class="form-select" id="enr-sem">
              <option value="">— Optional —</option>
              ${semesters.map((sm) => `<option value="${sm.id}">${esc(sm.name)}</option>`).join("")}
            </select>
          </div>
          <div class="col-12 text-end"><button class="btn btn-primary" type="submit">Enroll Student</button></div>
        </form>`);
      document.getElementById("enr-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          await ERP.api("/api/admin/enrollments", {
            method: "POST",
            body: JSON.stringify({
              student_id: Number(document.getElementById("enr-stud").value),
              subject_id: Number(document.getElementById("enr-sub").value),
              semester_id: document.getElementById("enr-sem").value ? Number(document.getElementById("enr-sem").value) : null,
            }),
          });
          modal.hide();
          ERP.showToast("Student enrolled!");
          loadEnrollments();
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };

    renderTableWithSearch({
      title: "Subject Enrollments",
      addLabel: "Enroll Student",
      onAdd: showForm,
      filters: [
        { id: "batch", label: "Batch", getValue: (r) => r.students?.academic_sessions?.name },
        { id: "semester", label: "Semester", getValue: (r) => r.semesters?.name },
        { id: "status", label: "Status", getValue: (r) => (r.semesters ? (r.semesters.is_current ? "Running" : "Completed") : "") },
      ],
      exportFn: (filtered) => {
        ERP.exportCsv(
          "enrollments.csv",
          ["Roll No", "Student", "Batch", "Subject Code", "Subject", "Semester", "Status"],
          filtered.map((r) => [
            r.students?.roll_number,
            `${r.students?.profiles?.first_name || ""} ${r.students?.profiles?.last_name || ""}`.trim(),
            r.students?.academic_sessions?.name || "",
            r.subjects?.code,
            r.subjects?.name,
            r.semesters?.name || "",
            r.semesters ? (r.semesters.is_current ? "Running" : "Completed") : "",
          ])
        );
      },
      rows,
      columns: [
        { label: "Roll No", sortValue: (r) => r.students?.roll_number || "", render: (r) => `<span class="badge bg-dark">${esc(r.students?.roll_number || "—")}</span>` },
        { label: "Student", sortValue: (r) => `${r.students?.profiles?.first_name || ""} ${r.students?.profiles?.last_name || ""}`.trim(), render: (r) => `<strong>${esc(r.students?.profiles?.first_name || "")} ${esc(r.students?.profiles?.last_name || "")}</strong>` },
        { label: "Batch", sortValue: (r) => r.students?.academic_sessions?.name || "", render: (r) => esc(r.students?.academic_sessions?.name || "—") },
        { label: "Subject", sortValue: (r) => `${r.subjects?.code || ""} ${r.subjects?.name || ""}`.trim(), render: (r) => `<span class="badge bg-info text-dark me-1">${esc(r.subjects?.code || "")}</span>${esc(r.subjects?.name || "—")}` },
        { label: "Semester", sortValue: (r) => r.semesters?.semester_number ?? r.semesters?.name ?? "", render: (r) => esc(r.semesters?.name || "—") },
        {
          label: "Status",
          sortValue: (r) => (r.semesters ? (r.semesters.is_current ? "Running" : "Completed") : ""),
          render: (r) => {
            if (!r.semesters) return "—";
            return r.semesters.is_current
              ? '<span class="badge bg-success">Running</span>'
              : '<span class="badge bg-secondary">Completed</span>';
          },
        },
        {
          label: "Actions",
          render: (r) => `<button class="btn btn-sm btn-outline-danger" data-del="${r.id}">Remove</button>`,
        },
      ],
      onAction: async (b) => {
        if (b.dataset.del) {
          const item = rows.find((x) => x.id == b.dataset.del);
          const studName = `${item?.students?.profiles?.first_name || ""} ${item?.students?.profiles?.last_name || ""}`.trim();
          const ok = await ERP.confirmAction({
            title: "Remove Enrollment",
            message: "Are you sure you want to remove this student's enrollment?",
            detail: item ? `${item.students?.roll_number || ""} (${studName}) — ${item.subjects?.code || ""} ${item.subjects?.name || ""}`.trim() : "",
            confirmText: "Yes, Remove",
          });
          if (!ok) return;
          try {
            await ERP.api(`/api/admin/enrollments?id=${b.dataset.del}`, { method: "DELETE" });
            ERP.showToast("Enrollment removed");
            loadEnrollments();
          } catch (err) { ERP.showToast(err.message, "danger"); }
        }
      },
    });
  }

  // 6. TEACHERS
  async function loadTeachers(signal) {
    const [rows, depts] = await Promise.all([
      ERP.cachedApi("/api/admin/teachers", { signal }),
      ERP.cachedApi("/api/admin/departments", { signal }),
    ]);
    const showForm = (item = null) => {
      openModal(item ? "Edit Teacher" : "Add Teacher", `
        <form id="teach-form" class="row g-3">
          <div class="col-md-4"><label class="form-label">First Name</label><input class="form-control" id="t-fn" value="${esc(item?.profiles?.first_name || "")}" required></div>
          <div class="col-md-4"><label class="form-label">Last Name</label><input class="form-control" id="t-ln" value="${esc(item?.profiles?.last_name || "")}" required></div>
          <div class="col-md-4"><label class="form-label">Username</label><input class="form-control" id="t-user" value="${esc(item?.profiles?.username || "")}" placeholder="e.g. prof-smith"></div>
          ${!item ? `
          <div class="col-md-6"><label class="form-label">Email</label><input type="email" class="form-control" id="t-email" required></div>
          <div class="col-md-6"><label class="form-label">Password</label><input type="password" class="form-control" id="t-pw" minlength="6" required></div>` : ""}
          <div class="col-md-4"><label class="form-label">Employee ID</label><input class="form-control" id="t-emp" value="${esc(item?.employee_id || "")}" required></div>
          <div class="col-md-4"><label class="form-label">Department</label>
            <select class="form-select" id="t-dept"><option value="">— Optional —</option>${depts.map((d) => `<option value="${d.id}" ${item?.department_id === d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-4"><label class="form-label">Qualification</label><input class="form-control" id="t-qual" value="${esc(item?.qualification || "")}"></div>
          <div class="col-12 text-end"><button class="btn btn-primary" type="submit">Save Teacher</button></div>
        </form>`);
      document.getElementById("teach-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          const payload = {
            id: item?.id,
            profile_id: item?.profile_id,
            first_name: document.getElementById("t-fn").value.trim(),
            last_name: document.getElementById("t-ln").value.trim(),
            username: document.getElementById("t-user").value.trim(),
            employee_id: document.getElementById("t-emp").value.trim(),
            department_id: document.getElementById("t-dept").value ? Number(document.getElementById("t-dept").value) : null,
            qualification: document.getElementById("t-qual").value.trim(),
          };
          if (!item) {
            payload.email = document.getElementById("t-email").value.trim();
            payload.password = document.getElementById("t-pw").value;
          }
          await ERP.api("/api/admin/teachers", { method: item ? "PUT" : "POST", body: JSON.stringify(payload) });
          modal.hide();
          ERP.showToast("Teacher saved!");
          loadTeachers();
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };

    renderTableWithSearch({
      title: "Teachers & Faculty",
      addLabel: "Add Teacher",
      onAdd: () => showForm(),
      rows,
      filters: [
        { id: "department", label: "Department", getValue: (r) => r.departments?.name },
      ],
      columns: [
        { label: "Emp ID", sortValue: (r) => r.employee_id || "", render: (r) => `<span class="badge bg-secondary">${esc(r.employee_id)}</span>` },
        { label: "Name", sortValue: (r) => `${r.profiles?.first_name || ""} ${r.profiles?.last_name || ""}`.trim(), render: (r) => `<strong>${esc(r.profiles?.first_name)} ${esc(r.profiles?.last_name)}</strong>` },
        { label: "Email", sortValue: (r) => r.profiles?.email || "", render: (r) => esc(r.profiles?.email) },
        { label: "Department", sortValue: (r) => r.departments?.name || "", render: (r) => esc(r.departments?.name || "—") },
        { label: "Qualification", sortValue: (r) => r.qualification || "", render: (r) => esc(r.qualification || "—") },
        {
          label: "Actions",
          render: (r) => `
            <button class="btn btn-sm btn-outline-primary me-1" data-edit="${r.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${r.profile_id}">Delete</button>`,
        },
      ],
      onAction: async (b) => {
        if (b.dataset.edit) return showForm(rows.find((x) => x.id == b.dataset.edit));
        if (b.dataset.del) {
          const item = rows.find((x) => x.profile_id == b.dataset.del);
          const ok = await ERP.confirmAction({
            title: "Delete Teacher Account",
            message: "Are you sure you want to permanently delete this teacher account?",
            detail: item ? `${item.employee_id} — ${item.profiles?.first_name || ""} ${item.profiles?.last_name || ""}`.trim() : "",
          });
          if (!ok) return;
          try { await ERP.api(`/api/admin/teachers?profile_id=${b.dataset.del}`, { method: "DELETE" }); ERP.showToast("Teacher deleted"); loadTeachers(); }
          catch (err) { ERP.showToast(err.message, "danger"); }
        }
      },
    });
  }

  // 7. STUDENTS
  async function loadStudents(signal) {
    const [rows, courses, sessions, semesters] = await Promise.all([
      ERP.cachedApi("/api/admin/students", { signal }),
      ERP.cachedApi("/api/admin/courses", { signal }),
      ERP.cachedApi("/api/admin/sessions", { signal }),
      ERP.cachedApi("/api/admin/semesters", { signal }),
    ]);

    const showForm = (item = null) => {
      openModal(item ? "Edit Student" : "Add Student", `
        <form id="stud-form" class="row g-3">
          <div class="col-md-4"><label class="form-label">First Name</label><input class="form-control" id="st-fn" value="${esc(item?.profiles?.first_name || "")}" required></div>
          <div class="col-md-4"><label class="form-label">Last Name</label><input class="form-control" id="st-ln" value="${esc(item?.profiles?.last_name || "")}" required></div>
          <div class="col-md-4"><label class="form-label">Username</label><input class="form-control" id="st-user" value="${esc(item?.profiles?.username || "")}" placeholder="e.g. john-doe"></div>
          ${!item ? `
          <div class="col-md-6"><label class="form-label">Email</label><input type="email" class="form-control" id="st-email" required></div>
          <div class="col-md-6"><label class="form-label">Password <small class="text-muted">(default: student@prstu)</small></label><input type="password" class="form-control" id="st-pw" minlength="6" value="student@prstu" placeholder="student@prstu"></div>` : ""}
          <div class="col-md-3"><label class="form-label">Roll Number</label><input class="form-control" id="st-roll" value="${esc(item?.roll_number || "")}" required></div>
          <div class="col-md-3"><label class="form-label">Course</label>
            <select class="form-select" id="st-course"><option value="">— Select —</option>${courses.map((c) => `<option value="${c.id}" ${item?.course_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-3"><label class="form-label">Session</label>
            <select class="form-select" id="st-sess"><option value="">— Select —</option>${sessions.map((s) => `<option value="${s.id}" ${item?.session_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-3"><label class="form-label">Semester</label>
            <select class="form-select" id="st-sem"><option value="">— Select —</option>${semesters.map((s) => `<option value="${s.id}" ${item?.semester_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
          </div>
          <div class="col-12 text-end"><button class="btn btn-primary" type="submit">Save Student</button></div>
        </form>`);
      document.getElementById("stud-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          const payload = {
            id: item?.id,
            profile_id: item?.profile_id,
            first_name: document.getElementById("st-fn").value.trim(),
            last_name: document.getElementById("st-ln").value.trim(),
            username: document.getElementById("st-user").value.trim(),
            roll_number: document.getElementById("st-roll").value.trim(),
            course_id: document.getElementById("st-course").value ? Number(document.getElementById("st-course").value) : null,
            session_id: document.getElementById("st-sess").value ? Number(document.getElementById("st-sess").value) : null,
            semester_id: document.getElementById("st-sem").value ? Number(document.getElementById("st-sem").value) : null,
          };
          if (!item) {
            payload.email = document.getElementById("st-email").value.trim();
            payload.password = document.getElementById("st-pw").value;
          }
          await ERP.api("/api/admin/students", { method: item ? "PUT" : "POST", body: JSON.stringify(payload) });
          modal.hide();
          ERP.showToast("Student saved!");
          loadStudents();
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };

    renderTableWithSearch({
      title: "Students",
      addLabel: "Add Student",
      onAdd: () => showForm(),
      filters: [
        { id: "course", label: "Course", getValue: (r) => r.courses?.name },
        { id: "session", label: "Session", getValue: (r) => r.academic_sessions?.name },
        { id: "semester", label: "Semester", getValue: (r) => r.semesters?.name },
      ],
      exportFn: (filtered) => {
        ERP.exportCsv(
          "students.csv",
          ["Roll Number", "First Name", "Last Name", "Email", "Course", "Session", "Semester"],
          filtered.map((r) => [r.roll_number, r.profiles?.first_name, r.profiles?.last_name, r.profiles?.email, r.courses?.name, r.academic_sessions?.name, r.semesters?.name || ""])
        );
      },
      rows,
      columns: [
        { label: "Roll No", sortValue: (r) => r.roll_number || "", render: (r) => `<span class="badge bg-dark">${esc(r.roll_number)}</span>` },
        { label: "Name", sortValue: (r) => `${r.profiles?.first_name || ""} ${r.profiles?.last_name || ""}`.trim(), render: (r) => `<strong>${esc(r.profiles?.first_name)} ${esc(r.profiles?.last_name)}</strong>` },
        { label: "Email", sortValue: (r) => r.profiles?.email || "", render: (r) => esc(r.profiles?.email) },
        { label: "Course", sortValue: (r) => r.courses?.name || "", render: (r) => esc(r.courses?.name || "—") },
        { label: "Session", sortValue: (r) => r.academic_sessions?.name || "", render: (r) => esc(r.academic_sessions?.name || "—") },
        { label: "Semester", sortValue: (r) => r.semesters?.name || "", render: (r) => esc(r.semesters?.name || "—") },
        {
          label: "Actions",
          render: (r) => `
            <button class="btn btn-sm btn-outline-primary me-1" data-edit="${r.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${r.profile_id}">Delete</button>`,
        },
      ],
      onAction: async (b) => {
        if (b.dataset.edit) return showForm(rows.find((x) => x.id == b.dataset.edit));
        if (b.dataset.del) {
          const item = rows.find((x) => x.profile_id == b.dataset.del);
          const ok = await ERP.confirmAction({
            title: "Delete Student Account",
            message: "Are you sure you want to permanently delete this student account and all linked records?",
            detail: item ? `${item.roll_number} — ${item.profiles?.first_name || ""} ${item.profiles?.last_name || ""}`.trim() : "",
          });
          if (!ok) return;
          try { await ERP.api(`/api/admin/students?profile_id=${b.dataset.del}`, { method: "DELETE" }); ERP.showToast("Student deleted"); loadStudents(); }
          catch (err) { ERP.showToast(err.message, "danger"); }
        }
      },
    });
  }

  // 8. ATTENDANCE VIEW (lazy incremental session rendering)
  async function loadAttendance(signal) {
    const [sessionsList, subjects, academicSessions] = await Promise.all([
      ERP.cachedApi("/api/admin/attendance", { signal }),
      ERP.cachedApi("/api/admin/subjects", { signal }),
      ERP.cachedApi("/api/admin/sessions", { signal }),
    ]);
    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h5 class="fw-bold mb-0">Attendance Records</h5>
          <div class="d-flex flex-wrap gap-2">
            <input type="search" id="att-search" class="form-control form-control-sm" style="width: 190px;" placeholder="Search topic, teacher, roll...">
            <select id="att-sub-filter" class="form-select form-select-sm" style="width: 200px;">
              <option value="">All Subjects</option>
              ${subjects.map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.code)})</option>`).join("")}
            </select>
            <select id="att-sess-filter" class="form-select form-select-sm" style="width: 160px;">
              <option value="">All Sessions</option>
              ${academicSessions.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}
            </select>
            <select id="att-sort" class="form-select form-select-sm" style="width: 185px;">
              <option value="date:desc">Sort: Newest Date</option>
              <option value="date:asc">Sort: Oldest Date</option>
              <option value="pct:desc">Sort: Attendance % (High-Low)</option>
              <option value="pct:asc">Sort: Attendance % (Low-High)</option>
            </select>
          </div>
        </div>
        <div id="att-list"></div>
        <div id="att-more-wrap" class="text-center mt-2"></div>
      </div>`;

    let activeObserver = null;
    const drawList = (items) => {
      if (activeObserver) activeObserver.disconnect();
      const box = document.getElementById("att-list");
      const moreWrap = document.getElementById("att-more-wrap");
      if (items.length === 0) {
        box.innerHTML = `<div class="text-center text-muted py-4">No attendance sessions recorded yet.</div>`;
        moreWrap.innerHTML = "";
        return;
      }
      const BATCH = 25;
      let rendered = 0;
      box.innerHTML = "";

      const renderNextBatch = () => {
        const slice = items.slice(rendered, rendered + BATCH);
        if (slice.length === 0) return;
        const html = slice.map((s) => {
          const recs = s.attendance_records || [];
          const present = recs.filter((r) => r.status === "present" || r.status === "late").length;
          return `
            <div class="border rounded p-3 mb-3">
              <div class="d-flex flex-wrap justify-content-between align-items-center mb-2">
                <div>
                  <strong>${esc(s.subjects?.name)}</strong> (${esc(s.subjects?.code)})
                  <span class="text-muted ms-2">${esc(s.attendance_date)}</span>
                </div>
                <span class="badge bg-primary">${present}/${recs.length} Present</span>
              </div>
              <div class="small text-muted mb-2">Topic: ${esc(s.topic || "—")} &bull; Teacher: ${esc(s.teachers?.profiles?.first_name || "")} ${esc(s.teachers?.profiles?.last_name || "")}</div>
              <div class="d-flex flex-wrap gap-1">
                ${recs.map((r) => `<span class="badge ${r.status === "present" ? "bg-success-subtle text-success" : r.status === "late" ? "bg-warning-subtle text-warning" : "bg-danger-subtle text-danger"}">${esc(r.students?.roll_number)}: ${esc(r.status)}</span>`).join("")}
              </div>
            </div>`;
        }).join("");
        box.insertAdjacentHTML("beforeend", html);
        rendered += slice.length;

        if (rendered < items.length) {
          moreWrap.innerHTML = `<button id="att-load-more" class="btn btn-outline-primary btn-sm">Load More (${items.length - rendered} remaining)</button>`;
          const btn = document.getElementById("att-load-more");
          btn.onclick = renderNextBatch;
          if ("IntersectionObserver" in window) {
            activeObserver = new IntersectionObserver((entries) => {
              if (entries[0]?.isIntersecting) {
                activeObserver.disconnect();
                renderNextBatch();
              }
            }, { rootMargin: "120px" });
            activeObserver.observe(btn);
          }
        } else {
          moreWrap.innerHTML = `<small class="text-muted">Showing all ${items.length} sessions</small>`;
        }
      };

      renderNextBatch();
    };

    let currentAttItems = sessionsList;
    const pctOf = (s) => {
      const recs = s.attendance_records || [];
      if (recs.length === 0) return -1;
      const present = recs.filter((r) => r.status === "present" || r.status === "late").length;
      return present / recs.length;
    };
    const applyAttControls = () => {
      const q = document.getElementById("att-search").value.trim().toLowerCase();
      const sessId = document.getElementById("att-sess-filter").value;
      const sortVal = document.getElementById("att-sort").value;
      let list = currentAttItems;
      if (sessId) list = list.filter((s) => String(s.session_id || s.academic_sessions?.id || "") === sessId);
      if (q) list = list.filter((s) => JSON.stringify(s).toLowerCase().includes(q));
      if (sortVal === "date:asc") list = ERP.sortRows(list, (s) => s.attendance_date || "", "asc");
      else if (sortVal === "date:desc") list = ERP.sortRows(list, (s) => s.attendance_date || "", "desc");
      else if (sortVal === "pct:desc") list = ERP.sortRows(list, pctOf, "desc");
      else if (sortVal === "pct:asc") list = ERP.sortRows(list, pctOf, "asc");
      drawList(list);
    };

    applyAttControls();
    document.getElementById("att-sub-filter").onchange = async (e) => {
      const sid = e.target.value;
      currentAttItems = await ERP.cachedApi(sid ? `/api/admin/attendance?subject_id=${sid}` : "/api/admin/attendance", { signal });
      applyAttControls();
    };
    document.getElementById("att-sess-filter").onchange = applyAttControls;
    document.getElementById("att-sort").onchange = applyAttControls;
    document.getElementById("att-search").oninput = applyAttControls;
  }

  // 9. EXAMS & RESULTS
  async function loadResults(signal) {
    const [exams, results, sessions] = await Promise.all([
      ERP.cachedApi("/api/admin/examinations", { signal }),
      ERP.cachedApi("/api/admin/results", { signal }),
      ERP.cachedApi("/api/admin/sessions", { signal }),
    ]);

    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4 mb-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold mb-0">Examinations</h5>
          <button id="add-exam-btn" class="btn btn-primary btn-sm"><i data-lucide="plus" class="me-1"></i>Create Examination</button>
        </div>
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead><tr><th>Name</th><th>Type</th><th>Session</th><th>Date</th><th>Max Marks</th><th>Actions</th></tr></thead>
            <tbody>
              ${exams.map((ex) => `
                <tr>
                  <td><strong>${esc(ex.name)}</strong></td>
                  <td><span class="badge bg-secondary text-uppercase">${esc(ex.exam_type)}</span></td>
                  <td>${esc(ex.academic_sessions?.name || "—")}</td>
                  <td>${esc(ex.exam_date || "—")}</td>
                  <td>${ex.max_marks}</td>
                  <td>
                    <button class="btn btn-sm btn-outline-primary me-1" data-edit-exam="${ex.id}">Edit</button>
                    <button class="btn btn-sm btn-outline-danger" data-del-exam="${ex.id}">Delete</button>
                  </td>
                </tr>`).join("") || `<tr><td colspan="6" class="text-center text-muted">No examinations yet</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div id="admin-res-wrap"></div>`;

    ERP.renderDataTable(document.getElementById("admin-res-wrap"), {
      title: "Published Results",
      addLabel: "Enter Result",
      onAdd: () => openResultModal(),
      searchPlaceholder: "Filter results...",
      rows: results,
      filters: [
        { id: "exam", label: "Examination", getValue: (r) => r.examinations?.name },
        { id: "subject", label: "Subject", getValue: (r) => r.subjects?.name },
        { id: "grade", label: "Grade", getValue: (r) => r.grade },
      ],
      exportFn: (filtered) => {
        ERP.exportCsv(
          "results.csv",
          ["Roll No", "Student", "Subject", "Examination", "Marks", "Max Marks", "Grade"],
          filtered.map((r) => [r.students?.roll_number, `${r.students?.profiles?.first_name} ${r.students?.profiles?.last_name}`, r.subjects?.name, r.examinations?.name, r.marks_obtained, r.max_marks, r.grade])
        );
      },
      columns: [
        { label: "Roll No", sortValue: (r) => r.students?.roll_number || "", render: (r) => esc(r.students?.roll_number) },
        { label: "Student", sortValue: (r) => `${r.students?.profiles?.first_name || ""} ${r.students?.profiles?.last_name || ""}`.trim(), render: (r) => `${esc(r.students?.profiles?.first_name)} ${esc(r.students?.profiles?.last_name)}` },
        { label: "Subject", sortValue: (r) => r.subjects?.name || "", render: (r) => esc(r.subjects?.name) },
        { label: "Exam", sortValue: (r) => r.examinations?.name || "", render: (r) => esc(r.examinations?.name) },
        { label: "Marks", sortValue: (r) => Number(r.marks_obtained), render: (r) => `${r.marks_obtained} / ${r.max_marks}` },
        { label: "Grade", sortValue: (r) => r.grade || "", render: (r) => `<span class="badge bg-primary">${esc(r.grade)}</span>` },
        {
          label: "Actions",
          render: (r) => `
            <button class="btn btn-sm btn-outline-primary me-1" data-edit-res="${r.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-del-res="${r.id}">Delete</button>`,
        },
      ],
      onAction: async (b) => {
        if (b.dataset.editRes) return openResultModal(results.find((x) => x.id == b.dataset.editRes));
        if (b.dataset.delRes) {
          const item = results.find((x) => x.id == b.dataset.delRes);
          const ok = await ERP.confirmAction({
            title: "Delete Examination Result",
            message: "Are you sure you want to delete this examination result?",
            detail: item ? `${item.students?.roll_number || ""} — ${item.subjects?.name || ""} (${item.examinations?.name || ""})` : "",
          });
          if (!ok) return;
          try {
            await ERP.api(`/api/admin/results?id=${b.dataset.delRes}`, { method: "DELETE" });
            ERP.showToast("Result deleted");
            loadResults();
          } catch (err) { ERP.showToast(err.message, "danger"); }
        }
      },
      emptyMessage: "No results entered yet",
    });

    const openExamModal = (item = null) => {
      openModal(item ? "Edit Examination" : "Create Examination", `
        <form id="exam-form" class="row g-3">
          <div class="col-md-6"><label class="form-label">Exam Name</label><input class="form-control" id="ex-name" value="${esc(item?.name || "")}" placeholder="Midterm Fall 2026" required></div>
          <div class="col-md-3"><label class="form-label">Type</label>
            <select class="form-select" id="ex-type">
              ${["internal", "midterm", "final", "practical"].map((t) => `<option value="${t}" ${(item?.exam_type || "final") === t ? "selected" : ""}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join("")}
            </select>
          </div>
          <div class="col-md-3"><label class="form-label">Max Marks</label><input type="number" class="form-control" id="ex-max" value="${item?.max_marks || 100}" required></div>
          <div class="col-md-6"><label class="form-label">Session</label>
            <select class="form-select" id="ex-sess" required>${sessions.map((s) => `<option value="${s.id}" ${item?.session_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-6"><label class="form-label">Date</label><input type="date" class="form-control" id="ex-date" value="${esc(item?.exam_date || "")}"></div>
          <div class="col-12 text-end"><button class="btn btn-primary" type="submit">${item ? "Save Examination" : "Create Exam"}</button></div>
        </form>`);
      document.getElementById("exam-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          await ERP.api("/api/admin/examinations", {
            method: item ? "PUT" : "POST",
            body: JSON.stringify({
              id: item?.id,
              name: document.getElementById("ex-name").value.trim(),
              exam_type: document.getElementById("ex-type").value,
              max_marks: Number(document.getElementById("ex-max").value),
              session_id: Number(document.getElementById("ex-sess").value),
              exam_date: document.getElementById("ex-date").value || null,
            }),
          });
          modal.hide();
          ERP.showToast(item ? "Examination updated!" : "Examination created!");
          loadResults();
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };

    const openResultModal = async (item = null) => {
      const [students, subjects] = await Promise.all([
        ERP.cachedApi("/api/admin/students"),
        ERP.cachedApi("/api/admin/subjects"),
      ]);
      openModal(item ? "Edit Result" : "Enter Result", `
        <form id="admin-res-form" class="row g-3">
          <div class="col-md-6"><label class="form-label">Examination</label>
            <select class="form-select" id="ar-exam" required>${exams.map((ex) => `<option value="${ex.id}" ${item?.examination_id === ex.id ? "selected" : ""}>${esc(ex.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-6"><label class="form-label">Subject</label>
            <select class="form-select" id="ar-sub" required>${subjects.map((sb) => `<option value="${sb.id}" ${item?.subject_id === sb.id ? "selected" : ""}>${esc(sb.code)} — ${esc(sb.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-6"><label class="form-label">Student</label>
            <select class="form-select" id="ar-stud" required>${students.map((st) => `<option value="${st.id}" ${item?.student_id === st.id ? "selected" : ""}>${esc(st.roll_number)} — ${esc(st.profiles?.first_name)} ${esc(st.profiles?.last_name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-3"><label class="form-label">Marks</label><input type="number" step="0.5" min="0" class="form-control" id="ar-marks" value="${item?.marks_obtained ?? ""}" required></div>
          <div class="col-md-3"><label class="form-label">Max Marks</label><input type="number" step="0.5" min="1" class="form-control" id="ar-max" value="${item?.max_marks ?? 100}" required></div>
          <div class="col-12"><label class="form-label">Remarks</label><input type="text" class="form-control" id="ar-rem" value="${esc(item?.remarks || "")}"></div>
          <div class="col-12 text-end"><button class="btn btn-primary" type="submit">Save Result</button></div>
        </form>`);
      document.getElementById("admin-res-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          await ERP.api("/api/admin/results", {
            method: item ? "PUT" : "POST",
            body: JSON.stringify({
              examination_id: Number(document.getElementById("ar-exam").value),
              subject_id: Number(document.getElementById("ar-sub").value),
              student_id: Number(document.getElementById("ar-stud").value),
              marks_obtained: Number(document.getElementById("ar-marks").value),
              max_marks: Number(document.getElementById("ar-max").value),
              remarks: document.getElementById("ar-rem").value.trim(),
            }),
          });
          modal.hide();
          ERP.showToast("Result saved!");
          loadResults();
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };

    document.getElementById("add-exam-btn").onclick = () => openExamModal();

    main.querySelectorAll("[data-edit-exam]").forEach((b) => (b.onclick = () => openExamModal(exams.find((x) => x.id == b.dataset.editExam))));
    main.querySelectorAll("[data-del-exam]").forEach((b) => (b.onclick = async () => {
      const item = exams.find((x) => x.id == b.dataset.delExam);
      const ok = await ERP.confirmAction({
        title: "Delete Examination",
        message: "Are you sure you want to delete this examination?",
        detail: item ? `${item.name} (${item.exam_type || ""})` : "",
      });
      if (!ok) return;
      try { await ERP.api(`/api/admin/examinations?id=${b.dataset.delExam}`, { method: "DELETE" }); ERP.showToast("Examination deleted"); loadResults(); }
      catch (err) { ERP.showToast(err.message, "danger"); }
    }));
  }

  // 10. LEAVES
  async function loadLeaves(signal) {
    const rows = await ERP.cachedApi("/api/admin/leaves", { signal });
    renderTableWithSearch({
      title: "Leave Applications",
      rows,
      filters: [
        { id: "role", label: "Role", getValue: (r) => r.applicant_role },
        { id: "status", label: "Status", getValue: (r) => r.status },
      ],
      columns: [
        { label: "Applicant", sortValue: (r) => `${r.applicant?.first_name || ""} ${r.applicant?.last_name || ""}`.trim(), render: (r) => `<strong>${esc(r.applicant?.first_name)} ${esc(r.applicant?.last_name)}</strong><br><small class="text-muted">${esc(r.applicant_role)}</small>` },
        { label: "Dates", sortValue: (r) => r.start_date || "", render: (r) => `${esc(r.start_date)} to ${esc(r.end_date)}` },
        { label: "Reason", render: (r) => esc(r.reason) },
        { label: "Status", sortValue: (r) => r.status || "", render: (r) => ERP.statusBadge(r.status) },
        {
          label: "Action",
          render: (r) =>
            r.status === "pending"
              ? `<button class="btn btn-sm btn-success me-1" data-lv="${r.id}" data-st="approved">Approve</button>
                 <button class="btn btn-sm btn-danger" data-lv="${r.id}" data-st="rejected">Reject</button>`
              : `<small class="text-muted">${esc(r.review_note || "Reviewed")}</small>`,
        },
      ],
      onAction: async (b) => {
        if (!b.dataset.lv) return;
        const item = rows.find((x) => x.id == b.dataset.lv);
        const status = b.dataset.st;
        const applicantName = `${item?.applicant?.first_name || ""} ${item?.applicant?.last_name || ""}`.trim();
        openModal(`${status === "approved" ? "Approve" : "Reject"} Leave Application`, `
          <form id="leave-review-form" class="row g-3">
            <div class="col-12 small text-muted">
              Applicant: <strong>${esc(applicantName || "—")}</strong> (${esc(item?.start_date || "")} to ${esc(item?.end_date || "")})
            </div>
            <div class="col-12">
              <label class="form-label">Review Note (Optional)</label>
              <textarea id="lv-note" class="form-control" rows="2" placeholder="Add an optional note..."></textarea>
            </div>
            <div class="col-12 text-end">
              <button type="button" class="btn btn-light me-1" data-bs-dismiss="modal">Cancel</button>
              <button class="btn btn-${status === "approved" ? "success" : "danger"}" type="submit">${status === "approved" ? "Approve Leave" : "Reject Leave"}</button>
            </div>
          </form>`);
        document.getElementById("leave-review-form").onsubmit = async (e) => {
          e.preventDefault();
          const note = document.getElementById("lv-note").value.trim();
          try {
            await ERP.api("/api/admin/leaves", {
              method: "PATCH",
              body: JSON.stringify({ id: Number(b.dataset.lv), status, review_note: note }),
            });
            modal.hide();
            ERP.showToast(`Leave ${status}!`);
            loadLeaves();
          } catch (err) { ERP.showToast(err.message, "danger"); }
        };
      },
    });
  }

  // 11. FEEDBACK
  async function loadFeedback(signal) {
    const rows = await ERP.cachedApi("/api/admin/feedback", { signal });
    renderTableWithSearch({
      title: "Student & Teacher Feedback",
      rows,
      filters: [
        { id: "role", label: "Role", getValue: (r) => r.sender_role },
        { id: "replied", label: "Reply Status", getValue: (r) => (r.reply ? "Replied" : "Pending Reply") },
      ],
      columns: [
        { label: "Sender", sortValue: (r) => `${r.sender?.first_name || ""} ${r.sender?.last_name || ""}`.trim(), render: (r) => `<strong>${esc(r.sender?.first_name)} ${esc(r.sender?.last_name)}</strong><br><small class="text-muted">${esc(r.sender_role)}</small>` },
        { label: "Subject", sortValue: (r) => r.subject || "", render: (r) => esc(r.subject) },
        { label: "Message", render: (r) => esc(r.message) },
        { label: "Reply", render: (r) => r.reply ? `<span class="text-success">${esc(r.reply)}</span>` : `<span class="text-muted">No reply yet</span>` },
        { label: "Action", render: (r) => `<button class="btn btn-sm btn-outline-primary" data-fb="${r.id}">Reply</button>` },
      ],
      onAction: async (b) => {
        if (!b.dataset.fb) return;
        const item = rows.find((x) => x.id == b.dataset.fb);
        openModal("Reply to Feedback", `
          <form id="fb-reply-form" class="row g-3">
            <div class="col-12 small text-muted">
              Subject: <strong>${esc(item?.subject || "")}</strong>
            </div>
            <div class="col-12">
              <label class="form-label">Reply Message</label>
              <textarea id="fb-reply-text" class="form-control" rows="3" required placeholder="Write your reply...">${esc(item?.reply || "")}</textarea>
            </div>
            <div class="col-12 text-end">
              <button type="button" class="btn btn-light me-1" data-bs-dismiss="modal">Cancel</button>
              <button class="btn btn-primary" type="submit">Send Reply</button>
            </div>
          </form>`);
        document.getElementById("fb-reply-form").onsubmit = async (e) => {
          e.preventDefault();
          const reply = document.getElementById("fb-reply-text").value.trim();
          if (!reply) return;
          try {
            await ERP.api("/api/admin/feedback", { method: "PATCH", body: JSON.stringify({ id: Number(b.dataset.fb), reply }) });
            modal.hide();
            ERP.showToast("Reply sent!");
            loadFeedback();
          } catch (err) { ERP.showToast(err.message, "danger"); }
        };
      },
    });
  }

  // 12. SEND NOTICE
  function loadNotificationsForm() {
    main.innerHTML = `
      <div class="card panel-card p-4" style="max-width: 600px;">
        <h5 class="fw-bold mb-3"><i data-lucide="megaphone" class="me-2 text-primary"></i>Broadcast In-App Notice</h5>
        <form id="notif-form" class="row g-3">
          <div class="col-12"><label class="form-label">Target Audience</label>
            <select id="n-role" class="form-select">
              <option value="student">All Students</option>
              <option value="teacher">All Teachers</option>
            </select>
          </div>
          <div class="col-12"><label class="form-label">Title</label><input id="n-title" class="form-control" value="University ERP Notice" required></div>
          <div class="col-12"><label class="form-label">Message</label><textarea id="n-msg" class="form-control" rows="3" required placeholder="Write announcement..."></textarea></div>
          <div class="col-12"><button class="btn btn-primary" type="submit">Send Notification</button></div>
        </form>
      </div>`;
    document.getElementById("notif-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const res = await ERP.api("/api/admin/notifications", {
          method: "POST",
          body: JSON.stringify({
            target_role: document.getElementById("n-role").value,
            title: document.getElementById("n-title").value.trim(),
            message: document.getElementById("n-msg").value.trim(),
          }),
        });
        ERP.showToast(`Sent to ${res.sent} recipient(s)!`);
        document.getElementById("n-msg").value = "";
      } catch (err) { ERP.showToast(err.message, "danger"); }
    };
  }

  const tabHandlers = {
    overview: loadOverview,
    departments: loadDepartments,
    courses: loadCourses,
    sessions: loadSessions,
    subjects: loadSubjects,
    enrollments: loadEnrollments,
    teachers: loadTeachers,
    students: loadStudents,
    attendance: loadAttendance,
    results: loadResults,
    leaves: loadLeaves,
    feedback: loadFeedback,
    notifications: loadNotificationsForm,
    profile: async () => {
      await ERP.loadProfileWidget();
      window.renderProfileView(main, userData);
    },
  };

  const switchTab = ERP.createTabRunner(main, tabHandlers);
  const initialTab = ERP.getInitialTab(navItems);

  ERP.renderShell({
    title: "Overview",
    roleLabel: "Admin / HOD",
    navItems,
    user: userData,
    initialTab,
    onTabChange: (tabId) => switchTab(tabId),
  });

  if (initialTab === "overview") {
    const prefetchedStats = await statsBoot;
    loadOverview(null, prefetchedStats);
  } else {
    switchTab(initialTab);
  }
})();

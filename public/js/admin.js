/**
 * Admin / HOD Dashboard Controller.
 * Covers: Overview + Charts, Departments, Courses, Sessions & Semesters,
 * Subjects, Teachers, Students, Enrollments, Attendance View, Exams & Results,
 * Leave Approvals, Feedback Replies, In-App Notifications, and Profile.
 */

(async () => {
  const userData = await ERP.requireAuth("admin");
  if (!userData) return;

  const main = document.getElementById("main-content");
  const esc = ERP.escapeHtml;
  const modalEl = document.getElementById("adminModal");
  const modal = new bootstrap.Modal(modalEl);
  const modalTitle = document.getElementById("adminModalTitle");
  const modalBody = document.getElementById("adminModalBody");

  const navItems = [
    { id: "overview", label: "Overview", icon: "bi-speedometer2" },
    { id: "departments", label: "Departments", icon: "bi-building" },
    { id: "courses", label: "Courses", icon: "bi-book" },
    { id: "sessions", label: "Sessions & Semesters", icon: "bi-calendar-range" },
    { id: "subjects", label: "Subjects", icon: "bi-journal-text" },
    { id: "teachers", label: "Teachers", icon: "bi-person-workspace" },
    { id: "students", label: "Students", icon: "bi-people" },
    { id: "attendance", label: "Attendance Reports", icon: "bi-check2-square" },
    { id: "results", label: "Exams & Results", icon: "bi-award" },
    { id: "leaves", label: "Leave Applications", icon: "bi-calendar-x" },
    { id: "feedback", label: "Feedback", icon: "bi-chat-left-text" },
    { id: "notifications", label: "Send Notice", icon: "bi-megaphone" },
    { id: "profile", label: "My Profile", icon: "bi-person-circle" },
  ];

  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.show();
  }

  function renderTableWithSearch({ title, addLabel, onAdd, exportFn, columns, rows, searchPlaceholder = "Search..." }) {
    let query = "";
    let page = 1;
    const pageSize = 10;

    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h5 class="fw-bold mb-0">${esc(title)}</h5>
          <div class="d-flex flex-wrap gap-2">
            <input type="search" id="tbl-search" class="form-control form-control-sm" style="width: 220px;" placeholder="${esc(searchPlaceholder)}">
            ${exportFn ? `<button id="tbl-export" class="btn btn-outline-success btn-sm"><i class="bi bi-download me-1"></i>CSV</button>` : ""}
            ${addLabel ? `<button id="tbl-add" class="btn btn-primary btn-sm"><i class="bi bi-plus-lg me-1"></i>${esc(addLabel)}</button>` : ""}
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-2">
            <thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
            <tbody id="tbl-body"></tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-2">
          <small id="tbl-info" class="text-muted"></small>
          <div id="tbl-pager" class="btn-group btn-group-sm"></div>
        </div>
      </div>`;

    if (onAdd) document.getElementById("tbl-add").onclick = onAdd;
    if (exportFn) document.getElementById("tbl-export").onclick = () => exportFn(getFiltered());

    function getFiltered() {
      if (!query) return rows;
      const q = query.toLowerCase();
      return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    }

    function draw() {
      const filtered = getFiltered();
      const paged = ERP.paginate(filtered, page, pageSize);
      const tbody = document.getElementById("tbl-body");
      if (paged.rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}" class="text-center text-muted py-4">No records found</td></tr>`;
      } else {
        tbody.innerHTML = paged.rows
          .map((row) => `<tr>${columns.map((c) => `<td>${c.render(row)}</td>`).join("")}</tr>`)
          .join("");
      }
      document.getElementById("tbl-info").textContent = `Showing ${paged.rows.length} of ${paged.total} records (Page ${paged.page}/${paged.totalPages})`;
      const pager = document.getElementById("tbl-pager");
      pager.innerHTML = `
        <button class="btn btn-outline-secondary" ${paged.page <= 1 ? "disabled" : ""} id="pg-prev">Prev</button>
        <button class="btn btn-outline-secondary" ${paged.page >= paged.totalPages ? "disabled" : ""} id="pg-next">Next</button>`;
      document.getElementById("pg-prev").onclick = () => { page--; draw(); };
      document.getElementById("pg-next").onclick = () => { page++; draw(); };
    }

    document.getElementById("tbl-search").addEventListener("input", (e) => {
      query = e.target.value;
      page = 1;
      draw();
    });

    draw();
  }

  // 1. OVERVIEW
  async function loadOverview() {
    const data = await ERP.api("/api/admin/stats");
    const c = data.counts;
    const cards = [
      { label: "Total Students", val: c.students, icon: "bi-people-fill", bg: "bg-primary-subtle text-primary" },
      { label: "Total Teachers", val: c.teachers, icon: "bi-person-workspace", bg: "bg-success-subtle text-success" },
      { label: "Courses", val: c.courses, icon: "bi-book-fill", bg: "bg-info-subtle text-info" },
      { label: "Subjects", val: c.subjects, icon: "bi-journal-text", bg: "bg-warning-subtle text-warning" },
      { label: "Pending Leaves", val: c.pending_leaves, icon: "bi-calendar-x", bg: "bg-danger-subtle text-danger" },
      { label: "Attendance Sessions", val: c.attendance_sessions, icon: "bi-check2-square", bg: "bg-secondary-subtle text-secondary" },
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

    new Chart(document.getElementById("chart-courses"), {
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

    new Chart(document.getElementById("chart-subjects"), {
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
  async function loadDepartments() {
    const rows = await ERP.api("/api/admin/departments");
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
        { label: "Code", render: (r) => `<span class="badge bg-secondary">${esc(r.code)}</span>` },
        { label: "Name", render: (r) => `<strong>${esc(r.name)}</strong>` },
        { label: "Description", render: (r) => esc(r.description || "—") },
        {
          label: "Actions",
          render: (r) => `
            <button class="btn btn-sm btn-outline-primary me-1" data-edit="${r.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${r.id}">Delete</button>`,
        },
      ],
    });

    main.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => showForm(rows.find((x) => x.id == b.dataset.edit))));
    main.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Delete this department?")) return;
      try {
        await ERP.api(`/api/admin/departments?id=${b.dataset.del}`, { method: "DELETE" });
        ERP.showToast("Department deleted");
        loadDepartments();
      } catch (err) { ERP.showToast(err.message, "danger"); }
    }));
  }

  // 3. COURSES
  async function loadCourses() {
    const [rows, depts] = await Promise.all([ERP.api("/api/admin/courses"), ERP.api("/api/admin/departments")]);
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
      columns: [
        { label: "Code", render: (r) => `<span class="badge bg-primary">${esc(r.code)}</span>` },
        { label: "Course Name", render: (r) => `<strong>${esc(r.name)}</strong>` },
        { label: "Department", render: (r) => esc(r.departments?.name || "—") },
        { label: "Duration", render: (r) => `${r.duration_years} yrs` },
        {
          label: "Actions",
          render: (r) => `
            <button class="btn btn-sm btn-outline-primary me-1" data-edit="${r.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${r.id}">Delete</button>`,
        },
      ],
    });
    main.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => showForm(rows.find((x) => x.id == b.dataset.edit))));
    main.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Delete this course?")) return;
      try {
        await ERP.api(`/api/admin/courses?id=${b.dataset.del}`, { method: "DELETE" });
        ERP.showToast("Course deleted");
        loadCourses();
      } catch (err) { ERP.showToast(err.message, "danger"); }
    }));
  }

  // 4. SESSIONS & SEMESTERS
  async function loadSessions() {
    const [sessions, semesters] = await Promise.all([ERP.api("/api/admin/sessions"), ERP.api("/api/admin/semesters")]);

    main.innerHTML = `
      <div class="row g-4">
        <div class="col-lg-6">
          <div class="card panel-card p-3 p-md-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="fw-bold mb-0">Academic Sessions</h5>
              <button id="add-sess-btn" class="btn btn-primary btn-sm"><i class="bi bi-plus-lg me-1"></i>Add Session</button>
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
              <button id="add-sem-btn" class="btn btn-primary btn-sm"><i class="bi bi-plus-lg me-1"></i>Add Semester</button>
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
      if (!confirm("Delete this session?")) return;
      try { await ERP.api(`/api/admin/sessions?id=${b.dataset.delSess}`, { method: "DELETE" }); loadSessions(); }
      catch (err) { ERP.showToast(err.message, "danger"); }
    }));
    main.querySelectorAll("[data-del-sem]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Delete this semester?")) return;
      try { await ERP.api(`/api/admin/semesters?id=${b.dataset.delSem}`, { method: "DELETE" }); loadSessions(); }
      catch (err) { ERP.showToast(err.message, "danger"); }
    }));
  }

  // 5. SUBJECTS
  async function loadSubjects() {
    const [rows, courses, semesters, teachers] = await Promise.all([
      ERP.api("/api/admin/subjects"),
      ERP.api("/api/admin/courses"),
      ERP.api("/api/admin/semesters"),
      ERP.api("/api/admin/teachers"),
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
      columns: [
        { label: "Code", render: (r) => `<span class="badge bg-info text-dark">${esc(r.code)}</span>` },
        { label: "Subject Name", render: (r) => `<strong>${esc(r.name)}</strong>` },
        { label: "Course", render: (r) => esc(r.courses?.name || "—") },
        { label: "Teacher", render: (r) => r.teachers?.profiles ? esc(`${r.teachers.profiles.first_name} ${r.teachers.profiles.last_name}`) : "Unassigned" },
        { label: "Credits", render: (r) => r.credits },
        {
          label: "Actions",
          render: (r) => `
            <button class="btn btn-sm btn-outline-primary me-1" data-edit="${r.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${r.id}">Delete</button>`,
        },
      ],
    });
    main.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => showForm(rows.find((x) => x.id == b.dataset.edit))));
    main.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Delete this subject?")) return;
      try { await ERP.api(`/api/admin/subjects?id=${b.dataset.del}`, { method: "DELETE" }); loadSubjects(); }
      catch (err) { ERP.showToast(err.message, "danger"); }
    }));
  }

  // 6. TEACHERS
  async function loadTeachers() {
    const [rows, depts] = await Promise.all([ERP.api("/api/admin/teachers"), ERP.api("/api/admin/departments")]);
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
      columns: [
        { label: "Emp ID", render: (r) => `<span class="badge bg-secondary">${esc(r.employee_id)}</span>` },
        { label: "Name", render: (r) => `<strong>${esc(r.profiles?.first_name)} ${esc(r.profiles?.last_name)}</strong>` },
        { label: "Email", render: (r) => esc(r.profiles?.email) },
        { label: "Department", render: (r) => esc(r.departments?.name || "—") },
        { label: "Qualification", render: (r) => esc(r.qualification || "—") },
        {
          label: "Actions",
          render: (r) => `
            <button class="btn btn-sm btn-outline-primary me-1" data-edit="${r.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${r.profile_id}">Delete</button>`,
        },
      ],
    });
    main.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => showForm(rows.find((x) => x.id == b.dataset.edit))));
    main.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Delete this teacher account?")) return;
      try { await ERP.api(`/api/admin/teachers?profile_id=${b.dataset.del}`, { method: "DELETE" }); loadTeachers(); }
      catch (err) { ERP.showToast(err.message, "danger"); }
    }));
  }

  // 7. STUDENTS
  async function loadStudents() {
    const [rows, courses, sessions, semesters] = await Promise.all([
      ERP.api("/api/admin/students"),
      ERP.api("/api/admin/courses"),
      ERP.api("/api/admin/sessions"),
      ERP.api("/api/admin/semesters"),
    ]);

    const showForm = (item = null) => {
      openModal(item ? "Edit Student" : "Add Student", `
        <form id="stud-form" class="row g-3">
          <div class="col-md-4"><label class="form-label">First Name</label><input class="form-control" id="st-fn" value="${esc(item?.profiles?.first_name || "")}" required></div>
          <div class="col-md-4"><label class="form-label">Last Name</label><input class="form-control" id="st-ln" value="${esc(item?.profiles?.last_name || "")}" required></div>
          <div class="col-md-4"><label class="form-label">Username</label><input class="form-control" id="st-user" value="${esc(item?.profiles?.username || "")}" placeholder="e.g. john-doe"></div>
          ${!item ? `
          <div class="col-md-6"><label class="form-label">Email</label><input type="email" class="form-control" id="st-email" required></div>
          <div class="col-md-6"><label class="form-label">Password</label><input type="password" class="form-control" id="st-pw" minlength="6" required></div>` : ""}
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
      exportFn: (filtered) => {
        ERP.exportCsv(
          "students.csv",
          ["Roll Number", "First Name", "Last Name", "Email", "Course", "Session"],
          filtered.map((r) => [r.roll_number, r.profiles?.first_name, r.profiles?.last_name, r.profiles?.email, r.courses?.name, r.academic_sessions?.name])
        );
      },
      rows,
      columns: [
        { label: "Roll No", render: (r) => `<span class="badge bg-dark">${esc(r.roll_number)}</span>` },
        { label: "Name", render: (r) => `<strong>${esc(r.profiles?.first_name)} ${esc(r.profiles?.last_name)}</strong>` },
        { label: "Email", render: (r) => esc(r.profiles?.email) },
        { label: "Course", render: (r) => esc(r.courses?.name || "—") },
        { label: "Session", render: (r) => esc(r.academic_sessions?.name || "—") },
        {
          label: "Actions",
          render: (r) => `
            <button class="btn btn-sm btn-outline-primary me-1" data-edit="${r.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${r.profile_id}">Delete</button>`,
        },
      ],
    });
    main.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => showForm(rows.find((x) => x.id == b.dataset.edit))));
    main.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Delete this student account?")) return;
      try { await ERP.api(`/api/admin/students?profile_id=${b.dataset.del}`, { method: "DELETE" }); loadStudents(); }
      catch (err) { ERP.showToast(err.message, "danger"); }
    }));
  }

  // 8. ATTENDANCE VIEW
  async function loadAttendance() {
    const [sessionsList, subjects] = await Promise.all([ERP.api("/api/admin/attendance"), ERP.api("/api/admin/subjects")]);
    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h5 class="fw-bold mb-0">Attendance Records</h5>
          <div class="d-flex gap-2">
            <select id="att-sub-filter" class="form-select form-select-sm" style="width: 220px;">
              <option value="">All Subjects</option>
              ${subjects.map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.code)})</option>`).join("")}
            </select>
          </div>
        </div>
        <div id="att-list"></div>
      </div>`;

    const drawList = (items) => {
      const box = document.getElementById("att-list");
      if (items.length === 0) {
        box.innerHTML = `<div class="text-center text-muted py-4">No attendance sessions recorded yet.</div>`;
        return;
      }
      box.innerHTML = items.map((s) => {
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
    };

    drawList(sessionsList);
    document.getElementById("att-sub-filter").onchange = async (e) => {
      const sid = e.target.value;
      const filtered = await ERP.api(sid ? `/api/admin/attendance?subject_id=${sid}` : "/api/admin/attendance");
      drawList(filtered);
    };
  }

  // 9. EXAMS & RESULTS
  async function loadResults() {
    const [exams, results, sessions] = await Promise.all([
      ERP.api("/api/admin/examinations"),
      ERP.api("/api/admin/results"),
      ERP.api("/api/admin/sessions"),
    ]);

    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4 mb-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold mb-0">Examinations</h5>
          <button id="add-exam-btn" class="btn btn-primary btn-sm"><i class="bi bi-plus-lg me-1"></i>Create Examination</button>
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
                  <td><button class="btn btn-sm btn-outline-danger" data-del-exam="${ex.id}">Delete</button></td>
                </tr>`).join("") || `<tr><td colspan="6" class="text-center text-muted">No examinations yet</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card panel-card p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold mb-0">Published Results</h5>
          <button id="export-res-btn" class="btn btn-outline-success btn-sm"><i class="bi bi-download me-1"></i>Export CSV</button>
        </div>
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead><tr><th>Roll No</th><th>Student</th><th>Subject</th><th>Exam</th><th>Marks</th><th>Grade</th></tr></thead>
            <tbody>
              ${results.map((r) => `
                <tr>
                  <td>${esc(r.students?.roll_number)}</td>
                  <td>${esc(r.students?.profiles?.first_name)} ${esc(r.students?.profiles?.last_name)}</td>
                  <td>${esc(r.subjects?.name)}</td>
                  <td>${esc(r.examinations?.name)}</td>
                  <td>${r.marks_obtained} / ${r.max_marks}</td>
                  <td><span class="badge bg-primary">${esc(r.grade)}</span></td>
                </tr>`).join("") || `<tr><td colspan="6" class="text-center text-muted">No results entered yet</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    document.getElementById("add-exam-btn").onclick = () => {
      openModal("Create Examination", `
        <form id="exam-form" class="row g-3">
          <div class="col-md-6"><label class="form-label">Exam Name</label><input class="form-control" id="ex-name" placeholder="Midterm Fall 2026" required></div>
          <div class="col-md-3"><label class="form-label">Type</label>
            <select class="form-select" id="ex-type">
              <option value="internal">Internal</option><option value="midterm">Midterm</option><option value="final" selected>Final</option><option value="practical">Practical</option>
            </select>
          </div>
          <div class="col-md-3"><label class="form-label">Max Marks</label><input type="number" class="form-control" id="ex-max" value="100" required></div>
          <div class="col-md-6"><label class="form-label">Session</label>
            <select class="form-select" id="ex-sess" required>${sessions.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-6"><label class="form-label">Date</label><input type="date" class="form-control" id="ex-date"></div>
          <div class="col-12 text-end"><button class="btn btn-primary" type="submit">Create Exam</button></div>
        </form>`);
      document.getElementById("exam-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          await ERP.api("/api/admin/examinations", {
            method: "POST",
            body: JSON.stringify({
              name: document.getElementById("ex-name").value.trim(),
              exam_type: document.getElementById("ex-type").value,
              max_marks: Number(document.getElementById("ex-max").value),
              session_id: Number(document.getElementById("ex-sess").value),
              exam_date: document.getElementById("ex-date").value || null,
            }),
          });
          modal.hide();
          ERP.showToast("Examination created!");
          loadResults();
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };

    document.getElementById("export-res-btn").onclick = () => {
      ERP.exportCsv(
        "results.csv",
        ["Roll No", "Student", "Subject", "Examination", "Marks", "Max Marks", "Grade"],
        results.map((r) => [r.students?.roll_number, `${r.students?.profiles?.first_name} ${r.students?.profiles?.last_name}`, r.subjects?.name, r.examinations?.name, r.marks_obtained, r.max_marks, r.grade])
      );
    };

    main.querySelectorAll("[data-del-exam]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Delete this examination?")) return;
      try { await ERP.api(`/api/admin/examinations?id=${b.dataset.delExam}`, { method: "DELETE" }); loadResults(); }
      catch (err) { ERP.showToast(err.message, "danger"); }
    }));
  }

  // 10. LEAVES
  async function loadLeaves() {
    const rows = await ERP.api("/api/admin/leaves");
    renderTableWithSearch({
      title: "Leave Applications",
      rows,
      columns: [
        { label: "Applicant", render: (r) => `<strong>${esc(r.applicant?.first_name)} ${esc(r.applicant?.last_name)}</strong><br><small class="text-muted">${esc(r.applicant_role)}</small>` },
        { label: "Dates", render: (r) => `${esc(r.start_date)} to ${esc(r.end_date)}` },
        { label: "Reason", render: (r) => esc(r.reason) },
        { label: "Status", render: (r) => ERP.statusBadge(r.status) },
        {
          label: "Action",
          render: (r) =>
            r.status === "pending"
              ? `<button class="btn btn-sm btn-success me-1" data-lv="${r.id}" data-st="approved">Approve</button>
                 <button class="btn btn-sm btn-danger" data-lv="${r.id}" data-st="rejected">Reject</button>`
              : `<small class="text-muted">${esc(r.review_note || "Reviewed")}</small>`,
        },
      ],
    });
    main.querySelectorAll("[data-lv]").forEach((b) => (b.onclick = async () => {
      const note = prompt(`Optional note for ${b.dataset.st}:`, "") ?? "";
      try {
        await ERP.api("/api/admin/leaves", {
          method: "PATCH",
          body: JSON.stringify({ id: Number(b.dataset.lv), status: b.dataset.st, review_note: note }),
        });
        ERP.showToast(`Leave ${b.dataset.st}!`);
        loadLeaves();
      } catch (err) { ERP.showToast(err.message, "danger"); }
    }));
  }

  // 11. FEEDBACK
  async function loadFeedback() {
    const rows = await ERP.api("/api/admin/feedback");
    renderTableWithSearch({
      title: "Student & Teacher Feedback",
      rows,
      columns: [
        { label: "Sender", render: (r) => `<strong>${esc(r.sender?.first_name)} ${esc(r.sender?.last_name)}</strong><br><small class="text-muted">${esc(r.sender_role)}</small>` },
        { label: "Subject", render: (r) => esc(r.subject) },
        { label: "Message", render: (r) => esc(r.message) },
        { label: "Reply", render: (r) => r.reply ? `<span class="text-success">${esc(r.reply)}</span>` : `<span class="text-muted">No reply yet</span>` },
        { label: "Action", render: (r) => `<button class="btn btn-sm btn-outline-primary" data-fb="${r.id}">Reply</button>` },
      ],
    });
    main.querySelectorAll("[data-fb]").forEach((b) => (b.onclick = async () => {
      const reply = prompt("Enter reply:");
      if (!reply) return;
      try {
        await ERP.api("/api/admin/feedback", { method: "PATCH", body: JSON.stringify({ id: Number(b.dataset.fb), reply }) });
        ERP.showToast("Reply sent!");
        loadFeedback();
      } catch (err) { ERP.showToast(err.message, "danger"); }
    }));
  }

  // 12. SEND NOTICE
  function loadNotificationsForm() {
    main.innerHTML = `
      <div class="card panel-card p-4" style="max-width: 600px;">
        <h5 class="fw-bold mb-3"><i class="bi bi-megaphone me-2 text-primary"></i>Broadcast In-App Notice</h5>
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
    teachers: loadTeachers,
    students: loadStudents,
    attendance: loadAttendance,
    results: loadResults,
    leaves: loadLeaves,
    feedback: loadFeedback,
    notifications: loadNotificationsForm,
    profile: () => window.renderProfileView(main, userData),
  };

  ERP.renderShell({
    title: "Overview",
    roleLabel: "Admin / HOD",
    navItems,
    user: userData,
    onTabChange: (tabId) => tabHandlers[tabId]?.(),
  });

  loadOverview();
})();

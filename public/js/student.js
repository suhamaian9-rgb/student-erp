/**
 * Student Dashboard Controller.
 * Covers: Overview + Lazy Attendance Charts, My Subjects, Attendance History & %,
 * Examination Results & Grades, Leave Applications, Feedback, and Lazy Profile.
 */

(async () => {
  const statsBoot = ERP.cachedApi("/api/student/stats").catch(() => null);
  const attBoot = ERP.cachedApi("/api/student/attendance").catch(() => null);
  const userData = await ERP.requireAuth("student");
  if (!userData) return;

  const main = document.getElementById("main-content");
  const esc = ERP.escapeHtml;

  const navItems = [
    { id: "overview", label: "Overview", icon: "bi-speedometer2" },
    { id: "subjects", label: "My Subjects", icon: "bi-journal-bookmark" },
    { id: "attendance", label: "Attendance", icon: "bi-calendar-check" },
    { id: "results", label: "Results & Grades", icon: "bi-award" },
    { id: "leaves", label: "Leave Applications", icon: "bi-calendar-x" },
    { id: "feedback", label: "Feedback", icon: "bi-chat-left-text" },
    { id: "profile", label: "My Profile", icon: "bi-person-circle" },
  ];

  // 1. OVERVIEW
  async function loadOverview(signal, prefetched = null) {
    const [stats, att] = prefetched || (await Promise.all([
      ERP.cachedApi("/api/student/stats", { signal }),
      ERP.cachedApi("/api/student/attendance", { signal }),
    ]));
    if (signal?.aborted) return;
    const c = stats.counts;
    const cards = [
      { label: "Attendance %", val: `${c.attendance_percentage}%`, icon: "bi-pie-chart-fill", bg: "bg-primary-subtle text-primary" },
      { label: "Subjects", val: c.subjects, icon: "bi-journal-text", bg: "bg-success-subtle text-success" },
      { label: "Graded Exams", val: c.results, icon: "bi-award-fill", bg: "bg-info-subtle text-info" },
      { label: "Pending Leaves", val: c.pending_leaves, icon: "bi-calendar-x", bg: "bg-warning-subtle text-warning" },
    ];

    main.innerHTML = `
      <div class="row g-3 mb-4">
        ${cards.map((card) => `
          <div class="col-6 col-md-3">
            <div class="card stat-card p-3 h-100">
              <div class="d-flex align-items-center justify-content-between mb-2">
                <div class="stat-icon ${card.bg}"><i class="bi ${card.icon}"></i></div>
                <span class="fs-4 fw-bold">${card.val}</span>
              </div>
              <div class="small text-muted fw-medium">${esc(card.label)}</div>
            </div>
          </div>`).join("")}
      </div>
      <div class="row g-3">
        <div class="col-lg-6">
          <div class="card panel-card p-3 p-md-4 h-100">
            <h6 class="fw-bold mb-3">Overall Attendance Breakdown</h6>
            <canvas id="stud-att-donut" height="180"></canvas>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card panel-card p-3 p-md-4 h-100">
            <h6 class="fw-bold mb-3">Attendance % by Subject</h6>
            <canvas id="stud-sub-bar" height="180"></canvas>
          </div>
        </div>
      </div>`;

    await ERP.loadChartJs();
    if (signal?.aborted) return;
    const donutEl = document.getElementById("stud-att-donut");
    const barEl = document.getElementById("stud-sub-bar");
    if (!donutEl || !barEl) return;

    new Chart(donutEl, {
      type: "doughnut",
      data: {
        labels: ["Present / Late", "Absent"],
        datasets: [{ data: [c.present_classes, c.absent_classes], backgroundColor: ["#10b981", "#ef4444"] }],
      },
      options: { responsive: true },
    });

    new Chart(barEl, {
      type: "bar",
      data: {
        labels: att.by_subject.map((x) => x.subject),
        datasets: [{ label: "Attendance %", data: att.by_subject.map((x) => x.percentage), backgroundColor: "#2563eb" }],
      },
      options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } },
    });
  }

  // 2. MY SUBJECTS
  async function loadSubjects(signal) {
    const rows = await ERP.cachedApi("/api/student/subjects", { signal });
    const runningCount = rows.filter((s) => s.semester_status === "running").length;
    const completedCount = rows.filter((s) => s.semester_status === "completed").length;
    const totalCredits = rows.reduce((sum, s) => sum + (Number(s.credits) || 0), 0);
    const statusLabel = (st) => (st === "running" ? "Running" : st === "completed" ? "Completed" : "Catalog");
    const statusBadge = (st) => {
      if (st === "running") return '<span class="badge bg-success">Running</span>';
      if (st === "completed") return '<span class="badge bg-secondary">Completed</span>';
      return '<span class="badge bg-light text-dark border">Catalog</span>';
    };
    ERP.renderDataTable(main, {
      title: "Enrolled Course Subjects",
      headerMetaHtml: `
        <div class="d-flex flex-wrap gap-2 small">
          <span class="badge bg-success-subtle text-success">Running: ${runningCount}</span>
          <span class="badge bg-secondary-subtle text-secondary">Completed: ${completedCount}</span>
          <span class="badge bg-primary-subtle text-primary">Total Credits: ${totalCredits}</span>
        </div>`,
      searchPlaceholder: "Search subjects...",
      rows,
      defaultPageSize: 50,
      filters: [
        { id: "semester", label: "Semester", getValue: (s) => s.semesters?.name },
        { id: "status", label: "Status", getValue: (s) => statusLabel(s.semester_status) },
      ],
      columns: [
        { label: "Code", sortValue: (s) => s.code || "", render: (s) => `<span class="badge bg-primary">${esc(s.code)}</span>` },
        { label: "Subject", sortValue: (s) => s.name || "", render: (s) => `<strong>${esc(s.name)}</strong>` },
        { label: "Semester", sortValue: (s) => s.semesters?.semester_number ?? s.semesters?.name ?? "", render: (s) => esc(s.semesters?.name || "—") },
        { label: "Status", sortValue: (s) => statusLabel(s.semester_status), render: (s) => statusBadge(s.semester_status) },
        { label: "Credits", sortValue: (s) => Number(s.credits) || 0, render: (s) => s.credits },
        { label: "Instructor", sortValue: (s) => s.teachers?.profiles ? `${s.teachers.profiles.first_name} ${s.teachers.profiles.last_name}` : "TBA", render: (s) => s.teachers?.profiles ? esc(`${s.teachers.profiles.first_name} ${s.teachers.profiles.last_name}`) : "TBA" },
      ],
      emptyMessage: "No subjects found for your course.",
    });
  }

  // 3. ATTENDANCE HISTORY
  async function loadAttendance(signal) {
    const data = await ERP.cachedApi("/api/student/attendance", { signal });
    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4 mb-4">
        <h5 class="fw-bold mb-3">Subject-Wise Attendance Percentage</h5>
        <div class="row g-3">
          ${data.by_subject.map((s) => `
            <div class="col-md-4">
              <div class="border rounded p-3">
                <div class="d-flex justify-content-between mb-1">
                  <strong>${esc(s.subject)}</strong>
                  <span class="badge ${s.percentage >= 75 ? "bg-success" : "bg-danger"}">${s.percentage}%</span>
                </div>
                <div class="small text-muted mb-2">${s.present} / ${s.total} classes attended</div>
                <div class="progress" style="height: 6px;">
                  <div class="progress-bar ${s.percentage >= 75 ? "bg-success" : "bg-danger"}" style="width: ${s.percentage}%"></div>
                </div>
              </div>
            </div>`).join("") || `<div class="text-muted">No attendance records yet.</div>`}
        </div>
      </div>

      <div id="s-att-wrap"></div>`;

    ERP.renderDataTable(document.getElementById("s-att-wrap"), {
      title: "Attendance History",
      searchPlaceholder: "Search attendance...",
      rows: data.records,
      filters: [
        { id: "subject", label: "Subject", getValue: (r) => r.attendance_sessions?.subjects?.name },
        { id: "status", label: "Status", getValue: (r) => r.status },
      ],
      exportFn: (filtered) => {
        ERP.exportCsv(
          "my-attendance.csv",
          ["Date", "Subject", "Topic", "Status", "Remarks"],
          filtered.map((r) => [r.attendance_sessions?.attendance_date, r.attendance_sessions?.subjects?.name, r.attendance_sessions?.topic, r.status, r.remarks])
        );
      },
      columns: [
        { label: "Date", sortValue: (r) => r.attendance_sessions?.attendance_date || "", render: (r) => esc(r.attendance_sessions?.attendance_date) },
        { label: "Subject", sortValue: (r) => r.attendance_sessions?.subjects?.name || "", render: (r) => esc(r.attendance_sessions?.subjects?.name) },
        { label: "Topic", sortValue: (r) => r.attendance_sessions?.topic || "", render: (r) => esc(r.attendance_sessions?.topic || "—") },
        { label: "Status", sortValue: (r) => r.status || "", render: (r) => ERP.statusBadge(r.status) },
        { label: "Remarks", render: (r) => esc(r.remarks || "—") },
      ],
      emptyMessage: "No attendance history yet.",
    });
  }

  // 4. RESULTS
  async function loadResults(signal) {
    const rows = await ERP.cachedApi("/api/student/results", { signal });
    ERP.renderDataTable(main, {
      title: "Examination Results",
      searchPlaceholder: "Search results...",
      rows,
      filters: [
        { id: "exam", label: "Examination", getValue: (r) => r.examinations?.name },
        { id: "subject", label: "Subject", getValue: (r) => r.subjects?.name },
        { id: "grade", label: "Grade", getValue: (r) => r.grade },
      ],
      exportFn: (filtered) => {
        ERP.exportCsv(
          "my-results.csv",
          ["Examination", "Subject", "Marks", "Max Marks", "Grade"],
          filtered.map((r) => [r.examinations?.name, r.subjects?.name, r.marks_obtained, r.max_marks, r.grade])
        );
      },
      columns: [
        { label: "Examination", sortValue: (r) => r.examinations?.name || "", render: (r) => `<strong>${esc(r.examinations?.name)}</strong>` },
        { label: "Type", sortValue: (r) => r.examinations?.exam_type || "", render: (r) => `<span class="badge bg-secondary text-uppercase">${esc(r.examinations?.exam_type)}</span>` },
        { label: "Subject", sortValue: (r) => r.subjects?.name || "", render: (r) => `${esc(r.subjects?.name)} (${esc(r.subjects?.code)})` },
        { label: "Marks", sortValue: (r) => Number(r.marks_obtained), render: (r) => `${r.marks_obtained} / ${r.max_marks}` },
        { label: "Grade", sortValue: (r) => r.grade || "", render: (r) => `<span class="badge bg-primary">${esc(r.grade)}</span>` },
      ],
      emptyMessage: "No results published yet.",
    });
  }

  // 5. LEAVES
  async function loadLeaves(signal) {
    const rows = await ERP.cachedApi("/api/student/leaves", { signal });
    main.innerHTML = `
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="card panel-card p-3 p-md-4">
            <h5 class="fw-bold mb-3">Apply for Leave</h5>
            <form id="s-leave-form" class="row g-3">
              <div class="col-md-6"><label class="form-label">Start Date</label><input type="date" id="sl-start" class="form-control" required></div>
              <div class="col-md-6"><label class="form-label">End Date</label><input type="date" id="sl-end" class="form-control" required></div>
              <div class="col-12"><label class="form-label">Reason</label><textarea id="sl-reason" class="form-control" rows="3" required></textarea></div>
              <div class="col-12"><button class="btn btn-primary" type="submit">Submit Application</button></div>
            </form>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="card panel-card p-3 p-md-4">
            <h5 class="fw-bold mb-3">My Leave Status</h5>
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead><tr><th>Dates</th><th>Reason</th><th>Status</th><th>Review Note</th></tr></thead>
                <tbody>
                  ${rows.map((r) => `<tr><td>${esc(r.start_date)} to ${esc(r.end_date)}</td><td>${esc(r.reason)}</td><td>${ERP.statusBadge(r.status)}</td><td>${esc(r.review_note || "—")}</td></tr>`).join("") || `<tr><td colspan="4" class="text-center text-muted">No leave applications</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
    document.getElementById("s-leave-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ERP.api("/api/student/leaves", {
          method: "POST",
          body: JSON.stringify({
            start_date: document.getElementById("sl-start").value,
            end_date: document.getElementById("sl-end").value,
            reason: document.getElementById("sl-reason").value.trim(),
          }),
        });
        ERP.showToast("Leave application submitted!");
        loadLeaves();
      } catch (err) { ERP.showToast(err.message, "danger"); }
    };
  }

  // 6. FEEDBACK
  async function loadFeedback(signal) {
    const rows = await ERP.cachedApi("/api/student/feedback", { signal });
    main.innerHTML = `
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="card panel-card p-3 p-md-4">
            <h5 class="fw-bold mb-3">Submit Feedback</h5>
            <form id="s-fb-form" class="row g-3">
              <div class="col-12"><label class="form-label">Subject</label><input id="sf-sub" class="form-control" value="General Feedback" required></div>
              <div class="col-12"><label class="form-label">Message</label><textarea id="sf-msg" class="form-control" rows="3" required></textarea></div>
              <div class="col-12"><button class="btn btn-primary" type="submit">Submit Feedback</button></div>
            </form>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="card panel-card p-3 p-md-4">
            <h5 class="fw-bold mb-3">Feedback History</h5>
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <thead><tr><th>Subject</th><th>Message</th><th>Admin Reply</th></tr></thead>
                <tbody>
                  ${rows.map((r) => `<tr><td><strong>${esc(r.subject)}</strong></td><td>${esc(r.message)}</td><td>${r.reply ? `<span class="text-success">${esc(r.reply)}</span>` : `<span class="text-muted">Pending</span>`}</td></tr>`).join("") || `<tr><td colspan="3" class="text-center text-muted">No feedback submitted</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
    document.getElementById("s-fb-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ERP.api("/api/student/feedback", {
          method: "POST",
          body: JSON.stringify({ subject: document.getElementById("sf-sub").value.trim(), message: document.getElementById("sf-msg").value.trim() }),
        });
        ERP.showToast("Feedback submitted!");
        loadFeedback();
      } catch (err) { ERP.showToast(err.message, "danger"); }
    };
  }

  const tabHandlers = {
    overview: loadOverview,
    subjects: loadSubjects,
    attendance: loadAttendance,
    results: loadResults,
    leaves: loadLeaves,
    feedback: loadFeedback,
    profile: async () => {
      await ERP.loadProfileWidget();
      window.renderProfileView(main, userData);
    },
  };

  const switchTab = ERP.createTabRunner(main, tabHandlers);

  ERP.renderShell({
    title: "Overview",
    roleLabel: "Student Portal",
    navItems,
    user: userData,
    onTabChange: (tabId) => switchTab(tabId),
  });

  const [prefetchedStats, prefetchedAtt] = await Promise.all([statsBoot, attBoot]);
  loadOverview(null, prefetchedStats && prefetchedAtt ? [prefetchedStats, prefetchedAtt] : null);
})();

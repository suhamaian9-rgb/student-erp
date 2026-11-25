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
    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4">
        <h5 class="fw-bold mb-3">Enrolled Course Subjects</h5>
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead><tr><th>Code</th><th>Subject</th><th>Course</th><th>Credits</th><th>Instructor</th></tr></thead>
            <tbody>
              ${rows.map((s) => `
                <tr>
                  <td><span class="badge bg-primary">${esc(s.code)}</span></td>
                  <td><strong>${esc(s.name)}</strong></td>
                  <td>${esc(s.courses?.name || "—")}</td>
                  <td>${s.credits}</td>
                  <td>${s.teachers?.profiles ? esc(`${s.teachers.profiles.first_name} ${s.teachers.profiles.last_name}`) : "TBA"}</td>
                </tr>`).join("") || `<tr><td colspan="5" class="text-center text-muted">No subjects found for your course.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
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

      <div class="card panel-card p-3 p-md-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h5 class="fw-bold mb-0">Attendance History</h5>
          <button id="exp-att" class="btn btn-outline-success btn-sm"><i class="bi bi-download me-1"></i>Export CSV</button>
        </div>
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-2">
            <thead><tr><th>Date</th><th>Subject</th><th>Topic</th><th>Status</th><th>Remarks</th></tr></thead>
            <tbody id="s-att-body"></tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-2">
          <small id="s-att-info" class="text-muted"></small>
          <div id="s-att-pager" class="btn-group btn-group-sm"></div>
        </div>
      </div>`;

    let page = 1;
    const drawAtt = () => {
      const paged = ERP.paginate(data.records, page, 12);
      document.getElementById("s-att-body").innerHTML = paged.rows.map((r) => `
        <tr>
          <td>${esc(r.attendance_sessions?.attendance_date)}</td>
          <td>${esc(r.attendance_sessions?.subjects?.name)}</td>
          <td>${esc(r.attendance_sessions?.topic || "—")}</td>
          <td>${ERP.statusBadge(r.status)}</td>
          <td>${esc(r.remarks || "—")}</td>
        </tr>`).join("") || `<tr><td colspan="5" class="text-center text-muted">No attendance history yet.</td></tr>`;
      document.getElementById("s-att-info").textContent = `Showing ${paged.rows.length} of ${paged.total} records (Page ${paged.page}/${paged.totalPages})`;
      document.getElementById("s-att-pager").innerHTML = `
        <button class="btn btn-outline-secondary" ${paged.page <= 1 ? "disabled" : ""} id="sa-prev">Prev</button>
        <button class="btn btn-outline-secondary" ${paged.page >= paged.totalPages ? "disabled" : ""} id="sa-next">Next</button>`;
      document.getElementById("sa-prev").onclick = () => { page--; drawAtt(); };
      document.getElementById("sa-next").onclick = () => { page++; drawAtt(); };
    };
    drawAtt();

    document.getElementById("exp-att").onclick = () => {
      ERP.exportCsv(
        "my-attendance.csv",
        ["Date", "Subject", "Topic", "Status", "Remarks"],
        data.records.map((r) => [r.attendance_sessions?.attendance_date, r.attendance_sessions?.subjects?.name, r.attendance_sessions?.topic, r.status, r.remarks])
      );
    };
  }

  // 4. RESULTS
  async function loadResults(signal) {
    const rows = await ERP.cachedApi("/api/student/results", { signal });
    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h5 class="fw-bold mb-0">Examination Results</h5>
          <button id="exp-res" class="btn btn-outline-success btn-sm"><i class="bi bi-download me-1"></i>Export CSV</button>
        </div>
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-2">
            <thead><tr><th>Examination</th><th>Type</th><th>Subject</th><th>Marks</th><th>Grade</th></tr></thead>
            <tbody id="s-res-body"></tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-2">
          <small id="s-res-info" class="text-muted"></small>
          <div id="s-res-pager" class="btn-group btn-group-sm"></div>
        </div>
      </div>`;

    let page = 1;
    const drawRes = () => {
      const paged = ERP.paginate(rows, page, 12);
      document.getElementById("s-res-body").innerHTML = paged.rows.map((r) => `
        <tr>
          <td><strong>${esc(r.examinations?.name)}</strong></td>
          <td><span class="badge bg-secondary text-uppercase">${esc(r.examinations?.exam_type)}</span></td>
          <td>${esc(r.subjects?.name)} (${esc(r.subjects?.code)})</td>
          <td>${r.marks_obtained} / ${r.max_marks}</td>
          <td><span class="badge bg-primary">${esc(r.grade)}</span></td>
        </tr>`).join("") || `<tr><td colspan="5" class="text-center text-muted">No results published yet.</td></tr>`;
      document.getElementById("s-res-info").textContent = `Showing ${paged.rows.length} of ${paged.total} results (Page ${paged.page}/${paged.totalPages})`;
      document.getElementById("s-res-pager").innerHTML = `
        <button class="btn btn-outline-secondary" ${paged.page <= 1 ? "disabled" : ""} id="sr-prev">Prev</button>
        <button class="btn btn-outline-secondary" ${paged.page >= paged.totalPages ? "disabled" : ""} id="sr-next">Next</button>`;
      document.getElementById("sr-prev").onclick = () => { page--; drawRes(); };
      document.getElementById("sr-next").onclick = () => { page++; drawRes(); };
    };
    drawRes();

    document.getElementById("exp-res").onclick = () => {
      ERP.exportCsv(
        "my-results.csv",
        ["Examination", "Subject", "Marks", "Max Marks", "Grade"],
        rows.map((r) => [r.examinations?.name, r.subjects?.name, r.marks_obtained, r.max_marks, r.grade])
      );
    };
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

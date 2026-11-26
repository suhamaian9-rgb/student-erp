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
    { id: "overview", label: "Overview", icon: "layout-dashboard" },
    { id: "subjects", label: "My Subjects", icon: "book-marked" },
    { id: "attendance", label: "Attendance", icon: "calendar-check" },
    { id: "results", label: "Results & Grades", icon: "award" },
    { id: "transcript", label: "Transcript & Retake", icon: "file-text" },
    { id: "fees", label: "Fees & Payments", icon: "credit-card" },
    { id: "notices", label: "Class Notices", icon: "megaphone" },
    { id: "idcard", label: "ID Card", icon: "badge" },
    { id: "leaves", label: "Leave Applications", icon: "calendar-x" },
    { id: "feedback", label: "Feedback", icon: "message-square" },
    { id: "profile", label: "My Profile", icon: "user-circle" },
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
      { label: "CGPA (4.00)", val: Number(c.cgpa || 0).toFixed(2), icon: "award", bg: "bg-primary-subtle text-primary" },
      { label: "Attendance %", val: `${c.attendance_percentage}%`, icon: "pie-chart", bg: "bg-success-subtle text-success" },
      { label: "Fees Due", val: `৳ ${Number(c.fees_due_total || 0).toFixed(0)}`, icon: "credit-card", bg: "bg-warning-subtle text-warning" },
      { label: "Retake / Improv.", val: (c.retake_count || 0) + (c.improvement_count || 0), icon: "alert-triangle", bg: "bg-danger-subtle text-danger" },
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

  // 3. ATTENDANCE HISTORY + LIVE CHECK-IN
  async function loadAttendance(signal) {
    const [data, openSessions] = await Promise.all([
      ERP.cachedApi("/api/student/attendance", { signal }),
      ERP.api("/api/student/attendance/open", { signal }),
    ]);
    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4 mb-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 class="fw-bold mb-0">Live Class Attendance</h5>
            <div class="small text-muted">Tick to confirm you are physically in class when your teacher opens attendance.</div>
          </div>
          <button id="refresh-open-att" class="btn btn-outline-secondary btn-sm">Refresh</button>
        </div>
        <div id="open-att-box">
          ${(openSessions || []).length === 0 ? `<div class="small text-muted">No active attendance links right now.</div>` : openSessions.map((os) => {
            const expStr = os.expires_at ? new Date(os.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
            return `
              <div class="border rounded p-3 mb-2 d-flex flex-wrap justify-content-between align-items-center gap-3">
                <div>
                  <span class="badge bg-success me-1">OPEN</span>
                  <strong>${esc(os.subjects?.name)}</strong> (${esc(os.subjects?.code)})
                  <div class="small text-muted">Date: ${esc(os.attendance_date)} &bull; Topic: ${esc(os.topic || "Class Session")} &bull; Closes at ${esc(expStr)}</div>
                </div>
                ${os.already_marked ? `<span class="badge bg-primary py-2 px-3">Marked: ${esc(os.marked_status)}</span>` : `
                  <div class="d-flex flex-wrap align-items-center gap-2">
                    <div class="form-check mb-0 me-1">
                      <input class="form-check-input live-att-tick" type="checkbox" id="tick-${os.id}">
                      <label class="form-check-label small fw-medium" for="tick-${os.id}">I am in class</label>
                    </div>
                    <input type="text" class="form-control form-control-sm text-uppercase live-att-code" id="code-${os.id}" style="width: 145px;" maxlength="10" placeholder="Enter Class Code" required>
                    <button class="btn btn-success btn-sm live-att-submit" data-id="${os.id}">Submit Attendance</button>
                  </div>`}
              </div>`;
          }).join("")}
        </div>
      </div>

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

    document.getElementById("refresh-open-att").onclick = () => loadAttendance(signal);
    main.querySelectorAll(".live-att-submit").forEach((btn) => {
      btn.onclick = async () => {
        const sid = Number(btn.dataset.id);
        const tick = document.getElementById(`tick-${sid}`);
        const codeInput = document.getElementById(`code-${sid}`);
        const sessionCode = (codeInput?.value || "").trim().toUpperCase();
        if (!tick || !tick.checked) {
          return ERP.showToast("Please tick 'I am in class' first.", "warning");
        }
        if (!sessionCode) {
          return ERP.showToast("Please enter the Class Code shown by your teacher.", "warning");
        }
        btn.disabled = true;
        btn.textContent = "Submitting...";
        try {
          await ERP.api("/api/student/attendance/checkin", {
            method: "POST",
            body: JSON.stringify({
              attendance_session_id: sid,
              confirmed: true,
              session_code: sessionCode,
            }),
          });
          ERP.invalidateCache("/api/student/attendance");
          ERP.invalidateCache("/api/student/stats");
          ERP.showToast("Attendance marked Present!");
          loadAttendance(signal);
        } catch (err) {
          ERP.showToast(err.message, "danger");
          btn.disabled = false;
          btn.textContent = "Submit Attendance";
        }
      };
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

  // 7. TRANSCRIPT, CGPA & RETAKE / IMPROVEMENT
  async function loadTranscript(signal) {
    const data = await ERP.cachedApi("/api/student/transcript", { signal });
    const sum = data.summary || {};
    const retakes = sum.retake_required || [];
    const improvements = sum.improvement_eligible || [];
    const semGpas = sum.semester_gpas || [];

    main.innerHTML = `
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <div class="card stat-card p-3">
            <div class="small text-muted">Cumulative CGPA</div>
            <div class="fs-3 fw-bold text-primary">${Number(sum.cgpa || 0).toFixed(2)} / 4.00</div>
            <div class="small text-muted">Credits Earned: ${sum.credits_earned || 0} / ${sum.credits_attempted || 0}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card stat-card p-3">
            <div class="small text-muted">Retake Required (F Grade)</div>
            <div class="fs-3 fw-bold text-danger">${retakes.length}</div>
            <div class="small text-muted">Subjects needing mandatory retake</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card stat-card p-3">
            <div class="small text-muted">Improvement Eligible</div>
            <div class="fs-3 fw-bold text-warning">${improvements.length}</div>
            <div class="small text-muted">Passed subjects with GP &lt; 2.50</div>
          </div>
        </div>
      </div>

      <div class="card panel-card p-3 p-md-4 mb-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h5 class="fw-bold mb-0">Official Academic Transcript</h5>
            <div class="small text-muted">Automatically unlocked once all university fees are verified as Paid.</div>
          </div>
          ${data.transcript_unlocked
            ? `<button id="print-transcript-btn" class="btn btn-primary btn-sm">Download / Print Official Transcript</button>`
            : `<button class="btn btn-secondary btn-sm" disabled>Transcript Locked (Payment Required)</button>`}
        </div>
        ${data.transcript_unlocked ? `
          <div class="alert alert-success small mb-3">
            Payment verified! Verification Code: <strong>${esc(data.verification_code)}</strong>
          </div>
          <div class="table-responsive">
            <table class="table table-sm table-bordered align-middle mb-0">
              <thead><tr><th>Code</th><th>Subject</th><th>Semester</th><th>Credits</th><th>Marks</th><th>Grade</th><th>GP</th></tr></thead>
              <tbody>
                ${(sum.subject_records || []).map((r) => `
                  <tr>
                    <td>${esc(r.subject_code)}</td>
                    <td>${esc(r.subject_name)}</td>
                    <td>${esc(r.semester)}</td>
                    <td>${r.credits}</td>
                    <td>${r.marks_obtained} / ${r.max_marks}</td>
                    <td><span class="badge bg-primary">${esc(r.grade)}</span></td>
                    <td>${Number(r.grade_point).toFixed(2)}</td>
                  </tr>`).join("") || `<tr><td colspan="7" class="text-center text-muted">No graded subjects yet.</td></tr>`}
              </tbody>
            </table>
          </div>` : `
          <div class="alert alert-warning mb-0">
            <strong>Transcript Locked:</strong> You have ${(data.unpaid_fees || []).length} unpaid or pending-verification fee(s). Please complete payment in <strong>Fees &amp; Payments</strong> to unlock your official transcript.
          </div>`}
      </div>

      <div class="row g-4">
        <div class="col-lg-6">
          <div class="card panel-card p-3 p-md-4 h-100">
            <h6 class="fw-bold mb-3 text-danger">Retake Required Subjects</h6>
            ${retakes.length === 0 ? `<div class="small text-muted">No failed subjects requiring retake.</div>` : retakes.map((r) => `
              <div class="border rounded p-2 mb-2 d-flex justify-content-between align-items-center">
                <div><strong>${esc(r.subject_code)}</strong> — ${esc(r.subject_name)}</div>
                <span class="badge bg-danger">Grade: ${esc(r.grade)} (${r.percentage}%)</span>
              </div>`).join("")}
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card panel-card p-3 p-md-4 h-100">
            <h6 class="fw-bold mb-3 text-warning">Improvement Eligible Subjects (GP &lt; 2.50)</h6>
            ${improvements.length === 0 ? `<div class="small text-muted">No subjects flagged for improvement.</div>` : improvements.map((r) => `
              <div class="border rounded p-2 mb-2 d-flex justify-content-between align-items-center">
                <div><strong>${esc(r.subject_code)}</strong> — ${esc(r.subject_name)}</div>
                <span class="badge bg-warning text-dark">GP: ${Number(r.grade_point).toFixed(2)} (${esc(r.grade)})</span>
              </div>`).join("")}
          </div>
        </div>
      </div>`;

    const printBtn = document.getElementById("print-transcript-btn");
    if (printBtn) {
      printBtn.onclick = () => {
        const st = data.student || {};
        const p = data.profile || {};
        const win = window.open("", "_blank");
        if (!win) return ERP.showToast("Please allow pop-ups to print transcript", "warning");
        win.document.write(`<!DOCTYPE html><html><head><title>Official Transcript - ${esc(st.roll_number)}</title>
          <style>body{font-family:Georgia,serif;padding:32px;color:#111}h1,h2{margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #444;padding:8px;text-align:left;font-size:13px}th{background:#f1f5f9}.meta{margin:14px 0;font-size:14px;line-height:1.6}.foot{margin-top:28px;display:flex;justify-content:space-between;font-size:13px}</style></head><body>
          <h1>Pirojpur Science &amp; Technology University</h1>
          <h2>Official Academic Transcript</h2>
          <div class="meta">
            <strong>Name:</strong> ${esc(p.first_name)} ${esc(p.last_name)} &nbsp;|&nbsp;
            <strong>Roll No:</strong> ${esc(st.roll_number)}<br>
            <strong>Course:</strong> ${esc(st.courses?.name || "—")} &nbsp;|&nbsp;
            <strong>Session:</strong> ${esc(st.academic_sessions?.name || "—")}<br>
            <strong>Cumulative CGPA:</strong> ${Number(sum.cgpa || 0).toFixed(2)} / 4.00 &nbsp;|&nbsp;
            <strong>Verification ID:</strong> ${esc(data.verification_code)}
          </div>
          <table><thead><tr><th>Code</th><th>Subject</th><th>Semester</th><th>Credits</th><th>Marks</th><th>Grade</th><th>GP</th></tr></thead><tbody>
            ${(sum.subject_records || []).map((r) => `<tr><td>${esc(r.subject_code)}</td><td>${esc(r.subject_name)}</td><td>${esc(r.semester)}</td><td>${r.credits}</td><td>${r.marks_obtained}/${r.max_marks}</td><td>${esc(r.grade)}</td><td>${Number(r.grade_point).toFixed(2)}</td></tr>`).join("")}
          </tbody></table>
          <div class="foot"><span>Generated: ${new Date().toLocaleDateString()}</span><span>Controller of Examinations (Verified)</span></div>
          </body></html>`);
        win.document.close();
        win.print();
      };
    }
  }

  // 8. FEES & PAYMENTS
  async function loadFees(signal) {
    const rows = await ERP.cachedApi("/api/student/fees", { signal });
    const dueTotal = rows.filter((r) => r.status !== "paid").reduce((a, b) => a + Number(b.amount || 0), 0);
    const paidTotal = rows.filter((r) => r.status === "paid").reduce((a, b) => a + Number(b.amount || 0), 0);

    main.innerHTML = `
      <div class="row g-3 mb-4">
        <div class="col-md-6"><div class="card stat-card p-3"><div class="small text-muted">Total Fees Due / Pending</div><div class="fs-3 fw-bold text-danger">৳ ${dueTotal.toFixed(2)}</div></div></div>
        <div class="col-md-6"><div class="card stat-card p-3"><div class="small text-muted">Completed Payments</div><div class="fs-3 fw-bold text-success">৳ ${paidTotal.toFixed(2)}</div></div></div>
      </div>
      <div class="card panel-card p-3 p-md-4">
        <h5 class="fw-bold mb-3">My Fee Invoices</h5>
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead><tr><th>Invoice</th><th>Type</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td><strong>${esc(r.title)}</strong></td>
                  <td><span class="badge bg-secondary text-uppercase">${esc(r.fee_type)}</span></td>
                  <td>৳ ${Number(r.amount).toFixed(2)}</td>
                  <td>${esc(r.due_date || "—")}</td>
                  <td>${r.status === "paid" ? '<span class="badge bg-success">Completed</span>' : r.status === "pending_verification" ? '<span class="badge bg-warning text-dark">Pending Verification</span>' : '<span class="badge bg-danger">Due</span>'}</td>
                  <td>${r.status === "due" ? `<button class="btn btn-sm btn-primary pay-fee-btn" data-id="${r.id}">Submit Payment Ref</button>` : `<small class="text-muted">${esc(r.transaction_ref || "Verified")}</small>`}</td>
                </tr>`).join("") || `<tr><td colspan="6" class="text-center text-muted py-3">No fee invoices assigned.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    main.querySelectorAll(".pay-fee-btn").forEach((btn) => {
      btn.onclick = async () => {
        const method = prompt("Payment Method (e.g., Bank Slip, bKash, Nagad, Cash):", "Bank Slip");
        if (!method) return;
        const trx = prompt("Enter Transaction ID / Receipt Number:");
        if (!trx) return;
        try {
          await ERP.api("/api/student/fees", {
            method: "POST",
            body: JSON.stringify({ id: Number(btn.dataset.id), payment_method: method, transaction_ref: trx }),
          });
          ERP.invalidateCache("/api/student/fees");
          ERP.invalidateCache("/api/student/stats");
          ERP.invalidateCache("/api/student/transcript");
          ERP.showToast("Payment reference submitted for Admin verification!");
          loadFees(signal);
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    });
  }

  // 9. CLASS NOTICES
  async function loadClassNotices(signal) {
    const rows = await ERP.cachedApi("/api/student/notices", { signal });
    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4">
        <h5 class="fw-bold mb-3">Subject Announcements &amp; Study Materials</h5>
        ${(rows || []).map((n) => `
          <div class="border rounded p-3 mb-2">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <div><span class="badge bg-primary me-1">${esc(n.subjects?.code)}</span> <strong>${esc(n.title)}</strong></div>
              <small class="text-muted">${esc((n.created_at || "").slice(0, 10))}</small>
            </div>
            <div class="small text-muted mb-1">Instructor: ${esc(n.teachers?.profiles?.first_name || "")} ${esc(n.teachers?.profiles?.last_name || "")}</div>
            <p class="mb-1 small">${esc(n.content)}</p>
            ${n.resource_url ? `<a href="${esc(n.resource_url)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary mt-1">Open Material</a>` : ""}
          </div>`).join("") || `<div class="text-muted small">No class notices yet.</div>`}
      </div>`;
  }

  // 10. DIGITAL ID CARD
  function loadIdCard() {
    const p = userData.profile || {};
    const st = userData.role_record || {};
    const fullName = `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.username || "Student";
    main.innerHTML = `
      <div class="card panel-card p-4" style="max-width: 480px;">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold mb-0">University Digital ID Card</h5>
          <button id="print-id-btn" class="btn btn-primary btn-sm">Print / Save PDF</button>
        </div>
        <div id="id-card-box" class="border rounded-3 overflow-hidden shadow-sm bg-white">
          <div class="p-3 text-white" style="background: linear-gradient(135deg, #1E3A5F, #132842);">
            <div class="fw-bold font-serif fs-5">Pirojpur Science &amp; Technology University</div>
            <div class="small opacity-75">STUDENT IDENTITY CARD</div>
          </div>
          <div class="p-3">
            <div class="fs-5 fw-bold mb-1">${esc(fullName)}</div>
            <div class="badge bg-primary mb-3">ID: ${esc(st.roll_number || "—")}</div>
            <div class="small mb-1"><strong>Department:</strong> ${esc(st.courses?.departments?.name || "—")}</div>
            <div class="small mb-1"><strong>Program:</strong> ${esc(st.courses?.name || "—")}</div>
            <div class="small mb-1"><strong>Session:</strong> ${esc(st.academic_sessions?.name || "—")}</div>
            <div class="small mb-1"><strong>Email:</strong> ${esc(p.email || "—")}</div>
            <div class="small"><strong>Phone:</strong> ${esc(p.phone || "—")}</div>
          </div>
        </div>
      </div>`;

    document.getElementById("print-id-btn").onclick = () => {
      const cardHtml = document.getElementById("id-card-box").outerHTML;
      const win = window.open("", "_blank");
      if (!win) return ERP.showToast("Please allow pop-ups to print ID Card", "warning");
      win.document.write(`<!DOCTYPE html><html><head><title>University ID Card</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>body{padding:30px;display:flex;justify-content:center;}</style></head><body>
        <div style="width:380px">${cardHtml}</div></body></html>`);
      win.document.close();
      setTimeout(() => win.print(), 400);
    };
  }

  const tabHandlers = {
    overview: loadOverview,
    subjects: loadSubjects,
    attendance: loadAttendance,
    results: loadResults,
    transcript: loadTranscript,
    fees: loadFees,
    notices: loadClassNotices,
    idcard: loadIdCard,
    leaves: loadLeaves,
    feedback: loadFeedback,
    profile: async () => {
      await ERP.loadProfileWidget();
      window.renderProfileView(main, userData);
    },
  };

  const switchTab = ERP.createTabRunner(main, tabHandlers);
  const initialTab = ERP.getInitialTab(navItems);

  ERP.renderShell({
    title: "Overview",
    roleLabel: "Student Portal",
    navItems,
    user: userData,
    initialTab,
    onTabChange: (tabId) => switchTab(tabId),
  });

  if (initialTab === "overview") {
    const [prefetchedStats, prefetchedAtt] = await Promise.all([statsBoot, attBoot]);
    loadOverview(null, prefetchedStats && prefetchedAtt ? [prefetchedStats, prefetchedAtt] : null);
  } else {
    switchTab(initialTab);
  }
})();

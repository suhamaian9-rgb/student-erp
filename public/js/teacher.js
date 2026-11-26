/**
 * Teacher Dashboard Controller.
 * Covers: Overview + Lazy Charts, Assigned Subjects & Students, Take Attendance,
 * Update Attendance (with audit tracking), Enter/Edit Results, Leave Applications,
 * Feedback, and Lazy Profile.
 */

(async () => {
  const statsBoot = ERP.cachedApi("/api/teacher/stats").catch(() => null);
  const userData = await ERP.requireAuth("teacher");
  if (!userData) return;

  const main = document.getElementById("main-content");
  const esc = ERP.escapeHtml;

  const navItems = [
    { id: "overview", label: "Overview", icon: "layout-dashboard" },
    { id: "subjects", label: "My Subjects & Students", icon: "book-marked" },
    { id: "take-attendance", label: "Take Attendance", icon: "check-square" },
    { id: "update-attendance", label: "Update Attendance", icon: "edit" },
    { id: "results", label: "Examination Results", icon: "award" },
    { id: "insights", label: "Class Insights & Notices", icon: "bar-chart-2" },
    { id: "leaves", label: "Leave Applications", icon: "calendar-x" },
    { id: "feedback", label: "Feedback", icon: "message-square" },
    { id: "profile", label: "My Profile", icon: "user-circle" },
  ];

  // 1. OVERVIEW
  async function loadOverview(signal, prefetched = null) {
    const data = prefetched || (await ERP.cachedApi("/api/teacher/stats", { signal }));
    if (signal?.aborted) return;
    const c = data.counts;
    const cards = [
      { label: "Assigned Subjects", val: c.subjects, icon: "book-marked", bg: "bg-primary-subtle text-primary" },
      { label: "Students", val: c.students, icon: "users", bg: "bg-success-subtle text-success" },
      { label: "Attendance Taken", val: c.attendance_sessions, icon: "check-square", bg: "bg-info-subtle text-info" },
      { label: "Leave Requests", val: c.leaves, icon: "calendar-x", bg: "bg-warning-subtle text-warning" },
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
      <div class="card panel-card p-3 p-md-4">
        <h6 class="fw-bold mb-3">Attendance Sessions per Subject</h6>
        <canvas id="teacher-att-chart" height="120"></canvas>
      </div>`;

    await ERP.loadChartJs();
    if (signal?.aborted) return;
    const chartEl = document.getElementById("teacher-att-chart");
    if (!chartEl) return;

    new Chart(chartEl, {
      type: "bar",
      data: {
        labels: data.subject_chart.map((x) => x.subject),
        datasets: [{ label: "Sessions Held", data: data.subject_chart.map((x) => x.sessions), backgroundColor: "#2563eb" }],
      },
      options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  // 2. SUBJECTS & STUDENTS
  async function loadSubjectsAndStudents(signal) {
    const [subjects, students] = await Promise.all([
      ERP.cachedApi("/api/teacher/subjects", { signal }),
      ERP.cachedApi("/api/teacher/students", { signal }),
    ]);
    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4 mb-4">
        <h5 class="fw-bold mb-3">Assigned Subjects</h5>
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead><tr><th>Code</th><th>Subject</th><th>Course</th><th>Semester</th><th>Credits</th></tr></thead>
            <tbody>
              ${subjects.map((s) => `
                <tr>
                  <td><span class="badge bg-primary">${esc(s.code)}</span></td>
                  <td><strong>${esc(s.name)}</strong></td>
                  <td>${esc(s.courses?.name || "—")}</td>
                  <td>${esc(s.semesters?.name || "—")}</td>
                  <td>${s.credits}</td>
                </tr>`).join("") || `<tr><td colspan="5" class="text-center text-muted">No subjects assigned yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div id="t-stud-wrap"></div>`;

    ERP.renderDataTable(document.getElementById("t-stud-wrap"), {
      title: "My Students",
      searchPlaceholder: "Search students...",
      rows: students,
      filters: [
        { id: "course", label: "Course", getValue: (s) => s.courses?.name },
        { id: "session", label: "Session", getValue: (s) => s.academic_sessions?.name },
      ],
      columns: [
        { label: "Roll No", sortValue: (s) => s.roll_number || "", render: (s) => `<span class="badge bg-dark">${esc(s.roll_number)}</span>` },
        { label: "Name", sortValue: (s) => `${s.profiles?.first_name || ""} ${s.profiles?.last_name || ""}`.trim(), render: (s) => `<strong>${esc(s.profiles?.first_name)} ${esc(s.profiles?.last_name)}</strong>` },
        { label: "Email", sortValue: (s) => s.profiles?.email || "", render: (s) => esc(s.profiles?.email) },
        { label: "Course", sortValue: (s) => s.courses?.name || "", render: (s) => esc(s.courses?.name || "—") },
        { label: "Session", sortValue: (s) => s.academic_sessions?.name || "", render: (s) => esc(s.academic_sessions?.name || "—") },
      ],
      emptyMessage: "No students found.",
    });
  }

  // 3. TAKE ATTENDANCE (Live Classroom Link + Manual Roster)
  async function loadTakeAttendance(signal) {
    const [subjects, sessions, allAtt] = await Promise.all([
      ERP.cachedApi("/api/teacher/subjects", { signal }),
      ERP.cachedApi("/api/teacher/sessions", { signal }),
      ERP.api("/api/teacher/attendance", { signal }),
    ]);
    const today = new Date().toISOString().split("T")[0];
    const openSessions = (allAtt || []).filter((a) => a.is_open);

    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4 mb-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h5 class="fw-bold mb-0">Live Classroom Attendance Link</h5>
            <div class="small text-muted">Open a timed link and share the Class Code with students in class so they can tick Present.</div>
          </div>
          <button id="refresh-live-att" class="btn btn-outline-secondary btn-sm">Refresh</button>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-md-4">
            <label class="form-label">Subject</label>
            <select id="live-sub" class="form-select">${subjects.map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.code)})</option>`).join("")}</select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Session</label>
            <select id="live-sess" class="form-select">${sessions.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Date</label>
            <input type="date" id="live-date" class="form-control" value="${today}">
          </div>
          <div class="col-md-2">
            <label class="form-label">Duration</label>
            <select id="live-dur" class="form-select">
              <option value="5">5 mins</option>
              <option value="10" selected>10 mins</option>
              <option value="15">15 mins</option>
              <option value="30">30 mins</option>
            </select>
          </div>
          <div class="col-md-8">
            <input type="text" id="live-topic" class="form-control" placeholder="Lecture topic (optional)">
          </div>
          <div class="col-md-4 d-flex justify-content-md-end">
            <button id="open-live-btn" type="button" class="btn btn-primary w-100">Open Attendance Link</button>
          </div>
        </div>

        <div id="open-sessions-list">
          ${openSessions.length === 0 ? `<div class="small text-muted">No live attendance links are currently open.</div>` : openSessions.map((os) => {
            const checkedIn = (os.attendance_records || []).filter((r) => r.status === "present" || r.status === "late").length;
            const expStr = os.expires_at ? new Date(os.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
            return `
              <div class="border rounded p-3 mb-2 bg-light d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                  <span class="badge bg-success me-1">OPEN</span>
                  <strong>${esc(os.subjects?.name)}</strong> (${esc(os.subjects?.code)}) &bull; ${esc(os.attendance_date)}
                  ${os.session_code ? `<span class="badge bg-dark ms-2">Class Code: ${esc(os.session_code)}</span>` : ""}
                  <div class="small text-muted">Checked in: <strong>${checkedIn}</strong> student(s) &bull; Expires at ${esc(expStr)}</div>
                </div>
                <button class="btn btn-danger btn-sm close-live-btn" data-id="${os.id}">Close Link &amp; Auto-Mark Absent</button>
              </div>`;
          }).join("")}
        </div>
      </div>

      <div class="card panel-card p-3 p-md-4">
        <h5 class="fw-bold mb-3">Manual Attendance Roster</h5>
        <div class="row g-3 mb-3">
          <div class="col-md-4">
            <label class="form-label">Subject</label>
            <select id="att-sub" class="form-select">${subjects.map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.code)})</option>`).join("")}</select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Academic Session</label>
            <select id="att-sess" class="form-select">${sessions.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-2">
            <label class="form-label">Date</label>
            <input type="date" id="att-date" class="form-control" value="${today}">
          </div>
          <div class="col-md-3">
            <label class="form-label">Topic (Optional)</label>
            <input type="text" id="att-topic" class="form-control" placeholder="Lecture topic">
          </div>
        </div>
        <button id="fetch-att-studs" class="btn btn-outline-primary btn-sm mb-3">Load Students</button>
        <div id="att-students-area"></div>
      </div>`;

    document.getElementById("refresh-live-att").onclick = () => loadTakeAttendance(signal);

    document.getElementById("open-live-btn").onclick = async () => {
      const subjectId = document.getElementById("live-sub").value;
      const sessionId = document.getElementById("live-sess").value;
      if (!subjectId || !sessionId) return ERP.showToast("Select subject and session", "warning");
      try {
        await ERP.api("/api/teacher/attendance/open", {
          method: "POST",
          body: JSON.stringify({
            subject_id: Number(subjectId),
            session_id: Number(sessionId),
            attendance_date: document.getElementById("live-date").value,
            topic: document.getElementById("live-topic").value.trim(),
            duration_minutes: Number(document.getElementById("live-dur").value),
          }),
        });
        ERP.invalidateCache("/api/teacher/attendance");
        ERP.showToast("Live attendance link opened! Share the Class Code with students.");
        loadTakeAttendance(signal);
      } catch (err) { ERP.showToast(err.message, "danger"); }
    };

    main.querySelectorAll(".close-live-btn").forEach((btn) => {
      btn.onclick = async () => {
        const ok = await ERP.confirmAction({
          title: "Close Attendance Link",
          message: "All students who have not checked in will be automatically marked Absent. You can still mark late arrivals as Late in Update Attendance.",
          confirmLabel: "Close & Mark Absent",
          confirmClass: "btn-danger",
        });
        if (!ok) return;
        try {
          const res = await ERP.api(`/api/teacher/attendance/${btn.dataset.id}/close`, { method: "POST" });
          ERP.invalidateCache("/api/teacher/attendance");
          ERP.showToast(`Closed! ${res.present_count} present, ${res.absent_marked} marked absent.`);
          loadTakeAttendance(signal);
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    });

    document.getElementById("fetch-att-studs").onclick = async () => {
      const subjectId = document.getElementById("att-sub").value;
      const sessionId = document.getElementById("att-sess").value;
      if (!subjectId || !sessionId) return ERP.showToast("Select subject and session", "warning");
      const area = document.getElementById("att-students-area");
      ERP.renderSkeleton(area, "table");
      const students = await ERP.cachedApi(`/api/teacher/students?subject_id=${subjectId}&session_id=${sessionId}`, { signal });
      if (students.length === 0) {
        area.innerHTML = `<div class="alert alert-info">No students found for this subject and session.</div>`;
        return;
      }
      area.innerHTML = `
        <div class="table-responsive">
          <table class="table table-bordered align-middle">
            <thead><tr><th>Roll No</th><th>Student Name</th><th>Status</th><th>Remarks</th></tr></thead>
            <tbody>
              ${students.map((st) => `
                <tr data-sid="${st.id}">
                  <td>${esc(st.roll_number)}</td>
                  <td>${esc(st.profiles?.first_name)} ${esc(st.profiles?.last_name)}</td>
                  <td>
                    <select class="form-select form-select-sm att-status">
                      <option value="present" selected>Present</option>
                      <option value="absent">Absent</option>
                      <option value="late">Late</option>
                    </select>
                  </td>
                  <td><input type="text" class="form-control form-control-sm att-rem" placeholder="Optional note"></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <button id="save-att-btn" class="btn btn-success"><i data-lucide="save" class="me-1"></i>Save Attendance</button>`;

      document.getElementById("save-att-btn").onclick = async () => {
        const records = [...area.querySelectorAll("tr[data-sid]")].map((tr) => ({
          student_id: Number(tr.dataset.sid),
          status: tr.querySelector(".att-status").value,
          remarks: tr.querySelector(".att-rem").value.trim(),
        }));
        try {
          await ERP.api("/api/teacher/attendance", {
            method: "POST",
            body: JSON.stringify({
              subject_id: Number(subjectId),
              session_id: Number(sessionId),
              attendance_date: document.getElementById("att-date").value,
              topic: document.getElementById("att-topic").value.trim(),
              records,
            }),
          });
          ERP.showToast("Attendance saved successfully!");
          area.innerHTML = "";
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };
  }

  // 4. UPDATE ATTENDANCE
  async function loadUpdateAttendance(signal) {
    const sessions = await ERP.cachedApi("/api/teacher/attendance", { signal });
    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4">
        <h5 class="fw-bold mb-3">Update Past Attendance</h5>
        ${sessions.length === 0 ? `<div class="text-muted">No attendance sessions found yet.</div>` : `
          <div class="mb-3">
            <label class="form-label">Select Attendance Session</label>
            <select id="upd-att-select" class="form-select" style="max-width: 480px;">
              ${sessions.map((s) => `<option value="${s.id}">${esc(s.subjects?.name)} — ${esc(s.attendance_date)} (${esc(s.topic || "No topic")})</option>`).join("")}
            </select>
          </div>
          <div id="upd-att-body"></div>`}
      </div>`;

    if (sessions.length === 0) return;

    const renderSession = (sessionId) => {
      const s = sessions.find((x) => x.id == sessionId);
      const recs = s?.attendance_records || [];
      const body = document.getElementById("upd-att-body");
      body.innerHTML = `
        <div class="mb-2">
          <label class="form-label small">Topic</label>
          <input id="upd-topic" class="form-control form-control-sm" style="max-width: 400px;" value="${esc(s.topic || "")}">
        </div>
        <div class="table-responsive">
          <table class="table table-bordered align-middle">
            <thead><tr><th>Roll No</th><th>Student</th><th>Status</th><th>Remarks</th><th>Last Updated</th></tr></thead>
            <tbody>
              ${recs.map((r) => `
                <tr data-sid="${r.student_id}">
                  <td>${esc(r.students?.roll_number)}</td>
                  <td>${esc(r.students?.profiles?.first_name)} ${esc(r.students?.profiles?.last_name)}</td>
                  <td>
                    <select class="form-select form-select-sm upd-st">
                      <option value="present" ${r.status === "present" ? "selected" : ""}>Present</option>
                      <option value="absent" ${r.status === "absent" ? "selected" : ""}>Absent</option>
                      <option value="late" ${r.status === "late" ? "selected" : ""}>Late</option>
                    </select>
                  </td>
                  <td><input class="form-control form-control-sm upd-rem" value="${esc(r.remarks || "")}"></td>
                  <td class="small text-muted">${esc((r.updated_at || "").slice(0, 16).replace("T", " "))}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <button id="upd-att-save" class="btn btn-primary">Update Attendance</button>`;

      document.getElementById("upd-att-save").onclick = async () => {
        const records = [...body.querySelectorAll("tr[data-sid]")].map((tr) => ({
          student_id: Number(tr.dataset.sid),
          status: tr.querySelector(".upd-st").value,
          remarks: tr.querySelector(".upd-rem").value.trim(),
        }));
        try {
          await ERP.api(`/api/teacher/attendance/${s.id}`, {
            method: "PUT",
            body: JSON.stringify({ topic: document.getElementById("upd-topic").value.trim(), records }),
          });
          ERP.showToast("Attendance updated with audit log!");
          loadUpdateAttendance();
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    };

    renderSession(sessions[0].id);
    document.getElementById("upd-att-select").onchange = (e) => renderSession(e.target.value);
  }

  // 5. RESULTS
  async function loadResults(signal) {
    const [exams, subjects, results] = await Promise.all([
      ERP.cachedApi("/api/teacher/examinations", { signal }),
      ERP.cachedApi("/api/teacher/subjects", { signal }),
      ERP.cachedApi("/api/teacher/results", { signal }),
    ]);

    main.innerHTML = `
      <div class="card panel-card p-3 p-md-4 mb-4">
        <h5 class="fw-bold mb-3">Enter / Update Student Marks</h5>
        <form id="res-form" class="row g-3">
          <div class="col-md-3">
            <label class="form-label">Examination</label>
            <select id="r-exam" class="form-select" required>${exams.map((e) => `<option value="${e.id}" data-max="${e.max_marks}">${esc(e.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Subject</label>
            <select id="r-sub" class="form-select" required>${subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Student</label>
            <select id="r-stud" class="form-select" required><option value="">Select subject first</option></select>
          </div>
          <div class="col-md-1">
            <label class="form-label">Marks</label>
            <input type="number" step="0.5" min="0" id="r-marks" class="form-control" required>
          </div>
          <div class="col-md-2">
            <label class="form-label">Max Marks</label>
            <input type="number" step="0.5" min="1" id="r-max" class="form-control" value="${exams[0]?.max_marks || 100}" required>
          </div>
          <div class="col-12"><button class="btn btn-primary btn-sm" type="submit">Save Result</button></div>
        </form>
      </div>

      <div id="tr-wrap"></div>`;

    ERP.renderDataTable(document.getElementById("tr-wrap"), {
      title: "Recorded Results",
      searchPlaceholder: "Filter results...",
      rows: results,
      filters: [
        { id: "exam", label: "Examination", getValue: (r) => r.examinations?.name },
        { id: "subject", label: "Subject", getValue: (r) => r.subjects?.name },
        { id: "grade", label: "Grade", getValue: (r) => r.grade },
      ],
      exportFn: (filtered) => {
        ERP.exportCsv(
          "teacher-results.csv",
          ["Roll No", "Student", "Subject", "Exam", "Marks", "Max Marks", "Grade"],
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
      ],
      emptyMessage: "No results recorded yet.",
    });

    document.getElementById("r-exam").onchange = (e) => {
      const opt = e.target.selectedOptions[0];
      if (opt?.dataset.max) document.getElementById("r-max").value = opt.dataset.max;
    };

    const loadStudentsForSubject = async () => {
      const sid = document.getElementById("r-sub").value;
      if (!sid) return;
      const studs = await ERP.cachedApi(`/api/teacher/students?subject_id=${sid}`, { signal });
      document.getElementById("r-stud").innerHTML = studs.map((s) => `<option value="${s.id}">${esc(s.roll_number)} — ${esc(s.profiles?.first_name)} ${esc(s.profiles?.last_name)}</option>`).join("") || `<option value="">No students</option>`;
    };
    if (subjects.length > 0) loadStudentsForSubject();
    document.getElementById("r-sub").onchange = loadStudentsForSubject;

    document.getElementById("res-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ERP.api("/api/teacher/results", {
          method: "POST",
          body: JSON.stringify({
            examination_id: Number(document.getElementById("r-exam").value),
            subject_id: Number(document.getElementById("r-sub").value),
            student_id: Number(document.getElementById("r-stud").value),
            marks_obtained: Number(document.getElementById("r-marks").value),
            max_marks: Number(document.getElementById("r-max").value),
          }),
        });
        ERP.showToast("Result saved!");
        loadResults();
      } catch (err) { ERP.showToast(err.message, "danger"); }
    };
  }

  // 6. LEAVES
  async function loadLeaves(signal) {
    const rows = await ERP.cachedApi("/api/teacher/leaves", { signal });
    main.innerHTML = `
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="card panel-card p-3 p-md-4">
            <h5 class="fw-bold mb-3">Apply for Leave</h5>
            <form id="t-leave-form" class="row g-3">
              <div class="col-md-6"><label class="form-label">Start Date</label><input type="date" id="tl-start" class="form-control" required></div>
              <div class="col-md-6"><label class="form-label">End Date</label><input type="date" id="tl-end" class="form-control" required></div>
              <div class="col-12"><label class="form-label">Reason</label><textarea id="tl-reason" class="form-control" rows="3" required></textarea></div>
              <div class="col-12"><button class="btn btn-primary" type="submit">Submit Application</button></div>
            </form>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="card panel-card p-3 p-md-4">
            <h5 class="fw-bold mb-3">Leave History</h5>
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
    document.getElementById("t-leave-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ERP.api("/api/teacher/leaves", {
          method: "POST",
          body: JSON.stringify({
            start_date: document.getElementById("tl-start").value,
            end_date: document.getElementById("tl-end").value,
            reason: document.getElementById("tl-reason").value.trim(),
          }),
        });
        ERP.showToast("Leave application submitted!");
        loadLeaves();
      } catch (err) { ERP.showToast(err.message, "danger"); }
    };
  }

  // 7. FEEDBACK
  async function loadFeedback(signal) {
    const rows = await ERP.cachedApi("/api/teacher/feedback", { signal });
    main.innerHTML = `
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="card panel-card p-3 p-md-4">
            <h5 class="fw-bold mb-3">Send Feedback to HOD</h5>
            <form id="t-fb-form" class="row g-3">
              <div class="col-12"><label class="form-label">Subject</label><input id="tf-sub" class="form-control" value="General Feedback" required></div>
              <div class="col-12"><label class="form-label">Message</label><textarea id="tf-msg" class="form-control" rows="3" required></textarea></div>
              <div class="col-12"><button class="btn btn-primary" type="submit">Send Feedback</button></div>
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
                  ${rows.map((r) => `<tr><td><strong>${esc(r.subject)}</strong></td><td>${esc(r.message)}</td><td>${r.reply ? `<span class="text-success">${esc(r.reply)}</span>` : `<span class="text-muted">Pending</span>`}</td></tr>`).join("") || `<tr><td colspan="3" class="text-center text-muted">No feedback sent</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
    document.getElementById("t-fb-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ERP.api("/api/teacher/feedback", {
          method: "POST",
          body: JSON.stringify({ subject: document.getElementById("tf-sub").value.trim(), message: document.getElementById("tf-msg").value.trim() }),
        });
        ERP.showToast("Feedback sent!");
        loadFeedback();
      } catch (err) { ERP.showToast(err.message, "danger"); }
    };
  }

  // 8. CLASS INSIGHTS & SUBJECT NOTICES
  async function loadInsightsAndNotices(signal) {
    const [insights, notices, subjects] = await Promise.all([
      ERP.cachedApi("/api/teacher/insights", { signal }),
      ERP.cachedApi("/api/teacher/notices", { signal }),
      ERP.cachedApi("/api/teacher/subjects", { signal }),
    ]);

    main.innerHTML = `
      <div class="row g-4 mb-4">
        <div class="col-lg-6">
          <div class="card panel-card p-3 p-md-4 h-100">
            <h5 class="fw-bold mb-1">Low Attendance Alert (&lt; 75%)</h5>
            <div class="small text-muted mb-3">Students below 75% attendance in your subjects.</div>
            <div class="table-responsive">
              <table class="table table-sm table-hover align-middle mb-0">
                <thead><tr><th>Roll No</th><th>Student</th><th>Subject</th><th>Attendance</th></tr></thead>
                <tbody>
                  ${(insights.low_attendance || []).map((a) => `
                    <tr>
                      <td><strong>${esc(a.roll_number)}</strong></td>
                      <td>${esc(a.student_name)}</td>
                      <td>${esc(a.subject_code)}</td>
                      <td><span class="badge bg-danger">${a.percentage}% (${a.present}/${a.total})</span></td>
                    </tr>`).join("") || `<tr><td colspan="4" class="text-center text-muted py-3">All students have &ge; 75% attendance.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card panel-card p-3 p-md-4 h-100">
            <h5 class="fw-bold mb-1">Subject Performance Summary</h5>
            <div class="small text-muted mb-3">Average marks and pass rate across graded exams.</div>
            <div class="table-responsive">
              <table class="table table-sm table-hover align-middle mb-0">
                <thead><tr><th>Subject</th><th>Graded</th><th>Avg %</th><th>Pass Rate</th></tr></thead>
                <tbody>
                  ${(insights.subject_performance || []).map((p) => `
                    <tr>
                      <td><strong>${esc(p.subject_code)}</strong> — ${esc(p.subject_name)}</td>
                      <td>${p.graded_count}</td>
                      <td>${p.average_percentage}%</td>
                      <td><span class="badge ${p.pass_rate >= 60 ? "bg-success" : "bg-warning text-dark"}">${p.pass_rate}%</span></td>
                    </tr>`).join("") || `<tr><td colspan="4" class="text-center text-muted py-3">No subjects assigned.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="row g-4">
        <div class="col-lg-5">
          <div class="card panel-card p-3 p-md-4">
            <h5 class="fw-bold mb-3">Post Class Notice / Material</h5>
            <form id="t-notice-form" class="row g-3">
              <div class="col-12"><label class="form-label">Subject</label>
                <select id="tn-sub" class="form-select" required>${subjects.map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.code)})</option>`).join("")}</select>
              </div>
              <div class="col-12"><label class="form-label">Title</label><input id="tn-title" class="form-control" placeholder="e.g. Week 4 Lecture Slides" required></div>
              <div class="col-12"><label class="form-label">Message</label><textarea id="tn-content" class="form-control" rows="3" required></textarea></div>
              <div class="col-12"><label class="form-label">Resource Link (Optional)</label><input type="url" id="tn-url" class="form-control" placeholder="https://drive.google.com/..."></div>
              <div class="col-12"><button class="btn btn-primary" type="submit">Publish Notice</button></div>
            </form>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="card panel-card p-3 p-md-4">
            <h5 class="fw-bold mb-3">Published Class Notices</h5>
            ${(notices || []).map((n) => `
              <div class="border rounded p-3 mb-2 d-flex justify-content-between align-items-start gap-2">
                <div>
                  <span class="badge bg-primary me-1">${esc(n.subjects?.code)}</span>
                  <strong>${esc(n.title)}</strong>
                  <div class="small text-muted mt-1">${esc(n.content)}</div>
                  ${n.resource_url ? `<a href="${esc(n.resource_url)}" target="_blank" rel="noopener" class="small">Open Material Link</a>` : ""}
                </div>
                <button class="btn btn-sm btn-outline-danger del-notice-btn" data-id="${n.id}">Delete</button>
              </div>`).join("") || `<div class="text-muted small">No class notices published yet.</div>`}
          </div>
        </div>
      </div>`;

    document.getElementById("t-notice-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ERP.api("/api/teacher/notices", {
          method: "POST",
          body: JSON.stringify({
            subject_id: Number(document.getElementById("tn-sub").value),
            title: document.getElementById("tn-title").value.trim(),
            content: document.getElementById("tn-content").value.trim(),
            resource_url: document.getElementById("tn-url").value.trim(),
          }),
        });
        ERP.invalidateCache("/api/teacher/notices");
        ERP.showToast("Notice published to enrolled students!");
        loadInsightsAndNotices(signal);
      } catch (err) { ERP.showToast(err.message, "danger"); }
    };

    main.querySelectorAll(".del-notice-btn").forEach((b) => {
      b.onclick = async () => {
        try {
          await ERP.api(`/api/teacher/notices?id=${b.dataset.id}`, { method: "DELETE" });
          ERP.invalidateCache("/api/teacher/notices");
          ERP.showToast("Notice deleted");
          loadInsightsAndNotices(signal);
        } catch (err) { ERP.showToast(err.message, "danger"); }
      };
    });
  }

  const tabHandlers = {
    overview: loadOverview,
    subjects: loadSubjectsAndStudents,
    "take-attendance": loadTakeAttendance,
    "update-attendance": loadUpdateAttendance,
    results: loadResults,
    insights: loadInsightsAndNotices,
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
    roleLabel: "Teacher Portal",
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

import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import "./style.css";

const days = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

const menuItems = [
  { id: "dashboard", label: "Dashboard" },
  { id: "my-attendance", label: "My Attendance" },
  { id: "timetable", label: "Timetable" },
  { id: "attendance", label: "Attendance", staff: true },
  { id: "students", label: "Students", staff: true },
  { id: "reports", label: "Reports", staff: true },
  { id: "analytics", label: "Analytics", staff: true },
  { id: "settings", label: "Settings" },
];

const EMAIL_REDIRECT_URL =
  "https://adityamishra-spec.github.io/DDU-AIDS-ATTENDANCE/";

function formatTime(value) {
  if (!value) return "—";

  const [h, m] = value.split(":").map(Number);

  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${
    h >= 12 ? "PM" : "AM"
  }`;
}

function formatDate(value) {
  if (!value) return "—";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getIndiaDate() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

function percentage(present, total) {
  return total ? Math.round((present / total) * 100) : 0;
}

function Stat({ title, value, color }) {
  return (
    <div className="stat-card">
      <p>{title}</p>
      <h2 style={{ color: color || "inherit" }}>{value}</h2>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState("dashboard");

  const [students, setStudents] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [myAttendance, setMyAttendance] = useState([]);

  const [selectedSession, setSelectedSession] = useState("");
  const [search, setSearch] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [isSignup, setIsSignup] = useState(false);

  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentPhone, setNewStudentPhone] = useState("");
  const [newSubject, setNewSubject] = useState("");

  const [linkEmail, setLinkEmail] = useState("");
  const [linkStudentId, setLinkStudentId] = useState("");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const role = profile?.role || "student";
  const isStaff = role === "admin" || role === "cr";
  const isAdmin = role === "admin";

  const present = attendanceRecords.filter(
    (item) => item.status === "present"
  ).length;

  const absent = attendanceRecords.filter(
    (item) => item.status === "absent"
  ).length;

  const notMarked = Math.max(0, students.length - present - absent);

  const filteredStudents = useMemo(() => {
    const q = search.toLowerCase();

    return students.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.mobile_number?.includes(q)
    );
  }, [students, search]);

  const closedSessions = useMemo(
    () => sessions.filter((s) => !s.is_open),
    [sessions]
  );

  const todaySessions = useMemo(() => {
    const today = getIndiaDate();

    return sessions.filter(
      (s) => s.session_date === today && s.is_open
    );
  }, [sessions]);

  const subjectAnalytics = useMemo(() => {
    const result = {};

    closedSessions.forEach((s) => {
      if (!result[s.subject]) {
        result[s.subject] = {
          total: 0,
          present: 0,
        };
      }

      result[s.subject].total += 1;
    });

    allRecords.forEach((r) => {
      if (
        r.status === "present" &&
        r.attendance_sessions &&
        !r.attendance_sessions.is_open &&
        result[r.attendance_sessions.subject]
      ) {
        result[r.attendance_sessions.subject].present += 1;
      }
    });

    return Object.entries(result).map(([subject, values]) => ({
      subject,
      ...values,
      percentage: percentage(
        values.present,
        values.total * students.length
      ),
    }));
  }, [closedSessions, allRecords, students.length]);

  const studentAnalytics = useMemo(() => {
    return students.map((student) => {
      const total = closedSessions.length;

      const studentRecords = allRecords.filter(
        (r) =>
          r.student_id === student.id &&
          r.attendance_sessions &&
          !r.attendance_sessions.is_open
      );

      const attended = studentRecords.filter(
        (r) => r.status === "present"
      ).length;

      return {
        ...student,
        total,
        attended,
        missed: Math.max(0, total - attended),
        percentage: percentage(attended, total),
      };
    });
  }, [students, closedSessions, allRecords]);

  const myClosedRecords = myAttendance.filter(
    (r) => r.attendance_sessions && !r.attendance_sessions.is_open
  );

  const myPresent = myClosedRecords.filter(
    (r) => r.status === "present"
  ).length;

  const myPercentage = percentage(
    myPresent,
    myClosedRecords.length
  );

  // INITIAL AUTHENTICATION
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        setError(error.message);
      }

      if (mounted && data?.session) {
        setSession(data.session);
        await loadProfile(data.session.user.id);
      }

      if (mounted) {
        setLoading(false);
      }
    }

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);

      if (!newSession) {
        setProfile(null);
        setStudents([]);
        setTimetable([]);
        setSessions([]);
        setAttendanceRecords([]);
        setAllRecords([]);
        setMyAttendance([]);
        setSelectedSession("");
        setActive("dashboard");
      } else {
        setTimeout(() => {
          loadProfile(newSession.user.id);
        }, 0);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // AUTOMATIC DATA REFRESH
  useEffect(() => {
    if (!session || !profile) return;

    let refreshing = false;

    async function refreshData() {
      if (refreshing) return;

      refreshing = true;

      try {
        const tasks = [
          loadTimetable(),
          loadSessions(),
        ];

        if (isStaff) {
          tasks.push(loadStudents());
          tasks.push(loadAllRecords());
        }

        if (profile.student_id) {
          tasks.push(loadMyAttendance());
        }

        if (selectedSession) {
          tasks.push(loadAttendanceRecords(selectedSession));
        }

        await Promise.all(tasks);
      } finally {
        refreshing = false;
      }
    }

    refreshData();

    const refreshTimer = setInterval(refreshData, 15000);

    return () => {
      clearInterval(refreshTimer);
    };
  }, [
    session?.user?.id,
    profile?.id,
    profile?.student_id,
    isStaff,
    selectedSession,
  ]);

  // LOAD ATTENDANCE WHEN SESSION CHANGES
  useEffect(() => {
    if (selectedSession) {
      loadAttendanceRecords(selectedSession);
    } else {
      setAttendanceRecords([]);
    }
  }, [selectedSession]);

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, student_id")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      setError(error.message);
      return;
    }

    setProfile(data);
  }

  // AUTHENTICATION
  async function handleAuth(event) {
    event.preventDefault();

    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: loginEmail.trim(),
          password: loginPassword,
          options: {
            emailRedirectTo: EMAIL_REDIRECT_URL,
            data: {
              full_name: signupName.trim(),
              phone: signupPhone.trim(),
            },
          },
        });

        if (error) throw error;

        setMessage(
          data.session
            ? "Registration successful!"
            : "Registration successful. Please confirm your email if required."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: loginEmail.trim(),
          password: loginPassword,
        });

        if (error) throw error;

        setMessage("Login successful!");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    setProfile(null);
    setSession(null);
    setActive("dashboard");
    setMessage("");
    setError("");
  }

  // LOAD STUDENTS
  async function loadStudents() {
    const { data, error } = await supabase
      .from("students")
      .select("id, name, mobile_number, created_at")
      .order("name");

    if (error) {
      setError(error.message);
      return;
    }

    setStudents(data || []);
  }

  // LOAD TIMETABLE
  async function loadTimetable() {
    const { data, error } = await supabase
      .from("class_timetable")
      .select(
        "id, day_of_week, start_time, end_time, subject_code, class_label, room_name, class_location_id"
      )
      .order("day_of_week")
      .order("start_time");

    if (error) {
      setError("Timetable: " + error.message);
      return;
    }

    setTimetable(data || []);
  }

  // LOAD SESSIONS
  async function loadSessions() {
    const { data, error } = await supabase
      .from("attendance_sessions")
      .select("id, subject, session_date, is_open, created_by")
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    const loadedSessions = data || [];

    setSessions(loadedSessions);

    setSelectedSession((current) => {
      const currentExists = loadedSessions.some(
        (s) => s.id === current
      );

      if (currentExists) return current;

      const latestOpen = loadedSessions.find((s) => s.is_open);

      return latestOpen?.id || loadedSessions[0]?.id || "";
    });
  }

  // LOAD SELECTED SESSION RECORDS
  async function loadAttendanceRecords(sessionId) {
    const { data, error } = await supabase
      .from("attendance")
      .select("id, student_id, status, marked_at")
      .eq("session_id", sessionId);

    if (error) {
      setError(error.message);
      return;
    }

    setAttendanceRecords(data || []);
  }

  // LOAD ALL RECORDS FOR ANALYTICS
  async function loadAllRecords() {
    const { data, error } = await supabase
      .from("attendance")
      .select(
        "id, student_id, status, marked_at, attendance_sessions(subject, session_date, is_open)"
      );

    if (error) {
      setError("Analytics data: " + error.message);
      return;
    }

    setAllRecords(data || []);
  }

  // LOAD PERSONAL ATTENDANCE
  async function loadMyAttendance() {
    if (!profile?.student_id) return;

    const { data, error } = await supabase
      .from("attendance")
      .select(
        "id, status, marked_at, attendance_sessions(subject, session_date, is_open)"
      )
      .eq("student_id", profile.student_id)
      .order("marked_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setMyAttendance(data || []);
  }

  // ADD STUDENT
  async function addStudent(event) {
    event.preventDefault();

    setBusy(true);
    setError("");
    setMessage("");

    const { error } = await supabase.from("students").insert({
      name: newStudentName.trim(),
      mobile_number: newStudentPhone.trim(),
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Student added successfully!");

      setNewStudentName("");
      setNewStudentPhone("");

      await loadStudents();
    }

    setBusy(false);
  }

  // LINK STUDENT ACCOUNT
  async function linkStudent(event) {
    event.preventDefault();

    setBusy(true);
    setError("");
    setMessage("");

    const { data, error } = await supabase.rpc(
      "admin_link_student_by_email",
      {
        p_email: linkEmail.trim(),
        p_student_id: linkStudentId,
      }
    );

    if (error) {
      setError(error.message);
    } else {
      const result = Array.isArray(data) ? data[0] : data;

      if (result?.success === false) {
        setError(result.message || "Account linking failed.");
      } else {
        setMessage(result?.message || "Student account linked!");
      }
    }

    setBusy(false);
  }

  // CREATE MANUAL ATTENDANCE SESSION
  async function createAttendanceSession(event) {
    event.preventDefault();

    const subject = newSubject.trim().toUpperCase();

    if (!subject) {
      setError("Please enter a subject name or code.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const today = getIndiaDate();

      const { data: existing, error: checkError } = await supabase
        .from("attendance_sessions")
        .select("id, subject, session_date, is_open")
        .eq("subject", subject)
        .eq("session_date", today)
        .limit(1)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        setSelectedSession(existing.id);

        setMessage(
          existing.is_open
            ? "An open session for this subject already exists. Selected it."
            : "A session for this subject is already closed today. Duplicate session was not created."
        );

        setNewSubject("");
        return;
      }

      const { data, error } = await supabase
        .from("attendance_sessions")
        .insert({
          subject,
          session_date: today,
          is_open: true,
          created_by: session.user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setMessage("Attendance session created successfully!");
      setNewSubject("");

      await loadSessions();
      setSelectedSession(data.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // CLOSE SESSION AND MARK REMAINING STUDENTS ABSENT
  async function closeSession() {
    if (!selectedSession) return;

    const selected = sessions.find(
      (s) => s.id === selectedSession
    );

    if (!selected?.is_open) {
      setMessage("This session is already closed.");
      return;
    }

    const confirmed = window.confirm(
      "Close this session? Every student not marked Present will be marked Absent. This action cannot be undone."
    );

    if (!confirmed) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "close_attendance_session",
        {
          p_session_id: selectedSession,
        }
      );

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;

      if (result?.success === false) {
        throw new Error(
          result.message || "Could not close session."
        );
      }

      setMessage(
        result?.message ||
          `Session closed. ${
            result?.students_marked_absent ?? 0
          } students marked absent.`
      );

      await Promise.all([
        loadSessions(),
        loadAttendanceRecords(selectedSession),
        loadAllRecords(),
        loadMyAttendance(),
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // UPDATE ATTENDANCE MANUALLY
  async function updateAttendance(studentId, status) {
    if (!selectedSession) {
      setError("Please select an attendance session.");
      return;
    }

    const selected = sessions.find(
      (s) => s.id === selectedSession
    );

    if (!selected?.is_open) {
      setError("This session is closed. Attendance cannot be edited.");
      return;
    }

    setError("");
    setMessage("");

    if (status === "not_marked") {
      const { error } = await supabase
        .from("attendance")
        .delete()
        .eq("session_id", selectedSession)
        .eq("student_id", studentId);

      if (error) {
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("attendance")
        .upsert(
          {
            session_id: selectedSession,
            student_id: studentId,
            status,
            marked_at: new Date().toISOString(),
          },
          {
            onConflict: "session_id,student_id",
          }
        );

      if (error) {
        setError(error.message);
        return;
      }
    }

    setMessage("Attendance updated!");

    await Promise.all([
      loadAttendanceRecords(selectedSession),
      loadAllRecords(),
    ]);
  }

  // STUDENT GPS ATTENDANCE
  async function markMyAttendance() {
    setBusy(true);
    setError("");
    setMessage("");

    if (!profile?.student_id) {
      setError(
        "Your account is not linked. Please contact Admin."
      );

      setBusy(false);
      return;
    }

    if (!navigator.geolocation) {
      setError("Location is not supported by this browser.");

      setBusy(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { data, error } = await supabase.rpc(
            "mark_my_attendance",
            {
              p_lat: position.coords.latitude,
              p_lon: position.coords.longitude,
            }
          );

          if (error) throw error;

          const result = Array.isArray(data) ? data[0] : data;

          if (result?.success === false) {
            setError(
              result.message || "Attendance could not be marked."
            );
          } else {
            setMessage(
              result?.message ||
                "Attendance marked successfully!"
            );

            await loadMyAttendance();
            await loadSessions();
          }
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      },
      (geoError) => {
        setError(
          geoError.code === 1
            ? "Location permission denied. Allow location access."
            : geoError.code === 2
            ? "Your location could not be determined."
            : "Location request timed out. Try again."
        );

        setBusy(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  // EXPORT ANALYTICS CSV
  function exportCSV() {
    const rows = [
      [
        "Student Name",
        "Mobile",
        "Closed Sessions",
        "Present",
        "Absent",
        "Attendance %",
      ],
      ...studentAnalytics.map((s) => [
        s.name,
        s.mobile_number,
        s.total,
        s.attended,
        s.missed,
        `${s.percentage}%`,
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "DDU-AIDS-Attendance-Analytics.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  // LOADING SCREEN
  if (loading) {
    return (
      <div className="login-page">
        <h2>Loading DDU AIDS Portal...</h2>
      </div>
    );
  }

  // LOGIN / SIGNUP SCREEN
  if (!session) {
    return (
      <div className="login-page">
        <div className="login-box">
          <h1>DDU AIDS</h1>
          <p>Attendance Management Portal</p>

          <form onSubmit={handleAuth}>
            {isSignup && (
              <>
                <label>Full Name</label>
                <input
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder="Enter full name"
                  required
                />

                <label>Mobile Number</label>
                <input
                  value={signupPhone}
                  onChange={(e) => setSignupPhone(e.target.value)}
                  placeholder="Enter registered mobile number"
                  required
                />
              </>
            )}

            <label>Email Address</label>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="Enter email"
              required
            />

            <label>Password</label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Enter password"
              required
            />

            <button className="primary-btn" disabled={busy}>
              {busy
                ? "Please wait..."
                : isSignup
                ? "Create Account"
                : "Login"}
            </button>
          </form>

          <p>
            {isSignup
              ? "Already have an account?"
              : "New student?"}{" "}
            <button
              className="text-btn"
              onClick={() => {
                setIsSignup(!isSignup);
                setError("");
                setMessage("");
              }}
            >
              {isSignup ? "Login" : "Create Account"}
            </button>
          </p>

          {message && (
            <p className="success-message">{message}</p>
          )}

          {error && (
            <p className="error-message">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // MAIN APPLICATION
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h2>DDU AIDS</h2>
          <p>Attendance Portal</p>
        </div>

        <nav>
          {menuItems
            .filter((item) => !item.staff || isStaff)
            .map((item) => (
              <button
                key={item.id}
                className={active === item.id ? "active" : ""}
                onClick={() => {
                  setActive(item.id);
                  setMessage("");
                  setError("");
                }}
              >
                {item.label}
              </button>
            ))}
        </nav>

        <div className="sidebar-bottom">
          <p>{session.user.email}</p>
          <span className="role-label">
            {role.toUpperCase()}
          </span>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h2>
              {menuItems.find((i) => i.id === active)?.label}
            </h2>
            <p>
              DDU B.Tech Artificial Intelligence & Data Science
            </p>
          </div>
        </header>

        {message && (
          <div className="success-message">{message}</div>
        )}

        {error && (
          <div className="error-message">{error}</div>
        )}

        {/* DASHBOARD */}
        {active === "dashboard" && (
          <section className="page-content">
            <div className="welcome-panel">
              <h2>Welcome to DDU AIDS Portal</h2>
              <p>
                {session.user.email} · {role.toUpperCase()}
              </p>
            </div>

            {isStaff ? (
              <>
                <div className="stats-grid">
                  <Stat
                    title="Total Students"
                    value={students.length}
                  />

                  <Stat
                    title="Open Sessions"
                    value={sessions.filter((s) => s.is_open).length}
                  />

                  <Stat
                    title="Closed Sessions"
                    value={closedSessions.length}
                  />

                  <Stat
                    title="Below 75%"
                    value={
                      studentAnalytics.filter(
                        (s) =>
                          s.total > 0 && s.percentage < 75
                      ).length
                    }
                    color="#dc5555"
                  />
                </div>

                <div className="panel">
                  <h3>Quick Links</h3>

                  <div className="quick-links">
                    <button
                      onClick={() => setActive("attendance")}
                    >
                      Manage Attendance
                    </button>

                    <button
                      onClick={() => setActive("analytics")}
                    >
                      Open Analytics
                    </button>

                    <button
                      onClick={() => setActive("timetable")}
                    >
                      View Timetable
                    </button>
                  </div>
                </div>

                <div className="panel">
                  <h3>Today's Live Sessions</h3>

                  {todaySessions.length === 0 ? (
                    <p>No open attendance sessions right now.</p>
                  ) : (
                    <div className="table-wrapper">
                      <table>
                        <thead>
                          <tr>
                            <th>Subject</th>
                            <th>Date</th>
                            <th>Status</th>
                          </tr>
                        </thead>

                        <tbody>
                          {todaySessions.map((s) => (
                            <tr key={s.id}>
                              <td>{s.subject}</td>
                              <td>{formatDate(s.session_date)}</td>
                              <td className="status-present">
                                OPEN
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="panel">
                  <h3>Today's Live Classes</h3>

                  {todaySessions.length === 0 ? (
                    <p>
                      No attendance session is currently open.
                      Your live classes will appear here automatically.
                    </p>
                  ) : (
                    <>
                      <p>
                        Attendance is currently open for:
                      </p>

                      <div className="table-wrapper">
                        <table>
                          <thead>
                            <tr>
                              <th>Subject</th>
                              <th>Date</th>
                              <th>Status</th>
                            </tr>
                          </thead>

                          <tbody>
                            {todaySessions.map((s) => (
                              <tr key={s.id}>
                                <td>{s.subject}</td>
                                <td>{formatDate(s.session_date)}</td>
                                <td className="status-present">
                                  OPEN
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <button
                        className="primary-btn"
                        onClick={() =>
                          setActive("my-attendance")
                        }
                      >
                        Mark My Attendance
                      </button>
                    </>
                  )}
                </div>

                <div className="panel">
                  <h3>My Attendance</h3>

                  <p>
                    {profile?.student_id
                      ? "Your account is linked to the student roster."
                      : "Your account is not linked yet. Please contact Admin."}
                  </p>

                  <button
                    className="primary-btn"
                    onClick={() =>
                      setActive("my-attendance")
                    }
                  >
                    Open My Attendance
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {/* TIMETABLE */}
        {active === "timetable" && (
          <section className="page-content">
            <div className="panel">
              <h3>Official Class Timetable</h3>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Time</th>
                      <th>Subject</th>
                      <th>Class</th>
                      <th>Location</th>
                    </tr>
                  </thead>

                  <tbody>
                    {timetable.map((item) => (
                      <tr key={item.id}>
                        <td>{days[item.day_of_week]}</td>

                        <td>
                          {formatTime(item.start_time)} -{" "}
                          {formatTime(item.end_time)}
                        </td>

                        <td>{item.subject_code}</td>

                        <td>
                          {item.class_label || item.subject_code}
                        </td>

                        <td>
                          {item.room_name ||
                            "Location not configured"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* MY ATTENDANCE */}
        {active === "my-attendance" && (
          <section className="page-content">
            <div className="panel">
              <h3>My Attendance</h3>

              {!profile?.student_id ? (
                <p>
                  Your account is not linked. Please contact Admin.
                </p>
              ) : (
                <>
                  <div className="stats-grid">
                    <Stat
                      title="Closed Classes"
                      value={myClosedRecords.length}
                    />

                    <Stat
                      title="Present"
                      value={myPresent}
                      color="#159767"
                    />

                    <Stat
                      title="Attendance"
                      value={`${myPercentage}%`}
                      color={
                        myPercentage < 75
                          ? "#dc5555"
                          : "#159767"
                      }
                    />
                  </div>

                  {myClosedRecords.length > 0 &&
                    myPercentage < 75 && (
                      <div className="error-message">
                        Warning: Your attendance is below 75%.
                      </div>
                    )}

                  <p>
                    Mark attendance during your eligible class
                    time and at the configured classroom location.
                  </p>

                  <button
                    className="primary-btn"
                    onClick={markMyAttendance}
                    disabled={busy}
                  >
                    {busy
                      ? "Checking Location..."
                      : "Mark Attendance"}
                  </button>
                </>
              )}
            </div>

            <div className="panel">
              <h3>Attendance History</h3>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Subject</th>
                      <th>Status</th>
                      <th>Session</th>
                    </tr>
                  </thead>

                  <tbody>
                    {myAttendance.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {formatDate(
                            r.attendance_sessions?.session_date
                          )}
                        </td>

                        <td>
                          {r.attendance_sessions?.subject || "—"}
                        </td>

                        <td
                          className={
                            r.status === "present"
                              ? "status-present"
                              : "status-absent"
                          }
                        >
                          {r.status.toUpperCase()}
                        </td>

                        <td>
                          {r.attendance_sessions?.is_open
                            ? "Open"
                            : "Closed"}
                        </td>
                      </tr>
                    ))}

                    {myAttendance.length === 0 && (
                      <tr>
                        <td colSpan="4">
                          No attendance records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* STAFF ATTENDANCE */}
        {active === "attendance" && isStaff && (
          <section className="page-content">
            <div className="panel">
              <h3>Create Attendance Session</h3>

              <p>
                Automatic sessions are managed by the scheduler.
                Use this option only when you need a manual session.
              </p>

              <form onSubmit={createAttendanceSession}>
                <label>Subject Name / Code</label>

                <input
                  value={newSubject}
                  onChange={(e) =>
                    setNewSubject(e.target.value)
                  }
                  placeholder="Example: AID101"
                  required
                />

                <button
                  className="primary-btn"
                  disabled={busy}
                >
                  {busy ? "Creating..." : "Create Session"}
                </button>
              </form>
            </div>

            <div className="panel">
              <h3>Attendance Records</h3>

              <label>Select Session</label>

              <select
                value={selectedSession}
                onChange={(e) =>
                  setSelectedSession(e.target.value)
                }
              >
                <option value="">Select session</option>

                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subject} — {formatDate(s.session_date)}{" "}
                    {s.is_open ? "(Open)" : "(Closed)"}
                  </option>
                ))}
              </select>

              {selectedSession && (
                <>
                  <div className="stats-grid">
                    <Stat
                      title="Present"
                      value={present}
                      color="#159767"
                    />

                    <Stat
                      title="Absent"
                      value={absent}
                      color="#dc5555"
                    />

                    <Stat
                      title="Not Marked"
                      value={notMarked}
                    />
                  </div>

                  {sessions.find(
                    (s) => s.id === selectedSession
                  )?.is_open && (
                    <button
                      className="primary-btn"
                      onClick={closeSession}
                      disabled={busy}
                    >
                      {busy
                        ? "Closing..."
                        : "Close Session & Mark Remaining Absent"}
                    </button>
                  )}

                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Present</th>
                          <th>Absent</th>
                          <th>Not Marked</th>
                        </tr>
                      </thead>

                      <tbody>
                        {students.map((student) => {
                          const record = attendanceRecords.find(
                            (r) => r.student_id === student.id
                          );

                          const status =
                            record?.status || "not_marked";

                          const isOpen = sessions.find(
                            (s) => s.id === selectedSession
                          )?.is_open;

                          return (
                            <tr key={student.id}>
                              <td>{student.name}</td>

                              <td>
                                <button
                                  disabled={!isOpen}
                                  className={
                                    status === "present"
                                      ? "status-selected"
                                      : "status-btn"
                                  }
                                  onClick={() =>
                                    updateAttendance(
                                      student.id,
                                      "present"
                                    )
                                  }
                                >
                                  Present
                                </button>
                              </td>

                              <td>
                                <button
                                  disabled={!isOpen}
                                  className={
                                    status === "absent"
                                      ? "status-selected"
                                      : "status-btn"
                                  }
                                  onClick={() =>
                                    updateAttendance(
                                      student.id,
                                      "absent"
                                    )
                                  }
                                >
                                  Absent
                                </button>
                              </td>

                              <td>
                                <button
                                  disabled={!isOpen}
                                  className={
                                    status === "not_marked"
                                      ? "status-selected"
                                      : "status-btn"
                                  }
                                  onClick={() =>
                                    updateAttendance(
                                      student.id,
                                      "not_marked"
                                    )
                                  }
                                >
                                  Not Marked
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* STUDENTS */}
        {active === "students" && isStaff && (
          <section className="page-content">
            <div className="panel">
              <h3>Add New Student</h3>

              <form onSubmit={addStudent}>
                <label>Student Name</label>

                <input
                  value={newStudentName}
                  onChange={(e) =>
                    setNewStudentName(e.target.value)
                  }
                  required
                />

                <label>Mobile Number</label>

                <input
                  value={newStudentPhone}
                  onChange={(e) =>
                    setNewStudentPhone(e.target.value)
                  }
                  required
                />

                <button
                  className="primary-btn"
                  disabled={busy}
                >
                  Add Student
                </button>
              </form>
            </div>

            {isAdmin && (
              <div className="panel">
                <h3>Link Student Account</h3>

                <form onSubmit={linkStudent}>
                  <label>Select Student</label>

                  <select
                    value={linkStudentId}
                    onChange={(e) =>
                      setLinkStudentId(e.target.value)
                    }
                    required
                  >
                    <option value="">Choose student</option>

                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.mobile_number}
                      </option>
                    ))}
                  </select>

                  <label>Student Signup Email</label>

                  <input
                    type="email"
                    value={linkEmail}
                    onChange={(e) =>
                      setLinkEmail(e.target.value)
                    }
                    required
                  />

                  <button
                    className="primary-btn"
                    disabled={busy}
                  >
                    Link Account
                  </button>
                </form>
              </div>
            )}

            <div className="panel">
              <h3>Student Directory ({students.length})</h3>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students..."
              />

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Mobile Number</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredStudents.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.mobile_number}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* REPORTS */}
        {active === "reports" && isStaff && (
          <section className="page-content">
            <div className="panel">
              <h3>Attendance Reports</h3>

              <p>Reports include closed sessions only.</p>

              <div className="stats-grid">
                <Stat
                  title="Closed Sessions"
                  value={closedSessions.length}
                />

                <Stat
                  title="Students"
                  value={students.length}
                />

                <Stat
                  title="Below 75%"
                  value={
                    studentAnalytics.filter(
                      (s) =>
                        s.total > 0 && s.percentage < 75
                    ).length
                  }
                  color="#dc5555"
                />
              </div>

              <button
                className="primary-btn"
                onClick={exportCSV}
              >
                Export Analytics CSV
              </button>
            </div>
          </section>
        )}

        {/* ANALYTICS */}
        {active === "analytics" && isStaff && (
          <section className="page-content">
            <div className="panel">
              <h3>Class Attendance Analytics</h3>

              <p>
                Only closed sessions are included in these
                calculations.
              </p>

              <div className="stats-grid">
                <Stat
                  title="Total Students"
                  value={students.length}
                />

                <Stat
                  title="Closed Sessions"
                  value={closedSessions.length}
                />

                <Stat
                  title="Below 75%"
                  value={
                    studentAnalytics.filter(
                      (s) =>
                        s.total > 0 && s.percentage < 75
                    ).length
                  }
                  color="#dc5555"
                />

                <Stat
                  title="Eligible (75%+)"
                  value={
                    studentAnalytics.filter(
                      (s) =>
                        s.total > 0 && s.percentage >= 75
                    ).length
                  }
                  color="#159767"
                />
              </div>
            </div>

            <div className="panel">
              <h3>Student-wise Attendance</h3>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Present</th>
                      <th>Absent</th>
                      <th>Total Closed</th>
                      <th>Percentage</th>
                      <th>Remark</th>
                    </tr>
                  </thead>

                  <tbody>
                    {studentAnalytics.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.attended}</td>
                        <td>{s.missed}</td>
                        <td>{s.total}</td>

                        <td>
                          {s.total
                            ? `${s.percentage}%`
                            : "—"}
                        </td>

                        <td>
                          {s.total === 0
                            ? "No data"
                            : s.percentage < 75
                            ? "Below 75%"
                            : "Good"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <h3>Subject-wise Attendance</h3>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Present Marks</th>
                      <th>Possible Marks</th>
                      <th>Class Percentage</th>
                    </tr>
                  </thead>

                  <tbody>
                    {subjectAnalytics.map((s) => (
                      <tr key={s.subject}>
                        <td>{s.subject}</td>
                        <td>{s.present}</td>
                        <td>{s.total * students.length}</td>
                        <td>{`${s.percentage}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                className="primary-btn"
                onClick={exportCSV}
              >
                Export Analytics CSV
              </button>
            </div>
          </section>
        )}

        {/* SETTINGS */}
        {active === "settings" && (
          <section className="page-content">
            <div className="panel">
              <h3>Account Settings</h3>

              <p>
                <strong>Email:</strong> {session.user.email}
              </p>

              <p>
                <strong>Role:</strong> {role.toUpperCase()}
              </p>

              <p>
                <strong>Student Account:</strong>{" "}
                {profile?.student_id ? "Linked" : "Not linked"}
              </p>

              <button
                className="primary-btn"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
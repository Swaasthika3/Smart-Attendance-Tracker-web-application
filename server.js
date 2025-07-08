require("dotenv").config();
const express = require("express");
const path = require("path");
const multer = require("multer");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const moment = require("moment");
const fs = require("fs");
const session = require("express-session");
const xlsx = require("xlsx");
const ExcelJS = require("exceljs");
const bodyParser = require("body-parser");
const cors = require("cors");

const Faculty = require("./models/FacultyUser");
const Student = require("./models/StudentUser");
const ODRequest = require("./models/ODRequest");
const Attendance = require("./models/Attendance");

const app = express();
const PORT = 3000;

// ---------- Middleware ----------
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(session({
  secret: "smart-attendance-secret", // Replaces 'your-secret-key'
  resave: false,
  saveUninitialized: true,
}));

// ---------- MongoDB Connection ----------
mongoose.connect("mongodb://127.0.0.1:27017/smart_attendance3", {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// ---------- Uploads Folder ----------
const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// ---------- Nodemailer ----------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ---------- Load Excel Attendance Backup (if exists) ----------
let attendanceData = [];
try {
  const workbook = xlsx.readFile("./cleaned_attendance_report.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  attendanceData = xlsx.utils.sheet_to_json(sheet);
} catch (err) {
  console.warn("⚠️ Excel file load error:", err.message);
}

// ---------- Routes ----------
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "public", "welcome.html")));
app.get("/student-login", (_, res) => res.sendFile(path.join(__dirname, "public", "student-login.html")));
app.get("/faculty-login", (_, res) => res.sendFile(path.join(__dirname, "public", "faculty-login.html")));

// Student Login
app.post("/student-login", async (req, res) => {
  const { studentId, password } = req.body;
  try {
    const student = await Student.findOne({ studentId });
    if (student?.password === password) {
      res.redirect(`/student-dashboard/${studentId}`);
    } else {
      res.status(401).send("Invalid Student ID or Password");
    }
  } catch {
    res.status(500).send("Server error during student login");
  }
});

// Faculty Login
app.post("/faculty-login", async (req, res) => {
  const { facultyId, password } = req.body;
  try {
    const faculty = await Faculty.findOne({ facultyId });
    if (faculty?.password === password) {
      req.session.faculty = faculty;
      res.redirect("/faculty-dashboard");
    } else {
      res.status(401).send("Invalid Faculty ID or Password");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error during faculty login");
  }
});

// Student Dashboard
app.get("/student-dashboard/:studentId", async (req, res) => {
  const studentusers = await Student.findOne({ studentId: req.params.studentId });
  const odRequests = await ODRequest.find({ studentID: req.params.studentId });
  res.render("student-dashboard", { studentusers, odRequests });
});

// Faculty Dashboard
app.get("/faculty-dashboard", async (req, res) => {
  if (!req.session.faculty) return res.redirect("/faculty-login");
  const odRequests = await ODRequest.find();
  const formattedDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  res.render("faculty-dashboard", {
    faculty: req.session.faculty,
    odRequests,
    formattedDateTime
  });
});

// Submit OD Request
app.post("/submit-od", upload.single("proof"), async (req, res) => {
  const { studentId, reason } = req.body;
  if (!req.file) return res.status(400).send("Proof file is required");

  const filePath = `/uploads/${req.file.filename}`;
  const student = await Student.findOne({ studentId });
  const od = new ODRequest({
    studentID: studentId,
    reason,
    name: student?.name || "Unknown",
    filePath,
    date: moment().format("YYYY-MM-DD"),
    status: "Pending",
  });
  await od.save();
  res.send("OD submitted successfully.");
});

// OD API Endpoints
app.get("/api/od-requests", async (_, res) => {
  const odRequests = await ODRequest.find().lean();
  const populated = await Promise.all(odRequests.map(async od => {
    const student = await Student.findOne({ studentId: od.studentID });
    return { ...od, studentName: student?.name || "Unknown" };
  }));
  res.json(populated);
});

app.post("/api/approve-od/:id", async (req, res) => {
  const od = await ODRequest.findById(req.params.id);
  if (od) {
    od.status = "Approved";
    await od.save();
    res.redirect("/faculty-dashboard");
  } else res.status(404).send("Not found");
});

app.post("/api/reject-od/:id", async (req, res) => {
  const od = await ODRequest.findById(req.params.id);
  if (od) {
    od.status = "Rejected";
    await od.save();
    res.redirect("/faculty-dashboard");
  } else res.status(404).send("Not found");
});

app.delete("/delete-od/:id", async (req, res) => {
  await ODRequest.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Attendance Storage API
app.post("/api/attendance", async (req, res) => {
  const { name, roll, email, percentage } = req.body;
  try {
    await Attendance.create({ name, roll, email, percentage });
    res.send("Attendance saved");
  } catch {
    res.status(500).send("Error saving attendance");
  }
});

// Fetch All Students
app.get("/api/students", async (req, res) => {
  try {
    const students = await Attendance.find();
    res.json(students);
  } catch {
    res.status(500).send("Error fetching student data");
  }
});

// Filtered Students API
app.get("/api/students/filter", async (req, res) => {
  const { name, roll, percentage } = req.query;
  const query = {};
  if (name) query.name = new RegExp(name, "i");
  if (roll) query.roll = new RegExp(roll, "i");
  if (percentage) query.percentage = Number(percentage);
  const filtered = await Attendance.find(query);
  res.json(filtered);
});

// Export Attendance to Excel
app.get("/api/export-excel", async (req, res) => {
  const data = await Attendance.find().lean();
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Attendance");

  worksheet.columns = [
    { header: "Name", key: "name" },
    { header: "Roll", key: "roll" },
    { header: "Email", key: "email" },
    { header: "Percentage", key: "percentage" }
  ];
  worksheet.addRows(data);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=attendance.xlsx");
  await workbook.xlsx.write(res);
  res.end();
});

// Email Alerts
app.post("/send-alerts", async (req, res) => {
  const alerts = req.body;
  if (!Array.isArray(alerts)) return res.status(400).send("Invalid format");

  try {
    for (const student of alerts) {
      await sendLowAttendanceEmail(student.name, student.email, student.percentage);
    }
    res.send("Emails sent");
  } catch (err) {
    res.status(500).send("Failed to send emails");
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Send Low Attendance Email
async function sendLowAttendanceEmail(name, email, percentage) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "⚠️ Low Attendance Alert",
    text: `Hello ${name},\n\nYour attendance is currently ${percentage}%. Please maintain above 75%.`,
  };
  await transporter.sendMail(mailOptions);
}

// ---------- Start Server ----------
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

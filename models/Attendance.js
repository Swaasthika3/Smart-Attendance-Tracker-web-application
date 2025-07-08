const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  studentName: String,
  subject: String,
  date: Date,
  status: String  // e.g., Present / Absent
});

module.exports = mongoose.model('Attendance', AttendanceSchema);

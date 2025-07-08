const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: String,
  department: String,
  attendance: {
    type: Number,
    default: 0,
  },
});

// Avoid OverwriteModelError
module.exports = mongoose.models.StudentUser || mongoose.model("StudentUser", studentSchema);

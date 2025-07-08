const mongoose = require("mongoose");

const facultySchema = new mongoose.Schema({
  facultyId: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: String,
  department: String,
  attendance: {
    type: Number,
    default: 0,
  },
});

module.exports = mongoose.models.FacultyUser || mongoose.model("FacultyUser", facultySchema);

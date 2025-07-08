const mongoose = require("mongoose");

const odRequestSchema = new mongoose.Schema({
  studentID: { type: String, required: true },
  reason: { type: String, required: true },
  name: { type: String, required: true },
  filePath: { type: String },
  date: { type: String, required: true },
  status: { type: String, default: "Pending" }
});

const ODRequest = mongoose.model("ODRequest", odRequestSchema);

module.exports = ODRequest;

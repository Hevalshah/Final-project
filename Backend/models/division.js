const mongoose = require('mongoose');

const divisionSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // e.g., "Division A"
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }], // Subjects taught in this division
    batchCount: { type: Number, default: 2 }, // For lab sessions (2 batches per division)
    strength: { type: Number, required: true }, // Number of students in the division
    semester: { type: Number, required: true } // Semester number
});

module.exports = mongoose.model('Division', divisionSchema);
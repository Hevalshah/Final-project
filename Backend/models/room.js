const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    room_id: { type: String, required: true, unique: true },
    room_no: { type: String, required: true },
    name: { type: String, required: true },
    capacity: { type: Number, required: true },
    room_type: { type: String, default: 'Classroom' },
    equipment: { type: String, default: 'Projector' }
});

module.exports = mongoose.model('Room', roomSchema);
// const mongoose = require("mongoose");

// const roomSchema = new mongoose.Schema({
//   room_no: { type: String, required: true, unique: true }, // e.g., N-303
//   capacity: { type: Number, required: true }, // e.g., 60

//   weekly_schedule: {
//     type: Object,
//     default: {
//       Monday: {},
//       Tuesday: {},
//       Wednesday: {},
//       Thursday: {},
//       Friday: {},
//       Saturday: {},
//     },
//   },
// });

// module.exports = mongoose.model("Room", roomSchema);

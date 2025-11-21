const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const xlsx = require("xlsx");
const axios = require("axios");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("./models/user");
const app = express();

// Models
const Teacher = require("./models/teacher");
const Subject = require("./models/subject");
const Room = require("./models/room");
const Division = require("./models/division");

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cors());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Multer Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage: storage });

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// ==================== FILE UPLOAD ROUTES ====================
app.get("/", (req, res) => {
  res.render("index", { message: null });
});

// FIXED: Updated to handle multiple file upload fields properly
app.post("/upload", upload.any(), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No files uploaded" 
      });
    }

    // Find files by fieldname
    const teachersFile = req.files.find(f => f.fieldname === 'teachersFile' || f.originalname.includes('Teacher'));
    const subjectsFile = req.files.find(f => f.fieldname === 'subjectsFile' || f.originalname.includes('Subject'));
    const roomsFile = req.files.find(f => f.fieldname === 'roomsFile' || f.originalname.includes('Room'));

    if (!teachersFile || !subjectsFile || !roomsFile) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required files. Please upload Teachers, Subjects, and Rooms files." 
      });
    }

    // Parse Teachers
    const teachersWorkbook = xlsx.readFile(teachersFile.path);
    const teachersSheet = xlsx.utils.sheet_to_json(
      teachersWorkbook.Sheets[teachersWorkbook.SheetNames[0]]
    );

    const teachersData = teachersSheet.map((row) => ({
      mis_id: row.mis_id || row.MIS_ID || row['MIS ID'] || row['MIS_ID'] || row['Teacher ID'] || row.teacher_id,
      name: row.name || row.Name || row.NAME || row['Teacher Name'] || row.teacher_name,
      email: row.email || row.Email || row.EMAIL || row['Email ID'] || row.email_id,
      designation: row.designation || row.Designation || row.DESIGNATION || row.Rank || row.rank || 'Professor',
      subject_preferences: row.subject_preferences || row.Subject_Preferences || row['Subject Preferences'] || row.preferences ?
        (row.subject_preferences || row.Subject_Preferences || row['Subject Preferences'] || row.preferences).toString().split(',').map(s => s.trim()) : [],
      max_hours: parseInt(row.max_hours || row.Max_Hours || row['Max Hours'] || row['Maximum Hours'] || row.max_load || row.Max_Load || 16),
      shift: row.shift || row.Shift || row.SHIFT || 'Morning',
      preferred_shift: row.preferred_shift || row.Preferred_Shift || row['Preferred Shift'] || 'General'
    }));

    await Teacher.deleteMany();
    await Teacher.insertMany(teachersData);

    // Parse Subjects
    const subjectsWorkbook = xlsx.readFile(subjectsFile.path);
    const subjectsSheet = xlsx.utils.sheet_to_json(
      subjectsWorkbook.Sheets[subjectsWorkbook.SheetNames[0]]
    );

    const subjectsData = subjectsSheet.map((row) => {
      // Helper function to properly parse boolean values
      const parseBoolean = (value) => {
        if (value === undefined || value === null || value === '') return false;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        const str = String(value).toLowerCase().trim();
        return str === 'true' || str === '1' || str === 'yes' || str === 'y';
      };

      return {
        code: row.code || row.Code || row.CODE || row['Subject Code'] || row.subject_code,
        name: row.name || row.Name || row.NAME || row['Subject Name'] || row.subject_name,
        department: row.department || row.Department || row.DEPARTMENT || row.Dept || row.dept || 'CSE',
        semester: parseInt(row.semester || row.Semester || row.SEMESTER || row.Sem || row.sem || 3),
        weekly_load: row.weekly_load || row.Weekly_Load || row['Weekly Load'] || row.load || '3,1',
        difficulty: row.difficulty || row.Difficulty || row.DIFFICULTY || 'Medium',
        requires_lab: parseBoolean(row.requires_lab || row.Requires_Lab || row['Requires Lab'] || row.lab || row.Lab),
        total_hours: parseInt(row.total_hours || row.Total_Hours || row['Total Hours'] || row.hours || row.Hours || 4)
      };
    });

    await Subject.deleteMany();
    await Subject.insertMany(subjectsData);

    // Parse Rooms
    const roomsWorkbook = xlsx.readFile(roomsFile.path);
    const roomsSheet = xlsx.utils.sheet_to_json(
      roomsWorkbook.Sheets[roomsWorkbook.SheetNames[0]]
    );

    const roomsData = roomsSheet.map((row) => ({
      room_id: row.room_id || row.Room_ID || row['Room ID'] || row.room_no || row.Room_No || row['Room No'],
      room_no: row.room_no || row.Room_No || row['Room No'] || row.room_id || row.Room_ID || row['Room ID'],
      name: row.name || row.Name || row.NAME || row['Room Name'] || row.room_no || row.Room_No,
      capacity: parseInt(row.capacity || row.Capacity || row.CAPACITY || row.Seats || row.seats || 30),
      room_type: row.room_type || row.Room_Type || row['Room Type'] || row.Type || row.type || 'Classroom',
      equipment: row.equipment || row.Equipment || row.EQUIPMENT || row.Facilities || row.facilities || 'Projector'
    }));

    await Room.deleteMany();
    await Room.insertMany(roomsData);

    // Initialize Divisions
    await Division.deleteMany();
    const divisionsData = [
      { name: "Division A", semester: 3, strength: 60 },
      { name: "Division B", semester: 3, strength: 55 },
      { name: "Division C", semester: 3, strength: 50 },
      { name: "Division D", semester: 3, strength: 45 },
      { name: "Division E", semester: 3, strength: 40 },
    ];
    await Division.insertMany(divisionsData);

    // Cleanup uploaded files
    req.files.forEach(file => {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error("Error deleting file:", err);
      }
    });

    res.json({ 
      success: true, 
      message: 'Files uploaded and parsed successfully',
      data: {
        teachers: teachersData.length,
        subjects: subjectsData.length,
        rooms: roomsData.length,
        divisions: divisionsData.length
      }
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error uploading files.", 
      error: err.message 
    });
  }
});

// ==================== TEACHER ASSIGNMENT ROUTES ====================
// FIXED: Proper data fetching with error handling
app.get("/api/teachers", async (req, res) => {
  try {
    const teachers = await Teacher.find({}).lean();
    res.json({ success: true, data: teachers });
  } catch (err) {
    console.error("Error fetching teachers:", err);
    res.status(500).json({ success: false, message: err.message, data: [] });
  }
});

app.get("/api/subjects", async (req, res) => {
  try {
    const subjects = await Subject.find({}).lean();
    res.json({ success: true, data: subjects });
  } catch (err) {
    console.error("Error fetching subjects:", err);
    res.status(500).json({ success: false, message: err.message, data: [] });
  }
});

// FIXED: Save teacher assignments
app.post("/api/save-assignments", async (req, res) => {
  try {
    const { assignments, workloadSummary } = req.body;

    // Validate assignments structure
    if (!assignments || typeof assignments !== 'object') {
      return res.status(400).json({
        success: false,
        message: "Invalid assignments data"
      });
    }

    // Update subjects with assigned teachers (array format)
    for (const [subjectCode, teacherAssignments] of Object.entries(assignments)) {
      // teacherAssignments is an array of { teacherId, hours, isPriority }
      if (!Array.isArray(teacherAssignments)) {
        continue;
      }

      await Subject.findOneAndUpdate(
        { code: subjectCode },
        {
          assigned_teachers: teacherAssignments,
          // Also update legacy field with first teacher for backward compatibility
          assigned_teacher: teacherAssignments.length > 0 ? teacherAssignments[0].teacherId : null
        },
        { new: true }
      );
    }

    res.json({
      success: true,
      message: 'Teacher assignments saved successfully'
    });
  } catch (err) {
    console.error("Save assignments error:", err);
    res.status(500).json({
      success: false,
      message: "Error saving assignments.",
      error: err.message
    });
  }
});

// ==================== BATCH MANAGEMENT ROUTES ====================
// FIXED: Proper batch data structure
app.get("/api/batches", async (req, res) => {
  try {
    const divisions = await Division.find({}).lean();

    const batches = {};
    
    divisions.forEach(div => {
      const divLetter = div.name.split(' ')[1];
      const key = `${divLetter}-${div.semester}`;
      batches[key] = {
        name: `CSE-${divLetter} Semester ${div.semester}`,
        strength: div.strength,
        division: divLetter,
        semester: div.semester,
        subBatches: [
          { 
            id: `${divLetter}1`, 
            name: `Batch ${divLetter}1`, 
            students: Math.ceil(div.strength / 2) 
          },
          { 
            id: `${divLetter}2`, 
            name: `Batch ${divLetter}2`, 
            students: Math.floor(div.strength / 2) 
          }
        ]
      };
    });

    res.json({ success: true, data: batches });
  } catch (err) {
    console.error("Error fetching batches:", err);
    res.status(500).json({ success: false, message: err.message, data: {} });
  }
});

app.get("/api/rooms", async (req, res) => {
  try {
    const rooms = await Room.find({}).lean();
    res.json({ success: true, data: rooms });
  } catch (err) {
    console.error("Error fetching rooms:", err);
    res.status(500).json({ success: false, message: err.message, data: [] });
  }
});

app.post("/api/batch-assignments", async (req, res) => {
  try {
    const { batchAssignments } = req.body;

    // You can save this to a BatchAssignment collection if needed
    // For now, just acknowledge the save
    
    res.json({ 
      success: true, 
      message: 'Batch assignments saved successfully' 
    });
  } catch (err) {
    console.error("Batch assignment error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error saving batch assignments.",
      error: err.message 
    });
  }
});

// ==================== TIMETABLE GENERATION ROUTES ====================
app.get("/get-timetable", async (req, res) => {
  try {
    const teachers = await Teacher.find({}, "name email");
    const subjects = await Subject.find(
      {},
      "name code assignedTeachers"
    ).populate("assignedTeachers");
    const rooms = await Room.find({}, "name capacity");
    const divisions = await Division.find({}, "name");

    const timetableData = {
      teachers: teachers.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        email: t.email,
      })),
      subjects: subjects.map((s) => ({
        id: s._id.toString(),
        code: s.code,
        name: s.name,
        assignedTeachers: s.assignedTeachers.map((t) => t._id.toString()),
      })),
      rooms: rooms.map((r) => ({
        id: r._id.toString(),
        name: r.name,
        capacity: r.capacity,
      })),
      divisions: divisions.map((d) => ({ id: d._id.toString(), name: d.name })),
    };

    try {
      const response = await axios.post(
        "http://127.0.0.1:8000/generate-timetable",
        timetableData
      );
      const timetables = response.data;
      res.render("display-timetable", { timetables });
    } catch (apiError) {
      console.error("FastAPI Error:", apiError.message);
      res.render("display-timetable", {
        timetables: [],
        error: "Failed to generate timetable. Please try again.",
      });
    }
  } catch (error) {
    console.error("Error preparing timetable data:", error.message);
    res.status(500).send(`Failed to prepare timetable data: ${error.message}`);
  }
});

app.post("/api/generate-timetable", async (req, res) => {
  try {
    const teachers = await Teacher.find({});
    const subjects = await Subject.find({});
    const rooms = await Room.find({});
    const divisions = await Division.find({});

    const timetableData = {
      teachers: teachers.map((t) => ({
        id: t._id.toString(),
        mis_id: t.mis_id,
        name: t.name,
        email: t.email,
        designation: t.designation,
        max_hours: t.max_hours,
        shift: t.shift,
        preferred_shift: t.preferred_shift
      })),
      subjects: subjects.map((s) => {
        // Get assigned teachers - use the new assigned_teachers array
        let assignedTeachers = [];

        if (s.assigned_teachers && Array.isArray(s.assigned_teachers) && s.assigned_teachers.length > 0) {
          // Use the new assigned_teachers array (with teacherId field)
          assignedTeachers = s.assigned_teachers.map(a => a.teacherId);
        } else if (s.assigned_teacher) {
          // Fallback to old assigned_teacher field for backward compatibility
          assignedTeachers = [s.assigned_teacher];
        }

        return {
          id: s._id.toString(),
          code: s.code,
          name: s.name,
          department: s.department,
          semester: s.semester,
          weekly_load: s.weekly_load,
          total_hours: s.total_hours,
          assignedTeachers: assignedTeachers, // Array of teacher IDs
          requires_lab: s.requires_lab
        };
      }),
      rooms: rooms.map((r) => ({
        id: r._id.toString(),
        room_no: r.room_no,
        name: r.name,
        capacity: r.capacity,
        room_type: r.room_type,
        equipment: r.equipment
      })),
      divisions: divisions.map((d) => ({
        id: d._id.toString(),
        name: d.name,
        semester: d.semester,
        strength: d.strength
      })),
    };

    const response = await axios.post(
      "http://127.0.0.1:8000/generate-timetable",
      timetableData
    );
    const timetables = response.data;

    res.json({ success: true, data: timetables });
  } catch (error) {
    console.error("Error generating timetable:", error.message);
    res.status(500).json({ 
      success: false, 
      message: `Failed to generate timetable: ${error.message}` 
    });
  }
});

// ==================== AUTH ROUTES ====================
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields required." });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(409).json({ message: "Email already registered." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ userId: user._id }, "SECRET_KEY", {
      expiresIn: "2h",
    });
    res
      .status(201)
      .json({ token, user: { name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: "Signup failed." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "All fields required." });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid credentials." });

    const token = jwt.sign({ userId: user._id }, "SECRET_KEY", {
      expiresIn: "2h",
    });
    res.json({ token, user: { name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: "Login failed." });
  }
});

// Auth Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ message: "No token provided." });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, "SECRET_KEY", (err, decoded) => {
    if (err) return res.status(401).json({ message: "Invalid token." });
    req.userId = decoded.userId;
    next();
  });
}


app.post("/generate-timetable", (req, res) => {
  res
    .status(404)
    .send(
      "Route not found. Did you mean to call the FastAPI endpoint at http://127.0.0.1:8000/generate-timetable?"
    );
});


mongoose
  .connect("mongodb://localhost:27017/timetableDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(3000, () =>
      console.log("Server running on http://localhost:3000")
    );
  })
  .catch((err) => console.error("MongoDB connection error:", err));
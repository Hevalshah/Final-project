import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, BookOpen, MapPin, AlertCircle, CheckCircle, Save, RotateCcw, Plus, Trash2, Layers } from 'lucide-react';

const BatchManagementPage = ({ onBack, onNext }) => {
  const [batches, setBatches] = useState({});
  const [rooms, setRooms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [batchAssignments, setBatchAssignments] = useState({});
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);

  // Fetch data from backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [batchesRes, roomsRes, subjectsRes] = await Promise.all([
          fetch('http://localhost:3000/api/batches'),
          fetch('http://localhost:3000/api/rooms'),
          fetch('http://localhost:3000/api/subjects')
        ]);
        
        const batchesData = await batchesRes.json();
        const roomsData = await roomsRes.json();
        const subjectsData = await subjectsRes.json();
        
        if (batchesData.success) {
          setBatches(batchesData.data);
          setSelectedBatch(Object.keys(batchesData.data)[0]);
        }
        if (roomsData.success) setRooms(roomsData.data);
        if (subjectsData.success) setSubjects(subjectsData.data);
        
        // Initialize batch assignments
        const initialAssignments = {};
        Object.keys(batchesData.data).forEach(batchKey => {
          initialAssignments[batchKey] = {};
          subjectsData.data.forEach(subject => {
            initialAssignments[batchKey][subject.code] = {
              teacher: subject.assigned_teacher || null,
              room: null,
              batches: subject.requires_lab ? 'separate' : 'combined'
            };
          });
        });
        setBatchAssignments(initialAssignments);
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const assignRoomToBatch = (batchKey, subjectCode, roomNo) => {
    const room = rooms.find(r => r.room_no === roomNo);
    const subject = subjects.find(s => s.code === subjectCode);
    const batch = batches[batchKey];

    if (room && batch) {
      const requiredCapacity = batchAssignments[batchKey][subjectCode].batches === 'combined' 
        ? batch.strength 
        : Math.max(...batch.subBatches.map(b => b.students));

      if (room.capacity < requiredCapacity) {
        alert(`Room ${roomNo} capacity (${room.capacity}) is insufficient for this batch (${requiredCapacity} students)`);
        return;
      }

      // Check room type compatibility
      if (subject.requires_lab && room.room_type !== 'Lab') {
        setConflicts(prev => [...prev.filter(c => !(c.batch === batchKey && c.subject === subjectCode)), {
          type: 'room_type_mismatch',
          batch: batchKey,
          subject: subjectCode,
          room: roomNo,
          message: `${subject.name} requires a lab room but ${roomNo} is a ${room.room_type}`
        }]);
      } else if (!subject.requires_lab && room.room_type === 'Lab') {
        setConflicts(prev => [...prev.filter(c => !(c.batch === batchKey && c.subject === subjectCode)), {
          type: 'room_type_mismatch',
          batch: batchKey,
          subject: subjectCode,
          room: roomNo,
          message: `${subject.name} is a theory subject but ${roomNo} is a lab room`
        }]);
      } else {
        setConflicts(prev => prev.filter(c => !(c.batch === batchKey && c.subject === subjectCode)));
      }
    }

    setBatchAssignments(prev => ({
      ...prev,
      [batchKey]: {
        ...prev[batchKey],
        [subjectCode]: {
          ...prev[batchKey][subjectCode],
          room: roomNo
        }
      }
    }));
  };

  const setBatchMode = (batchKey, subjectCode, mode) => {
    setBatchAssignments(prev => ({
      ...prev,
      [batchKey]: {
        ...prev[batchKey],
        [subjectCode]: {
          ...prev[batchKey][subjectCode],
          batches: mode
        }
      }
    }));
  };

  const autoAssignRooms = () => {
    setLoading(true);
    
    setTimeout(() => {
      const newAssignments = { ...batchAssignments };
      
      Object.keys(batches).forEach(batchKey => {
        const batch = batches[batchKey];
        
        subjects.forEach(subject => {
          const assignment = newAssignments[batchKey][subject.code];
          if (!assignment.room) {
            const requiredCapacity = assignment.batches === 'combined' 
              ? batch.strength 
              : Math.max(...batch.subBatches.map(b => b.students));
            
            const suitableRooms = rooms.filter(room => {
              const isCapacitySufficient = room.capacity >= requiredCapacity;
              const isTypeMatch = subject.requires_lab ? room.room_type === 'Lab' : room.room_type === 'Classroom';
              return isCapacitySufficient && isTypeMatch;
            });
            
            if (suitableRooms.length > 0) {
              const bestRoom = suitableRooms.sort((a, b) => a.capacity - b.capacity)[0];
              assignment.room = bestRoom.room_no;
            }
          }
        });
      });
      
      setBatchAssignments(newAssignments);
      setLoading(false);
    }, 2000);
  };

  const saveAssignments = async () => {
    setSaving(true);
    
    try {
      const response = await fetch('http://localhost:3000/api/batch-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchAssignments })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('Batch assignments saved successfully!');
        if (onNext) onNext();
      }
    } catch (error) {
      console.error('Error saving batch assignments:', error);
      alert('Failed to save batch assignments');
    }
    
    setSaving(false);
  };

  const resetAssignments = () => {
    const resetAssignments = {};
    Object.keys(batches).forEach(batchKey => {
      resetAssignments[batchKey] = {};
      subjects.forEach(subject => {
        resetAssignments[batchKey][subject.code] = {
          teacher: subject.assigned_teacher || null,
          room: null,
          batches: subject.requires_lab ? 'separate' : 'combined'
        };
      });
    });
    setBatchAssignments(resetAssignments);
    setConflicts([]);
  };

  const getAssignmentProgress = () => {
    let total = 0;
    let completed = 0;
    
    Object.keys(batches).forEach(batchKey => {
      subjects.forEach(subject => {
        total++;
        const assignment = batchAssignments[batchKey]?.[subject.code];
        if (assignment?.teacher && assignment?.room) {
          completed++;
        }
      });
    });
    
    return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-700 text-lg font-medium">Loading batch management...</p>
        </div>
      </div>
    );
  }

  const progress = getAssignmentProgress();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors mb-6 group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">Back</span>
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-5xl font-bold text-gray-900 mb-3 tracking-tight">
                Batch & Room Management
              </h1>
              <p className="text-gray-600 text-lg">
                Manage batch divisions and assign rooms for optimal utilization
              </p>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={resetAssignments}
                className="px-5 py-2.5 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all flex items-center space-x-2 border border-gray-300"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="font-medium">Reset</span>
              </button>
              <button
                onClick={autoAssignRooms}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/30 font-medium"
                disabled={loading}
              >
                Auto Assign Rooms
              </button>
              <button
                onClick={saveAssignments}
                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all shadow-lg flex items-center space-x-2 font-medium"
                disabled={saving}
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save & Continue'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-600">Total Batches</div>
              <Layers className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{Object.keys(batches).length}</div>
          </div>
          
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-600">Assignments Complete</div>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{progress.completed}/{progress.total}</div>
          </div>
          
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-600">Conflicts</div>
              <AlertCircle className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{conflicts.length}</div>
          </div>
          
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-600">Progress</div>
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{progress.percentage}%</div>
          </div>
        </div>

        {/* Conflicts Alert */}
        {conflicts.length > 0 && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 rounded-lg p-5">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="ml-3 flex-1">
                <h3 className="font-semibold text-red-900 mb-2">Room Assignment Conflicts</h3>
                <div className="space-y-1">
                  {conflicts.map((conflict, index) => (
                    <p key={index} className="text-red-800 text-sm">{conflict.message}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-12 gap-8">
          {/* Batch Selector & Assignments */}
          <div className="col-span-8">
            {/* Batch Tabs */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-6 p-2">
              <div className="flex space-x-2 overflow-x-auto">
                {Object.keys(batches).map(batchKey => (
                  <button
                    key={batchKey}
                    onClick={() => setSelectedBatch(batchKey)}
                    className={`px-6 py-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                      selectedBatch === batchKey
                        ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {batches[batchKey].name}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Batch Details */}
            {selectedBatch && batches[selectedBatch] && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-2">
                        {batches[selectedBatch].name}
                      </h3>
                      <p className="text-gray-300">Total Students: {batches[selectedBatch].strength}</p>
                    </div>
                    <div className="flex space-x-3">
                      {batches[selectedBatch].subBatches.map(subBatch => (
                        <div key={subBatch.id} className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/20">
                          <div className="text-white font-bold text-lg">{subBatch.name}</div>
                          <div className="text-gray-300 text-sm">{subBatch.students} students</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Subject Assignments Table */}
                <div className="p-6">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-100 border-b-2 border-gray-200">
                          <th className="px-4 py-4 text-left text-sm font-bold text-gray-900">Subject</th>
                          <th className="px-4 py-4 text-left text-sm font-bold text-gray-900">Type</th>
                          <th className="px-4 py-4 text-left text-sm font-bold text-gray-900">Batch Mode</th>
                          <th className="px-4 py-4 text-left text-sm font-bold text-gray-900">Assigned Room</th>
                          <th className="px-4 py-4 text-center text-sm font-bold text-gray-900">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {subjects.map(subject => {
                          const assignment = batchAssignments[selectedBatch]?.[subject.code];
                          const assignedRoom = assignment?.room ? rooms.find(r => r.room_no === assignment.room) : null;
                          const hasConflict = conflicts.some(c => c.batch === selectedBatch && c.subject === subject.code);
                          
                          return (
                            <tr key={subject.code} className="hover:bg-blue-50/50 transition-colors">
                              <td className="px-4 py-4">
                                <div>
                                  <div className="font-bold text-gray-900">{subject.name}</div>
                                  <div className="text-sm text-gray-600">{subject.code}</div>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                                  subject.requires_lab 
                                    ? 'bg-red-100 text-red-800 border border-red-200' 
                                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                                }`}>
                                  {subject.requires_lab ? 'Lab' : 'Theory'}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <select
                                  value={assignment?.batches || 'combined'}
                                  onChange={(e) => setBatchMode(selectedBatch, subject.code, e.target.value)}
                                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                                >
                                  <option value="combined">Combined</option>
                                  <option value="separate">Separate Batches</option>
                                </select>
                              </td>
                              <td className="px-4 py-4">
                                <select
                                  value={assignment?.room || ''}
                                  onChange={(e) => assignRoomToBatch(selectedBatch, subject.code, e.target.value)}
                                  className={`w-full px-3 py-2 border-2 rounded-lg focus:outline-none focus:ring-2 text-sm font-medium ${
                                    hasConflict ? 'border-red-300 bg-red-50' : 'border-gray-300 focus:ring-blue-500'
                                  }`}
                                >
                                  <option value="">Select Room</option>
                                  {rooms
                                    .filter(room => subject.requires_lab ? room.room_type === 'Lab' : room.room_type === 'Classroom')
                                    .map(room => (
                                      <option key={room.room_no} value={room.room_no}>
                                        {room.room_no} ({room.capacity} capacity)
                                      </option>
                                    ))}
                                </select>
                                {assignedRoom && (
                                  <div className="text-xs text-gray-500 mt-1 flex items-center">
                                    <MapPin className="w-3 h-3 mr-1" />
                                    {assignedRoom.room_type} • {assignedRoom.equipment}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-4 text-center">
                                {hasConflict ? (
                                  <div className="inline-flex items-center space-x-1 bg-red-100 text-red-700 px-3 py-1.5 rounded-full">
                                    <AlertCircle className="w-4 h-4" />
                                    <span className="text-xs font-semibold">Conflict</span>
                                  </div>
                                ) : assignment?.room ? (
                                  <div className="inline-flex items-center space-x-1 bg-green-100 text-green-700 px-3 py-1.5 rounded-full">
                                    <CheckCircle className="w-4 h-4" />
                                    <span className="text-xs font-semibold">Assigned</span>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center space-x-1 bg-gray-100 text-gray-500 px-3 py-1.5 rounded-full">
                                    <Users className="w-4 h-4" />
                                    <span className="text-xs font-semibold">Pending</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Room Information Sidebar */}
          <div className="col-span-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden sticky top-8">
              <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-5 border-b border-blue-700">
                <h2 className="text-xl font-bold text-white flex items-center">
                  <MapPin className="w-5 h-5 mr-3" />
                  Available Rooms
                </h2>
              </div>
              
              <div className="p-6 space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
                {rooms.map(room => {
                  const assignmentCount = Object.keys(batches).reduce((count, batchKey) => {
                    return count + subjects.filter(subject => 
                      batchAssignments[batchKey]?.[subject.code]?.room === room.room_no
                    ).length;
                  }, 0);
                  
                  return (
                    <div key={room.room_no} className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-5 border-2 border-gray-200 hover:border-blue-400 transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-bold text-gray-900 text-lg">{room.room_no}</h3>
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold mt-1 ${
                            room.room_type === 'Lab' 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {room.room_type}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">
                            Capacity: {room.capacity}
                          </div>
                          <div className="text-xs text-gray-500">
                            {assignmentCount} assignments
                          </div>
                        </div>
                      </div>
                      
                      <div className="mb-3">
                        <div className="text-xs font-medium text-gray-700 mb-2">Equipment:</div>
                        <div className="flex flex-wrap gap-1">
                          {room.equipment.split(',').map(eq => (
                            <span key={eq} className="bg-white text-gray-700 px-2 py-1 rounded text-xs border border-gray-200">
                              {eq.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      {/* Utilization Bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`h-2 rounded-full transition-all duration-500 ${
                            assignmentCount === 0 ? 'bg-gray-400' :
                            assignmentCount <= 2 ? 'bg-green-500' :
                            assignmentCount <= 4 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min((assignmentCount / 6) * 100, 100)}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-500 mt-2 font-medium">
                        {assignmentCount === 0 ? 'Available' : 
                         assignmentCount <= 2 ? 'Low usage' :
                         assignmentCount <= 4 ? 'Moderate usage' : 'High usage'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Room Summary */}
              <div className="p-6 bg-gradient-to-r from-blue-50 to-blue-100 border-t border-blue-200">
                <h3 className="font-bold text-blue-900 mb-3 text-sm">Room Utilization Summary</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-blue-800">
                    <span className="font-medium">Classrooms:</span>
                    <span className="font-bold">
                      {rooms.filter(r => r.room_type === 'Classroom').length} available
                    </span>
                  </div>
                  <div className="flex justify-between text-blue-800">
                    <span className="font-medium">Labs:</span>
                    <span className="font-bold">
                      {rooms.filter(r => r.room_type === 'Lab').length} available
                    </span>
                  </div>
                  <div className="flex justify-between text-blue-900 pt-2 border-t border-blue-300">
                    <span className="font-semibold">Total Capacity:</span>
                    <span className="font-bold">
                      {rooms.reduce((sum, r) => sum + r.capacity, 0)} students
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Continue Button */}
        {progress.percentage === 100 && (
          <div className="mt-8 text-center animate-fade-in">
            <button
              onClick={saveAssignments}
              className="px-10 py-4 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-2xl hover:from-green-700 hover:to-green-600 transition-all text-lg font-bold shadow-xl shadow-green-600/30 hover:scale-105"
            >
              All Assignments Complete! Generate Final Timetable →
            </button>
          </div>
        )}
      </div>
      
      <style>
        {`
          .animate-fade-in {
            animation: fadeIn 0.5s ease-in;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
    </div>
  );
};

export default BatchManagementPage;
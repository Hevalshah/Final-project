import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, User, Clock, BookOpen, AlertTriangle, CheckCircle, Save, RotateCcw, X, Star } from 'lucide-react';

const TeacherAssignmentPage = ({ onBack, onNext }) => {
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [workloadSummary, setWorkloadSummary] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const progressPercent = useMemo(() => subjects.length > 0 ? (Object.keys(assignments).length / subjects.length) * 100 : 0, [assignments, subjects]);

  const saveAssignments = async () => {
    setSaving(true);
    try {
      const response = await fetch('http://localhost:3000/api/save-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments, workloadSummary })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('Assignments saved successfully!');
        if (onNext) onNext();
      } else {
        alert('Failed to save assignments: ' + result.message);
      }
    } catch (error) {
      console.error('Error saving assignments:', error);
      alert('Failed to save assignments: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Fetch data from backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Fetching teachers and subjects...');
        const [teachersRes, subjectsRes] = await Promise.all([
          fetch('http://localhost:3000/api/teachers'),
          fetch('http://localhost:3000/api/subjects')
        ]);
        
        const teachersData = await teachersRes.json();
        const subjectsData = await subjectsRes.json();
        
        console.log('Teachers response:', teachersData);
        console.log('Subjects response:', subjectsData);
        
        if (teachersData.success && teachersData.data) {
          setTeachers(teachersData.data);
          
          // Initialize workload summary
          const workload = {};
          teachersData.data.forEach(teacher => {
            workload[teacher.mis_id] = {
              assigned: 0,
              remaining: teacher.max_hours || 16,
              subjects: []
            };
          });
          setWorkloadSummary(workload);
        } else {
          console.error('Failed to fetch teachers:', teachersData);
        }
        
        if (subjectsData.success && subjectsData.data) {
          setSubjects(subjectsData.data);
        } else {
          console.error('Failed to fetch subjects:', subjectsData);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        alert('Error loading data. Please make sure you have uploaded the files first.');
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const assignSubjectToTeacher = (subjectCode, teacherId) => {
    const subject = subjects.find(s => s.code === subjectCode);
    const teacher = teachers.find(t => t.mis_id === teacherId);
    
    if (!subject || !teacher) return;

    // Check capacity
    const currentWorkload = workloadSummary[teacherId];
    if (currentWorkload.assigned + subject.total_hours > teacher.max_hours) {
      setWarnings(prev => [...prev, {
        type: 'overload',
        message: `${teacher.name} would exceed maximum hours (${teacher.max_hours}h/week)`
      }]);
      return;
    }

    // Remove previous assignment if exists
    if (assignments[subjectCode]) {
      const prevTeacherId = assignments[subjectCode];
      const prevSubject = subjects.find(s => s.code === subjectCode);
      setWorkloadSummary(prev => ({
        ...prev,
        [prevTeacherId]: {
          ...prev[prevTeacherId],
          assigned: prev[prevTeacherId].assigned - prevSubject.total_hours,
          remaining: prev[prevTeacherId].remaining + prevSubject.total_hours,
          subjects: prev[prevTeacherId].subjects.filter(s => s !== subjectCode)
        }
      }));
    }

    // Make new assignment
    setAssignments(prev => ({
      ...prev,
      [subjectCode]: teacherId
    }));

    // Update workload
    setWorkloadSummary(prev => ({
      ...prev,
      [teacherId]: {
        ...prev[teacherId],
        assigned: prev[teacherId].assigned + subject.total_hours,
        remaining: prev[teacherId].remaining - subject.total_hours,
        subjects: [...prev[teacherId].subjects, subjectCode]
      }
    }));

    // Update subject assignment
    setSubjects(prev => prev.map(s => 
      s.code === subjectCode 
        ? { ...s, assigned_teacher: teacherId }
        : s
    ));
  };

  const autoAssign = () => {
    setLoading(true);
    
    setTimeout(() => {
      const newAssignments = {};
      const newWorkload = { ...workloadSummary };
      
      // Reset all assignments
      Object.keys(newWorkload).forEach(teacherId => {
        newWorkload[teacherId] = {
          assigned: 0,
          remaining: teachers.find(t => t.mis_id === teacherId).max_hours,
          subjects: []
        };
      });

      // Sort subjects by total hours (descending)
      const sortedSubjects = [...subjects].sort((a, b) => b.total_hours - a.total_hours);

      // Assign based on preferences and availability
      sortedSubjects.forEach(subject => {
        const preferredTeachers = teachers.filter(teacher => 
          teacher.subject_preferences && teacher.subject_preferences.includes(subject.code)
        );

        for (const teacher of preferredTeachers) {
          if (newWorkload[teacher.mis_id].assigned + subject.total_hours <= teacher.max_hours) {
            newAssignments[subject.code] = teacher.mis_id;
            newWorkload[teacher.mis_id].assigned += subject.total_hours;
            newWorkload[teacher.mis_id].remaining -= subject.total_hours;
            newWorkload[teacher.mis_id].subjects.push(subject.code);
            break;
          }
        }

        // If not assigned, assign to any available teacher
        if (!newAssignments[subject.code]) {
          for (const teacher of teachers) {
            if (newWorkload[teacher.mis_id].assigned + subject.total_hours <= teacher.max_hours) {
              newAssignments[subject.code] = teacher.mis_id;
              newWorkload[teacher.mis_id].assigned += subject.total_hours;
              newWorkload[teacher.mis_id].remaining -= subject.total_hours;
              newWorkload[teacher.mis_id].subjects.push(subject.code);
              break;
            }
          }
        }
      });

      setAssignments(newAssignments);
      setWorkloadSummary(newWorkload);
      
      // Update subjects
      setSubjects(prev => prev.map(subject => ({
        ...subject,
        assigned_teacher: newAssignments[subject.code] || null
      })));
      
      setLoading(false);
    }, 2000);
  };

  const resetAssignments = () => {
    setAssignments({});
    setWorkloadSummary(prev => {
      const reset = {};
      Object.keys(prev).forEach(teacherId => {
        const teacher = teachers.find(t => t.mis_id === teacherId);
        reset[teacherId] = {
          assigned: 0,
          remaining: teacher.max_hours,
          subjects: []
        };
      });
      return reset;
    });
    setSubjects(prev => prev.map(s => ({ ...s, assigned_teacher: null })));
    setWarnings([]);
  };

  const assignedCount = Object.keys(assignments).length;
  const totalSubjects = subjects.length;
  const warningCount = warnings.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-700 text-lg font-medium">Loading teacher assignments...</p>
        </div>
      </div>
    );
  }

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
                Assign Subjects to Teachers
              </h1>
              <p className="text-gray-600 text-lg">
                Drag subjects to teachers or click to assign based on preferences and workload
              </p>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={resetAssignments}
                className="px-5 py-2.5 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all flex items-center space-x-2 border border-gray-300"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="font-medium">Reset All</span>
              </button>
              <button
                onClick={autoAssign}
                className="px-6 py-2.5 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-all shadow-lg shadow-gray-600/30 font-medium"
                disabled={loading}
              >
                Smart Auto-Assign
              </button>
              <button
                onClick={saveAssignments}
                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all shadow-lg flex items-center space-x-2 font-medium"
                disabled={saving || assignedCount === 0}
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
              <div className="text-sm font-medium text-gray-600">Total Teachers</div>
              <User className="w-5 h-5 text-gray-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{teachers.length}</div>
            <div className="text-xs text-gray-500 mt-1">Available</div>
          </div>
          
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-600">Subjects Assigned</div>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{assignedCount}/{totalSubjects}</div>
            <div className="text-xs text-gray-500 mt-1">{Math.round(progressPercent)}% complete</div>
          </div>
          
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-600">Warnings</div>
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{warningCount}</div>
            <div className="text-xs text-gray-500 mt-1">
              {warningCount === 0 ? 'All good' : 'Needs attention'}
            </div>
          </div>
          
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-600">Progress</div>
              <Clock className="w-5 h-5 text-gray-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{Math.round(progressPercent)}%</div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-3">
              <div 
                className="bg-gray-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Warnings Alert */}
        {warnings.length > 0 && (
          <div className="mb-6 bg-orange-50 border-l-4 border-orange-500 rounded-lg p-5">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="ml-3 flex-1">
                <h3 className="font-semibold text-orange-900 mb-2">Assignment Warnings</h3>
                <div className="space-y-1">
                  {warnings.map((warning, index) => (
                    <p key={index} className="text-orange-800 text-sm">{warning.message}</p>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setWarnings([])}
                className="text-orange-600 hover:text-orange-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-12 gap-8">
          {/* Available Subjects - Left Panel */}
          <div className="col-span-5">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-5 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white flex items-center">
                  <BookOpen className="w-5 h-5 mr-3" />
                  Available Subjects
                </h2>
                <p className="text-gray-300 text-sm mt-1">
                  {totalSubjects - assignedCount} subjects waiting for assignment
                </p>
              </div>
              
              <div className="p-6 space-y-3 max-h-[calc(100vh-350px)] overflow-y-auto">
                {subjects.length === 0 ? (
                  <div className="text-center py-12">
                    <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No subjects available</p>
                    <p className="text-gray-400 text-sm mt-2">Please upload subject files first</p>
                  </div>
                ) : (
                  subjects.map(subject => {
                    const isAssigned = !!assignments[subject.code];
                    const assignedTeacher = isAssigned ? 
                      teachers.find(t => t.mis_id === assignments[subject.code]) : null;
                    
                    return (
                      <div
                        key={subject.code}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          isAssigned
                            ? 'bg-green-50 border-green-300'
                            : 'bg-gray-50 border-gray-200 hover:border-gray-400 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h3 className="font-bold text-gray-900">{subject.name}</h3>
                              {subject.requires_lab && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                                  Lab
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">{subject.code}</p>
                            <div className="flex items-center space-x-3 mt-2 text-xs text-gray-500">
                              <span>{subject.department}</span>
                              <span>•</span>
                              <span>Sem {subject.semester}</span>
                              <span>•</span>
                              <span className="font-semibold text-gray-700">{subject.total_hours}h/week</span>
                            </div>
                          </div>
                          {isAssigned && (
                            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                          )}
                        </div>
                        
                        {isAssigned && assignedTeacher && (
                          <div className="mt-3 pt-3 border-t border-green-200">
                            <div className="flex items-center space-x-2 text-sm text-green-900">
                              <User className="w-4 h-4" />
                              <span className="font-medium">{assignedTeacher.name}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Teachers - Right Panel */}
          <div className="col-span-7">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-gray-600 to-gray-500 px-6 py-5 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white flex items-center">
                  <User className="w-5 h-5 mr-3" />
                  Teachers
                </h2>
                <p className="text-gray-100 text-sm mt-1">
                  {teachers.filter(t => workloadSummary[t.mis_id]?.subjects.length > 0).length} teachers actively assigned
                </p>
              </div>
              
              <div className="p-6 space-y-4 max-h-[calc(100vh-350px)] overflow-y-auto">
                {teachers.length === 0 ? (
                  <div className="text-center py-12">
                    <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No teachers available</p>
                    <p className="text-gray-400 text-sm mt-2">Please upload teacher files first</p>
                  </div>
                ) : (
                  teachers.map(teacher => {
                    const workload = workloadSummary[teacher.mis_id] || { assigned: 0, remaining: teacher.max_hours, subjects: [] };
                    const utilizationPercent = (workload.assigned / teacher.max_hours) * 100;
                    
                    return (
                      <div key={teacher.mis_id} className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-gray-200 p-6 hover:shadow-lg transition-all">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="font-bold text-gray-900 text-lg">{teacher.name}</h3>
                              <span className="px-3 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded-full">
                                {teacher.designation}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-1">{teacher.email}</p>
                            <div className="flex items-center space-x-2 text-xs text-gray-500">
                              <span className="px-2 py-1 bg-gray-100 rounded">
                                {teacher.preferred_shift} Shift
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-3xl font-bold mb-1 ${
                              utilizationPercent > 90 ? 'text-red-600' :
                              utilizationPercent > 70 ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {workload.assigned}<span className="text-gray-400 text-lg">/{teacher.max_hours}h</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {workload.remaining}h available
                            </div>
                          </div>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="mb-4">
                          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                            <div 
                              className={`h-3 rounded-full transition-all duration-500 ${
                                utilizationPercent > 90 ? 'bg-red-500' : 
                                utilizationPercent > 70 ? 'bg-orange-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-xs text-gray-600 font-medium">
                              {utilizationPercent.toFixed(0)}% utilized
                            </span>
                            <span className={`text-xs font-semibold ${
                              utilizationPercent > 90 ? 'text-red-600' :
                              utilizationPercent > 70 ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {utilizationPercent > 90 ? 'Overloaded' :
                               utilizationPercent > 70 ? 'High Load' :
                               utilizationPercent > 40 ? 'Optimal' : 'Available'}
                            </span>
                          </div>
                        </div>

                        {/* Preferred Subjects */}
                        {teacher.subject_preferences && teacher.subject_preferences.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
                              <Star className="w-3 h-3 mr-1 text-yellow-500" />
                              Preferred Subjects:
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {teacher.subject_preferences.map(code => (
                                <span key={code} className="px-2 py-1 bg-yellow-50 text-yellow-800 text-xs font-medium rounded border border-yellow-200">
                                  {code}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Assigned Subjects */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-3 flex items-center justify-between">
                            <span>Assigned Subjects ({workload.subjects.length}):</span>
                            {workload.subjects.length > 0 && (
                              <span className="text-gray-600">{workload.assigned}h total</span>
                            )}
                          </h4>
                          {workload.subjects.length > 0 ? (
                            <div className="space-y-2">
                              {workload.subjects.map(subjectCode => {
                                const subject = subjects.find(s => s.code === subjectCode);
                                return subject && (
                                  <div key={subjectCode} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-gray-200 hover:border-gray-300 transition-all">
                                    <div className="flex items-center space-x-3 flex-1">
                                      <BookOpen className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-900 text-sm truncate">{subject.name}</div>
                                        <div className="text-xs text-gray-500">{subject.code}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                      <span className="text-sm font-semibold text-gray-600">{subject.total_hours}h</span>
                                      <button
                                        onClick={() => {
                                          const updatedAssignments = { ...assignments };
                                          delete updatedAssignments[subjectCode];
                                          setAssignments(updatedAssignments);
                                          
                                          setWorkloadSummary(prev => ({
                                            ...prev,
                                            [teacher.mis_id]: {
                                              ...prev[teacher.mis_id],
                                              assigned: prev[teacher.mis_id].assigned - subject.total_hours,
                                              remaining: prev[teacher.mis_id].remaining + subject.total_hours,
                                              subjects: prev[teacher.mis_id].subjects.filter(s => s !== subjectCode)
                                            }
                                          }));
                                          
                                          setSubjects(prev => prev.map(s => 
                                            s.code === subjectCode ? { ...s, assigned_teacher: null } : s
                                          ));
                                        }}
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-all"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                              <User className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                              <p className="text-gray-500 text-sm">No subjects assigned yet</p>
                              <p className="text-gray-400 text-xs mt-1">Click on subjects to assign</p>
                            </div>
                          )}
                        </div>
                        
                        {/* Quick Assign Dropdown */}
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <select 
                            value="" 
                            onChange={(e) => {
                              if (e.target.value) {
                                assignSubjectToTeacher(e.target.value, teacher.mis_id);
                                e.target.value = '';
                              }
                            }}
                            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm font-medium text-gray-700 hover:border-gray-400 transition-all cursor-pointer"
                          >
                            <option value="">+ Assign a Subject</option>
                            {subjects.filter(s => !assignments[s.code]).map(subject => {
                              const canAssign = workload.remaining >= subject.total_hours;
                              const isPreferred = teacher.subject_preferences && teacher.subject_preferences.includes(subject.code);
                              
                              return (
                                <option 
                                  key={subject.code} 
                                  value={subject.code}
                                  disabled={!canAssign}
                                >
                                  {subject.name} ({subject.total_hours}h)
                                  {isPreferred && ' ⭐'}
                                  {!canAssign && ' - Insufficient capacity'}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Continue Button */}
        {progressPercent === 100 && (
          <div className="mt-8 text-center animate-fade-in">
            <button
              onClick={saveAssignments}
              className="px-10 py-4 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-2xl hover:from-green-700 hover:to-green-600 transition-all text-lg font-bold shadow-xl shadow-green-600/30 hover:scale-105"
            >
              All Subjects Assigned! Continue to Batch Management →
            </button>
          </div>
        )}
      </div>
      
      <style jsx>{`
        .animate-fade-in {
          animation: fadeIn 0.5s ease-in;
        }
        @keyframes fadeIn {
          from { 
            opacity: 0; 
            transform: translateY(10px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }
      `}</style>
    </div>
  );
};

export default TeacherAssignmentPage;
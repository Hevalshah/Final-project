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

  const progressPercent = useMemo(() => {
    if (subjects.length === 0) return 0;
    const assignedCount = subjects.filter(subject => {
      const subjectAssignments = assignments[subject.code] || [];
      return subjectAssignments.length > 0; // Subject is assigned if at least one teacher has it
    }).length;
    return (assignedCount / subjects.length) * 100;
  }, [assignments, subjects]);

  const saveAssignments = async () => {
    setSaving(true);
    try {
      // Save assignments with priority flags
      // Priority teachers (isPriority: true) will be assigned to higher/top classes first
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

  const assignSubjectToTeacher = (subjectCode, teacherId, hoursToAssign = null) => {
    const subject = subjects.find(s => s.code === subjectCode);
    const teacher = teachers.find(t => t.mis_id === teacherId);

    if (!subject || !teacher) return;

    const MAX_HOURS_PER_SUBJECT = 4;
    const currentWorkload = workloadSummary[teacherId];
    const currentAssignments = assignments[subjectCode] || [];

    // Check if this teacher already has this subject
    const alreadyAssignedToThisTeacher = currentAssignments.some(a => a.teacherId === teacherId);
    if (alreadyAssignedToThisTeacher) {
      setWarnings(prev => [...prev, {
        type: 'info',
        message: `${teacher.name} is already assigned to ${subject.code}`
      }]);
      return;
    }

    // Calculate hours to assign to this teacher (max 4h per teacher per subject)
    if (!hoursToAssign) {
      hoursToAssign = Math.min(subject.total_hours, MAX_HOURS_PER_SUBJECT);
    }

    // Check if teacher has capacity
    if (hoursToAssign > currentWorkload.remaining) {
      setWarnings(prev => [...prev, {
        type: 'overload',
        message: `${teacher.name} has only ${currentWorkload.remaining}h available (needs ${hoursToAssign}h for ${subject.code})`
      }]);
      return;
    }

    // Update assignments
    setAssignments(prev => {
      const updated = { ...prev };
      if (!updated[subjectCode]) {
        updated[subjectCode] = [];
      }
      updated[subjectCode] = [...updated[subjectCode], { teacherId, hours: hoursToAssign, isPriority: false }];
      return updated;
    });

    // Update workload
    setWorkloadSummary(prev => ({
      ...prev,
      [teacherId]: {
        ...prev[teacherId],
        assigned: prev[teacherId].assigned + hoursToAssign,
        remaining: prev[teacherId].remaining - hoursToAssign,
        subjects: [
          ...prev[teacherId].subjects.filter(s => s.code !== subjectCode),
          { code: subjectCode, hours: hoursToAssign }
        ]
      }
    }));

    // Update subject assignment
    setSubjects(prev => prev.map(s =>
      s.code === subjectCode
        ? {
            ...s,
            assigned_teachers: [...(s.assigned_teachers || []), { teacherId, hours: hoursToAssign, isPriority: false }]
          }
        : s
    ));
  };

  const togglePriority = (subjectCode, teacherId) => {
    setAssignments(prev => {
      const updated = { ...prev };
      if (updated[subjectCode]) {
        updated[subjectCode] = updated[subjectCode].map(assignment =>
          assignment.teacherId === teacherId
            ? { ...assignment, isPriority: !assignment.isPriority }
            : assignment
        );
      }
      return updated;
    });

    setSubjects(prev => prev.map(subject => {
      if (subject.code === subjectCode && subject.assigned_teachers) {
        return {
          ...subject,
          assigned_teachers: subject.assigned_teachers.map(assignment =>
            assignment.teacherId === teacherId
              ? { ...assignment, isPriority: !assignment.isPriority }
              : assignment
          )
        };
      }
      return subject;
    }));
  };

  const autoAssign = () => {
    setLoading(true);

    setTimeout(() => {
      const newAssignments = {};
      const newWorkload = { ...workloadSummary };
      const MAX_HOURS_PER_SUBJECT = 4; // Maximum hours per teacher per subject

      // Reset all assignments
      Object.keys(newWorkload).forEach(teacherId => {
        newWorkload[teacherId] = {
          assigned: 0,
          remaining: teachers.find(t => t.mis_id === teacherId).max_hours,
          subjects: []
        };
      });

      // Process each subject
      subjects.forEach(subject => {
        newAssignments[subject.code] = []; // Array of { teacherId, hours }

        // Calculate hours to assign to EACH teacher (max 4h/week per teacher per subject)
        // Note: subject.total_hours is preserved; this limit is PER TEACHER only
        const hoursPerTeacher = Math.min(subject.total_hours, MAX_HOURS_PER_SUBJECT);

        // First: Assign to all teachers who prefer this subject
        const preferredTeachers = teachers.filter(teacher =>
          teacher.subject_preferences && teacher.subject_preferences.includes(subject.code)
        ).sort((a, b) => newWorkload[b.mis_id].remaining - newWorkload[a.mis_id].remaining); // Sort by most available first

        for (const teacher of preferredTeachers) {
          const availableCapacity = newWorkload[teacher.mis_id].remaining;

          // Check if teacher has capacity
          if (availableCapacity >= hoursPerTeacher) {
            newAssignments[subject.code].push({
              teacherId: teacher.mis_id,
              hours: hoursPerTeacher,
              isPriority: false
            });
            newWorkload[teacher.mis_id].assigned += hoursPerTeacher;
            newWorkload[teacher.mis_id].remaining -= hoursPerTeacher;
            newWorkload[teacher.mis_id].subjects.push({
              code: subject.code,
              hours: hoursPerTeacher
            });
          }
        }

        // If no preferred teachers were assigned, assign to any available teacher
        if (newAssignments[subject.code].length === 0) {
          const availableTeachers = teachers
            .filter(t => newWorkload[t.mis_id].remaining >= hoursPerTeacher)
            .sort((a, b) => newWorkload[b.mis_id].remaining - newWorkload[a.mis_id].remaining);

          if (availableTeachers.length > 0) {
            const teacher = availableTeachers[0]; // Assign to the teacher with most availability
            newAssignments[subject.code].push({
              teacherId: teacher.mis_id,
              hours: hoursPerTeacher,
              isPriority: false
            });
            newWorkload[teacher.mis_id].assigned += hoursPerTeacher;
            newWorkload[teacher.mis_id].remaining -= hoursPerTeacher;
            newWorkload[teacher.mis_id].subjects.push({
              code: subject.code,
              hours: hoursPerTeacher
            });
          }
        }
      });

      setAssignments(newAssignments);
      setWorkloadSummary(newWorkload);

      // Update subjects with assignment info
      setSubjects(prev => prev.map(subject => ({
        ...subject,
        assigned_teachers: newAssignments[subject.code] || []
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
    setSubjects(prev => prev.map(s => ({ ...s, assigned_teachers: [] })));
    setWarnings([]);
  };

  const assignedCount = subjects.filter(subject => {
    const subjectAssignments = assignments[subject.code] || [];
    return subjectAssignments.length > 0; // Subject is assigned if at least one teacher has it
  }).length;
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
                    const subjectAssignments = assignments[subject.code] || [];
                    const isAssigned = subjectAssignments.length > 0;
                    const hasMultipleTeachers = subjectAssignments.length > 1;
                    const priorityCount = subjectAssignments.filter(a => a.isPriority).length;

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
                              {hasMultipleTeachers && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                  {subjectAssignments.length} Teachers
                                </span>
                              )}
                              {priorityCount > 0 && (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full flex items-center space-x-1">
                                  <Star className="w-3 h-3 fill-current" />
                                  <span>{priorityCount} Priority</span>
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

                        {subjectAssignments.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-green-200">
                            <div className="space-y-1.5">
                              {subjectAssignments
                                .sort((a, b) => (b.isPriority ? 1 : 0) - (a.isPriority ? 1 : 0))
                                .map((assignment, idx) => {
                                  const teacher = teachers.find(t => t.mis_id === assignment.teacherId);
                                  const isPreferred = teacher?.subject_preferences?.includes(subject.code);
                                  return teacher && (
                                    <div key={idx} className={`flex items-center justify-between text-sm p-2 rounded-lg transition-all ${
                                      assignment.isPriority ? 'bg-yellow-50 border border-yellow-300 text-yellow-900' : 'text-green-900'
                                    }`}>
                                      <div className="flex items-center space-x-2 flex-1">
                                        <User className="w-4 h-4" />
                                        <span className="font-medium">{teacher.name}</span>
                                        {isPreferred && (
                                          <span className="text-xs text-blue-600" title="Preferred Subject">✓</span>
                                        )}
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <span className="text-xs font-semibold">{assignment.hours}h</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            togglePriority(subject.code, assignment.teacherId);
                                          }}
                                          className={`p-1 rounded hover:bg-yellow-100 transition-all ${
                                            assignment.isPriority ? 'text-yellow-600' : 'text-gray-400 hover:text-yellow-600'
                                          }`}
                                          title={assignment.isPriority ? 'Remove Priority' : 'Set as Priority'}
                                        >
                                          <Star className={`w-4 h-4 ${assignment.isPriority ? 'fill-current' : ''}`} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
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
                              {workload.subjects.map(subjectItem => {
                                const subject = subjects.find(s => s.code === subjectItem.code);
                                return subject && (
                                  <div key={subjectItem.code} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-gray-200 hover:border-gray-300 transition-all">
                                    <div className="flex items-center space-x-3 flex-1">
                                      <BookOpen className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-900 text-sm truncate">{subject.name}</div>
                                        <div className="text-xs text-gray-500">{subject.code}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                      <span className="text-sm font-semibold text-gray-600">{subjectItem.hours}h</span>
                                      <button
                                        onClick={() => {
                                          // Remove this specific assignment
                                          setAssignments(prev => {
                                            const updated = { ...prev };
                                            if (updated[subjectItem.code]) {
                                              updated[subjectItem.code] = updated[subjectItem.code].filter(
                                                a => a.teacherId !== teacher.mis_id
                                              );
                                              if (updated[subjectItem.code].length === 0) {
                                                delete updated[subjectItem.code];
                                              }
                                            }
                                            return updated;
                                          });

                                          setWorkloadSummary(prev => ({
                                            ...prev,
                                            [teacher.mis_id]: {
                                              ...prev[teacher.mis_id],
                                              assigned: prev[teacher.mis_id].assigned - subjectItem.hours,
                                              remaining: prev[teacher.mis_id].remaining + subjectItem.hours,
                                              subjects: prev[teacher.mis_id].subjects.filter(s => s.code !== subjectItem.code)
                                            }
                                          }));

                                          setSubjects(prev => prev.map(s => {
                                            if (s.code === subjectItem.code) {
                                              const updatedTeachers = (s.assigned_teachers || []).filter(
                                                a => a.teacherId !== teacher.mis_id
                                              );
                                              return { ...s, assigned_teachers: updatedTeachers };
                                            }
                                            return s;
                                          }));
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
                            {subjects.map(subject => {
                              const currentAssignments = assignments[subject.code] || [];
                              const hoursPerTeacher = Math.min(subject.total_hours, 4);
                              const canAssign = workload.remaining >= hoursPerTeacher;
                              const isPreferred = teacher.subject_preferences && teacher.subject_preferences.includes(subject.code);
                              const alreadyAssignedToThisTeacher = currentAssignments.some(a => a.teacherId === teacher.mis_id);

                              return (
                                <option
                                  key={subject.code}
                                  value={subject.code}
                                  disabled={!canAssign || alreadyAssignedToThisTeacher}
                                >
                                  {subject.name} - {subject.total_hours}h total ({hoursPerTeacher}h per teacher)
                                  {isPreferred && ' ⭐'}
                                  {alreadyAssignedToThisTeacher && ' - Already assigned'}
                                  {!canAssign && !alreadyAssignedToThisTeacher && ' - Insufficient capacity'}
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
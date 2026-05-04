(function() {
  'use strict';

  // Backend API configuration
  const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://iamsproject-production.up.railway.app';

  const currentRole = localStorage.getItem('iams_user_role');
  const userEmail = localStorage.getItem('iams_user_email');

  let currentUser = null;
  let logbooks = [];
  let organizations = [];
  let supervisorStudents = [];
  let finalReport = null;
  let notifications = [];
  let upcomingDeadlines = [];
  let stats = { students: 0, organizations: 0, logbooks: 0 };

  const coordCard = document.getElementById('coordinatorDashboardCard');
  const regTitle = document.getElementById('regTitle');
  const profileFields = document.getElementById('profileFields');
  const prefCard = document.getElementById('preferencesCard');
  const prefTitle = document.getElementById('prefTitle');
  const prefFields = document.getElementById('prefFields');
  const logbookCard = document.getElementById('logbookCard');
  const logEntriesDiv = document.getElementById('logEntriesList');
  const currentUserDisplay = document.getElementById('currentUserDisplay');
  const authStatus = document.getElementById('authStatus');
  const summaryName = document.getElementById('summaryName');
  const summaryEmail = document.getElementById('summaryEmail');
  const summaryRole = document.getElementById('summaryRole');
  const prefTagsDiv = document.getElementById('prefTags');
  const statStudents = document.getElementById('statStudents');
  const statOrgs = document.getElementById('statOrgs');
  const statLogbooks = document.getElementById('statLogbooks');
  const coordStudentsDiv = document.getElementById('coordStudents');
  const coordOrgsDiv = document.getElementById('coordOrgs');
  const coordLogbooksDiv = document.getElementById('coordLogbooks');
  const coordinatorPanel = document.getElementById('coordinatorPanel');
  const recommendationMessage = document.getElementById('recommendationMessage');
  const organizationListCard = document.getElementById('organizationListCard');
  const organizationListDiv = document.getElementById('organizationList');
  const supervisorStudentsCard = document.getElementById('supervisorStudentsCard');
  const supervisorStudentsList = document.getElementById('supervisorStudentsList');
  const supervisorLogbooksCard = document.getElementById('supervisorLogbooksCard');
  const supervisorLogbooksList = document.getElementById('supervisorLogbooksList');
  const finalReportCard = document.getElementById('finalReportCard');
  const finalReportForm = document.getElementById('finalReportForm');
  const assessmentResultsCard = document.getElementById('assessmentResultsCard');
  const assessmentResultsList = document.getElementById('assessmentResultsList');
  const finalReportMessage = document.getElementById('finalReportMessage');
  const notificationsCard = document.getElementById('notificationsCard');
  const deadlinesList = document.getElementById('deadlinesList');
  const notificationsList = document.getElementById('notificationsList');
  const sendRemindersBtn = document.getElementById('sendRemindersBtn');
  const remindersMessage = document.getElementById('remindersMessage');
  const exportDataBtn = document.getElementById('exportDataBtn');
  const exportMessage = document.getElementById('exportMessage');
  const createBackupBtn = document.getElementById('createBackupBtn');
  const viewBackupsBtn = document.getElementById('viewBackupsBtn');
  const backupHistory = document.getElementById('backupHistory');
  const backupList = document.getElementById('backupList');
  const encryptExport = document.getElementById('encryptExport');
  const createBackup = document.getElementById('createBackup');
  const siteVisitForm = document.getElementById('siteVisitForm');
  const siteVisitStudent = document.getElementById('siteVisitStudent');
  const siteVisitDate = document.getElementById('siteVisitDate');
  const siteVisitLocation = document.getElementById('siteVisitLocation');
  const siteVisitProgress = document.getElementById('siteVisitProgress');
  const siteVisitChallenges = document.getElementById('siteVisitChallenges');
  const siteVisitRating = document.getElementById('siteVisitRating');
  const siteVisitComments = document.getElementById('siteVisitComments');
  const siteVisitMessage = document.getElementById('siteVisitMessage');
  const siteVisitHistory = document.getElementById('siteVisitHistory');
  const runMatchingBtn = document.getElementById('runMatchingBtn');
  const matchingMessage = document.getElementById('matchingMessage');
  const matchingResults = document.getElementById('matchingResults');
  const coordFinalReportsDiv = document.getElementById('coordFinalReports');
  const coordRegistrationsDiv = document.getElementById('coordRegistrations');
  const registrationSearchInput = document.getElementById('registrationSearch');
  const registrationRoleFilter = document.getElementById('registrationRoleFilter');
  const registrationSortOrder = document.getElementById('registrationSortOrder');
  let coordinatorUsers = [];
  let registrationSearchQuery = '';
  let registrationFilterRole = 'all';
  let registrationSortOrderValue = 'name_asc';

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
  });

  if (runMatchingBtn) {
    runMatchingBtn.addEventListener('click', runCoordinatorMatching);
  }

  if (sendRemindersBtn) {
    sendRemindersBtn.addEventListener('click', sendReminderToAllStudents);
  }

  if (exportDataBtn) {
    exportDataBtn.addEventListener('click', exportData);
  }

  if (createBackupBtn) {
    createBackupBtn.addEventListener('click', createSecureBackup);
  }

  if (viewBackupsBtn) {
    viewBackupsBtn.addEventListener('click', viewBackupHistory);
  }

  if (siteVisitForm) {
    siteVisitForm.addEventListener('submit', submitSiteVisitAssessment);
  }

  if (registrationSearchInput) {
    registrationSearchInput.addEventListener('input', event => {
      registrationSearchQuery = event.target.value.trim().toLowerCase();
      renderCoordinatorRegistrations();
    });
  }

  if (registrationRoleFilter) {
    registrationRoleFilter.addEventListener('change', event => {
      registrationFilterRole = event.target.value;
      renderCoordinatorRegistrations();
    });
  }

  if (registrationSortOrder) {
    registrationSortOrder.addEventListener('change', event => {
      registrationSortOrderValue = event.target.value;
      renderCoordinatorRegistrations();
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function updateUI() {
    if (!currentRole || !userEmail) {
      window.location.href = 'index.html';
      return;
    }

    currentUserDisplay.textContent = userEmail;
    authStatus.textContent = `✅ Logged in as ${currentRole}`;
    summaryEmail.textContent = userEmail;
    summaryRole.textContent = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);

    coordCard.style.display = currentRole === 'coordinator' ? 'block' : 'none';
    coordinatorPanel.style.display = currentRole === 'coordinator' ? 'block' : 'none';
    logbookCard.style.display = currentRole === 'student' ? 'block' : 'none';
    finalReportCard.style.display = currentRole === 'student' ? 'block' : 'none';
    assessmentResultsCard.style.display = currentRole === 'student' ? 'block' : 'none';
    notificationsCard.style.display = currentRole === 'student' || currentRole === 'coordinator' ? 'block' : 'none';
    organizationListCard.style.display = currentRole === 'student' ? 'block' : 'none';
    supervisorStudentsCard.style.display = currentRole === 'supervisor' ? 'block' : 'none';
    supervisorLogbooksCard.style.display = currentRole === 'supervisor' ? 'block' : 'none';
    const supervisorSiteVisitCard = document.getElementById('supervisorSiteVisitCard');
    if (supervisorSiteVisitCard) {
      supervisorSiteVisitCard.style.display = currentRole === 'supervisor' ? 'block' : 'none';
    }

    if (currentRole === 'student' || currentRole === 'organization') {
      prefCard.style.display = 'block';
      prefTitle.textContent = currentRole === 'student' ? 'Project & Location Preferences' : 'Skill Requirements';
    } else {
      prefCard.style.display = 'none';
    }

    const titles = {
      student: 'Student Profile',
      coordinator: 'Coordinator Profile',
      organization: 'Organization Profile',
      supervisor: 'Supervisor Profile'
    };
    regTitle.innerHTML = `<i class="fas fa-user"></i> ${titles[currentRole]}`;

    await loadUserData();
    await loadNotifications();
    await loadUpcomingDeadlines();
    await loadAssessmentResults();
    renderProfileForm();
    renderPrefForm();
    renderSupervisorStudents();
    renderOrganizationList();
    renderLogbookEntries();
    renderFinalReportForm();
    renderNotifications();
    renderDeadlines();
    updateStats();
    updateSummary();
    if (currentRole === 'supervisor') {
      await renderSiteVisitForm();
      await loadSupervisorLogbooks();
      await loadSupervisorVisitAssessments();
    }
    if (currentRole === 'coordinator') {
      await loadCoordinatorData();
    }
  }

  async function loadUserData() {
    try {
      const response = await fetch(`${API_BASE}/api/me?email=${encodeURIComponent(userEmail)}`);
      if (!response.ok) {
        localStorage.clear();
        window.location.href = 'index.html';
        return;
      }

      const data = await response.json();
      currentUser = data;
      logbooks = data.logbooks || [];
      organizations = data.organizations || [];
      supervisorStudents = data.supervisorStudents || [];
      finalReport = data.finalReport || null;
      await fetchStats();
    } catch (error) {
      console.error(error);
      alert('Unable to load dashboard data. Please ensure the backend server is running.');
    }
  }

  async function loadNotifications() {
    try {
      const response = await fetch(`${API_BASE}/api/notifications?email=${encodeURIComponent(userEmail)}`);
      if (!response.ok) return;
      notifications = await response.json();
      renderNotifications();
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }

  async function loadUpcomingDeadlines() {
    try {
      const response = await fetch(`${API_BASE}/api/upcoming-deadlines`);
      if (!response.ok) return;
      upcomingDeadlines = await response.json();
      renderDeadlines();
    } catch (error) {
      console.error('Failed to load deadlines:', error);
    }
  }

  function renderNotifications() {
    if (!notificationsList) return;
    if (!notifications || notifications.length === 0) {
      notificationsList.innerHTML = '<p>No notifications yet.</p>';
      return;
    }

    notificationsList.innerHTML = `
      <strong>Recent Notifications:</strong>
      ${notifications.map(notif => `
        <div class="log-entry" style="opacity: ${notif.is_read ? 0.6 : 1};">
          ${notif.message}<br>
          <small style="color: #3d5d78;">${new Date(notif.created_at).toLocaleString()}</small>
        </div>
      `).join('')}
    `;
  }

  function renderDeadlines() {
    if (!deadlinesList) return;
    if (!upcomingDeadlines || upcomingDeadlines.length === 0) {
      deadlinesList.innerHTML = '<p>No upcoming deadlines.</p>';
      return;
    }

    deadlinesList.innerHTML = `
      <strong>📅 Upcoming Deadlines:</strong>
      ${upcomingDeadlines.map(deadline => {
        const daysUntil = Math.ceil((new Date(deadline.deadline_date) - new Date()) / (1000 * 60 * 60 * 24));
        const urgency = daysUntil <= 3 ? 'color: #d32f2f;' : daysUntil <= 7 ? 'color: #f57c00;' : '';
        return `
          <div class="log-entry" style="${urgency}">
            <strong>${escapeHtml(deadline.deadline_type)}</strong> - ${escapeHtml(deadline.description)}<br>
            <small>Due: ${new Date(deadline.deadline_date).toLocaleString()} (${daysUntil} days)</small>
          </div>
        `;
      }).join('')}
    `;
  }

  async function loadAssessmentResults() {
    try {
      const response = await fetch(`${API_BASE}/api/student/assessment-results?email=${encodeURIComponent(userEmail)}`);
      if (!response.ok) return;
      const assessments = await response.json();
      renderAssessmentResults(assessments);
    } catch (error) {
      console.error('Failed to load assessment results:', error);
    }
  }

  function renderAssessmentResults(assessments) {
    if (!assessmentResultsList) return;
    if (!assessments || assessments.length === 0) {
      assessmentResultsList.innerHTML = '<p>No assessments available yet.</p>';
      return;
    }

    assessmentResultsList.innerHTML = `
      <strong>📊 Your Assessment Results:</strong>
      ${assessments.map(assessment => `
        <div class="log-entry">
          <strong>Week ${assessment.week}</strong> - Rating: ${assessment.supervisor_rating}/5<br>
          <em>Feedback:</em> ${escapeHtml(assessment.supervisor_comments || 'No comments provided')}<br>
          <small style="color: #3d5d78;">Submitted: ${new Date(assessment.created_at).toLocaleString()}</small>
        </div>
      `).join('')}
    `;
  }

  async function sendReminderToAllStudents() {
    if (!sendRemindersBtn || currentRole !== 'coordinator') return;
    
    sendRemindersBtn.disabled = true;
    remindersMessage.textContent = 'Sending reminders...';

    try {
      const response = await fetch(`${API_BASE}/api/coordinator/send-deadline-reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: currentRole })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to send reminders.');
      remindersMessage.textContent = `✅ ${result.message}`;
      await loadNotifications();
    } catch (error) {
      console.error(error);
      remindersMessage.textContent = '⚠️ Failed to send reminders.';
    } finally {
      sendRemindersBtn.disabled = false;
    }
  }

  async function exportData() {
    if (!exportDataBtn || currentRole !== 'coordinator') return;
    
    exportDataBtn.disabled = true;
    exportMessage.textContent = 'Preparing export...';

    try {
      const checkboxes = document.querySelectorAll('input[name="exportData"]:checked');
      const selectedData = Array.from(checkboxes).map(cb => cb.value);
      
      if (selectedData.length === 0) {
        exportMessage.textContent = '⚠️ Please select at least one data type to export.';
        exportDataBtn.disabled = false;
        return;
      }

      const encrypt = encryptExport.checked;
      const createBackupFile = createBackup.checked;

      const response = await fetch(`${API_BASE}/api/coordinator/export-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          dataTypes: selectedData, 
          role: currentRole,
          encrypt: encrypt,
          createBackup: createBackupFile
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Unable to export data.');
      }

      const data = await response.json();
      
      // Create a download link
      const dataStr = JSON.stringify(data, null, 2);
      const dataBlob = new Blob([dataStr], { type: encrypt ? 'application/octet-stream' : 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = createBackupFile 
        ? `iams-backup-${timestamp}.json${encrypt ? '.enc' : ''}`
        : `iams-export-${new Date().toISOString().split('T')[0]}.json${encrypt ? '.enc' : ''}`;
      
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      exportMessage.textContent = `✅ ${createBackupFile ? 'Backup created' : 'Data exported'} successfully!${encrypt ? ' (Encrypted)' : ''}`;
    } catch (error) {
      console.error(error);
      exportMessage.textContent = `⚠️ Export failed: ${error.message}`;
    } finally {
      exportDataBtn.disabled = false;
    }
  }

  async function createSecureBackup() {
    if (!createBackupBtn || currentRole !== 'coordinator') return;
    
    createBackupBtn.disabled = true;
    exportMessage.textContent = 'Creating secure backup...';

    try {
      const checkboxes = document.querySelectorAll('input[name="exportData"]:checked');
      const selectedData = Array.from(checkboxes).map(cb => cb.value);
      
      if (selectedData.length === 0) {
        exportMessage.textContent = '⚠️ Please select at least one data type to backup.';
        createBackupBtn.disabled = false;
        return;
      }

      const response = await fetch(`${API_BASE}/api/coordinator/create-backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          dataTypes: selectedData, 
          role: currentRole,
          encrypt: true,
          createBackup: true
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Unable to create backup.');
      }

      const result = await response.json();
      
      exportMessage.textContent = `✅ Secure backup created successfully! Backup ID: ${result.backupId}`;
      
      // Refresh backup history if visible
      if (backupHistory.style.display !== 'none') {
        viewBackupHistory();
      }
    } catch (error) {
      console.error(error);
      exportMessage.textContent = `⚠️ Backup creation failed: ${error.message}`;
    } finally {
      createBackupBtn.disabled = false;
    }
  }

  async function viewBackupHistory() {
    if (!viewBackupsBtn || currentRole !== 'coordinator') return;
    
    viewBackupsBtn.disabled = true;
    
    try {
      const response = await fetch(`${API_BASE}/api/coordinator/backup-history`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Unable to load backup history.');
      }

      const backups = await response.json();
      
      backupList.innerHTML = '';
      
      if (backups.length === 0) {
        backupList.innerHTML = '<p>No backups found.</p>';
      } else {
        backups.forEach(backup => {
          const backupItem = document.createElement('div');
          backupItem.className = 'backup-item';
          backupItem.style.cssText = 'border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 4px;';
          
          const timestamp = new Date(backup.created_at).toLocaleString();
          const size = backup.size ? `${(backup.size / 1024).toFixed(2)} KB` : 'Unknown size';
          
          backupItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong>${backup.filename}</strong><br>
                <small>Created: ${timestamp} | Size: ${size}</small>
              </div>
              <div>
                <button class="btn btn-small" onclick="downloadBackup('${backup.id}')">
                  <i class="fas fa-download"></i> Download
                </button>
              </div>
            </div>
          `;
          
          backupList.appendChild(backupItem);
        });
      }
      
      backupHistory.style.display = 'block';
    } catch (error) {
      console.error(error);
      backupList.innerHTML = `<p style="color: red;">Error loading backup history: ${error.message}</p>`;
    } finally {
      viewBackupsBtn.disabled = false;
    }
  }

  // Global function for downloading backups
  window.downloadBackup = async function(backupId) {
    try {
      const response = await fetch(`${API_BASE}/api/coordinator/download-backup/${backupId}`);
      
      if (!response.ok) {
        throw new Error('Failed to download backup');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup-${backupId}.json.enc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert(`Download failed: ${error.message}`);
    }
  };

  function renderSiteVisitForm() {
    if (!siteVisitStudent || !siteVisitForm) return;

    siteVisitStudent.innerHTML = '<option value="">Select a supervised student</option>' +
      supervisorStudents.map(student => `
        <option value="${escapeHtml(student.email)}">${escapeHtml(student.name || student.email)}</option>
      `).join('');

    siteVisitDate.value = new Date().toISOString().split('T')[0];
  }

  async function loadSupervisorVisitAssessments() {
    if (!siteVisitHistory) return;

    try {
      const response = await fetch(`${API_BASE}/api/supervisor/site-visit-assessments?role=supervisor&email=${encodeURIComponent(userEmail)}`);
      if (!response.ok) {
        throw new Error('Unable to load site visit assessments.');
      }
      const assessments = await response.json();
      renderSiteVisitAssessments(assessments);
    } catch (error) {
      console.error(error);
      siteVisitHistory.innerHTML = '<p>Unable to load site visit assessments.</p>';
    }
  }

  function renderSiteVisitAssessments(assessments) {
    if (!siteVisitHistory) return;
    if (!assessments || assessments.length === 0) {
      siteVisitHistory.innerHTML = '<p>No site visit assessments have been submitted yet.</p>';
      return;
    }

    siteVisitHistory.innerHTML = assessments.map(assessment => `
      <div class="log-entry">
        <strong>${escapeHtml(assessment.student_name || assessment.student_email)}</strong> — ${new Date(assessment.visit_date).toLocaleDateString()}<br>
        <strong>Location:</strong> ${escapeHtml(assessment.visit_location || 'N/A')}<br>
        <strong>Progress Summary:</strong> ${escapeHtml(assessment.progress_summary || 'No summary')}<br>
        <strong>Challenges:</strong> ${escapeHtml(assessment.challenges || 'None')}<br>
        <strong>Rating:</strong> ${escapeHtml(assessment.overall_rating || 'N/A')} / 5<br>
        <em>${escapeHtml(assessment.comments || '')}</em><br>
        <small>${new Date(assessment.created_at).toLocaleString()}</small>
      </div>
    `).join('');
  }

  async function submitSiteVisitAssessment(event) {
    event.preventDefault();
    if (!siteVisitForm) return;

    siteVisitMessage.textContent = 'Submitting assessment...';
    const studentEmail = siteVisitStudent.value;
    const visitDateValue = siteVisitDate.value;
    const visitLocationValue = siteVisitLocation.value.trim();
    const progressValue = siteVisitProgress.value.trim();
    const challengesValue = siteVisitChallenges.value.trim();
    const ratingValue = siteVisitRating.value;
    const commentsValue = siteVisitComments.value.trim();

    if (!studentEmail || !visitDateValue || !progressValue || !ratingValue) {
      siteVisitMessage.textContent = '⚠️ Please select a student, date, progress summary, and rating.';
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/supervisor/site-visit-assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: currentRole,
          email: userEmail,
          studentEmail,
          visitDate: visitDateValue,
          visitLocation: visitLocationValue,
          progressSummary: progressValue,
          challenges: challengesValue,
          overallRating: ratingValue,
          comments: commentsValue
        })
      });

      let result;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        result = await response.json();
      } else {
        result = { error: await response.text() };
      }
      if (!response.ok) {
        throw new Error(result.error || 'Unable to submit site visit assessment.');
      }

      siteVisitMessage.textContent = '✅ Site visit assessment submitted successfully.';
      siteVisitForm.reset();
      renderSiteVisitForm();
      await loadSupervisorVisitAssessments();
    } catch (error) {
      console.error(error);
      siteVisitMessage.textContent = `⚠️ ${error.message}`;
    }
  }

  async function fetchStats() {
    try {
      const response = await fetch(`${API_BASE}/api/dashboard-stats`);
      if (!response.ok) return;
      stats = await response.json();
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }

  async function loadCoordinatorData() {
    try {
      const studentsResponse = await fetch(`${API_BASE}/api/coordinator/students?role=coordinator`);
      const orgsResponse = await fetch(`${API_BASE}/api/coordinator/organizations?role=coordinator`);
      const logbooksResponse = await fetch(`${API_BASE}/api/coordinator/student-logbooks?role=coordinator`);

      if (studentsResponse.ok) {
        const students = await studentsResponse.json();
        renderCoordinatorStudents(students);
      }
      if (orgsResponse.ok) {
        const orgs = await orgsResponse.json();
        renderCoordinatorOrgs(orgs);
      }
      if (logbooksResponse.ok) {
        const logs = await logbooksResponse.json();
        renderCoordinatorLogbooks(logs);
      }
      const finalReportsResponse = await fetch(`${API_BASE}/api/coordinator/final-reports?role=coordinator`);
      if (finalReportsResponse.ok) {
        const finalReports = await finalReportsResponse.json();
        renderCoordinatorFinalReports(finalReports);
      }
      const usersResponse = await fetch(`${API_BASE}/api/users`);
      if (usersResponse.ok) {
        coordinatorUsers = await usersResponse.json();
        renderCoordinatorRegistrations();
      }
    } catch (error) {
      console.error('Failed to load coordinator data', error);
    }
  }

  async function runCoordinatorMatching() {
    if (!runMatchingBtn) return;

    runMatchingBtn.disabled = true;
    matchingMessage.textContent = 'Running matching...';

    try {
      const response = await fetch(`${API_BASE}/api/coordinator/match-students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: currentRole })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to run matching.');

      matchingMessage.textContent = result.message;
      renderMatchingResults(result.allocations || []);
      await loadCoordinatorData();
      await fetchStats();
      updateStats();
    } catch (error) {
      console.error(error);
      matchingMessage.textContent = 'Failed to run matching. Check the backend connection and try again.';
    } finally {
      runMatchingBtn.disabled = false;
    }
  }

  function renderMatchingResults(allocations) {
    if (!matchingResults) return;
    if (!allocations.length) {
      matchingResults.innerHTML = '<p>No students found to match.</p>';
      return;
    }

    matchingResults.innerHTML = `
      <div class="allocation-list">
        ${allocations.map(allocation => {
          const studentName = escapeHtml(allocation.student_name || allocation.student_email);
          const orgName = allocation.organization_name
            ? escapeHtml(allocation.organization_name)
            : '<strong>Needs review</strong>';
          const score = Number(allocation.score || 0);
          const scoreLabel = score >= 5 ? 'Strong' : score > 0 ? 'Possible' : 'No preference match';

          return `
            <div class="allocation-row">
              <div>
                <strong>${studentName}</strong><br>
                <span>${escapeHtml(allocation.program || 'No program')} / ${escapeHtml(allocation.project_type || 'No project preference')}</span>
              </div>
              <div>
                ${orgName}<br>
                <span>${scoreLabel} (${score})</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderCoordinatorStudents(students) {
    if (!students || !students.length) {
      coordStudentsDiv.innerHTML = '<p>No students available yet.</p>';
      return;
    }

    coordStudentsDiv.innerHTML = students.map(student => {
      const matchInfo = student.organization_name
        ? `Matched to <strong>${escapeHtml(student.organization_name)}</strong> (${escapeHtml(student.organization_email)}) - score ${Number(student.score || 0)}`
        : '<strong>No match found yet</strong>';
      return `
        <div class="log-entry">
          <strong>${escapeHtml(student.name || student.email)}</strong><br>
          Student ID: ${escapeHtml(student.student_id || 'N/A')}<br>
          Program: ${escapeHtml(student.program || 'N/A')}<br>
          Preferences: ${escapeHtml(student.location || 'N/A')} / ${escapeHtml(student.project_type || 'N/A')}<br>
          ${matchInfo}
        </div>
      `;
    }).join('');
  }

  function renderCoordinatorOrgs(orgs) {
    if (!orgs || !orgs.length) {
      coordOrgsDiv.innerHTML = '<p>No organizations available yet.</p>';
      return;
    }

    coordOrgsDiv.innerHTML = orgs.map(org => {
      const studentList = org.students && org.students.length ? org.students.map(escapeHtml).join(', ') : 'No matched students yet';
      return `
        <div class="log-entry">
          <strong>${escapeHtml(org.name || org.email)}</strong><br>
          Location / Project: ${escapeHtml(org.location || 'N/A')} / ${escapeHtml(org.project_type || 'N/A')}<br>
          Skills: ${escapeHtml(org.required_skills || 'N/A')}<br>
          Students: ${studentList}
        </div>
      `;
    }).join('');
  }

  function renderCoordinatorLogbooks(logs) {
    if (!logs || !logs.length) {
      coordLogbooksDiv.innerHTML = '<p>No student logbooks available.</p>';
      return;
    }

    coordLogbooksDiv.innerHTML = logs.map(log => `
      <div class="log-entry">
        <strong>${escapeHtml(log.student_name)}</strong> (Week ${escapeHtml(log.week)})<br>
        <div style="margin:8px 0; white-space: pre-wrap;">${escapeHtml(log.content)}</div>
        ${log.supervisor_rating ? `<div><strong>Supervisor Rating:</strong> ${escapeHtml(log.supervisor_rating)}</div>` : ''}
        ${log.supervisor_comments ? `<div><strong>Supervisor Comments:</strong><br>${escapeHtml(log.supervisor_comments)}</div>` : ''}
      </div>
    `).join('');
  }

  function renderCoordinatorFinalReports(reports) {
    if (!coordFinalReportsDiv) return;
    if (!reports || !reports.length) {
      coordFinalReportsDiv.innerHTML = '<p>No final reports submitted yet.</p>';
      return;
    }

    coordFinalReportsDiv.innerHTML = reports.map(report => `
      <div class="log-entry">
        <strong>${escapeHtml(report.student_name)}</strong> - ${escapeHtml(report.title)}<br>
        <div style="margin: 8px 0; white-space: pre-wrap;">${escapeHtml(report.content)}</div>
        <div style="font-size: 0.9rem; color: #3d5d78;">Submitted: ${new Date(report.submitted_at).toLocaleString()}</div>
      </div>
    `).join('');
  }

  function renderCoordinatorRegistrations(users) {
    const list = Array.isArray(users) ? users : coordinatorUsers;
    const filtered = list.filter(user => {
      if (!user) return false;
      if (registrationFilterRole !== 'all' && String(user.role || '').toLowerCase() !== registrationFilterRole) {
        return false;
      }

      if (!registrationSearchQuery) return true;

      const searchTarget = [user.name, user.email, user.role]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchTarget.includes(registrationSearchQuery);
    });

    if (!filtered.length) {
      coordRegistrationsDiv.innerHTML = `<p>No registrations match your search or filter.</p>`;
      return;
    }

    const sorted = filtered.slice().sort((a, b) => {
      const roleA = String(a.role || '').toLowerCase();
      const roleB = String(b.role || '').toLowerCase();
      const nameA = String(a.name || a.email || '').toLowerCase();
      const nameB = String(b.name || b.email || '').toLowerCase();

      switch (registrationSortOrderValue) {
        case 'name_desc':
          return nameB.localeCompare(nameA);
        case 'role_asc':
          return roleA.localeCompare(roleB) || nameA.localeCompare(nameB);
        case 'role_desc':
          return roleB.localeCompare(roleA) || nameA.localeCompare(nameB);
        default:
          return nameA.localeCompare(nameB);
      }
    });

    coordRegistrationsDiv.innerHTML = sorted.map(user => `
      <div class="log-entry">
        <strong>${escapeHtml(user.name || user.email)}</strong> (${escapeHtml(user.role)})<br>
        ${escapeHtml(user.email)}
      </div>
    `).join('');
  }

  function setupCollapsibles() {
    document.querySelectorAll('.collapsible-section').forEach(section => {
      const header = section.querySelector('.collapsible-header');
      const toggle = section.querySelector('.collapse-toggle');
      if (!header || !toggle) return;

      header.addEventListener('click', () => {
        const isCollapsed = section.classList.toggle('collapsed');
        toggle.setAttribute('aria-expanded', String(!isCollapsed));
      });
    });
  }

  function renderProfileForm() {
    let html = '';
    if (currentRole === 'student') {
      html = `<div class="form-row"><label>Full Name</label><input type="text" id="sName" value="${currentUser.name || ''}"></div>
              <div class="form-row"><label>Student ID</label><input type="text" id="sId" value="${currentUser.studentId || ''}"></div>
              <div class="form-row"><label>Program</label><input type="text" id="sProgram" value="${currentUser.program || ''}"></div>`;
    } else if (currentRole === 'organization') {
      html = `<div class="form-row"><label>Organization</label><input type="text" id="orgName" value="${currentUser.orgName || ''}"></div>
              <div class="form-row"><label>Industry</label><input type="text" id="orgIndustry" value="${currentUser.industry || ''}"></div>`;
    } else if (currentRole === 'supervisor') {
      html = `<div class="form-row"><label>Name</label><input type="text" id="supName" value="${currentUser.name || ''}"></div>
              <div class="form-row"><label>Department</label><input type="text" id="supDept" value="${currentUser.supervisorDept || ''}"></div>`;
    } else {
      html = `<div class="form-row"><label>Name</label><input type="text" id="coordName" value="${currentUser.name || ''}"></div>`;
    }
    profileFields.innerHTML = html;
  }

  function renderPrefForm() {
    const preferences = currentUser.preferences || {};
    if (currentRole === 'student') {
      prefFields.innerHTML = `
        <div class="form-row"><label>Location</label><input type="text" id="prefLoc" value="${preferences.location || 'Gaborone'}"></div>
        <div class="form-row"><label>Project Type</label><input type="text" id="prefProjectType" placeholder="e.g. Web Dev, Data Science, AI" value="${preferences.project_type || ''}"></div>
      `;
    } else if (currentRole === 'organization') {
      prefFields.innerHTML = `
        <div class="form-row"><label>Preferred Location</label><input type="text" id="orgPrefLoc" value="${preferences.location || 'Gaborone'}"></div>
        <div class="form-row"><label>Project Type</label><input type="text" id="orgProjectType" placeholder="e.g. Web Dev, Data Science, AI" value="${preferences.project_type || ''}"></div>
        <div class="form-row"><label>Required Skills</label><input type="text" id="reqSkills" value="${preferences.required_skills || 'JavaScript, Python'}"></div>
      `;
    }
  }

  function renderLogbookEntries() {
    const matchedOrgName = currentUser?.matchedOrganization ? (currentUser.matchedOrganization.name || currentUser.matchedOrganization.email) : null;
    const matchedOrgInfo = document.getElementById('matchedOrgInfo');
    if (matchedOrgInfo) {
      matchedOrgInfo.textContent = matchedOrgName
        ? `Matched organization: ${matchedOrgName}`
        : 'No organization matched yet. Update your preferences to improve matching.';
    }

    if (logbooks.length === 0) {
      logEntriesDiv.innerHTML = '<p>No entries yet.</p>';
      return;
    }
    logEntriesDiv.innerHTML = logbooks.slice(0, 4).map(entry => 
      `<div class="log-entry"><strong>Week ${entry.week}</strong><br>${entry.content}<br><em style="color:#3d5d78; margin-top:8px; display:block;">Organization: ${matchedOrgName || 'None yet'}</em></div>`
    ).join('');
  }

  function updateStats() {
    statStudents.textContent = stats.students;
    statOrgs.textContent = stats.organizations;
    statLogbooks.textContent = stats.logbooks;
  }

  function updateSummary() {
    summaryName.textContent = currentUser.name || currentUser.orgName || '—';
    const preferences = currentUser.preferences || {};
    if (currentRole === 'student') {
      prefTagsDiv.innerHTML = `<span class="pref-tag">📍 ${preferences.location || 'Gaborone'}</span>
                               <span class="pref-tag">💻 ${preferences.project_type || 'Web Dev'}</span>`;
      if (!currentUser.matchedOrganization) {
        const recommendations = currentUser.recommendations || [];
        if (recommendations.length) {
          recommendationMessage.textContent = `No match found yet. Try updating your preferences to better align with: ${recommendations.map(r => r.name || r.email).join(', ')}.`;
        } else {
          recommendationMessage.textContent = 'No match found yet. Please update your preferences or wait for organizations to add requirements.';
        }
      } else {
        recommendationMessage.textContent = `Matched to ${currentUser.matchedOrganization.name || currentUser.matchedOrganization.email}.`;
      }
    } else if (currentRole === 'organization') {
      prefTagsDiv.innerHTML = `<span class="pref-tag">📍 ${preferences.location || 'Gaborone'}</span>
                               <span class="pref-tag">💻 ${preferences.project_type || 'Project type'}</span>
                               <span class="pref-tag">🧰 ${preferences.required_skills || 'JavaScript, Python'}</span>`;
      recommendationMessage.textContent = '';
    } else {
      prefTagsDiv.innerHTML = '<span class="pref-tag">No preferences configured</span>';
      recommendationMessage.textContent = '';
    }
  }

  function renderFinalReportForm() {
    if (!finalReportCard) return;
    
    const titleInput = document.getElementById('finalReportTitle');
    const contentInput = document.getElementById('finalReportContent');
    if (finalReport) {
      titleInput.value = finalReport.title || '';
      contentInput.value = finalReport.content || '';
      finalReportMessage.textContent = finalReport.submitted_at
        ? `Last submitted: ${new Date(finalReport.submitted_at).toLocaleString()}`
        : '';
    } else {
      titleInput.value = '';
      contentInput.value = '';
      finalReportMessage.textContent = '';
    }
  }

  function renderSupervisorStudents() {
    if (currentRole !== 'supervisor') {
      supervisorStudentsList.innerHTML = '';
      return;
    }
    if (!supervisorStudents || supervisorStudents.length === 0) {
      supervisorStudentsList.innerHTML = '<p>No supervised students found for your department.</p>';
      return;
    }
    supervisorStudentsList.innerHTML = supervisorStudents.map(student => `
      <div class="org-card">
        <strong>${student.name || student.email}</strong><br>
        <span class="org-email">${student.email}</span><br>
        <span>Student ID: ${student.studentId || 'N/A'}</span><br>
        <span>Program: ${student.program || 'N/A'}</span><br>
        <span>Project type: ${student.projectType || 'N/A'}</span><br>
        <span>Matched org: ${student.matchedOrganization ? (student.matchedOrganization.name || student.matchedOrganization.email) : 'None'}</span>
      </div>
    `).join('');
  }

  async function submitFinalReport(event) {
    event.preventDefault();
    const title = document.getElementById('finalReportTitle')?.value.trim();
    const content = document.getElementById('finalReportContent')?.value.trim();

    if (!title || !content) {
      finalReportMessage.textContent = 'Please provide both a title and report content.';
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/final-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, title, content })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to submit final report.');
      finalReport = result.report;
      finalReportMessage.textContent = '✅ Final report submitted successfully.';
      renderFinalReportForm();
      await fetchStats();
      updateStats();
    } catch (error) {
      console.error(error);
      finalReportMessage.textContent = '⚠️ Failed to submit final report.';
    }
  }

  async function loadSupervisorLogbooks() {
    if (!supervisorLogbooksList) return;
    try {
      const response = await fetch(`${API_BASE}/api/supervisor/student-logbooks?role=supervisor&email=${encodeURIComponent(userEmail)}`);
      if (!response.ok) {
        throw new Error('Unable to load supervised logbooks.');
      }
      const logs = await response.json();
      renderSupervisorLogbooks(logs);
    } catch (error) {
      console.error(error);
      supervisorLogbooksList.innerHTML = '<p>Unable to load supervised logbooks.</p>';
    }
  }

  function renderSupervisorLogbooks(logs) {
    if (!supervisorLogbooksList) return;
    if (!logs || logs.length === 0) {
      supervisorLogbooksList.innerHTML = '<p>No logbook entries available for approval.</p>';
      return;
    }

    supervisorLogbooksList.innerHTML = logs.map(log => {
      const approvedLabel = log.supervisor_approved ? 'Approved' : 'Pending approval';
      const submittedLabel = log.submitted_to_coordinator ? 'Submitted' : 'Not submitted';
      return `
        <div class="log-entry supervisor-logbook-row" data-id="${escapeHtml(log.id)}">
          <strong>${escapeHtml(log.student_name || log.student_email)}</strong> (Week ${escapeHtml(log.week)})<br>
          <div style="margin: 8px 0; white-space: pre-wrap;">${escapeHtml(log.content)}</div>
          <div style="font-size: 0.9rem; color: #3d5d78; margin-bottom: 10px;">Status: ${approvedLabel} · ${submittedLabel}</div>
          ${log.supervisor_rating ? `<div style="margin-bottom:10px;"><strong>Rating:</strong> ${escapeHtml(log.supervisor_rating)}</div>` : ''}
          ${log.supervisor_comments ? `<div style="margin-bottom:10px;"><strong>Supervisor Comments:</strong><br>${escapeHtml(log.supervisor_comments)}</div>` : ''}
          ${log.supervisor_approved ? '' : `
            <div class="form-row" style="margin-bottom: 10px;">
              <label>Assessment Rating</label>
              <select class="assessment-rating">
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Good</option>
                <option value="3">3 - Satisfactory</option>
                <option value="2">2 - Needs Improvement</option>
                <option value="1">1 - Unsatisfactory</option>
              </select>
            </div>
            <div class="form-row" style="margin-bottom: 10px;">
              <label>Assessment Comments</label>
              <textarea class="assessment-comments" placeholder="Enter your performance evaluation..."></textarea>
            </div>
            <button class="btn btn-small approve-logbook-btn" data-id="${escapeHtml(log.id)}">Approve & Submit Assessment</button>
          `}
        </div>
      `;
    }).join('');

    supervisorLogbooksList.querySelectorAll('.approve-logbook-btn').forEach(button => {
      button.addEventListener('click', () => handleApproveLogbook(button.dataset.id));
    });
  }

  async function handleApproveLogbook(logbookId) {
    if (!logbookId) return;
    const row = document.querySelector(`.supervisor-logbook-row[data-id="${logbookId}"]`);
    const rating = row?.querySelector('.assessment-rating')?.value;
    const comments = row?.querySelector('.assessment-comments')?.value.trim();

    try {
      const response = await fetch(`${API_BASE}/api/logbooks/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: currentRole, email: userEmail, logbookId, supervisorRating: rating, supervisorComments: comments })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Unable to approve the logbook entry.');
      }
      alert(result.message || 'Logbook approved and assessment submitted.');
      await loadSupervisorLogbooks();
      if (currentRole === 'coordinator') {
        await loadCoordinatorData();
      }
    } catch (error) {
      console.error(error);
      alert(error.message || 'Failed to approve logbook entry.');
    }
  }

  function renderOrganizationList() {
    if (currentRole !== 'student') {
      organizationListDiv.innerHTML = '';
      return;
    }
    if (!organizations || organizations.length === 0) {
      organizationListDiv.innerHTML = '<p>No organizations have published preferences yet.</p>';
      return;
    }
    organizationListDiv.innerHTML = organizations.map(org => `
      <div class="org-card">
        <strong>${org.orgName || org.name || org.email}</strong><br>
        <span class="org-email">${org.email}</span><br>
        <span>Skills / Requirements: ${org.requiredSkills || 'Not specified'}</span>
      </div>
    `).join('');
  }

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const profile = {};

    if (currentRole === 'student') {
      profile.name = document.getElementById('sName')?.value.trim();
      profile.studentId = document.getElementById('sId')?.value.trim();
      profile.program = document.getElementById('sProgram')?.value.trim();
    } else if (currentRole === 'organization') {
      profile.orgName = document.getElementById('orgName')?.value.trim();
      profile.industry = document.getElementById('orgIndustry')?.value.trim();
    } else if (currentRole === 'supervisor') {
      profile.name = document.getElementById('supName')?.value.trim();
      profile.supervisorDept = document.getElementById('supDept')?.value.trim();
    } else {
      profile.name = document.getElementById('coordName')?.value.trim();
    }

    try {
      const response = await fetch(`${API_BASE}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, profile })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save profile.');
      document.getElementById('profileMessage').textContent = '✅ Profile saved';
      await loadUserData();
      renderProfileForm();
      updateSummary();
    } catch (error) {
      console.error(error);
      document.getElementById('profileMessage').textContent = '⚠️ Failed to save profile';
    }
  });

  if (finalReportForm) {
    finalReportForm.addEventListener('submit', submitFinalReport);
  }

  document.getElementById('prefForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const preferences = {};

    if (currentRole === 'student') {
      preferences.location = document.getElementById('prefLoc')?.value.trim();
      preferences.projectType = document.getElementById('prefProjectType')?.value.trim();
    } else if (currentRole === 'organization') {
      preferences.location = document.getElementById('orgPrefLoc')?.value.trim();
      preferences.projectType = document.getElementById('orgProjectType')?.value.trim();
      preferences.requiredSkills = document.getElementById('reqSkills')?.value.trim();
    }

    try {
      const response = await fetch(`${API_BASE}/api/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, preferences })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save preferences.');
      document.getElementById('prefMessage').textContent = '✓ Saved';
      await loadUserData();
      renderPrefForm();
      updateSummary();
    } catch (error) {
      console.error(error);
      document.getElementById('prefMessage').textContent = '⚠️ Failed to save preferences';
    }
  });

  document.getElementById('logbookForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const week = document.getElementById('logWeek').value;
    const content = document.getElementById('logContent').value.trim();

    if (!content) return;

    try {
      const response = await fetch(`${API_BASE}/api/logbooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, week, content })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save logbook entry.');
      document.getElementById('logContent').value = '';
      await loadUserData();
      renderLogbookEntries();
      updateStats();
    } catch (error) {
      console.error(error);
      alert('Failed to save logbook entry.');
    }
  });

  setupCollapsibles();
  updateUI();
})();

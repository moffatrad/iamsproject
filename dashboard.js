(function() {
  'use strict';

  // Backend API configuration
  const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://your-railway-app-name.up.railway.app'; // Will update after deployment

  const currentRole = localStorage.getItem('iams_user_role');
  const userEmail = localStorage.getItem('iams_user_email');

  let currentUser = null;
  let logbooks = [];
  let organizations = [];
  let supervisorStudents = [];
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

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
  });

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
    organizationListCard.style.display = currentRole === 'student' ? 'block' : 'none';
    supervisorStudentsCard.style.display = currentRole === 'supervisor' ? 'block' : 'none';

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
    renderProfileForm();
    renderPrefForm();
    renderSupervisorStudents();
    renderOrganizationList();
    renderLogbookEntries();
    updateStats();
    updateSummary();
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
      await fetchStats();
    } catch (error) {
      console.error(error);
      alert('Unable to load dashboard data. Please ensure the backend server is running.');
    }
  }

  async function fetchStats() {
    try {
      const response = await fetch(`${API_BASE}/api/dashboard-stats`);
      if (!response.ok) return;
      stats = await response.json();
    } catch (error) {
      console.error(error);
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
    } catch (error) {
      console.error('Failed to load coordinator data', error);
    }
  }

  function renderCoordinatorStudents(students) {
    if (!students || !students.length) {
      coordStudentsDiv.innerHTML = '<p>No students available yet.</p>';
      return;
    }

    coordStudentsDiv.innerHTML = students.map(student => {
      const matchInfo = student.organization_name ? `Matched to <strong>${student.organization_name}</strong> (${student.organization_email})` : '<strong>No match found yet</strong>';
      return `
        <div class="log-entry">
          <strong>${student.name || student.email}</strong><br>
          Student ID: ${student.student_id || 'N/A'}<br>
          Program: ${student.program || 'N/A'}<br>
          Preferences: ${student.location || 'N/A'} / ${student.project_type || 'N/A'}<br>
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
      const studentList = org.students && org.students.length ? org.students.join(', ') : 'No matched students yet';
      return `
        <div class="log-entry">
          <strong>${org.name || org.email}</strong><br>
          Skills: ${org.required_skills || 'N/A'}<br>
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
        <strong>${log.student_name}</strong> (Week ${log.week})<br>
        ${log.content}
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
      prefFields.innerHTML = `<div class="form-row"><label>Required Skills</label><input type="text" id="reqSkills" value="${preferences.required_skills || 'JavaScript, Python'}"></div>`;
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
      prefTagsDiv.innerHTML = `<span class="pref-tag">🧰 ${preferences.required_skills || 'JavaScript, Python'}</span>`;
      recommendationMessage.textContent = '';
    } else {
      prefTagsDiv.innerHTML = '<span class="pref-tag">No preferences configured</span>';
      recommendationMessage.textContent = '';
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

  document.getElementById('prefForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const preferences = {};

    if (currentRole === 'student') {
      preferences.location = document.getElementById('prefLoc')?.value.trim();
      preferences.projectType = document.getElementById('prefProjectType')?.value.trim();
    } else if (currentRole === 'organization') {
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
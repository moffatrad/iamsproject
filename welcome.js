(function() {
  'use strict';

  const modalOverlay = document.getElementById('modalOverlay');
  const modalContainer = document.getElementById('modalContainer');
  const showLoginBtn = document.getElementById('showLoginBtn');
  const showSignupBtn = document.getElementById('showSignupBtn');

  let currentMode = 'login'; // 'login', 'signup', 'forgot', 'otp', 'reset'
  let selectedRole = 'student';
  let pendingEmail = '';
  let pendingRole = 'student';
  let displayedOtpCode = '';

  showLoginBtn.addEventListener('click', () => openModal('login'));
  showSignupBtn.addEventListener('click', () => openModal('signup'));
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  function openModal(mode) {
    currentMode = mode;
    if (mode === 'login' || mode === 'signup') {
      selectedRole = 'student';
    }
    pendingEmail = '';
    pendingRole = 'student';
    displayedOtpCode = '';
    renderModal();
    modalOverlay.style.display = 'flex';
  }

  function closeModal() {
    modalOverlay.style.display = 'none';
  }

  function getPlaceholderEmail() {
    if (selectedRole === 'student') return 'student@uni.ac.bw';
    if (selectedRole === 'coordinator') return 'coordinator@cs.ub.bw';
    if (selectedRole === 'organization') return 'hr@company.co.bw';
    return 'supervisor@ub.bw';
  }

  function getLoginFields() {
    return `
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="loginEmail" placeholder="${getPlaceholderEmail()}" required>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="loginPassword" placeholder="••••••••" required>
      </div>
      <div class="form-group link-group">
        <a id="forgotPasswordLink">Forgot password?</a>
      </div>
    `;
  }

  function getSignupFields() {
    let extraFields = '';
    if (selectedRole === 'student') {
      extraFields = `
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="signupName" placeholder="e.g. Goitseone Moothai" required>
        </div>
        <div class="form-group">
          <label>Student ID</label>
          <input type="text" id="signupId" placeholder="201403857" required>
        </div>
        <div class="form-group">
          <label>Program</label>
          <input type="text" id="signupProgram" value="Computer Science" required>
        </div>
      `;
    } else if (selectedRole === 'organization') {
      extraFields = `
        <div class="form-group">
          <label>Organization Name</label>
          <input type="text" id="signupOrgName" placeholder="e.g. TechCorp Ltd" required>
        </div>
        <div class="form-group">
          <label>Industry</label>
          <input type="text" id="signupIndustry" placeholder="Software Development" required>
        </div>
      `;
    } else if (selectedRole === 'supervisor') {
      extraFields = `
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="signupSupName" placeholder="e.g. Dr. L. Mokgweetsi" required>
        </div>
        <div class="form-group">
          <label>Department</label>
          <input type="text" id="signupSupDept" value="Computer Science" required>
        </div>
      `;
    } else {
      extraFields = `
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="signupCoordName" placeholder="e.g. Prof. T. Selelo" required>
        </div>
      `;
    }

    return `
      ${extraFields}
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="signupEmail" placeholder="${getPlaceholderEmail()}" required>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="signupPassword" placeholder="At least 6 characters" required>
      </div>
      <div class="form-group">
        <label>Confirm Password</label>
        <input type="password" id="signupConfirm" placeholder="Re-enter password" required>
      </div>
    `;
  }

  function getForgotFields() {
    return `
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="forgotEmail" placeholder="student@uni.ac.bw" required>
      </div>
    `;
  }

  function getOtpFields() {
    return `
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="otpEmail" value="${pendingEmail}" readonly>
      </div>
      <div class="form-group">
        <label>Verification Code</label>
        <input type="text" id="otpCode" placeholder="123456" required>
      </div>
    `;
  }

  function getResetFields() {
    return `
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="resetEmail" value="${pendingEmail}" readonly>
      </div>
      <div class="form-group">
        <label>Reset Code</label>
        <input type="text" id="resetCode" placeholder="123456" required>
      </div>
      <div class="form-group">
        <label>New Password</label>
        <input type="password" id="resetPassword" placeholder="At least 6 characters" required>
      </div>
      <div class="form-group">
        <label>Confirm Password</label>
        <input type="password" id="resetConfirm" placeholder="Re-enter password" required>
      </div>
    `;
  }

  function submitLoginSignup() {
    const email = document.getElementById(currentMode === 'login' ? 'loginEmail' : 'signupEmail')?.value.trim();
    const password = document.getElementById(currentMode === 'login' ? 'loginPassword' : 'signupPassword')?.value;
    if (!email || !password) {
      alert('Please fill in both email and password.');
      return null;
    }

    if (currentMode === 'signup') {
      if (document.getElementById('signupPassword').value !== document.getElementById('signupConfirm').value) {
        alert('Passwords do not match.');
        return null;
      }
      if (password.length < 6) {
        alert('Password must be at least 6 characters long.');
        return null;
      }
    }

    const payload = { email, password, role: selectedRole };
    if (currentMode === 'signup') {
      if (selectedRole === 'student') {
        const studentId = document.getElementById('signupId')?.value.trim();
        if (!studentId || studentId.length !== 9 || studentId[0] !== '2') {
          alert('Student ID must be 9 characters long and start with the digit 2.');
          return null;
        }
        payload.profile = {
          name: document.getElementById('signupName')?.value.trim(),
          studentId,
          program: document.getElementById('signupProgram')?.value.trim()
        };
      } else if (selectedRole === 'organization') {
        payload.profile = {
          orgName: document.getElementById('signupOrgName')?.value.trim(),
          industry: document.getElementById('signupIndustry')?.value.trim()
        };
      } else if (selectedRole === 'supervisor') {
        payload.profile = {
          name: document.getElementById('signupSupName')?.value.trim(),
          supervisorDept: document.getElementById('signupSupDept')?.value.trim()
        };
      } else {
        payload.profile = {
          name: document.getElementById('signupCoordName')?.value.trim()
        };
      }
    }

    return payload;
  }

  async function handleForgot() {
    const email = document.getElementById('forgotEmail')?.value.trim();
    if (!email) {
      alert('Please enter your email.');
      return;
    }

    try {
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const result = await response.json();
      if (!response.ok) {
        alert(result.error || 'Unable to send reset instructions.');
        return;
      }
      pendingEmail = email;
      displayedOtpCode = result.otpCode || '';
      currentMode = 'reset';
      renderModal();
      if (displayedOtpCode) {
        alert(`A password reset code has been generated: ${displayedOtpCode}`);
      } else {
        alert('A password reset code has been sent if that email is registered.');
      }
    } catch (error) {
      console.error(error);
      alert('Unable to connect to the backend. Please try again.');
    }
  }

  async function handleVerifyOtp() {
    const code = document.getElementById('otpCode')?.value.trim();
    if (!pendingEmail || !code) {
      alert('Please enter the verification code.');
      return;
    }

    try {
      const response = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, code, role: pendingRole })
      });
      const result = await response.json();
      if (!response.ok) {
        alert(result.error || 'Invalid verification code.');
        return;
      }
      localStorage.setItem('iams_user_role', pendingRole);
      localStorage.setItem('iams_user_email', pendingEmail);
      alert('✅ Verification successful. Redirecting to dashboard...');
      window.location.href = 'dashboard.html';
    } catch (error) {
      console.error(error);
      alert('Unable to connect to the backend. Please try again.');
    }
  }

  async function handleReset() {
    const code = document.getElementById('resetCode')?.value.trim();
    const password = document.getElementById('resetPassword')?.value;
    const confirm = document.getElementById('resetConfirm')?.value;
    if (!pendingEmail || !code || !password || !confirm) {
      alert('Please fill in all reset fields.');
      return;
    }
    if (password !== confirm) {
      alert('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }

    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, code, newPassword: password })
      });
      const result = await response.json();
      if (!response.ok) {
        alert(result.error || 'Unable to reset password.');
        return;
      }
      alert('✅ Your password was reset successfully. Please sign in with your new password.');
      currentMode = 'login';
      renderModal();
    } catch (error) {
      console.error(error);
      alert('Unable to connect to the backend. Please try again.');
    }
  }

  async function handleAuth() {
    if (currentMode === 'forgot') {
      return handleForgot();
    }
    if (currentMode === 'otp') {
      return handleVerifyOtp();
    }
    if (currentMode === 'reset') {
      return handleReset();
    }

    const payload = submitLoginSignup();
    if (!payload) return;

    try {
      const response = await fetch(currentMode === 'login' ? '/api/login' : '/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        alert(result.error || 'Unable to complete request.');
        return;
      }

      if (currentMode === 'signup') {
        localStorage.setItem('iams_user_role', selectedRole);
        localStorage.setItem('iams_user_email', payload.email);
        alert(`✅ Account created successfully as ${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}!\nRedirecting to dashboard...`);
        window.location.href = 'dashboard.html';
        return;
      }

      if (result.status === 'otp_required') {
        pendingEmail = payload.email;
        pendingRole = selectedRole;
        displayedOtpCode = result.otpCode || '';
        currentMode = 'otp';
        renderModal();
        if (displayedOtpCode) {
          alert(`A verification code has been generated: ${displayedOtpCode}`);
        } else {
          alert('A verification code has been sent to your email. Please enter it to complete login.');
        }
        return;
      }

      localStorage.setItem('iams_user_role', selectedRole);
      localStorage.setItem('iams_user_email', payload.email);
      alert('✅ Login successful. Redirecting to dashboard...');
      window.location.href = 'dashboard.html';
    } catch (error) {
      console.error(error);
      alert('Unable to connect to the backend. Please make sure the server is running and try again.');
    }
  }

  function renderModal() {
    const titleMap = {
      login: 'Sign In to IAMS',
      signup: 'Create Account',
      forgot: 'Forgot Password',
      otp: 'Enter OTP Code',
      reset: 'Reset Your Password'
    };

    const submitTextMap = {
      login: 'Sign In',
      signup: 'Create Account',
      forgot: 'Send reset code',
      otp: 'Verify Code',
      reset: 'Update Password'
    };

    const title = titleMap[currentMode] || 'IAMS';
    const submitText = submitTextMap[currentMode] || 'Submit';

    let roleTabsHtml = '';
    if (currentMode === 'login' || currentMode === 'signup') {
      roleTabsHtml = `
        <div class="role-tabs" id="roleTabs">
          <button class="role-tab ${selectedRole === 'student' ? 'active' : ''}" data-role="student">🎓 Student</button>
          <button class="role-tab ${selectedRole === 'coordinator' ? 'active' : ''}" data-role="coordinator">📋 Coordinator</button>
          <button class="role-tab ${selectedRole === 'organization' ? 'active' : ''}" data-role="organization">🏢 Organization</button>
          <button class="role-tab ${selectedRole === 'supervisor' ? 'active' : ''}" data-role="supervisor">👨‍🏫 Supervisor</button>
        </div>
      `;
    }

    let formFields = '';
    if (currentMode === 'login') {
      formFields = getLoginFields();
    } else if (currentMode === 'signup') {
      formFields = getSignupFields();
    } else if (currentMode === 'forgot') {
      formFields = getForgotFields();
    } else if (currentMode === 'otp') {
      formFields = getOtpFields();
    } else if (currentMode === 'reset') {
      formFields = getResetFields();
    }

    let codeHint = '';
    if ((currentMode === 'otp' || currentMode === 'reset') && displayedOtpCode) {
      codeHint = `<div class="form-group otp-hint">Your code is: <strong>${displayedOtpCode}</strong></div>`;
    }

    let switchHtml = '';
    if (currentMode === 'login') {
      switchHtml = `Don't have an account? <a id="switchToSignup">Sign up</a>`;
    } else if (currentMode === 'signup') {
      switchHtml = `Already have an account? <a id="switchToLogin">Sign in</a>`;
    } else {
      switchHtml = `<a id="switchToLogin">Back to sign in</a>`;
    }

    modalContainer.innerHTML = `
      <div class="modal-header">
        <h2><i class="fas ${currentMode === 'login' ? 'fa-sign-in-alt' : currentMode === 'signup' ? 'fa-user-plus' : currentMode === 'forgot' ? 'fa-unlock-alt' : currentMode === 'otp' ? 'fa-shield-alt' : 'fa-key'}"></i> ${title}</h2>
        <button class="close-btn" onclick="document.getElementById('modalOverlay').style.display='none'">&times;</button>
      </div>
      ${roleTabsHtml}
      <form id="authForm">
        ${formFields}
        ${codeHint}
        <div class="form-footer">
          <button type="submit" class="btn-primary">${submitText}</button>
        </div>
      </form>
      <div class="switch-link">${switchHtml}</div>
    `;

    document.querySelectorAll('.role-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        selectedRole = tab.dataset.role;
        renderModal();
      });
    });

    const switchToSignup = document.getElementById('switchToSignup');
    const switchToLogin = document.getElementById('switchToLogin');
    if (switchToSignup) switchToSignup.addEventListener('click', () => { currentMode = 'signup'; renderModal(); });
    if (switchToLogin) switchToLogin.addEventListener('click', () => { currentMode = 'login'; renderModal(); });

    const forgotLink = document.getElementById('forgotPasswordLink');
    if (forgotLink) {
      forgotLink.addEventListener('click', () => {
        currentMode = 'forgot';
        renderModal();
      });
    }

    const authForm = document.getElementById('authForm');
    if (authForm) {
      authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleAuth();
      });
    }
  }

  renderModal();
  window.closeModal = closeModal;
})();
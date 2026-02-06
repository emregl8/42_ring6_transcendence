(function () {
  'use strict';
  function renderProfile(user) {
    const card = document.getElementById('profileCard');
    const avatarEl = document.getElementById('avatar');
    const usernameEl = document.getElementById('username');
    const emailEl = document.getElementById('email');
    const fullNameEl = document.getElementById('fullName');
    const joinedAtEl = document.getElementById('joinedAt');
    avatarEl.src = user.avatar || 'https://ui-avatars.com/api/?name=' + user.username + '&background=0D8ABC&color=fff&size=128';
    usernameEl.textContent = user.username;
    emailEl.textContent = user.email;
    fullNameEl.textContent = (user.firstName || '') + ' ' + (user.lastName || '');
    joinedAtEl.textContent = new Date(user.createdAt).toLocaleDateString();

    const projectsListEl = document.getElementById('projectsList');
    if (user.projects && user.projects.length > 0) {
      const activeProjects = user.projects.filter((p) => p.status === 'in_progress' && !p['validated?']);

      projectsListEl.innerHTML = '';
      if (activeProjects.length === 0) {
        projectsListEl.innerHTML = '<li style="color: #666; font-style: italic;">No active projects found.</li>';
      } else {
        activeProjects.forEach((pu) => {
          const li = document.createElement('li');
          li.style.padding = '0.75rem 0';
          li.style.borderBottom = '1px solid #f5f5f5';
          li.style.display = 'flex';
          li.style.justifyContent = 'space-between';
          li.style.alignItems = 'center';

          const projectName = pu.project ? pu.project.name : 'Unknown Project';
          const status = pu.status || 'In Progress';

          li.innerHTML = `
            <span style="font-weight: 500;">${DOMPurify.sanitize(projectName)}</span>
            <span style="font-size: 0.85rem; color: #666;">
              ${DOMPurify.sanitize(status)}
            </span>
          `;
          projectsListEl.appendChild(li);
        });
      }
    } else {
      projectsListEl.innerHTML = '<li style="color: #666; font-style: italic;">No projects found.</li>';
    }

    card.style.display = 'block';
  }

  document.addEventListener('DOMContentLoaded', function () {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', AuthClient.logout);
    }

    const urlParams = new URLSearchParams(globalThis.location.search);
    const username = urlParams.get('username');

    if (username) {
      if (logoutBtn) logoutBtn.style.display = 'none';
      AuthClient.request('/api/auth/users/' + encodeURIComponent(username))
        .then(function (res) {
          if (!res.ok) throw new Error('User not found');
          return res.json();
        })
        .then(renderProfile)
        .catch(function (err) {
          Utils.showError('User not found.');
        });
    } else {
      AuthClient.loadUserProfile(renderProfile);
    }
  });
})();

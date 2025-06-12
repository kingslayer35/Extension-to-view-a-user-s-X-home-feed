class XFeedViewer {
  constructor() {
      this.currentSession = null;
      this.sessions = new Map();
      this.autoRefreshInterval = null;
      this.serverUrl = 'http://localhost:5000';
      
      this.initializeElements();
      this.attachEventListeners();
      this.loadSavedSessions();
  }
  
  initializeElements() {
      this.elements = {
          status: document.getElementById('status'),
          loginForm: document.getElementById('login-form'),
          username: document.getElementById('username'),
          email: document.getElementById('email'),
          password: document.getElementById('password'),
          loginBtn: document.getElementById('login-btn'),
          sessionsContainer: document.getElementById('sessions-container'),
          sessionsList: document.getElementById('sessions-list'),
          feedControls: document.getElementById('feed-controls'),
          feedContainer: document.getElementById('feed-container'),
          feedContent: document.getElementById('feed-content'),
          refreshFeed: document.getElementById('refresh-feed'),
          autoRefreshToggle: document.getElementById('auto-refresh-toggle')
      };
  }
  
  attachEventListeners() {
      this.elements.loginBtn.addEventListener('click', () => this.handleLogin());
      this.elements.refreshFeed.addEventListener('click', () => this.refreshFeed());
      this.elements.autoRefreshToggle.addEventListener('click', () => this.toggleAutoRefresh());
      
      // Enter key support for login
      [this.elements.username, this.elements.email, this.elements.password].forEach(input => {
          input.addEventListener('keypress', (e) => {
              if (e.key === 'Enter') this.handleLogin();
          });
      });
  }
  
  async loadSavedSessions() {
      try {
          const result = await chrome.storage.local.get(['sessions']);
          if (result.sessions) {
              this.sessions = new Map(Object.entries(result.sessions));
              this.updateSessionsDisplay();
          }
      } catch (error) {
          console.error('Error loading sessions:', error);
      }
  }
  
  async saveSessions() {
      try {
          const sessionsObj = Object.fromEntries(this.sessions);
          await chrome.storage.local.set({ sessions: sessionsObj });
      } catch (error) {
          console.error('Error saving sessions:', error);
      }
  }
  
  showStatus(message, type = 'success') {
      this.elements.status.textContent = message;
      this.elements.status.className = `status ${type}`;
      this.elements.status.classList.remove('hidden');
      
      setTimeout(() => {
          this.elements.status.classList.add('hidden');
      }, 5000);
  }
  
  async handleLogin() {
      const username = this.elements.username.value.trim();
      const email = this.elements.email.value.trim();
      const password = this.elements.password.value.trim();
      
      if (!username || !password) {
          this.showStatus('Username and password are required', 'error');
          return;
      }
      
      this.elements.loginBtn.disabled = true;
      this.elements.loginBtn.textContent = 'Logging in...';
      
      try {
          const sessionId = `${username}_${Date.now()}`;
          const response = await fetch(`${this.serverUrl}/login`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  username,
                  email: email || null,
                  password,
                  session_id: sessionId
              })
          });
          
          const result = await response.json();
          
          if (result.success) {
              this.sessions.set(sessionId, {
                  username,
                  email,
                  loginTime: new Date().toISOString()
              });
              
              await this.saveSessions();
              this.updateSessionsDisplay();
              this.setActiveSession(sessionId);
              
              // Clear form
              this.elements.username.value = '';
              this.elements.email.value = '';
              this.elements.password.value = '';
              
              this.showStatus(`Successfully logged in as ${username}`, 'success');
          } else {
              this.showStatus(`Login failed: ${result.error}`, 'error');
          }
      } catch (error) {
          this.showStatus(`Connection error: ${error.message}`, 'error');
      } finally {
          this.elements.loginBtn.disabled = false;
          this.elements.loginBtn.textContent = 'Login & Add Account';
      }
  }
  
  updateSessionsDisplay() {
      if (this.sessions.size === 0) {
          this.elements.sessionsContainer.classList.add('hidden');
          return;
      }
      
      this.elements.sessionsContainer.classList.remove('hidden');
      this.elements.sessionsList.innerHTML = '';
      
      for (const [sessionId, sessionData] of this.sessions) {
          const sessionElement = document.createElement('div');
          sessionElement.className = `session-item ${sessionId === this.currentSession ? 'active' : ''}`;
          
          sessionElement.innerHTML = `
              <div>
                  <div class="session-name">${sessionData.username}</div>
                  <div style="font-size: 12px; color: #666;">
                      ${new Date(sessionData.loginTime).toLocaleString()}
                  </div>
              </div>
              <div class="session-actions">
                  <button class="btn-small" onclick="xFeedViewer.setActiveSession('${sessionId}')">
                      ${sessionId === this.currentSession ? 'Active' : 'Switch'}
                  </button>
                  <button class="btn-small btn-danger" onclick="xFeedViewer.removeSession('${sessionId}')">
                      Remove
                  </button>
              </div>
          `;
          
          this.elements.sessionsList.appendChild(sessionElement);
      }
  }
  
  setActiveSession(sessionId) {
      this.currentSession = sessionId;
      this.updateSessionsDisplay();
      this.elements.feedControls.classList.remove('hidden');
      this.refreshFeed();
  }
  
  async removeSession(sessionId) {
      try {
          // Logout from server
          await fetch(`${this.serverUrl}/logout`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({ session_id: sessionId })
          });
      } catch (error) {
          console.error('Error logging out from server:', error);
      }
      
      this.sessions.delete(sessionId);
      await this.saveSessions();
      
      if (this.currentSession === sessionId) {
          this.currentSession = null;
          this.elements.feedControls.classList.add('hidden');
          this.elements.feedContainer.classList.add('hidden');
      }
      
      this.updateSessionsDisplay();
      this.showStatus('Session removed', 'success');
  }
  
  async refreshFeed() {
      if (!this.currentSession) {
          this.showStatus('No active session', 'error');
          return;
      }
      
      this.elements.refreshFeed.disabled = true;
      this.elements.refreshFeed.textContent = 'Loading...';
      
      try {
          const response = await fetch(`${this.serverUrl}/get_home_timeline`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  session_id: this.currentSession,
                  count: 20
              })
          });
          
          const result = await response.json();
          
          if (result.success) {
              this.displayFeed(result.tweets);
              this.showStatus('Feed refreshed', 'success');
          } else {
              this.showStatus(`Failed to load feed: ${result.error}`, 'error');
          }
      } catch (error) {
          this.showStatus(`Connection error: ${error.message}`, 'error');
      } finally {
          this.elements.refreshFeed.disabled = false;
          this.elements.refreshFeed.textContent = 'Refresh Feed';
      }
  }
  
  displayFeed(tweets) {
      this.elements.feedContainer.classList.remove('hidden');
      this.elements.feedContent.innerHTML = '';
      
      if (tweets.length === 0) {
          this.elements.feedContent.innerHTML = '<p>No tweets found.</p>';
          return;
      }
      
      tweets.forEach(tweet => {
          const tweetElement = document.createElement('div');
          tweetElement.className = 'tweet';
          
          const mediaHtml = tweet.media.length > 0 
              ? `<div class="tweet-media">
                   ${tweet.media.map(url => `<img src="${url}" style="max-width: 100%; margin: 5px 0; border-radius: 4px;">`).join('')}
                 </div>`
              : '';
          
          tweetElement.innerHTML = `
              <div class="tweet-header">
                  <img src="${tweet.user_profile_image}" alt="Profile" class="profile-image">
                  <div class="user-info">
                      <p class="user-name">${tweet.user_name}</p>
                      <p class="user-handle">@${tweet.user_screen_name}</p>
                  </div>
              </div>
              <div class="tweet-text">${tweet.text}</div>
              ${mediaHtml}
              <div class="tweet-stats">
                  ${new Date(tweet.created_at).toLocaleString()} • 
                  ❤️ ${tweet.favorite_count} • 
                  🔄 ${tweet.retweet_count}
              </div>
          `;
          
          this.elements.feedContent.appendChild(tweetElement);
      });
  }
  
  toggleAutoRefresh() {
      if (this.autoRefreshInterval) {
          clearInterval(this.autoRefreshInterval);
          this.autoRefreshInterval = null;
          this.elements.autoRefreshToggle.textContent = 'Enable Auto-Refresh';
          this.showStatus('Auto-refresh disabled', 'success');
      } else {
          this.autoRefreshInterval = setInterval(() => {
              this.refreshFeed();
          }, 30000); // Refresh every 30 seconds
          this.elements.autoRefreshToggle.textContent = 'Disable Auto-Refresh';
          this.showStatus('Auto-refresh enabled (30s interval)', 'success');
      }
  }
}

// Initialize the app when popup opens
const xFeedViewer = new XFeedViewer();

// Make it globally accessible for onclick handlers
window.xFeedViewer = xFeedViewer;

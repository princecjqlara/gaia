import React from 'react';

const Header = ({
  role,
  currentUserName,
  onUserNameChange,
  onRoleChange,
  onThemeToggle,
  onAddClient,
  onAdminSettings,
  onNotifications,
  onReports,
  onCalendar,
  onTeamPerformance,
  onTeamOnline,
  onLogout,
  isOnlineMode,
  currentUserEmail,
  unreadNotificationCount = 0,
  // Clock in/out props
  isClockedIn = false,
  shiftDuration = '',
  onClockToggle,
  clockLoading = false,
  // Multi-tenant props
  organizationName,
  isOrganizer = false,
  onOrganizationSettings,
  onTeamManagement
}) => {
  return (
    <header className="app-header">
      <div className="app-logo">
        <img src="/logo.jpg" alt="GAIA Logo" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' }} />
        <h1>GAIA</h1>
      </div>
      <div className="header-actions">
        {/* Clock In/Out Button */}
        {isOnlineMode && onClockToggle && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginRight: '0.75rem',
            padding: '0.4rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: isClockedIn ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${isClockedIn ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isClockedIn ? '#22c55e' : '#ef4444',
              boxShadow: isClockedIn ? '0 0 8px #22c55e' : 'none',
              animation: isClockedIn ? 'pulse 2s infinite' : 'none'
            }} />
            <span style={{
              fontSize: '0.8rem',
              color: isClockedIn ? '#22c55e' : '#ef4444',
              fontWeight: '500'
            }}>
              {isClockedIn ? `Online ${shiftDuration}` : 'Offline'}
            </span>
            <button
              onClick={onClockToggle}
              disabled={clockLoading}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: isClockedIn ? '#ef4444' : '#22c55e',
                color: 'white',
                cursor: clockLoading ? 'wait' : 'pointer',
                opacity: clockLoading ? 0.7 : 1,
                fontWeight: '500'
              }}
            >
              {clockLoading ? '...' : (isClockedIn ? 'Clock Out' : 'Clock In')}
            </button>
          </div>
        )}

        {isOnlineMode && currentUserEmail && (
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginRight: '0.5rem' }}>
            {currentUserEmail}
          </span>
        )}
        {!isOnlineMode && (
          <div className="role-selector">
            <select
              className="form-select"
              id="roleSelector"
              style={{ minWidth: '120px' }}
              value={role}
              onChange={(e) => onRoleChange(e.target.value)}
            >
              <option value="user">👤 User</option>
              <option value="admin">👑 Admin</option>
            </select>
          </div>
        )}
        <input
          type="text"
          className="form-input user-only"
          id="currentUserName"
          placeholder="Your Name"
          style={{ width: '120px' }}
          value={currentUserName}
          onChange={(e) => onUserNameChange(e.target.value)}
          disabled={isOnlineMode}
        />
        <button
          className="btn btn-secondary admin-only"
          id="adminSettingsBtn"
          title="Expense Settings"
          onClick={onAdminSettings}
        >
          ⚙️ Settings
        </button>
        {onReports && (
          <button
            className="btn btn-secondary admin-only"
            id="reportsBtn"
            title="Reports & Analytics"
            onClick={onReports}
          >
            📊 Reports
          </button>
        )}
        {onTeamPerformance && (
          <button
            className="btn btn-secondary admin-only"
            id="teamPerformanceBtn"
            title="Team Performance & Leaderboard"
            onClick={onTeamPerformance}
          >
            🏆 Team Performance
          </button>
        )}
        {onTeamOnline && (
          <button
            className="btn btn-secondary admin-only"
            id="teamOnlineBtn"
            title="Online Team & Auto-Assign"
            onClick={onTeamOnline}
          >
            👥 Team
          </button>
        )}
        {onCalendar && (
          <button
            className="btn btn-secondary"
            id="calendarBtn"
            title="Calendar View"
            onClick={onCalendar}
          >
            📅 Calendar
          </button>
        )}
        {/* Organization Management (Organizers only) */}
        {isOrganizer && onOrganizationSettings && (
          <button
            className="btn btn-secondary"
            id="orgSettingsBtn"
            title="Organization Settings"
            onClick={onOrganizationSettings}
          >
            🏢 Organization
          </button>
        )}
        {isOrganizer && onTeamManagement && (
          <button
            className="btn btn-secondary"
            id="teamManagementBtn"
            title="Manage Team Members"
            onClick={onTeamManagement}
          >
            👥 Manage Team
          </button>
        )}
        {isOnlineMode && (
          <button
            className="btn btn-secondary"
            id="notificationsBtn"
            title="Notifications"
            onClick={onNotifications}
            style={{ position: 'relative' }}
          >
            🔔
            {unreadNotificationCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: 'var(--error)',
                color: 'white',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 'bold'
              }}>
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </span>
            )}
          </button>
        )}
        <button
          className="btn btn-primary"
          id="addClientBtn"
          onClick={onAddClient}
        >
          <span>➕</span> Add Client
        </button>
        {isOnlineMode && (
          <button
            className="btn btn-secondary"
            id="logoutBtn"
            title="Sign Out"
            onClick={onLogout}
            style={{ marginLeft: '0.5rem' }}
          >
            🚪 Logout
          </button>
        )}
        <button
          className="theme-toggle"
          id="themeToggle"
          title="Toggle Theme"
          onClick={onThemeToggle}
        >
          🌙
        </button>
      </div>

      {/* Pulse animation for online indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </header>
  );
};

export default Header;

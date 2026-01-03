import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import StatsGrid from './components/StatsGrid';
import FiltersBar from './components/FiltersBar';
import PhasesContainer from './components/PhasesContainer';
import ClientModal from './components/ClientModal';
import ViewClientModal from './components/ViewClientModal';
import AdminSettingsModal from './components/AdminSettingsModal';
import TeamPerformanceModal from './components/TeamPerformanceModal';
import NotificationsPanel from './components/NotificationsPanel';
import CommunicationLog from './components/CommunicationLog';
import ReportsDashboard from './components/ReportsDashboard';
import CalendarView from './components/CalendarView';
import HistoryModal from './components/HistoryModal';
import LoginModal from './components/LoginModal';
import ToastContainer from './components/ToastContainer';
import { useSupabase } from './hooks/useSupabase';
import { useNotifications } from './hooks/useNotifications';
import { useStorage } from './hooks/useStorage';
import { useClients } from './hooks/useClients';
import { usePhases } from './hooks/usePhases';
import { useMetrics } from './hooks/useMetrics';
import './css/styles.css';

function App() {
  const [theme, setTheme] = useState('dark');
  const [role, setRole] = useState('user');
  const [currentUserName, setCurrentUserName] = useState('User 1');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [showTeamPerformance, setShowTeamPerformance] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCommunicationLog, setShowCommunicationLog] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [currentClientId, setCurrentClientId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPhase, setFilterPhase] = useState('');
  const [filterPackage, setFilterPackage] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [viewMode, setViewMode] = useState(() => {
    const settings = JSON.parse(localStorage.getItem('campy_settings') || '{}');
    return settings.viewMode || 'kanban';
  }); // 'kanban' or 'table'

  const { isOnlineMode, initSupabase, signIn, signUp, signOut, getSession, isAdmin, getUserName, currentUser, currentUserProfile, getExpenses, saveExpenses, getAIPrompts, saveAIPrompts, getPackagePrices, savePackagePrices, getPackageDetails, savePackageDetails, refreshUserProfile, getAllUsers, syncAllData, addClientToSupabase, updateClientInSupabase, deleteClientFromSupabase } = useSupabase();
  const { unreadCount: notificationUnreadCount } = useNotifications(currentUser?.id);
  const { clients, addClient, updateClient, deleteClient, getClient } = useClients();
  const { metrics, updateMetrics } = useMetrics(clients);
  const { renderAllPhases, moveToNextPhase, moveClientToPhase } = usePhases(clients, {
    searchTerm,
    filterPhase,
    filterPackage,
    filterPayment
  }, currentUser);

  useEffect(() => {
    // Initialize theme
    const settings = JSON.parse(localStorage.getItem('campy_settings') || '{}');
    const savedTheme = settings.theme || 'dark';
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;

    // Initialize Supabase
    const init = async () => {
      const supabaseAvailable = initSupabase();
      if (supabaseAvailable) {
        const session = await getSession();
        if (session) {
          // Already logged in - sync data from Supabase
          setShowLoginModal(false);
          await syncAllData();
          // Role will be set by the useEffect that watches currentUserProfile
        } else {
          setShowLoginModal(true);
        }
      } else {
        // Offline mode
        setShowLoginModal(false);
        const savedRole = settings.role || 'user';
        setRole(savedRole);
        document.documentElement.dataset.role = savedRole;
      }
    };

    init();
  }, []);

  // Update role when user profile changes
  useEffect(() => {
    if (isOnlineMode && currentUserProfile) {
      const userRole = currentUserProfile.role === 'admin' ? 'admin' : 'user';
      console.log('User profile loaded:', { 
        email: currentUserProfile.email, 
        role: currentUserProfile.role, 
        detectedRole: userRole 
      });
      setRole(userRole);
      document.documentElement.dataset.role = userRole;
      setCurrentUserName(getUserName());
    }
  }, [isOnlineMode, currentUserProfile, getUserName]);

  // Add keyboard shortcut to refresh profile (Ctrl+Shift+R or Cmd+Shift+R)
  useEffect(() => {
    const handleKeyPress = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        if (isOnlineMode && currentUser) {
          console.log('Refreshing user profile...');
          refreshUserProfile();
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOnlineMode, currentUser, refreshUserProfile]);

  useEffect(() => {
    updateMetrics();
  }, [clients]);

  // Load all users when admin settings or team performance is opened
  useEffect(() => {
    if ((showAdminSettings || showTeamPerformance) && isOnlineMode && isAdmin()) {
      const loadUsers = async () => {
        const users = await getAllUsers();
        setAllUsers(users);
      };
      loadUsers();
    }
  }, [showAdminSettings, showTeamPerformance, isOnlineMode, isAdmin, getAllUsers]);

  // Update unread notification count
  useEffect(() => {
    setUnreadNotificationCount(notificationUnreadCount);
  }, [notificationUnreadCount]);

  const handleLogin = async (email, password) => {
    try {
      await signIn(email, password);
      setShowLoginModal(false);
      // Sync data after login
      await syncAllData();
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const handleSignUp = async (email, password, name) => {
    try {
      await signUp(email, password, name);
      // Don't close modal immediately - show success message
      // User will need to confirm email first
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  };

  const handleEnterOfflineMode = () => {
    setShowLoginModal(false);
    const settings = JSON.parse(localStorage.getItem('campy_settings') || '{}');
    const savedRole = settings.role || 'user';
    setRole(savedRole);
    document.documentElement.dataset.role = savedRole;
  };

  const handleToggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.dataset.theme = newTheme;
    const settings = JSON.parse(localStorage.getItem('campy_settings') || '{}');
    localStorage.setItem('campy_settings', JSON.stringify({ ...settings, theme: newTheme }));
  };

  const handleSwitchRole = (newRole) => {
    setRole(newRole);
    document.documentElement.dataset.role = newRole;
    const settings = JSON.parse(localStorage.getItem('campy_settings') || '{}');
    localStorage.setItem('campy_settings', JSON.stringify({ ...settings, role: newRole }));
  };

  const handleOpenAddModal = () => {
    setCurrentClientId(null);
    setShowClientModal(true);
  };

  const handleOpenEditModal = (id) => {
    setCurrentClientId(id);
    setShowClientModal(true);
  };

  const handleOpenViewModal = (id) => {
    setCurrentClientId(id);
    setShowViewModal(true);
  };

  const handleSaveClient = async (clientData) => {
    try {
      if (currentClientId) {
        // Update existing client
        if (isOnlineMode) {
          // Update in Supabase first
          const updated = await updateClientInSupabase(currentClientId, clientData);
          // Then update local storage with the mapped data
          if (updated) {
            await updateClient(currentClientId, updated);
          } else {
            // Fallback: update local storage with provided data
            await updateClient(currentClientId, clientData);
          }
        } else {
          await updateClient(currentClientId, clientData);
        }
      } else {
        // Create new client
        if (isOnlineMode) {
          // Create in Supabase first to get the real UUID
          const created = await addClientToSupabase(clientData);
          // Then add to local storage with the mapped data
          if (created) {
            await addClient(created);
          } else {
            // Fallback: add to local storage with provided data
            await addClient(clientData);
          }
        } else {
          await addClient(clientData);
        }
      }
      setShowClientModal(false);
      setCurrentClientId(null);
    } catch (error) {
      console.error('Error saving client:', error);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setShowLoginModal(true);
      setRole('user');
      document.documentElement.dataset.role = 'user';
      setCurrentUserName('User 1');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="app-container">
      <Header
        role={role}
        currentUserName={currentUserName}
        onUserNameChange={setCurrentUserName}
        onRoleChange={handleSwitchRole}
        onThemeToggle={handleToggleTheme}
        onAddClient={handleOpenAddModal}
        onAdminSettings={() => setShowAdminSettings(true)}
        onNotifications={() => setShowNotifications(true)}
        onReports={() => setShowReports(true)}
        onCalendar={() => setShowCalendar(true)}
        onTeamPerformance={() => setShowTeamPerformance(true)}
        onLogout={handleLogout}
        isOnlineMode={isOnlineMode}
        currentUserEmail={currentUser?.email}
        unreadNotificationCount={unreadNotificationCount}
      />

      <StatsGrid metrics={metrics} role={role} />

      <FiltersBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filterPhase={filterPhase}
        onPhaseFilterChange={setFilterPhase}
        filterPackage={filterPackage}
        onPackageFilterChange={setFilterPackage}
        filterPayment={filterPayment}
        onPaymentFilterChange={setFilterPayment}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          const settings = JSON.parse(localStorage.getItem('campy_settings') || '{}');
          localStorage.setItem('campy_settings', JSON.stringify({ ...settings, viewMode: mode }));
        }}
      />

      <PhasesContainer
        clients={clients}
        filters={{ searchTerm, filterPhase, filterPackage, filterPayment }}
        viewMode={viewMode}
        onViewClient={handleOpenViewModal}
        onEditClient={handleOpenEditModal}
        onMoveClient={async (clientId, targetPhase) => {
          try {
            await moveClientToPhase(clientId, targetPhase);
          } catch (error) {
            console.error('Error moving client to phase:', error);
          }
        }}
      />

      {showClientModal && (
        <ClientModal
          clientId={currentClientId}
          client={currentClientId ? getClient(currentClientId) : null}
          onClose={() => {
            setShowClientModal(false);
            setCurrentClientId(null);
          }}
          onSave={handleSaveClient}
          onDelete={async (id) => {
            // Delete from Supabase first if online
            if (isOnlineMode) {
              await deleteClientFromSupabase(id);
            }
            // Then delete from local storage
            await deleteClient(id);
            setShowClientModal(false);
            setCurrentClientId(null);
          }}
        />
      )}

      {showViewModal && (
        <ViewClientModal
          client={getClient(currentClientId)}
          onClose={() => {
            setShowViewModal(false);
            setCurrentClientId(null);
          }}
          onEdit={() => {
            setShowViewModal(false);
            handleOpenEditModal(currentClientId);
          }}
          onViewCommunication={() => {
            setShowCommunicationLog(true);
          }}
        />
      )}

      {showAdminSettings && (
        <AdminSettingsModal
          onClose={() => setShowAdminSettings(false)}
          getExpenses={getExpenses}
          saveExpenses={saveExpenses}
          getAIPrompts={getAIPrompts}
          saveAIPrompts={saveAIPrompts}
          getPackagePrices={getPackagePrices}
          savePackagePrices={savePackagePrices}
          getPackageDetails={getPackageDetails}
          savePackageDetails={savePackageDetails}
          onTeamPerformance={() => {
            setShowAdminSettings(false);
            setShowTeamPerformance(true);
          }}
        />
      )}

      {showTeamPerformance && (
        <TeamPerformanceModal
          clients={clients}
          users={allUsers}
          onClose={() => setShowTeamPerformance(false)}
        />
      )}

      {showNotifications && (
        <NotificationsPanel
          isOpen={showNotifications}
          onClose={() => setShowNotifications(false)}
          currentUserId={currentUser?.id}
        />
      )}

      {showCommunicationLog && (
        <CommunicationLog
          clientId={currentClientId}
          isOpen={showCommunicationLog}
          onClose={() => {
            setShowCommunicationLog(false);
            setCurrentClientId(null);
          }}
          currentUserId={currentUser?.id}
        />
      )}

      {showReports && (
        <ReportsDashboard
          clients={clients}
          users={allUsers}
          isOpen={showReports}
          onClose={() => setShowReports(false)}
        />
      )}

      {showCalendar && (
        <CalendarView
          clients={clients}
          isOpen={showCalendar}
          onClose={() => setShowCalendar(false)}
          currentUserId={currentUser?.id}
        />
      )}

      {showHistoryModal && (
        <HistoryModal
          clientId={currentClientId}
          onClose={() => {
            setShowHistoryModal(false);
            setCurrentClientId(null);
          }}
        />
      )}

      {showLoginModal && (
        <LoginModal
          onLogin={handleLogin}
          onSignUp={handleSignUp}
          onOfflineMode={handleEnterOfflineMode}
        />
      )}

      <ToastContainer />
    </div>
  );
}

export default App;


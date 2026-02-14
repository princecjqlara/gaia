import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import StatsGrid from "./components/StatsGrid";
import FiltersBar from "./components/FiltersBar";
import PhasesContainer from "./components/PhasesContainer";
import ClientModal from "./components/ClientModal";
import ViewClientModal from "./components/ViewClientModal";
import AdminSettingsModal from "./components/AdminSettingsModal";
import TeamPerformanceModal from "./components/TeamPerformanceModal";
import NotificationsPanel from "./components/NotificationsPanel";
import CommunicationLog from "./components/CommunicationLog";
import CalendarView from "./components/CalendarView";
import HistoryModal from "./components/HistoryModal";
import LoginModal from "./components/LoginModal";
import LandingPage from "./components/LandingPage";
import ToastContainer from "./components/ToastContainer";
import MeetingRoom from "./components/MeetingRoom";
import MessengerInbox from "./components/MessengerInbox";
import AIAssistantWidget from "./components/AIAssistantWidget";
import BookingPage from "./components/BookingPage";
import TeamOnlinePanel from "./components/TeamOnlinePanel";
import EvaluationModal from "./components/EvaluationModal";
import EvaluationQuestionsModal from "./components/EvaluationQuestionsModal";

import UnassignedClientsPanel from "./components/UnassignedClientsPanel";
import ContactsWithPhonePanel from "./components/ContactsWithPhonePanel";
import PropertyManagement from "./components/PropertyManagement";
import OrganizerDashboard from "./components/OrganizerDashboard";
import PublicPropertiesContainer from "./components/PublicPropertiesContainer";
import PropertyShowcaseDemo from "./pages/PropertyShowcaseDemo";
import TeamProfilePage from "./components/TeamProfilePage";
import { useSupabase } from "./hooks/useSupabase";
import { useScheduledMessageProcessor } from "./hooks/useScheduledMessageProcessor";
import { useClockInOut } from "./hooks/useClockInOut";
import { useNotifications } from "./hooks/useNotifications";
import { useStorage } from "./hooks/useStorage";
import { useClients } from "./hooks/useClients";
import { usePhases } from "./hooks/usePhases";
import { useMetrics } from "./hooks/useMetrics";
import { showToast } from "./utils/toast";
import "./css/styles.css";

function App() {
  const [theme, setTheme] = useState("dark");
  const [role, setRole] = useState("user");
  const [activeMainTab, setActiveMainTab] = useState("clients"); // 'clients', 'messenger', 'properties'
  const [currentUserName, setCurrentUserName] = useState("User 1");
  const [showLandingPage, setShowLandingPage] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [showTeamPerformance, setShowTeamPerformance] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCommunicationLog, setShowCommunicationLog] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showMeetingRoom, setShowMeetingRoom] = useState(false);
  const [showTeamOnlinePanel, setShowTeamOnlinePanel] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [showEvaluationQuestionsModal, setShowEvaluationQuestionsModal] = useState(false);
  const [meetingRoomSlug, setMeetingRoomSlug] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [currentClientId, setCurrentClientId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPhase, setFilterPhase] = useState("");
  const [filterAssignedTo, setFilterAssignedTo] = useState("");
  const [viewMode, setViewMode] = useState(() => {
    const settings = JSON.parse(localStorage.getItem("gaia_settings") || "{}");
    return settings.viewMode || "kanban";
  }); // 'kanban' or 'table'

  // Check for /room/:slug or /book/:pageId URL on load
  const [showBookingPage, setShowBookingPage] = useState(false);
  const [showPublicProperties, setShowPublicProperties] = useState(false);
  const [showPropertyDemo, setShowPropertyDemo] = useState(false);
  const [showTeamProfile, setShowTeamProfile] = useState(false);
  const [profileTeamId, setProfileTeamId] = useState(null);

  useEffect(() => {
    const path = window.location.pathname;

    // Meeting room route
    const roomMatch = path.match(/^\/room\/([a-zA-Z0-9]+)$/);
    if (roomMatch) {
      setMeetingRoomSlug(roomMatch[1]);
      setShowMeetingRoom(true);
      return;
    }

    // Booking page route - support both /book/:pageId and /booking
    const bookMatch = path.match(/^\/book\/([a-zA-Z0-9]+)$/);
    const isBookingPath = path === "/booking" || path.startsWith("/booking");
    if (bookMatch || isBookingPath) {
      setShowBookingPage(true);
      return;
    }

    // Property Demo route
    const isPropertyDemo = path === "/demo/property-showcase";
    if (isPropertyDemo) {
      setShowPropertyDemo(true);
      return;
    }

    // Team Profile Route - Instagram style profile page
    // Only match if path has content after / (e.g., /team-id but not /)
    const teamProfileMatch = path.match(/^\/([a-zA-Z0-9-]{3,})$/);
    if (teamProfileMatch &&
      teamProfileMatch[1] !== 'room' &&
      teamProfileMatch[1] !== 'book' &&
      teamProfileMatch[1] !== 'booking' &&
      teamProfileMatch[1] !== 'properties' &&
      teamProfileMatch[1] !== 'demo' &&
      teamProfileMatch[1] !== 'u' &&
      teamProfileMatch[1] !== 'api') {
      setProfileTeamId(teamProfileMatch[1]);
      setShowTeamProfile(true);
      return;
    }

    // Public Property Routes
    const propertyMatch = path.match(/^\/property\/([a-zA-Z0-9-]+)$/);
    const trackingPropertyMatch = path.match(
      /^\/u\/[^/]+\/property\/([a-zA-Z0-9-]+)$/,
    ); // Matches /u/:visitorName/property/:id
    const trackingListMatch = path.match(/^\/u\/[^/]+\/properties$/); // Matches /u/:visitorName/properties
    const teamPropertyMatch = path.match(/^\/([a-zA-Z0-9-]+)\/property\/([a-zA-Z0-9-]+)$/); // Matches /:teamId/property/:id
    const teamListMatch = path.match(/^\/([a-zA-Z0-9-]+)\/properties$/); // Matches /:teamId/properties
    const isPropertiesPath = path === "/properties";

    if (
      propertyMatch ||
      isPropertiesPath ||
      trackingPropertyMatch ||
      trackingListMatch ||
      teamPropertyMatch ||
      teamListMatch
    ) {
      setShowPublicProperties(true);
      return;
    }

    // Listen for popstate (back/forward)
    const handlePopState = () => {
      const newPath = window.location.pathname;
      const matchRoom = newPath.match(/^\/room\/([a-zA-Z0-9]+)$/);
      const matchBook = newPath.match(/^\/book\/([a-zA-Z0-9]+)$/);
      const isBookingPath =
        newPath === "/booking" || newPath.startsWith("/booking");
      const isPropertyDemo = newPath === "/demo/property-showcase";
      const matchTeamProfile = newPath.match(/^\/([a-zA-Z0-9-]{3,})$/);
      const isTeamProfile = matchTeamProfile &&
        matchTeamProfile[1] !== 'room' &&
        matchTeamProfile[1] !== 'book' &&
        matchTeamProfile[1] !== 'booking' &&
        matchTeamProfile[1] !== 'properties' &&
        matchTeamProfile[1] !== 'demo' &&
        matchTeamProfile[1] !== 'u' &&
        matchTeamProfile[1] !== 'api';

      const matchProp = newPath.match(/^\/property\/([a-zA-Z0-9-]+)$/);
      const matchTrackProp = newPath.match(
        /^\/u\/[^/]+\/property\/([a-zA-Z0-9-]+)$/,
      );
      const matchTrackList = newPath.match(/^\/u\/[^/]+\/properties$/);
      const matchTeamProp = newPath.match(/^\/([a-zA-Z0-9-]+)\/property\/([a-zA-Z0-9-]+)$/);
      const matchTeamList = newPath.match(/^\/([a-zA-Z0-9-]+)\/properties$/);
      const isPropPath = newPath === "/properties";

      if (matchRoom) {
        setMeetingRoomSlug(matchRoom[1]);
        setShowMeetingRoom(true);
        setShowBookingPage(false);
        setShowPublicProperties(false);
        setShowPropertyDemo(false);
      } else if (matchBook || isBookingPath) {
        setShowBookingPage(true);
        setShowMeetingRoom(false);
        setMeetingRoomSlug(null);
        setShowPublicProperties(false);
        setShowPropertyDemo(false);
      } else if (isPropertyDemo) {
        setShowPropertyDemo(true);
        setShowBookingPage(false);
        setShowMeetingRoom(false);
        setMeetingRoomSlug(null);
        setShowPublicProperties(false);
        setShowTeamProfile(false);
      } else if (isTeamProfile) {
        setProfileTeamId(matchTeamProfile[1]);
        setShowTeamProfile(true);
        setShowPropertyDemo(false);
        setShowBookingPage(false);
        setShowMeetingRoom(false);
        setMeetingRoomSlug(null);
        setShowPublicProperties(false);
      } else if (matchProp || isPropPath || matchTrackProp || matchTrackList || matchTeamProp || matchTeamList) {
        setShowTeamProfile(false);
        setShowPublicProperties(true);
        setShowBookingPage(false);
        setShowMeetingRoom(false);
        setMeetingRoomSlug(null);
        setShowPropertyDemo(false);
      } else {
        setShowMeetingRoom(false);
        setMeetingRoomSlug(null);
        setShowBookingPage(false);
        setShowPublicProperties(false);
        setShowPropertyDemo(false);
        setShowTeamProfile(false);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Facebook page selection state
  const [fbPagesForSelection, setFbPagesForSelection] = useState([]);
  const [showFbPageModal, setShowFbPageModal] = useState(false);
  const [connectingPage, setConnectingPage] = useState(false);

  // Auto-connect a single Facebook page
  const autoConnectPage = async (page) => {
    try {
      const facebookServiceModule = await import("./services/facebookService");
      const facebookService =
        facebookServiceModule.default || facebookServiceModule.facebookService;

      // connectPage expects: pageData.id, pageData.name, pageData.access_token, pageData.picture?.data?.url
      await facebookService.connectPage(
        {
          id: page.id,
          name: page.name,
          access_token: page.token,
          picture: { data: { url: page.picture } },
        },
        null,
      );

      alert(`✅ Connected "${page.name}"! You can now sync conversations.`);
      setActiveMainTab("messenger");
    } catch (err) {
      console.error("Failed to connect page:", err);
      alert(
        `Failed to connect page: ${err.message}\n\nMake sure you've run the database migration in Supabase.`,
      );
    }
  };

  // Check for Facebook OAuth callback parameters - run FIRST before any other effects
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);

    // Handle Facebook error
    const fbError = urlParams.get("fb_error");
    if (fbError) {
      alert("Facebook Error: " + decodeURIComponent(fbError));
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    // Handle Facebook pages for selection
    const fbPages = urlParams.get("fb_pages");
    if (fbPages) {
      console.log("FB Pages param found:", fbPages);
      // Clear URL immediately
      window.history.replaceState({}, "", window.location.pathname);

      try {
        const decoded = atob(fbPages);
        console.log("Decoded:", decoded);
        const pages = JSON.parse(decoded);
        console.log("Parsed pages:", pages);

        if (pages && pages.length > 0) {
          if (pages.length === 1) {
            // Auto-connect if only one page
            alert(
              `Found 1 Facebook page: "${pages[0].name}". Connecting automatically...`,
            );
            autoConnectPage(pages[0]);
          } else {
            // Show selection modal for multiple pages
            setFbPagesForSelection(pages);
            setShowFbPageModal(true);
            alert(
              `Found ${pages.length} Facebook pages. Please select one to connect.`,
            );
          }
        } else {
          alert(
            "No Facebook pages found. Make sure you have admin access to at least one Facebook Page.",
          );
        }
      } catch (e) {
        console.error("Failed to parse Facebook pages:", e);
        alert("Failed to load Facebook pages: " + e.message);
      }
    }
  }, []);

  const {
    isOnlineMode,
    initSupabase,
    signIn,
    signUp,
    validateInviteCode,
    signOut,
    getSession,
    isAdmin,
    getUserName,
    currentUser,
    currentUserProfile,
    getExpenses,
    saveExpenses,
    getAIPrompts,
    saveAIPrompts,
    getPackagePrices,
    savePackagePrices,
    getPackageDetails,
    savePackageDetails,
    refreshUserProfile,
    getAllUsers,
    syncAllData,
    addClientToSupabase,
    updateClientInSupabase,
    deleteClientFromSupabase,
  } = useSupabase();
  const { unreadCount: notificationUnreadCount } = useNotifications(
    currentUser?.id,
  );
  const { clients, addClient, updateClient, deleteClient, getClient } =
    useClients();
  const { metrics, updateMetrics } = useMetrics(clients);
  const { renderAllPhases, moveToNextPhase, moveClientToPhase } = usePhases(
    clients,
    {
      searchTerm,
      filterPhase,
    },
    currentUser,
    updateClient,
  );

  // Hybrid scheduled message processing - runs every 60s when user is logged in
  useScheduledMessageProcessor(!!currentUser);

  // Clock in/out functionality
  const {
    isClockedIn,
    shiftDurationFormatted,
    loading: clockLoading,
    toggle: toggleClock,
  } = useClockInOut(currentUser?.id);

  useEffect(() => {
    // Initialize theme
    const settings = JSON.parse(localStorage.getItem("gaia_settings") || "{}");
    const savedTheme = settings.theme || "dark";
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
          // Load all users for calendar attendees
          const users = await getAllUsers();
          if (users) setAllUsers(users);
          // Role will be set by the useEffect that watches currentUserProfile
        } else {
          // Not logged in - show landing page
          setShowLandingPage(true);
        }
      } else {
        // No Supabase - show landing page
        setShowLandingPage(true);
      }
    };

    init();
  }, []);

  // Update role when user profile changes
  useEffect(() => {
    if (isOnlineMode && currentUserProfile) {
      // Recognize organizer, admin, or user roles
      const userRole = currentUserProfile.role || "user";
      console.log("User profile loaded:", {
        email: currentUserProfile.email,
        role: currentUserProfile.role,
        detectedRole: userRole,
      });
      setRole(userRole);
      document.documentElement.dataset.role = userRole;
      setCurrentUserName(getUserName());
    }
  }, [isOnlineMode, currentUserProfile, getUserName]);

  // Listen for custom events to open modals
  useEffect(() => {
    const handleOpenEvaluationQuestions = () => {
      setShowEvaluationQuestionsModal(true);
    };

    window.addEventListener('open-evaluation-questions', handleOpenEvaluationQuestions);

    return () => {
      window.removeEventListener('open-evaluation-questions', handleOpenEvaluationQuestions);
    };
  }, []);

  // Add keyboard shortcut to refresh profile (Ctrl+Shift+R or Cmd+Shift+R)
  useEffect(() => {
    const handleKeyPress = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "R") {
        e.preventDefault();
        if (isOnlineMode && currentUser) {
          console.log("Refreshing user profile...");
          refreshUserProfile();
        }
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isOnlineMode, currentUser, refreshUserProfile]);

  useEffect(() => {
    updateMetrics();
  }, [clients]);

  // Load all users when admin settings or team performance is opened
  useEffect(() => {
    if (
      (showAdminSettings || showTeamPerformance) &&
      isOnlineMode &&
      isAdmin()
    ) {
      const loadUsers = async () => {
        const users = await getAllUsers();
        setAllUsers(users);
      };
      loadUsers();
    }
  }, [
    showAdminSettings,
    showTeamPerformance,
    isOnlineMode,
    isAdmin,
    getAllUsers,
  ]);

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
      console.error("Login error:", error);
      throw error;
    }
  };

  const handleSignUp = async (email, password, name, inviteCode = null) => {
    try {
      await signUp(email, password, name, inviteCode);
      // Don't close modal immediately - show success message
      // User will need to confirm email first
    } catch (error) {
      console.error("Sign up error:", error);
      throw error;
    }
  };

  const handleEnterOfflineMode = () => {
    setShowLoginModal(false);
    const settings = JSON.parse(localStorage.getItem("gaia_settings") || "{}");
    const savedRole = settings.role || "user";
    setRole(savedRole);
    document.documentElement.dataset.role = savedRole;
  };

  const handleToggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    document.documentElement.dataset.theme = newTheme;
    const settings = JSON.parse(localStorage.getItem("gaia_settings") || "{}");
    localStorage.setItem(
      "gaia_settings",
      JSON.stringify({ ...settings, theme: newTheme }),
    );
  };

  const handleSwitchRole = (newRole) => {
    setRole(newRole);
    document.documentElement.dataset.role = newRole;
    const settings = JSON.parse(localStorage.getItem("gaia_settings") || "{}");
    localStorage.setItem(
      "gaia_settings",
      JSON.stringify({ ...settings, role: newRole }),
    );
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
          const updated = await updateClientInSupabase(
            currentClientId,
            clientData,
          );
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
        showToast("Client updated successfully", "success");
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
        showToast("Client added successfully", "success");
      }
      setShowClientModal(false);
      setCurrentClientId(null);
    } catch (error) {
      console.error("Error saving client:", error);
      const errorMessage =
        error?.message || "Failed to save client. Please try again.";
      showToast(`Error saving client: ${errorMessage}`, "error");
      throw error; // Re-throw so modal stays open
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setShowLoginModal(true);
      setRole("user");
      document.documentElement.dataset.role = "user";
      setCurrentUserName("User 1");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleOpenEvaluation = (clientId) => {
    setCurrentClientId(clientId);
    setShowEvaluationModal(true);
  };

  const handleEvaluationComplete = async (evaluationData) => {
    try {
      const wasMoved = evaluationData.phase === 'evaluated';
      if (isOnlineMode) {
        const updated = await updateClientInSupabase(currentClientId, evaluationData);
        if (updated) {
          await updateClient(currentClientId, updated);
        } else {
          await updateClient(currentClientId, evaluationData);
        }
      } else {
        await updateClient(currentClientId, evaluationData);
      }
      if (wasMoved) {
        showToast(`Evaluation completed! Client moved to Evaluated stage (${evaluationData.evaluationScore}%).`, "success");
      } else {
        showToast(`Evaluation completed (${evaluationData.evaluationScore}%). Score below threshold - client remains in current stage.`, "warning");
      }
      setShowEvaluationModal(false);
      setCurrentClientId(null);
    } catch (error) {
      console.error("Error completing evaluation:", error);
      showToast("Error completing evaluation", "error");
    }
  };

  // Only show main app UI when logged in
  const isLoggedIn = !!currentUser;
  const isOrganizer = role === "organizer";

  const appContainerStyle = showTeamProfile || showPublicProperties || showPropertyDemo
    ? { maxWidth: 'none', padding: 0 }
    : undefined;

  return (
    <div className="app-container" style={appContainerStyle}>
      {/* Show Organizer Dashboard for organizers (but not when viewing public pages) */}
      {isLoggedIn && isOrganizer && !showTeamProfile && !showPublicProperties && (
        <OrganizerDashboard
          onLogout={handleLogout}
          onThemeToggle={handleToggleTheme}
        />
      )}

      {/* Show regular CRM for admins and users (but not when viewing public pages) */}
      {isLoggedIn && !isOrganizer && !showTeamProfile && !showPublicProperties && (
        <>
          <Header
            role={role}
            currentUserName={currentUserName}
            onUserNameChange={setCurrentUserName}
            onRoleChange={handleSwitchRole}
            onThemeToggle={handleToggleTheme}
            onAddClient={handleOpenAddModal}
            onAdminSettings={() => setShowAdminSettings(true)}
            onNotifications={() => setShowNotifications(true)}
            onCalendar={() => setShowCalendar(true)}
            onTeamPerformance={() => setShowTeamPerformance(true)}
            onTeamOnline={() => setShowTeamOnlinePanel(true)}
            onLogout={handleLogout}
            isOnlineMode={isOnlineMode}
            currentUserEmail={currentUser?.email}
            unreadNotificationCount={unreadNotificationCount}
            isClockedIn={isClockedIn}
            shiftDuration={shiftDurationFormatted}
            onClockToggle={toggleClock}
            clockLoading={clockLoading}
          />

          {/* Main Tab Navigation */}
          <div
            style={{
              display: "flex",
              gap: "0",
              padding: "0 1.5rem",
              marginBottom: "1rem",
              borderBottom: "2px solid var(--border-color)",
            }}
          >
            <button
              onClick={() => setActiveMainTab("clients")}
              style={{
                padding: "0.75rem 1.5rem",
                border: "none",
                background: "transparent",
                borderBottom:
                  activeMainTab === "clients"
                    ? "2px solid var(--primary)"
                    : "2px solid transparent",
                marginBottom: "-2px",
                color:
                  activeMainTab === "clients"
                    ? "var(--primary)"
                    : "var(--text-secondary)",
                cursor: "pointer",
                fontWeight: activeMainTab === "clients" ? "600" : "400",
                fontSize: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              👥 Clients
            </button>
            <button
              onClick={() => {
                // Ensure reliable tab switching and prevent accidental resets
                setActiveMainTab((prev) =>
                  prev !== "messenger" ? "messenger" : prev,
                );
              }}
              style={{
                padding: "0.75rem 1.5rem",
                border: "none",
                background: "transparent",
                borderBottom:
                  activeMainTab === "messenger"
                    ? "2px solid var(--primary)"
                    : "2px solid transparent",
                marginBottom: "-2px",
                color:
                  activeMainTab === "messenger"
                    ? "var(--primary)"
                    : "var(--text-secondary)",
                cursor: "pointer",
                fontWeight: activeMainTab === "messenger" ? "600" : "400",
                fontSize: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              💬 Messenger
            </button>
            <button
              onClick={() => setActiveMainTab("properties")}
              style={{
                padding: "0.75rem 1.5rem",
                border: "none",
                background: "transparent",
                borderBottom:
                  activeMainTab === "properties"
                    ? "2px solid var(--primary)"
                    : "2px solid transparent",
                marginBottom: "-2px",
                color:
                  activeMainTab === "properties"
                    ? "var(--primary)"
                    : "var(--text-secondary)",
                cursor: "pointer",
                fontWeight: activeMainTab === "properties" ? "600" : "400",
                fontSize: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              🏠 Properties
            </button>
          </div>

          {/* Clients Tab Content */}
          {activeMainTab === "clients" && (
            <>
              {/* Alerts Row - Deadline Alerts + Unassigned Clients side by side */}
              <div
                style={{
                  display: "flex",
                  gap: "1rem",
                  margin: "0 1.5rem 1rem",
                  flexWrap: "wrap",
                }}
              >

                <div style={{ flex: 1, minWidth: "300px" }}>
                  <UnassignedClientsPanel
                    clients={clients}
                    users={allUsers}
                    onAssign={async (clientId, userId) => {
                      // Update client assignment
                      const updatedClient = clients.find(
                        (c) => c.id === clientId,
                      );
                      if (updatedClient) {
                        await updateClient(clientId, { assignedTo: userId });
                      }
                    }}
                    onViewClient={handleOpenViewModal}
                    onEditClient={handleOpenEditModal}
                  />
                </div>
              </div>

              <StatsGrid metrics={metrics} role={role} />

              <FiltersBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                filterPhase={filterPhase}
                onPhaseFilterChange={setFilterPhase}
                filterAssignedTo={filterAssignedTo}
                onAssignedToFilterChange={setFilterAssignedTo}
                users={allUsers}
                viewMode={viewMode}
                onViewModeChange={(mode) => {
                  setViewMode(mode);
                  const settings = JSON.parse(
                    localStorage.getItem("gaia_settings") || "{}",
                  );
                  localStorage.setItem(
                    "gaia_settings",
                    JSON.stringify({ ...settings, viewMode: mode }),
                  );
                }}
              />

              <PhasesContainer
                clients={clients}
                filters={{
                  searchTerm,
                  filterPhase,
                  filterAssignedTo,
                }}
                viewMode={viewMode}
                onViewClient={handleOpenViewModal}
                onEditClient={handleOpenEditModal}
                onUpdateClient={updateClient}
                onMoveClient={async (clientId, targetPhase) => {
                  try {
                    await moveClientToPhase(clientId, targetPhase);
                  } catch (error) {
                    console.error("Error moving client to phase:", error);
                  }
                }}
                onEvaluate={handleOpenEvaluation}
                onManageQuestions={() => setShowEvaluationQuestionsModal(true)}
              />
            </>
          )}

          {/* Messenger Tab Content */}
          {activeMainTab === "messenger" && (
            <div style={{ padding: "0 1.5rem" }}>
              {/* Contacts with Phone Numbers Panel */}
              <div style={{ marginBottom: "1rem" }}>
                <ContactsWithPhonePanel
                  onViewContact={(conversationId) => {
                    // Could navigate to the conversation in MessengerInbox
                    console.log("View contact:", conversationId);
                  }}
                />
              </div>
              <MessengerInbox
                clients={clients}
                users={allUsers}
                currentUserId={currentUser?.id}
              />
            </div>
          )}

          {/* Properties Tab Content */}
          {activeMainTab === "properties" && (
            <div style={{ marginTop: "1.5rem" }}>
              <PropertyManagement
                teamId={currentUserProfile?.team_id}
                organizationId={currentUserProfile?.organization_id}
              />
            </div>
          )}

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
              onEvaluate={() => {
                handleOpenEvaluation(currentClientId);
              }}
              onManageQuestions={() => setShowEvaluationQuestionsModal(true)}
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

          {showTeamOnlinePanel && (
            <TeamOnlinePanel onClose={() => setShowTeamOnlinePanel(false)} />
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


          {showCalendar && (
            <CalendarView
              clients={clients}
              isOpen={showCalendar}
              onClose={() => setShowCalendar(false)}
              currentUserId={currentUser?.id}
              currentUserName={currentUserProfile?.name || currentUserName}
              users={allUsers}
              onStartVideoCall={(meeting) => {
                // Get room slug from meeting or room
                const slug = meeting.room_slug;
                if (slug) {
                  setMeetingRoomSlug(slug);
                  setShowMeetingRoom(true);
                  setShowCalendar(false);
                  window.history.pushState({}, "", `/room/${slug}`);
                }
              }}
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

        </>
      )}

      {/* Evaluation Modal */}
      {showEvaluationModal && (
        <EvaluationModal
          isOpen={showEvaluationModal}
          onClose={() => {
            setShowEvaluationModal(false);
            setCurrentClientId(null);
          }}
          client={getClient(currentClientId)}
          onEvaluationComplete={handleEvaluationComplete}
        />
      )}

      {/* Evaluation Questions Modal */}
      {showEvaluationQuestionsModal && (
        <EvaluationQuestionsModal
          isOpen={showEvaluationQuestionsModal}
          onClose={() => setShowEvaluationQuestionsModal(false)}
        />
      )}
      {/* Meeting room - ALWAYS renders first for anyone with /room/:slug */}
      {showMeetingRoom && meetingRoomSlug && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
          <MeetingRoom
            roomSlug={meetingRoomSlug}
            currentUser={
              currentUser || { id: null, email: null, name: currentUserName }
            }
            onClose={() => {
              setShowMeetingRoom(false);
              setMeetingRoomSlug(null);
              window.history.pushState({}, "", "/");
            }}
            onRoomNotFound={() => {
              setShowMeetingRoom(false);
              setMeetingRoomSlug(null);
              window.history.pushState({}, "", "/");
            }}
          />
        </div>
      )}

      {/* Booking Page - Public route /book/:pageId */}
      {showBookingPage && <BookingPage />}

      {/* Public Properties Page */}
      {showPublicProperties && (
        <PublicPropertiesContainer
          onClose={(redirect) => {
            setShowPublicProperties(false);
            if (redirect?.teamId) {
              setProfileTeamId(redirect.teamId);
              setShowTeamProfile(true);
              window.history.pushState(
                {},
                "",
                redirect.profilePath || `/${redirect.teamId}`,
              );
              return;
            }

            setShowTeamProfile(false);
            setProfileTeamId(null);
            window.history.pushState(
              {},
              "",
              redirect?.profilePath || "/",
            );
          }}
        />
      )}

      {/* Property Showcase Demo Page */}
      {showPropertyDemo && <PropertyShowcaseDemo />}

      {/* Team Profile Page - Instagram Style */}
      {showTeamProfile && profileTeamId && (
        <TeamProfilePage
          teamId={profileTeamId}
          onClose={() => {
            setShowTeamProfile(false);
            window.history.pushState({}, "", "/");
          }}
        />
      )}

      {/* Landing page - shown when not logged in AND not in meeting AND not booking AND not viewing properties AND not demo AND not team profile */}
      {!isLoggedIn &&
        !showMeetingRoom &&
        !showBookingPage &&
        !showPublicProperties &&
        !showPropertyDemo &&
        !showTeamProfile && (
          <LandingPage
            onLogin={() => {
              setIsSignUpMode(false);
              setShowLoginModal(true);
            }}
            onSignUp={() => {
              setIsSignUpMode(true);
              setShowLoginModal(true);
            }}
          />
        )}

      {/* Login modal - can show on top of landing page */}
      {showLoginModal && (
        <LoginModal
          onLogin={async (email, password) => {
            await handleLogin(email, password);
            setShowLoginModal(false);
            setShowLandingPage(false);
          }}
          onSignUp={async (email, password, name, inviteCode) => {
            await handleSignUp(email, password, name, inviteCode);
          }}
          isSignUpMode={isSignUpMode}
          onClose={() => setShowLoginModal(false)}
          onValidateInviteCode={validateInviteCode}
        />
      )}

      {/* Facebook Page Selection Modal */}
      {showFbPageModal && fbPagesForSelection.length > 0 && (
        <div
          className="modal-overlay"
          onClick={() => setShowFbPageModal(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "500px" }}
          >
            <div className="modal-header">
              <h2>📘 Select Facebook Page</h2>
              <button
                className="modal-close"
                onClick={() => setShowFbPageModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
                Select a page to connect for Messenger:
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {fbPagesForSelection.map((page) => (
                  <div
                    key={page.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      padding: "1rem",
                      background: "var(--bg-tertiary)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-color)",
                      cursor: "pointer",
                    }}
                    onClick={async () => {
                      if (connectingPage) return;
                      setConnectingPage(true);
                      try {
                        // Import facebookService
                        const { facebookService } =
                          await import("./services/facebookService");
                        await facebookService.connectPage(
                          {
                            page_id: page.id,
                            page_name: page.name,
                            page_access_token: page.token,
                            picture_url: page.picture,
                          },
                          currentUser?.id,
                        );
                        showToast(`Connected ${page.name}!`, "success");
                        setShowFbPageModal(false);
                        setFbPagesForSelection([]);
                        // Switch to messenger tab
                        setActiveMainTab("messenger");
                      } catch (err) {
                        console.error("Failed to connect page:", err);
                        showToast(`Failed to connect: ${err.message}`, "error");
                      } finally {
                        setConnectingPage(false);
                      }
                    }}
                  >
                    {page.picture ? (
                      <img
                        src={page.picture}
                        alt={page.name}
                        style={{ width: 48, height: 48, borderRadius: "50%" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: "50%",
                          background: "var(--primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.5rem",
                          color: "white",
                        }}
                      >
                        📘
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "600" }}>{page.name}</div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Page ID: {page.id}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={connectingPage}
                    >
                      {connectingPage ? "⏳" : "Connect"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Assistant Widget - Admin Only */}
      {isLoggedIn && !showTeamProfile && !showPublicProperties && <AIAssistantWidget currentUser={currentUser} />}

      <ToastContainer />
    </div>
  );
}

export default App;

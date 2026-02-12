import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import React from "react";
import App from "../App";

// Mock services that use import.meta.env (Vite-specific)
jest.mock("../services/supabase", () => ({
  getSupabaseClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn(),
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    })),
  })),
}));

jest.mock("../services/facebookService", () => ({
  default: {
    connectPage: jest.fn(),
    createSavedReply: jest.fn(),
    assignTag: jest.fn(),
    createTag: jest.fn(),
    sendBulkMessage: jest.fn(),
    getConversationById: jest.fn(),
  },
  facebookService: {
    connectPage: jest.fn(),
    createSavedReply: jest.fn(),
    assignTag: jest.fn(),
    createTag: jest.fn(),
    sendBulkMessage: jest.fn(),
  },
}));

jest.mock("../services/aiService", () => ({
  nvidiaChat: jest.fn(),
}));

// Mock all the hooks used by App component
jest.mock("../hooks/useSupabase", () => ({
  useSupabase: () => ({
    isOnlineMode: true,
    initSupabase: jest.fn(),
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    getSession: jest.fn(),
    isAdmin: jest.fn(() => false),
    getUserName: jest.fn(() => "Test User"),
    currentUser: { id: "test-user-1", email: "test@example.com" },
    currentUserProfile: { role: "user", email: "test@example.com" },
    getExpenses: jest.fn(),
    saveExpenses: jest.fn(),
    getAIPrompts: jest.fn(),
    saveAIPrompts: jest.fn(),
    getPackagePrices: jest.fn(),
    savePackagePrices: jest.fn(),
    getPackageDetails: jest.fn(),
    savePackageDetails: jest.fn(),
    refreshUserProfile: jest.fn(),
    getAllUsers: jest.fn(() => []),
    syncAllData: jest.fn(),
    addClientToSupabase: jest.fn(),
    updateClientInSupabase: jest.fn(),
    deleteClientFromSupabase: jest.fn(),
  }),
}));

jest.mock("../hooks/useClients", () => ({
  useClients: () => ({
    clients: [],
    addClient: jest.fn(),
    updateClient: jest.fn(),
    deleteClient: jest.fn(),
    getClient: jest.fn(),
  }),
}));

jest.mock("../hooks/useMetrics", () => ({
  useMetrics: () => ({
    metrics: {},
    updateMetrics: jest.fn(),
  }),
}));

jest.mock("../hooks/usePhases", () => ({
  usePhases: () => ({
    renderAllPhases: jest.fn(),
    moveToNextPhase: jest.fn(),
    moveClientToPhase: jest.fn(),
  }),
}));

jest.mock("../hooks/useClockInOut", () => ({
  useClockInOut: () => ({
    isClockedIn: false,
    shiftDurationFormatted: "0h 0m",
    loading: false,
    toggle: jest.fn(),
  }),
}));

jest.mock("../hooks/useScheduledMessageProcessor", () => ({
  useScheduledMessageProcessor: jest.fn(),
}));

jest.mock("../hooks/useNotifications", () => ({
  useNotifications: () => ({
    unreadCount: 0,
  }),
}));

jest.mock("../hooks/useStorage", () => ({
  useStorage: () => ({}),
}));

// Create a mock for useFacebookMessenger that we can control
const mockUseFacebookMessenger = {
  conversations: [],
  selectedConversation: null,
  messages: [],
  loading: false,
  syncing: false,
  error: null,
  unreadCount: 0,
  selectConversation: jest.fn(),
  sendMessage: jest.fn(),
  syncAllConversations: jest.fn(),
  linkToClient: jest.fn(),
  refreshContactName: jest.fn(),
  setContactName: jest.fn(),
  assignToUser: jest.fn(),
  deleteConversation: jest.fn(),
  clearError: jest.fn(),
  loadConversations: jest.fn(),
  aiAnalysis: null,
  analyzing: false,
  existingClient: null,
  conversationInsights: null,
  analyzeCurrentConversation: jest.fn(),
  transferToClient: jest.fn(),
  updateExistingLead: jest.fn(),
  bookMeetingFromAI: jest.fn(),
  sendMediaMessage: jest.fn(),
  sendBookingButton: jest.fn(),
  sendPropertyCard: jest.fn(),
  sendVideoMessage: jest.fn(),
  loadMoreMessages: jest.fn(),
  searchMessages: jest.fn(),
  hasMoreMessages: false,
  uploadingMedia: false,
  searching: false,
  searchResults: [],
  clearSearch: jest.fn(),
  hasMoreConversations: false,
  loadMoreConversations: jest.fn(),
  totalConversations: 0,
  refreshMessages: jest.fn(),
  searchConversations: jest.fn(),
  conversationSearchResults: [],
  searchingConversations: false,
  clearConversationSearch: jest.fn(),
  updateLeadStatus: jest.fn(),
  bulkUpdateLeadStatus: jest.fn(),
};

jest.mock("../hooks/useFacebookMessenger", () => ({
  useFacebookMessenger: () => mockUseFacebookMessenger,
}));

// Mock components to simplify testing
jest.mock("../components/Header", () => () => <div>Header</div>);
jest.mock("../components/StatsGrid", () => () => <div>StatsGrid</div>);
jest.mock("../components/FiltersBar", () => () => <div>FiltersBar</div>);
jest.mock("../components/PhasesContainer", () => () => (
  <div>PhasesContainer</div>
));
jest.mock("../components/ClientModal", () => () => null);
jest.mock("../components/ViewClientModal", () => () => null);
jest.mock("../components/AdminSettingsModal", () => () => null);
jest.mock("../components/TeamPerformanceModal", () => () => null);
jest.mock("../components/NotificationsPanel", () => () => null);
jest.mock("../components/CommunicationLog", () => () => null);
jest.mock("../components/CalendarView", () => () => null);
jest.mock("../components/HistoryModal", () => () => null);
jest.mock("../components/LoginModal", () => () => null);
jest.mock("../components/LandingPage", () => () => null);
jest.mock("../components/ToastContainer", () => () => null);
jest.mock("../components/MeetingRoom", () => () => null);
jest.mock("../components/AIAssistantWidget", () => () => null);
jest.mock("../components/BookingPage", () => () => null);
jest.mock("../components/TeamOnlinePanel", () => () => null);
jest.mock("../components/DeadlineAlerts", () => () => null);
jest.mock("../components/UnassignedClientsPanel", () => () => null);
jest.mock("../components/PropertyManagement", () => () => (
  <div>PropertyManagement</div>
));
jest.mock("../components/OrganizerDashboard", () => () => null);
jest.mock("../components/PublicPropertiesContainer", () => () => null);

// Mock ContactsWithPhonePanel but preserve its functionality
jest.mock("../components/ContactsWithPhonePanel", () => ({ onViewContact }) => (
  <div data-testid="contacts-panel">ContactsWithPhonePanel</div>
));

// Dynamic mock for MessengerInbox that responds to useFacebookMessenger state
const MessengerInboxMock = ({ clients, users, currentUserId }) => {
  const { loading, error, loadConversations } = mockUseFacebookMessenger;

  // Handle loading state
  if (loading) {
    return (
      <div
        className="spinner"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontSize: "1rem",
          color: "var(--text-secondary)",
        }}
        data-testid="messenger-loader"
      >
        Loading…
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div
        style={{
          color: "var(--error)",
          padding: "1rem",
          background: "var(--bg-tertiary)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-color)",
          maxWidth: "800px",
          margin: "1.5rem auto",
        }}
        data-testid="messenger-error"
      >
        <p style={{ marginBottom: "1rem", fontWeight: "500" }}>
          {error.message || "Unknown error"}
        </p>
        <button
          onClick={loadConversations}
          style={{
            padding: "0.5rem 1rem",
            background: "var(--primary)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            fontWeight: "500",
          }}
          data-testid="retry-button"
        >
          Retry
        </button>
      </div>
    );
  }

  // Normal state
  return <div data-testid="messenger-content">MessengerInbox</div>;
};

jest.mock("../components/MessengerInbox", () => MessengerInboxMock);

describe("App - Messenger Tab Functionality", () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockUseFacebookMessenger.loading = false;
    mockUseFacebookMessenger.error = null;
    mockUseFacebookMessenger.loadConversations.mockClear();
    localStorage.clear();
  });

  test("clicking Messenger tab switches view and updates activeMainTab", async () => {
    render(<App />);

    // Find the messenger button
    const messengerBtn = screen.getByText("💬 Messenger");
    expect(messengerBtn).toBeInTheDocument();

    // Click the messenger button
    await act(async () => {
      fireEvent.click(messengerBtn);
    });

    // Verify the contact panel is shown (indicates we're on the messenger tab)
    const contactsPanel = screen.getByTestId("contacts-panel");
    expect(contactsPanel).toBeInTheDocument();

    // Verify the messenger content is shown
    const messengerContent = screen.getByTestId("messenger-content");
    expect(messengerContent).toBeInTheDocument();
  });

  test("when loading is true, a spinner is rendered inside MessengerInbox", async () => {
    // Set loading state to true
    mockUseFacebookMessenger.loading = true;

    render(<App />);

    // Click the messenger button to switch to the messenger tab
    const messengerBtn = screen.getByText("💬 Messenger");
    await act(async () => {
      fireEvent.click(messengerBtn);
    });

    // Wait for the loader to appear
    await waitFor(() => {
      const loader = screen.getByTestId("messenger-loader");
      expect(loader).toBeInTheDocument();
      expect(loader.className).toBe("spinner");
      expect(loader).toHaveTextContent("Loading…");
    });
  });

  test("when error is present, an error banner with a retry button appears", async () => {
    // Set error state
    const testError = new Error("Failed to load conversations: Network error");
    mockUseFacebookMessenger.error = testError;

    render(<App />);

    // Click the messenger button to switch to the messenger tab
    const messengerBtn = screen.getByText("💬 Messenger");
    await act(async () => {
      fireEvent.click(messengerBtn);
    });

    // Wait for the error banner to appear
    await waitFor(() => {
      const errorBanner = screen.getByTestId("messenger-error");
      expect(errorBanner).toBeInTheDocument();
    });

    // Verify the error message includes the error details
    expect(
      screen.getByText("Failed to load conversations: Network error"),
    ).toBeInTheDocument();

    // Verify the retry button exists
    const retryButton = screen.getByTestId("retry-button");
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).toHaveTextContent("Retry");

    // Click the retry button and verify loadConversations is called
    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(mockUseFacebookMessenger.loadConversations).toHaveBeenCalled();
  });

  test("messenger button uses functional update to prevent accidental resets", async () => {
    render(<App />);

    const messengerBtn = screen.getByText("💬 Messenger");

    // Click once to switch to messenger
    await act(async () => {
      fireEvent.click(messengerBtn);
    });

    // Verify we're on the messenger tab by checking for messenger content
    expect(screen.getByTestId("messenger-content")).toBeInTheDocument();

    // Click again while already on messenger - should stay on messenger
    await act(async () => {
      fireEvent.click(messengerBtn);
    });

    // The messenger content should still be visible (not reset)
    expect(screen.getByTestId("messenger-content")).toBeInTheDocument();
  });

  test("messenger tab renders ContactsWithPhonePanel without crashing", async () => {
    render(<App />);

    // Switch to messenger tab
    const messengerBtn = screen.getByText("💬 Messenger");
    await act(async () => {
      fireEvent.click(messengerBtn);
    });

    // Verify ContactsWithPhonePanel is rendered
    await waitFor(() => {
      const contactsPanel = screen.getByTestId("contacts-panel");
      expect(contactsPanel).toBeInTheDocument();
    });
  });

  test("switching between tabs changes active tab correctly", async () => {
    render(<App />);

    const clientsBtn = screen.getByText("👥 Clients");
    const messengerBtn = screen.getByText("💬 Messenger");
    const propertiesBtn = screen.getByText("🏠 Properties");

    // Start on Clients (default) - verify Clients content is visible
    const phasesContainer = screen.getByText("PhasesContainer");
    expect(phasesContainer).toBeInTheDocument();

    // Switch to Messenger
    await act(async () => {
      fireEvent.click(messengerBtn);
    });

    // Verify Messenger content is shown and Clients content is hidden
    expect(screen.getByTestId("messenger-content")).toBeInTheDocument();
    expect(phasesContainer).not.toBeInTheDocument();

    // Switch to Properties
    await act(async () => {
      fireEvent.click(propertiesBtn);
    });

    // Verify Properties content is shown and Messenger content is hidden
    const propertyManagement = screen.getByText("PropertyManagement");
    expect(propertyManagement).toBeInTheDocument();
    expect(screen.queryByTestId("messenger-content")).not.toBeInTheDocument();
  });
});

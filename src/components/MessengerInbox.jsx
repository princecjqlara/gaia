import React, { useState, useRef, useEffect } from 'react';
import { useFacebookMessenger } from '../hooks/useFacebookMessenger';
import { facebookService } from '../services/facebookService';
import WarningDashboard from './WarningDashboard';
import AIControlPanel from './AIControlPanel';
import AIChatbotSettings from './AIChatbotSettings';
import BestTimesOverview from './BestTimesOverview';
import { extractContactDetails, generateNotes } from '../services/aiConversationAnalyzer';

// Lead status configuration
const LEAD_STATUS_CONFIG = {
    intake: { icon: '📥', label: 'Intake', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.15)' },
    qualified: { icon: '✅', label: 'Qualified', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.15)' },
    unqualified: { icon: '❌', label: 'Unqualified', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)' },
    appointment_booked: { icon: '📅', label: 'Appointment Booked', color: '#a855f7', bgColor: 'rgba(168, 85, 247, 0.15)' },
    converted: { icon: '🎉', label: 'Converted', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.15)' },
    lost: { icon: '🚫', label: 'Lost', color: '#6b7280', bgColor: 'rgba(107, 114, 128, 0.15)' }
};

const MessengerInbox = ({ clients = [], users = [], currentUserId }) => {
    const {
        conversations,
        selectedConversation,
        messages,
        loading,
        syncing,
        error,
        unreadCount,
        selectConversation,
        sendMessage,
        syncAllConversations,
        linkToClient,
        refreshContactName,
        setContactName,
        assignToUser,
        deleteConversation,
        clearError,
        loadConversations,
        // AI features
        aiAnalysis,
        analyzing,
        existingClient,
        conversationInsights,
        analyzeCurrentConversation,
        transferToClient,
        updateExistingLead,
        bookMeetingFromAI,
        // New features
        sendMediaMessage,
        sendBookingButton,
        sendPropertyCard,
        sendVideoMessage,
        loadMoreMessages,
        searchMessages,
        hasMoreMessages,
        uploadingMedia,
        searching,
        searchResults,
        clearSearch,
        // Conversation pagination
        hasMoreConversations,
        loadMoreConversations,
        totalConversations,
        // Silent refresh
        refreshMessages,
        // Conversation search (across ALL pages, not just loaded)
        searchConversations,
        conversationSearchResults,
        searchingConversations,
        clearConversationSearch,
        // Lead status
        updateLeadStatus,
        bulkUpdateLeadStatus
    } = useFacebookMessenger();

    const lastAnalyzedCountRef = useRef(0);

    // Auto-analyze conversation:
    // 1. On selection if no analysis exists
    // 2. Every 3 messages
    useEffect(() => {
        if (selectedConversation && messages.length > 0) {
            const hasAnalysis = aiAnalysis || conversationInsights?.aiAnalysis;
            const thresholdMessages = messages.length % 3 === 0;
            const isNewCount = messages.length !== lastAnalyzedCountRef.current;

            if ((!hasAnalysis && isNewCount) || (thresholdMessages && isNewCount)) {
                console.log(`[Auto-AI] Triggering analysis (Count: ${messages.length}, HasAnalysis: ${!!hasAnalysis})`);
                lastAnalyzedCountRef.current = messages.length;
                analyzeCurrentConversation();
            }
        } else if (!selectedConversation) {
            lastAnalyzedCountRef.current = 0;
        }
    }, [messages.length, selectedConversation?.conversation_id, !!aiAnalysis, !!conversationInsights?.aiAnalysis]);

    const [messageText, setMessageText] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferForm, setTransferForm] = useState({
        clientName: '',
        businessName: '',
        contactDetails: '',
        pageLink: '',
        niche: '',
        notes: ''
    });
    const [editableNotes, setEditableNotes] = useState('');
    const [showMediaUpload, setShowMediaUpload] = useState(false);
    const [extractingDetails, setExtractingDetails] = useState(false);

    // Properties for sharing
    const [properties, setProperties] = useState([]);
    const [showDropUp, setShowDropUp] = useState(false);
    const [showPropertySelector, setShowPropertySelector] = useState(false);

    // Fetch properties on mount
    useEffect(() => {
        const fetchProperties = async () => {
            try {
                const props = await facebookService.getAllProperties();
                setProperties(props);
            } catch (err) {
                console.error('Failed to load properties for sharing:', err);
            }
        };
        fetchProperties();
    }, []);

    // New UI state
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkMessage, setBulkMessage] = useState('');
    const [bulkFilter, setBulkFilter] = useState('all');
    const [bulkTagFilter, setBulkTagFilter] = useState(''); // Tag ID for filtering
    const [bulkSending, setBulkSending] = useState(false);
    const [showTagsModal, setShowTagsModal] = useState(false);
    const [tags, setTags] = useState([]);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#a855f7');
    const [selectedTagFilter, setSelectedTagFilter] = useState(null);
    const [showArchived, setShowArchived] = useState(false);
    const [archivedConversations, setArchivedConversations] = useState([]);
    const [showWarningDashboard, setShowWarningDashboard] = useState(false);
    const [showAIControlPanel, setShowAIControlPanel] = useState(false);
    const [showAIChatbotSettings, setShowAIChatbotSettings] = useState(false);
    const [showBestTimes, setShowBestTimes] = useState(false);


    // Advanced filtering state
    const [activeFilter, setActiveFilter] = useState('all');
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);

    // Date filter state - filter contacts by when they first messaged
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [showDateFilter, setShowDateFilter] = useState(false);

    // Selection state for bulk actions
    const [selectedConversations, setSelectedConversations] = useState(new Set());
    const [selectMode, setSelectMode] = useState(false);

    // Saved replies state
    const [savedReplies, setSavedReplies] = useState([]);
    const [showSavedReplies, setShowSavedReplies] = useState(false);
    const [showCreateReply, setShowCreateReply] = useState(false);
    const [newReplyTitle, setNewReplyTitle] = useState('');
    const [newReplyContent, setNewReplyContent] = useState('');
    const [newReplyShortcut, setNewReplyShortcut] = useState('');

    // Scheduled messages state
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [scheduledDate, setScheduledDate] = useState('');
    const [scheduledTime, setScheduledTime] = useState('');

    // Conversation tags for current selection
    const [conversationTags, setConversationTags] = useState([]);
    const [loadingTags, setLoadingTags] = useState(false);

    // Warning settings - loaded from localStorage
    const [warningSettings, setWarningSettings] = useState(() => {
        try {
            const saved = localStorage.getItem('warning_settings');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.log('Could not load warning settings:', e);
        }
        return {
            warning_hours: 24,
            danger_hours: 48,
            response_deadline_hours: 24,
            warning_color: '#f59e0b',
            danger_color: '#ef4444',
            enable_no_activity_warning: false,
            enable_no_tag_warning: false,
            enable_proposal_stuck_warning: false
        };
    });

    // Warning detection function
    const getContactWarningStatus = (conv) => {
        if (!warningSettings) return null;

        const now = new Date();
        const lastActivity = conv.last_message_time ? new Date(conv.last_message_time) : null;
        const hoursSinceActivity = lastActivity ? (now - lastActivity) / (1000 * 60 * 60) : Infinity;

        // Check various conditions
        const hasNoTag = !conv.tags || conv.tags.length === 0;
        const isStuckProposal = conv.proposal_status === 'sent' && hoursSinceActivity > warningSettings.warning_hours;
        const isInactive = hoursSinceActivity >= warningSettings.warning_hours;
        const isCritical = hoursSinceActivity >= warningSettings.danger_hours;

        // Determine warning level based on enabled conditions
        let shouldWarn = false;
        let shouldCritical = false;

        if (warningSettings.enable_no_activity_warning && isInactive) {
            shouldWarn = true;
            if (isCritical) shouldCritical = true;
        }

        if (warningSettings.enable_no_tag_warning && hasNoTag) {
            shouldWarn = true;
        }

        if (warningSettings.enable_proposal_stuck_warning && isStuckProposal) {
            shouldWarn = true;
            if (isCritical) shouldCritical = true;
        }

        if (shouldCritical) {
            return { level: 'danger', color: warningSettings.danger_color, hoursSince: Math.floor(hoursSinceActivity) };
        }
        if (shouldWarn) {
            return { level: 'warning', color: warningSettings.warning_color, hoursSince: Math.floor(hoursSinceActivity) };
        }
        return null;
    };

    // Count contacts in warning state
    const warningCount = conversations.filter(conv => getContactWarningStatus(conv)).length;
    const dangerCount = conversations.filter(conv => {
        const status = getContactWarningStatus(conv);
        return status && status.level === 'danger';
    }).length;

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-refresh messages every 10 seconds when conversation is selected (silent - no loading)
    useEffect(() => {
        if (!selectedConversation) return;

        const refreshInterval = setInterval(() => {
            // Silently refresh messages without causing loading flash
            if (selectedConversation?.conversation_id) {
                refreshMessages(selectedConversation.conversation_id, selectedConversation.page_id);
            }
        }, 10000); // 10 seconds

        return () => clearInterval(refreshInterval);
    }, [selectedConversation?.id, refreshMessages]);

    // Auto-refresh conversation list every 5 seconds (silent to prevent UI flashing)
    // Using polling since Supabase Realtime may not be enabled
    useEffect(() => {
        const refreshInterval = setInterval(() => {
            loadConversations?.(null, true, true); // silent=true prevents loading flicker
        }, 5000); // 5 seconds for near real-time updates

        return () => clearInterval(refreshInterval);
    }, []);

    // Filter and optionally sort conversations
    const filteredConversations = conversations
        .filter(conv => {
            // Search filter
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                if (!(conv.participant_name?.toLowerCase().includes(term) ||
                    conv.last_message_text?.toLowerCase().includes(term))) {
                    return false;
                }
            }

            // Date filter - filter by when contact first messaged (created_at)
            if (filterDateFrom || filterDateTo) {
                const contactDate = conv.created_at ? new Date(conv.created_at) : null;
                if (!contactDate) return false;

                // Normalize to start of day for comparison
                const contactDateOnly = new Date(contactDate.getFullYear(), contactDate.getMonth(), contactDate.getDate());

                if (filterDateFrom) {
                    const fromDate = new Date(filterDateFrom);
                    const fromDateOnly = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
                    if (contactDateOnly < fromDateOnly) return false;
                }

                if (filterDateTo) {
                    const toDate = new Date(filterDateTo);
                    const toDateOnly = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
                    if (contactDateOnly > toDateOnly) return false;
                }
            }
            // Advanced filters
            switch (activeFilter) {
                case 'no_reply':
                    return !conv.last_message_from_page && conv.unread_count > 0;
                case 'not_booked':
                    return !conv.has_booking;
                case 'not_in_pipeline':
                    return !conv.linked_client_id;
                case 'in_pipeline':
                    return !!conv.linked_client_id;
                case 'proposal_sent':
                    return conv.proposal_status === 'sent';
                case 'proposal_waiting':
                    return conv.proposal_status === 'waiting';
                case 'unread':
                    return conv.unread_count > 0;
                // Lead status filters
                case 'status_intake':
                    return conv.lead_status === 'intake' || !conv.lead_status;
                case 'status_qualified':
                    return conv.lead_status === 'qualified';
                case 'status_unqualified':
                    return conv.lead_status === 'unqualified';
                case 'status_appointment_booked':
                    return conv.lead_status === 'appointment_booked';
                case 'status_converted':
                    return conv.lead_status === 'converted';
                default:
                    return true;
            }
        })
        .sort((a, b) => {
            // Sort by time
            return new Date(b.last_message_time) - new Date(a.last_message_time);
        });

    // Load tags on mount
    useEffect(() => {
        loadTags();
        loadSavedReplies();
    }, []);

    const loadTags = async () => {
        try {
            const pageId = conversations[0]?.page_id;
            if (pageId) {
                const tagData = await facebookService.getTags(pageId);
                setTags(tagData);
            }
        } catch (err) {
            console.error('Error loading tags:', err);
        }
    };

    // Load saved replies
    const loadSavedReplies = async () => {
        try {
            const pageId = conversations[0]?.page_id;
            if (pageId) {
                const replies = await facebookService.getSavedReplies(pageId);
                setSavedReplies(replies);
            }
        } catch (err) {
            console.error('Error loading saved replies:', err);
        }
    };

    // Load conversation tags when conversation is selected
    useEffect(() => {
        if (selectedConversation?.conversation_id) {
            loadConversationTags(selectedConversation.conversation_id);
        }
    }, [selectedConversation?.conversation_id]);

    const loadConversationTags = async (conversationId) => {
        setLoadingTags(true);
        try {
            const tags = await facebookService.getConversationTags(conversationId);
            setConversationTags(tags);
        } catch (err) {
            console.error('Error loading conversation tags:', err);
        } finally {
            setLoadingTags(false);
        }
    };

    // Handle saved reply creation
    const handleCreateSavedReply = async () => {
        if (!newReplyTitle.trim() || !newReplyContent.trim()) return;
        try {
            const pageId = conversations[0]?.page_id;
            await facebookService.createSavedReply(pageId, newReplyTitle, newReplyContent, newReplyShortcut || null, 'general', currentUserId);
            setNewReplyTitle('');
            setNewReplyContent('');
            setNewReplyShortcut('');
            setShowCreateReply(false);
            loadSavedReplies();
        } catch (err) {
            alert('Failed to create saved reply: ' + err.message);
        }
    };

    // Handle saved reply deletion
    const handleDeleteSavedReply = async (replyId) => {
        if (!confirm('Delete this saved reply?')) return;
        try {
            await facebookService.deleteSavedReply(replyId);
            loadSavedReplies();
        } catch (err) {
            alert('Failed to delete: ' + err.message);
        }
    };

    // Handle using a saved reply
    const handleUseSavedReply = async (reply) => {
        setMessageText(reply.content);
        setShowSavedReplies(false);
        await facebookService.useSavedReply(reply.id);
    };

    // Handle adding tag to conversation
    const handleAddTagToConversation = async (tagId) => {
        if (!selectedConversation) return;
        try {
            await facebookService.assignTag(selectedConversation.conversation_id, tagId, currentUserId);
            loadConversationTags(selectedConversation.conversation_id);
        } catch (err) {
            console.error('Error adding tag:', err);
        }
    };

    // Handle removing tag from conversation
    const handleRemoveTagFromConversation = async (tagId) => {
        if (!selectedConversation) return;
        try {
            await facebookService.removeTag(selectedConversation.conversation_id, tagId);
            loadConversationTags(selectedConversation.conversation_id);
        } catch (err) {
            console.error('Error removing tag:', err);
        }
    };

    // Toggle conversation selection
    const toggleConversationSelection = (conversationId) => {
        setSelectedConversations(prev => {
            const newSet = new Set(prev);
            if (newSet.has(conversationId)) {
                newSet.delete(conversationId);
            } else {
                newSet.add(conversationId);
            }
            return newSet;
        });
    };

    // Select all filtered conversations
    const selectAllFiltered = () => {
        const allIds = new Set(filteredConversations.map(c => c.conversation_id));
        setSelectedConversations(allIds);
    };

    // Clear selection
    const clearSelection = () => {
        setSelectedConversations(new Set());
        setSelectMode(false);
    };

    // Archive conversation
    const handleArchiveConversation = async (conversationId) => {
        if (!confirm('Archive this conversation? It can be restored later.')) return;
        try {
            await facebookService.archiveConversation(conversationId);
            loadConversations?.(null, true);
            alert('Conversation archived');
        } catch (err) {
            alert('Failed to archive: ' + err.message);
        }
    };

    // Restore conversation
    const handleRestoreConversation = async (conversationId) => {
        try {
            await facebookService.restoreConversation(conversationId);
            loadArchivedConversations();
            loadConversations?.(null, true);
            alert('Conversation restored');
        } catch (err) {
            alert('Failed to restore: ' + err.message);
        }
    };

    // Load archived conversations
    const loadArchivedConversations = async () => {
        try {
            const pageId = conversations[0]?.page_id;
            if (pageId) {
                const archived = await facebookService.getArchivedConversations(pageId);
                setArchivedConversations(archived);
            }
        } catch (err) {
            console.error('Error loading archived:', err);
        }
    };

    // Toggle show archived
    const toggleShowArchived = () => {
        if (!showArchived) {
            loadArchivedConversations();
        }
        setShowArchived(!showArchived);
    };

    // Create tag
    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;
        try {
            const pageId = conversations[0]?.page_id;
            await facebookService.createTag(pageId, newTagName, newTagColor, currentUserId);
            setNewTagName('');
            loadTags();
        } catch (err) {
            alert('Failed to create tag: ' + err.message);
        }
    };

    // Delete tag
    const handleDeleteTag = async (tagId) => {
        if (!confirm('Delete this tag?')) return;
        try {
            await facebookService.deleteTag(tagId);
            loadTags();
        } catch (err) {
            alert('Failed to delete tag: ' + err.message);
        }
    };

    // Assign tag to conversation
    const handleAssignTag = async (conversationId, tagId) => {
        try {
            await facebookService.assignTag(conversationId, tagId, currentUserId);
            loadConversations?.(null, true);
        } catch (err) {
            console.error('Error assigning tag:', err);
        }
    };

    // Send bulk message
    const handleSendBulkMessage = async () => {
        if (!bulkMessage.trim()) return;
        if (!confirm(`Send this message to ${bulkFilter} recipients?`)) return;

        setBulkSending(true);
        try {
            const pageId = conversations[0]?.page_id;
            const result = await facebookService.sendBulkMessage(
                pageId,
                bulkFilter,
                bulkMessage,
                null,
                currentUserId
            );
            alert(`Bulk message sent! ✅ ${result.sent} sent, ❌ ${result.failed} failed`);
            setShowBulkModal(false);
            setBulkMessage('');
        } catch (err) {
            alert('Failed to send bulk message: ' + err.message);
        } finally {
            setBulkSending(false);
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!messageText.trim()) {
            console.log('[SEND] No message text');
            return;
        }
        if (loading) {
            console.log('[SEND] Already loading, skipping');
            return;
        }
        if (!selectedConversation) {
            console.log('[SEND] No conversation selected');
            alert('Please select a conversation first');
            return;
        }
        if (!selectedConversation.participant_id) {
            console.log('[SEND] Missing participant_id:', selectedConversation);
            alert('Error: Contact does not have a participant ID');
            return;
        }

        console.log('[SEND] Sending message to:', selectedConversation.participant_name, 'Text:', messageText.substring(0, 50));

        try {
            const success = await sendMessage(messageText);
            if (success) {
                console.log('[SEND] Message sent successfully');
                setMessageText('');
            } else {
                console.log('[SEND] sendMessage returned false');
                alert('Failed to send message. Check console for details.');
            }
        } catch (err) {
            console.error('[SEND] Error:', err);
            alert('Error sending message: ' + err.message);
        }
    };

    // Handle file upload
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Check file size (25MB max)
        const maxSize = 25 * 1024 * 1024;
        if (file.size > maxSize) {
            alert('File size exceeds 25MB limit');
            return;
        }

        // Determine media type
        let mediaType = 'file';
        if (file.type.startsWith('image/')) mediaType = 'image';
        else if (file.type.startsWith('video/')) mediaType = 'video';
        else if (file.type.startsWith('audio/')) mediaType = 'audio';

        const success = await sendMediaMessage(file, mediaType);
        if (success) {
            setShowMediaUpload(false);
        }

        // Clear file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Handle sending booking button
    const handleSendBookingButton = async () => {
        const success = await sendBookingButton();
        if (!success) {
            alert('Failed to send booking button. Please try again.');
        }
    };

    const handleSendPropertyCard = async (property) => {
        const success = await sendPropertyCard(property);
        if (!success) {
            alert('Failed to send property card. Please try again.');
        }
    };

    const handleSendVideo = async (property) => {
        if (!property?.videos?.[0]) {
            alert('This property has no video available.');
            return;
        }
        const propertyUrl = selectedConversation.participant_name
            ? `${window.location.origin}/u/${encodeURIComponent(selectedConversation.participant_name)}/property/${property.id}?pid=${selectedConversation.participant_id}`
            : `${window.location.origin}/property/${property.id}?pid=${selectedConversation.participant_id}`;

        const success = await sendVideoMessage(
            property.videos[0],
            'View Property Details',
            propertyUrl
        );
        if (!success) {
            alert('Failed to send video. Please try again.');
        }
    };



    const handleSendTopSelling = async () => {
        // Fallback to first 5 properties (newest first) since we don't have stats here yet
        const topProps = (properties || []).slice(0, 5);

        if (!topProps || topProps.length === 0) {
            alert('No properties found to send.');
            return;
        }

        const success = await sendPropertyCard(topProps);
        if (!success) {
            alert('Failed to send top properties.');
        }
    };
    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days < 1) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (days < 7) {
            return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }
    };

    const renderAttachment = (attachment) => {
        if (!attachment) return null;

        // Generic Template (Property Card / Carousel)
        if (attachment.type === 'template' && attachment.payload?.template_type === 'generic') {
            const elements = attachment.payload.elements || [];
            return (
                <div style={{
                    marginTop: '0.5rem',
                    display: 'flex',
                    flexWrap: elements.length > 1 ? 'nowrap' : 'wrap',
                    overflowX: elements.length > 1 ? 'auto' : 'visible',
                    gap: '0.8rem',
                    paddingBottom: elements.length > 1 ? '0.5rem' : '0',
                    scrollbarWidth: 'thin'
                }}>
                    {elements.map((el, i) => (
                        <div key={i} style={{
                            width: '240px',
                            flexShrink: 0,
                            background: 'white',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            border: '1px solid #e5e7eb',
                            color: '#111827',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}>
                            {el.image_url && (
                                <img src={el.image_url} alt={el.title} style={{ width: '100%', height: '140px', objectFit: 'cover' }} />
                            )}
                            <div style={{ padding: '0.75rem' }}>
                                <div style={{ fontWeight: '700', fontSize: '0.95rem', marginBottom: '0.25rem' }}>{el.title}</div>
                                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>{el.subtitle}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    {el.buttons?.map((btn, bi) => (
                                        <button
                                            key={bi}
                                            className="btn btn-xs"
                                            style={{
                                                width: '100%',
                                                background: bi === 0 ? 'var(--primary)' : 'white',
                                                border: '1px solid ' + (bi === 0 ? 'var(--primary)' : '#e5e7eb'),
                                                color: bi === 0 ? 'white' : '#111827',
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                                padding: '0.4rem'
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (btn.type === 'web_url') {
                                                    window.open(btn.url, '_blank');
                                                } else if (btn.type === 'postback') {
                                                    if (btn.payload.startsWith('INQUIRY_PROPERTY_')) {
                                                        const propId = btn.payload.replace('INQUIRY_PROPERTY_', '');
                                                        setMessageText(`Hi, I'm interested in property ID: ${propId}. Can you provide more details?`);
                                                    }
                                                }
                                            }}
                                        >
                                            {btn.title}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        // Media Template (Video)
        if (attachment.type === 'template' && attachment.payload?.template_type === 'media') {
            return (
                <div style={{ marginTop: '0.5rem', width: '280px', background: 'white', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    {attachment.payload.elements?.map((el, i) => (
                        <div key={i}>
                            {el.media_type === 'video' && (
                                <div style={{ position: 'relative', height: '160px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {el.url ? (
                                        <video src={el.url} controls style={{ width: '100%', height: '100%' }} />
                                    ) : (
                                        <div style={{ color: 'white', fontSize: '0.8rem' }}>Video not available</div>
                                    )}
                                </div>
                            )}
                            <div style={{ padding: '0.75rem' }}>
                                {el.buttons?.map((btn, bi) => (
                                    <button
                                        key={bi}
                                        className="btn btn-sm btn-primary"
                                        style={{ width: '100%', fontWeight: '600', textTransform: 'none' }}
                                        onClick={() => btn.type === 'web_url' && window.open(btn.url, '_blank')}
                                    >
                                        {btn.title}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        // Button Template (Booking)
        if (attachment.type === 'template' && attachment.payload?.template_type === 'button') {
            return (
                <div style={{ marginTop: '0.8rem', background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.9rem', marginBottom: '0.8rem', color: '#334155', fontWeight: '500' }}>{attachment.payload.text}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {attachment.payload.buttons?.map((btn, i) => (
                            <button
                                key={i}
                                className="btn btn-sm btn-primary"
                                style={{ width: '100%', fontSize: '0.8rem', fontWeight: '600' }}
                                onClick={() => btn.type === 'web_url' && window.open(btn.url, '_blank')}
                            >
                                {btn.title}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        return null;
    };

    // Mobile view state
    const [mobileView, setMobileView] = useState('list'); // 'list', 'chat', 'details'

    return (
        <>
            {/* Mobile View Toggle - only visible on small screens */}
            <style>{`
                @media (max-width: 768px) {
                    .messenger-grid { 
                        display: flex !important; 
                        flex-direction: column !important;
                    }
                    .messenger-sidebar { 
                        display: none !important; 
                    }
                    .messenger-sidebar.mobile-active { 
                        display: flex !important; 
                        position: absolute;
                        inset: 0;
                        z-index: 10;
                    }
                    .messenger-chat { 
                        display: none !important; 
                    }
                    .messenger-chat.mobile-active { 
                        display: flex !important; 
                    }
                    .messenger-details { 
                        display: none !important; 
                    }
                    .messenger-details.mobile-active { 
                        display: flex !important;
                        position: absolute;
                        inset: 0;
                        z-index: 10;
                    }
                    .mobile-nav {
                        display: flex !important;
                    }
                }
            `}</style>

            {/* Mobile Navigation Bar */}
            <div className="mobile-nav" style={{
                display: 'none',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.5rem',
                background: 'var(--bg-primary)',
                borderBottom: '1px solid var(--border-color)',
                marginBottom: '-1px'
            }}>
                <button
                    className={`btn btn-sm ${mobileView === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setMobileView('list')}
                >
                    📋 Chats
                </button>
                <button
                    className={`btn btn-sm ${mobileView === 'chat' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setMobileView('chat')}
                    disabled={!selectedConversation}
                >
                    💬 Messages
                </button>
                <button
                    className={`btn btn-sm ${mobileView === 'details' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setMobileView('details')}
                    disabled={!selectedConversation}
                >
                    ℹ️ Details
                </button>
            </div>

            <div className="messenger-grid" style={{
                display: 'grid',
                gridTemplateColumns: '280px 1fr 260px',
                height: 'calc(100vh - 120px)',
                minHeight: '400px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                border: '1px solid var(--border-color)',
                position: 'relative'
            }}>
                {/* Left Sidebar - Conversations List */}
                <div
                    className={`messenger-sidebar ${mobileView === 'list' ? 'mobile-active' : ''}`}
                    style={{
                        borderRight: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'var(--bg-primary)',
                        height: '100%',
                        overflow: 'hidden'
                    }}>
                    {/* Header */}
                    <div style={{
                        padding: '1rem',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <h3 style={{ margin: 0, fontSize: '1.125rem' }}>
                            💬 Messages
                            {unreadCount > 0 && (
                                <span style={{
                                    marginLeft: '0.5rem',
                                    background: 'var(--error)',
                                    color: 'white',
                                    padding: '0.125rem 0.5rem',
                                    borderRadius: '999px',
                                    fontSize: '0.75rem'
                                }}>
                                    {unreadCount}
                                </span>
                            )}
                            {warningCount > 0 && (
                                <button
                                    onClick={() => setShowWarningDashboard(true)}
                                    style={{
                                        marginLeft: '0.5rem',
                                        background: dangerCount > 0 ? warningSettings.danger_color : warningSettings.warning_color,
                                        color: 'white',
                                        padding: '0.125rem 0.5rem',
                                        borderRadius: '999px',
                                        fontSize: '0.75rem',
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'transform 0.2s'
                                    }}
                                    title={`Click to view ${warningCount} contacts needing attention${dangerCount > 0 ? ` (${dangerCount} critical)` : ''}`}
                                    onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                                    onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                                >
                                    ⚠️ {warningCount}
                                </button>
                            )}
                        </h3>
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setShowAIChatbotSettings(true)}
                                title="AI Chatbot Settings"
                                style={{ minWidth: '32px', padding: '0.35rem 0.5rem', background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)', border: 'none', color: 'white' }}
                            >
                                🤖
                            </button>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setShowBulkModal(true)}
                                title="Send bulk message"
                                style={{ minWidth: '32px', padding: '0.35rem 0.5rem' }}
                            >
                                📢
                            </button>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setShowTagsModal(true)}
                                title="Manage tags"
                                style={{ minWidth: '32px', padding: '0.35rem 0.5rem' }}
                            >
                                🏷️
                            </button>
                            <button
                                className={`btn btn-sm ${showArchived ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={toggleShowArchived}
                                title="Toggle archived"
                                style={{ minWidth: '32px', padding: '0.35rem 0.5rem' }}
                            >
                                🗂️
                            </button>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={async () => {
                                    const result = await syncAllConversations();
                                    if (!result) {
                                        alert('Sync failed. Make sure you have connected a Facebook Page in Admin Settings → Facebook Integration.');
                                    }
                                }}
                                disabled={syncing}
                                title="Sync with Facebook"
                                style={{ minWidth: '32px', padding: '0.35rem 0.5rem' }}
                            >
                                {syncing ? '⏳' : '🔄'}
                            </button>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={async () => {
                                    try {
                                        const result = await facebookService.updateUnknownContactNames();
                                        if (result.updated > 0) {
                                            alert(`✅ Fixed ${result.updated} contact names!\n\nNames extracted from message content.`);
                                            await loadConversations();
                                        } else {
                                            alert('No names could be extracted from messages.\n\nTip: Click "Set Name" on individual contacts to manually enter names.');
                                        }
                                    } catch (err) {
                                        console.error('Error fixing names:', err);
                                        alert('Error: ' + err.message);
                                    }
                                }}
                                title="Fix unknown names by extracting from messages"
                                style={{ minWidth: '32px', padding: '0.35rem 0.5rem' }}
                            >
                                👤
                            </button>
                        </div>
                    </div>

                    {/* Search and Sort */}
                    <div style={{ padding: '0.5rem 0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Search all contacts..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setSearchTerm(value);
                                        // Trigger global search for 2+ characters (debounced)
                                        if (value.length >= 2) {
                                            // Debounce search
                                            clearTimeout(window._searchDebounce);
                                            window._searchDebounce = setTimeout(() => {
                                                searchConversations?.(value);
                                            }, 300);
                                        } else {
                                            clearConversationSearch?.();
                                        }
                                    }}
                                    style={{
                                        flex: 1,
                                        paddingRight: searchingConversations ? '2rem' : '0.75rem'
                                    }}
                                />
                                {searchingConversations && (
                                    <span style={{
                                        position: 'absolute',
                                        right: '0.5rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        fontSize: '0.875rem'
                                    }}>
                                        ⏳
                                    </span>
                                )}
                                {searchTerm && !searchingConversations && (
                                    <button
                                        onClick={() => {
                                            setSearchTerm('');
                                            clearConversationSearch?.();
                                        }}
                                        style={{
                                            position: 'absolute',
                                            right: '0.5rem',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: '0.875rem',
                                            color: 'var(--text-muted)',
                                            padding: '0.25rem'
                                        }}
                                        title="Clear search"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                            <button
                                className={`btn btn-sm ${selectMode ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => {
                                    setSelectMode(!selectMode);
                                    if (selectMode) clearSelection();
                                }}
                                title={selectMode ? 'Exit select mode' : 'Select contacts'}
                                style={{ padding: '0.35rem 0.5rem' }}
                            >
                                ☑️
                            </button>
                        </div>

                        {/* Search results indicator */}
                        {searchTerm.length >= 2 && conversationSearchResults?.length > 0 && (
                            <div style={{
                                fontSize: '0.7rem',
                                color: 'var(--text-muted)',
                                marginBottom: '0.5rem',
                                padding: '0.25rem 0.5rem',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--radius-sm)'
                            }}>
                                🔍 Found {conversationSearchResults.length} contacts across all pages
                            </div>
                        )}

                        {/* Filter Dropdown */}
                        <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                                style={{ width: '100%', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <span>🔍 Filter: {
                                    activeFilter === 'all' ? 'All Contacts' :
                                        activeFilter === 'no_reply' ? 'Awaiting Reply' :
                                            activeFilter === 'not_booked' ? 'Not Booked' :
                                                activeFilter === 'not_in_pipeline' ? 'Not in Pipeline' :
                                                    activeFilter === 'in_pipeline' ? 'In Pipeline' :
                                                        activeFilter === 'unread' ? 'Unread' :
                                                            activeFilter
                                }</span>
                                <span>{showFilterDropdown ? '▲' : '▼'}</span>
                            </button>

                            {showFilterDropdown && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    background: 'var(--bg-primary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--radius-md)',
                                    zIndex: 100,
                                    marginTop: '0.25rem',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                }}>
                                    {[
                                        { value: 'all', label: '📋 All Contacts' },
                                        { value: 'no_reply', label: '⏳ Awaiting Reply' },
                                        { value: 'unread', label: '🔔 Unread' },
                                        { value: 'not_booked', label: '📅 Not Booked' },
                                        { value: 'not_in_pipeline', label: '📊 Not in Pipeline' },
                                        { value: 'in_pipeline', label: '✅ In Pipeline' },
                                        { value: 'proposal_sent', label: '📨 Proposal Sent' },
                                        { value: 'proposal_waiting', label: '⏰ Proposal Waiting' },
                                        { type: 'divider', label: '── Lead Status ──' },
                                        { value: 'status_intake', label: '📥 Intake' },
                                        { value: 'status_qualified', label: '✅ Qualified' },
                                        { value: 'status_unqualified', label: '❌ Unqualified' },
                                        { value: 'status_appointment_booked', label: '📅 Appointment Booked' },
                                        { value: 'status_converted', label: '🎉 Converted' },
                                    ].map(opt => opt.type === 'divider' ? (
                                        <div key={opt.label} style={{
                                            padding: '0.25rem 0.75rem',
                                            fontSize: '0.65rem',
                                            color: 'var(--text-muted)',
                                            textAlign: 'center',
                                            borderTop: '1px solid var(--border-color)',
                                            marginTop: '0.25rem'
                                        }}>{opt.label}</div>
                                    ) : (
                                        <button
                                            key={opt.value}
                                            onClick={() => {
                                                setActiveFilter(opt.value);
                                                setShowFilterDropdown(false);
                                            }}
                                            style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 0.75rem',
                                                border: 'none',
                                                background: activeFilter === opt.value ? 'var(--primary-alpha)' : 'transparent',
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                fontSize: '0.75rem',
                                                color: 'var(--text-primary)'
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Date Filter - Filter by when contact first messaged */}
                        <div style={{ marginBottom: '0.5rem' }}>
                            <button
                                className={`btn btn-sm ${showDateFilter || filterDateFrom || filterDateTo ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setShowDateFilter(!showDateFilter)}
                                style={{
                                    width: '100%',
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <span>📅 {filterDateFrom || filterDateTo
                                    ? `Date: ${filterDateFrom || '...'} → ${filterDateTo || '...'}`
                                    : 'Filter by First Contact Date'}</span>
                                <span>{showDateFilter ? '▲' : '▼'}</span>
                            </button>

                            {showDateFilter && (
                                <div style={{
                                    padding: '0.5rem',
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 'var(--radius-md)',
                                    marginTop: '0.25rem',
                                    border: '1px solid var(--border-color)'
                                }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Filter contacts by when they first messaged:
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>From:</label>
                                            <input
                                                type="date"
                                                value={filterDateFrom}
                                                onChange={(e) => setFilterDateFrom(e.target.value)}
                                                className="form-input"
                                                style={{ fontSize: '0.75rem', padding: '0.35rem' }}
                                            />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>To:</label>
                                            <input
                                                type="date"
                                                value={filterDateTo}
                                                onChange={(e) => setFilterDateTo(e.target.value)}
                                                className="form-input"
                                                style={{ fontSize: '0.75rem', padding: '0.35rem' }}
                                            />
                                        </div>
                                    </div>
                                    {(filterDateFrom || filterDateTo) && (
                                        <button
                                            className="btn btn-sm btn-secondary"
                                            onClick={() => {
                                                setFilterDateFrom('');
                                                setFilterDateTo('');
                                            }}
                                            style={{ fontSize: '0.65rem', width: '100%' }}
                                        >
                                            ✕ Clear Date Filter
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Selection Actions Bar */}
                        {selectMode && selectedConversations.size > 0 && (
                            <div style={{
                                display: 'flex',
                                gap: '0.25rem',
                                marginBottom: '0.5rem',
                                padding: '0.5rem',
                                background: 'var(--primary-alpha)',
                                borderRadius: 'var(--radius-md)'
                            }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', flex: 1 }}>
                                    {selectedConversations.size} selected
                                </span>
                                <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={selectAllFiltered}
                                    style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
                                >
                                    All
                                </button>
                                <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => setShowBulkModal(true)}
                                    style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
                                >
                                    📢 Send
                                </button>
                                <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={clearSelection}
                                    style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
                                >
                                    ✕
                                </button>
                            </div>
                        )}


                    </div>

                    {/* Conversations List */}
                    <div
                        className="custom-scrollbar"
                        style={{
                            flex: 1,
                            minHeight: 0
                        }}
                    >
                        {/* Show global search results if search is active and has results */}
                        {searchTerm.length >= 2 && conversationSearchResults?.length > 0 ? (
                            conversationSearchResults.map(conv => {
                                const warningStatus = getContactWarningStatus(conv);
                                return (
                                    <div
                                        key={conv.id || conv.conversation_id}
                                        onClick={() => {
                                            selectConversation(conv);
                                            setMobileView('chat');
                                        }}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid var(--border-color)',
                                            borderLeft: warningStatus ? `4px solid ${warningStatus.color}` : '4px solid var(--primary)',
                                            paddingLeft: 'calc(1rem - 4px)',
                                            background: selectedConversation?.id === conv.id
                                                ? 'var(--primary-alpha)'
                                                : 'var(--bg-secondary)',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (selectedConversation?.id !== conv.id) {
                                                e.currentTarget.style.background = 'var(--primary-alpha)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (selectedConversation?.id !== conv.id) {
                                                e.currentTarget.style.background = 'var(--bg-secondary)';
                                            }
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            {/* Avatar */}
                                            <div style={{
                                                width: '40px',
                                                height: '40px',
                                                borderRadius: '50%',
                                                background: 'var(--primary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white',
                                                fontWeight: 'bold',
                                                fontSize: '1rem',
                                                flexShrink: 0
                                            }}>
                                                {conv.participant_picture_url ? (
                                                    <img
                                                        src={conv.participant_picture_url}
                                                        alt=""
                                                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                                                    />
                                                ) : (
                                                    conv.participant_name?.charAt(0)?.toUpperCase() || '?'
                                                )}
                                            </div>
                                            {/* Details */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                                                        {conv.participant_name || 'Unknown'}
                                                    </span>
                                                    {/* Lead Status Badge */}
                                                    {LEAD_STATUS_CONFIG[conv.lead_status || 'intake'] && (
                                                        <span style={{
                                                            fontSize: '0.6rem',
                                                            padding: '0.1rem 0.35rem',
                                                            borderRadius: '999px',
                                                            background: LEAD_STATUS_CONFIG[conv.lead_status || 'intake'].bgColor,
                                                            color: LEAD_STATUS_CONFIG[conv.lead_status || 'intake'].color,
                                                            fontWeight: '500',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {LEAD_STATUS_CONFIG[conv.lead_status || 'intake'].icon}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    color: 'var(--text-muted)',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}>
                                                    {conv.last_message_from_page ? 'You: ' : ''}{conv.last_message_text || 'No messages'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : filteredConversations.length === 0 ? (
                            <div style={{
                                padding: '2rem 1rem',
                                textAlign: 'center',
                                color: 'var(--text-muted)'
                            }}>
                                {searchTerm.length >= 2 && searchingConversations
                                    ? 'Searching...'
                                    : searchTerm.length >= 2
                                        ? 'No contacts found matching your search.'
                                        : conversations.length === 0
                                            ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                                    <p>No conversations yet. Connect a Facebook page to get started.</p>
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => {
                                                            if (confirm('Load demo data? This will enable demo mode.')) {
                                                                localStorage.setItem('gaia_demo_mode', 'true');
                                                                window.location.reload();
                                                            }
                                                        }}
                                                        style={{ background: '#e5e7eb', color: '#374151' }}
                                                    >
                                                        📂 Load Demo Data
                                                    </button>
                                                </div>
                                            )
                                            : 'No conversations match your filter.'
                                }
                            </div>
                        ) : (
                            filteredConversations.map(conv => {
                                const warningStatus = getContactWarningStatus(conv);
                                return (
                                    <div
                                        key={conv.id}
                                        onClick={() => {
                                            selectConversation(conv);
                                            setMobileView('chat'); // Switch to chat on mobile
                                        }}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid var(--border-color)',
                                            borderLeft: warningStatus ? `4px solid ${warningStatus.color}` : 'none',
                                            paddingLeft: warningStatus ? 'calc(1rem - 4px)' : '1rem',
                                            background: selectedConversation?.id === conv.id
                                                ? 'var(--primary-alpha)'
                                                : warningStatus
                                                    ? `${warningStatus.color}15`
                                                    : 'transparent',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (selectedConversation?.id !== conv.id) {
                                                e.currentTarget.style.background = warningStatus
                                                    ? `${warningStatus.color}25`
                                                    : 'var(--bg-secondary)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (selectedConversation?.id !== conv.id) {
                                                e.currentTarget.style.background = warningStatus
                                                    ? `${warningStatus.color}15`
                                                    : 'transparent';
                                            }
                                        }}
                                    >
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem'
                                        }}>
                                            {/* Avatar */}
                                            <div style={{
                                                width: '40px',
                                                height: '40px',
                                                borderRadius: '50%',
                                                background: 'var(--primary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white',
                                                fontWeight: 'bold',
                                                fontSize: '1rem',
                                                flexShrink: 0
                                            }}>
                                                {conv.participant_picture_url ? (
                                                    <img
                                                        src={conv.participant_picture_url}
                                                        alt=""
                                                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                                                    />
                                                ) : (
                                                    conv.participant_name?.charAt(0)?.toUpperCase() || '?'
                                                )}
                                            </div>

                                            {/* Details */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    marginBottom: '0.25rem'
                                                }}>
                                                    <span style={{
                                                        fontWeight: conv.unread_count > 0 ? '600' : '500',
                                                        color: 'var(--text-primary)',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}>
                                                        {conv.participant_name || 'Unknown'}
                                                    </span>
                                                    {/* Lead Status Badge */}
                                                    {LEAD_STATUS_CONFIG[conv.lead_status || 'intake'] && (
                                                        <span style={{
                                                            fontSize: '0.55rem',
                                                            padding: '0.1rem 0.3rem',
                                                            borderRadius: '999px',
                                                            background: LEAD_STATUS_CONFIG[conv.lead_status || 'intake'].bgColor,
                                                            color: LEAD_STATUS_CONFIG[conv.lead_status || 'intake'].color,
                                                            fontWeight: '500',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {LEAD_STATUS_CONFIG[conv.lead_status || 'intake'].icon}
                                                        </span>
                                                    )}
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        color: 'var(--text-muted)',
                                                        flexShrink: 0
                                                    }}>
                                                        {formatTime(conv.last_message_time)}
                                                    </span>
                                                </div>
                                                <div style={{
                                                    fontSize: '0.875rem',
                                                    color: conv.unread_count > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                                                    fontWeight: conv.unread_count > 0 ? '500' : '400',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}>
                                                    {conv.last_message_from_page ? 'You: ' : ''}{conv.last_message_text || 'No messages'}
                                                </div>
                                                {conv.linked_client && (
                                                    <div style={{
                                                        fontSize: '0.75rem',
                                                        color: 'var(--primary)',
                                                        marginTop: '0.25rem'
                                                    }}>
                                                        🔗 {conv.linked_client.client_name}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Unread Badge */}
                                            {conv.unread_count > 0 && (
                                                <div style={{
                                                    background: 'var(--primary)',
                                                    color: 'white',
                                                    borderRadius: '999px',
                                                    padding: '0.125rem 0.5rem',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 'bold',
                                                    flexShrink: 0
                                                }}>
                                                    {conv.unread_count}
                                                </div>
                                            )}

                                            {/* Goal Badge with Completion Status */}
                                            {conv.active_goal_id && (
                                                <div style={{
                                                    background: conv.goal_completed ? 'var(--success)' : 'var(--bg-tertiary)',
                                                    color: conv.goal_completed ? 'white' : 'var(--text-muted)',
                                                    borderRadius: '999px',
                                                    padding: '0.125rem 0.5rem',
                                                    fontSize: '0.65rem',
                                                    fontWeight: '500',
                                                    flexShrink: 0,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.25rem',
                                                    border: conv.goal_completed ? 'none' : '1px solid var(--border-color)'
                                                }}>
                                                    {conv.goal_completed && '✓ '}
                                                    {conv.active_goal_id === 'booking' && '📅'}
                                                    {conv.active_goal_id === 'closing' && '💰'}
                                                    {conv.active_goal_id === 'follow_up' && '🔄'}
                                                    {conv.active_goal_id === 'qualification' && '🎯'}
                                                    {conv.active_goal_id === 'information' && 'ℹ️'}
                                                    {' '}{conv.active_goal_id.replace('_', ' ')}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        {/* Load More Conversations */}
                        {hasMoreConversations && (
                            <div style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => loadMoreConversations()}
                                    disabled={loading}
                                    style={{ width: '100%', opacity: loading ? 0.5 : 0.8 }}
                                >
                                    ⬇️ Load More ({conversations.length}/{totalConversations})
                                </button>
                            </div>
                        )}

                        {/* Conversation count */}
                        {!hasMoreConversations && conversations.length > 0 && (
                            <div style={{
                                padding: '0.5rem',
                                textAlign: 'center',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)'
                            }}>
                                {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                </div>

                {/* Center - Messages Thread */}
                <div
                    className={`messenger-chat ${mobileView === 'chat' ? 'mobile-active' : ''}`}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'var(--bg-primary)',
                        height: '100%',
                        overflow: 'hidden'
                    }}>
                    {selectedConversation ? (
                        <>
                            {/* Conversation Header */}
                            <div style={{
                                padding: '1rem',
                                borderBottom: '1px solid var(--border-color)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem'
                            }}>
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    background: 'var(--primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    fontWeight: 'bold'
                                }}>
                                    {selectedConversation.participant_name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div>
                                    <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {selectedConversation.participant_name || 'Unknown'}
                                        {(!selectedConversation.participant_name || selectedConversation.participant_name === 'Unknown') && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        // First try to fetch from Facebook
                                                        await refreshContactName();
                                                    } catch (err) {
                                                        console.error('Failed to refresh name:', err);
                                                        // If Facebook fails, prompt user to enter a custom name
                                                        const customName = window.prompt(
                                                            'Facebook could not provide this contact\'s name (privacy restriction).\n\nEnter a name for this contact:',
                                                            ''
                                                        );
                                                        if (customName && customName.trim()) {
                                                            try {
                                                                await setContactName(customName.trim());
                                                            } catch (setErr) {
                                                                console.error('Failed to set custom name:', setErr);
                                                                alert('Failed to save the name. Please try again.');
                                                            }
                                                        }
                                                    }
                                                }}
                                                title="Refresh name from Facebook or set custom name"
                                                style={{
                                                    background: 'var(--bg-secondary)',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '4px',
                                                    padding: '0.125rem 0.5rem',
                                                    fontSize: '0.7rem',
                                                    cursor: 'pointer',
                                                    color: 'var(--text-muted)'
                                                }}
                                            >
                                                🔄 Set Name
                                            </button>
                                        )}
                                    </div>
                                    {selectedConversation.linked_client && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>
                                            🔗 Linked to {selectedConversation.linked_client.client_name}
                                        </div>
                                    )}
                                </div>
                                {/* AI Control Button */}
                                <button
                                    onClick={() => setShowAIControlPanel(true)}
                                    title="AI Controls"
                                    style={{
                                        marginLeft: 'auto',
                                        background: selectedConversation.ai_enabled !== false ? 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)' : 'var(--bg-secondary)',
                                        border: selectedConversation.ai_enabled !== false ? 'none' : '1px solid var(--border-color)',
                                        borderRadius: '8px',
                                        padding: '0.5rem 0.75rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        color: selectedConversation.ai_enabled !== false ? 'white' : 'var(--text-muted)',
                                        fontSize: '0.8rem',
                                        fontWeight: 500
                                    }}
                                >
                                    🤖 {selectedConversation.human_takeover ? 'Human' : 'AI'}
                                </button>
                            </div>

                            {/* Messages */}
                            <div
                                className="messages-scrollbar"
                                style={{
                                    flex: 1,
                                    minHeight: 0,
                                    padding: '1rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem'
                                }}
                            >
                                {/* Load More History - at top */}
                                {hasMoreMessages && (
                                    <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                                        <button
                                            className="btn btn-sm btn-secondary"
                                            onClick={loadMoreMessages}
                                            disabled={loading}
                                            style={{ opacity: loading ? 0.4 : 0.7 }}
                                        >
                                            ⬆️ Load earlier messages
                                        </button>
                                    </div>
                                )}

                                {messages.length === 0 && !loading && (
                                    <div style={{
                                        textAlign: 'center',
                                        color: 'var(--text-muted)',
                                        padding: '2rem',
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <div style={{
                                            textAlign: 'center',
                                            color: 'var(--text-muted)',
                                            padding: '2rem',
                                            flex: 1,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '1rem'
                                        }}>
                                            <div>No messages yet found locally.</div>
                                            <button
                                                className="btn btn-sm btn-primary"
                                                onClick={() => {
                                                    if (selectedConversation) {
                                                        refreshMessages(selectedConversation.conversation_id, selectedConversation.page_id);
                                                    }
                                                }}
                                                disabled={loading || syncing}
                                            >
                                                {syncing ? 'Syncing...' : '🔄 Sync Now'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {messages.map(msg => (
                                    <div
                                        key={msg.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: msg.is_from_page ? 'flex-end' : 'flex-start'
                                        }}
                                    >
                                        <div style={{
                                            maxWidth: '70%',
                                            padding: '0.75rem 1rem',
                                            borderRadius: msg.is_from_page
                                                ? '1rem 1rem 0 1rem'
                                                : '1rem 1rem 1rem 0',
                                            background: msg.is_from_page
                                                ? 'var(--primary)'
                                                : 'var(--bg-secondary)',
                                            color: msg.is_from_page
                                                ? 'white'
                                                : 'var(--text-primary)'
                                        }}>
                                            <div style={{ wordBreak: 'break-word' }}>
                                                {msg.message_text}
                                            </div>
                                            {msg.attachments && msg.attachments.length > 0 && (
                                                <div className="message-attachments">
                                                    {msg.attachments.map((att, idx) => (
                                                        <React.Fragment key={idx}>
                                                            {renderAttachment(att)}
                                                        </React.Fragment>
                                                    ))}
                                                </div>
                                            )}
                                            <div style={{
                                                fontSize: '0.7rem',
                                                opacity: 0.7,
                                                marginTop: '0.25rem',
                                                textAlign: 'right'
                                            }}>
                                                {formatTime(msg.timestamp)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Message Composer */}
                            <form onSubmit={handleSendMessage} style={{
                                padding: '1rem',
                                borderTop: '1px solid var(--border-color)',
                                display: 'flex',
                                gap: '0.5rem',
                                flexDirection: 'column'
                            }}>
                                {/* Action Buttons Row */}
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem', position: 'relative' }}>
                                    {/* Action Drop Up */}
                                    <div style={{ position: 'relative' }}>
                                        <button
                                            type="button"
                                            className={`btn btn-sm ${showDropUp ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setShowDropUp(!showDropUp)}
                                            title="Quick Actions"
                                        >
                                            ⚡
                                        </button>
                                        {showDropUp && (
                                            <div style={{
                                                position: 'absolute',
                                                bottom: '100%',
                                                left: 0,
                                                marginBottom: '0.5rem',
                                                background: 'var(--bg-primary)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: 'var(--radius-md)',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                                zIndex: 50,
                                                minWidth: '220px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                padding: '0.5rem',
                                                gap: '0.25rem'
                                            }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-ghost"
                                                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                                                    onClick={() => {
                                                        setShowDropUp(false);
                                                        setShowPropertySelector(true);
                                                    }}
                                                >
                                                    🏠 Send Property Card
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-ghost"
                                                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                                                    onClick={() => {
                                                        setShowDropUp(false);
                                                        handleSendTopSelling();
                                                    }}
                                                >
                                                    🔥 Send Top Properties
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-ghost"
                                                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                                                    onClick={() => {
                                                        setShowDropUp(false);
                                                        handleSendBookingButton();
                                                    }}
                                                >
                                                    📅 Send Booking Link
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploadingMedia}
                                        title="Attach file (max 25MB)"
                                    >
                                        {uploadingMedia ? '⏳' : '📎'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-secondary"
                                        onClick={handleSendBookingButton}
                                        disabled={loading}
                                        title="Send booking link"
                                    >
                                        📅
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn btn-sm ${showSavedReplies ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => setShowSavedReplies(!showSavedReplies)}
                                        title="Saved replies"
                                    >
                                        💬
                                    </button>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        style={{ display: 'none' }}
                                        onChange={handleFileUpload}
                                        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                                    />

                                    {/* Saved Replies Dropdown */}
                                    {showSavedReplies && (
                                        <div style={{
                                            position: 'absolute',
                                            bottom: '100%',
                                            left: 0,
                                            right: 0,
                                            maxHeight: '250px',
                                            overflowY: 'auto',
                                            background: 'var(--bg-primary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-md)',
                                            marginBottom: '0.5rem',
                                            boxShadow: '0 -4px 12px rgba(0,0,0,0.3)'
                                        }}>
                                            <div style={{
                                                padding: '0.5rem 0.75rem',
                                                borderBottom: '1px solid var(--border-color)',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <span style={{ fontWeight: '600', fontSize: '0.8rem' }}>💬 Saved Replies</span>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => setShowCreateReply(true)}
                                                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                                                >
                                                    + New
                                                </button>
                                            </div>

                                            {savedReplies.length === 0 ? (
                                                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    No saved replies yet. Click "+ New" to create one.
                                                </div>
                                            ) : (
                                                savedReplies.map(reply => (
                                                    <div
                                                        key={reply.id}
                                                        onClick={() => handleUseSavedReply(reply)}
                                                        style={{
                                                            padding: '0.5rem 0.75rem',
                                                            cursor: 'pointer',
                                                            borderBottom: '1px solid var(--border-color)',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'flex-start',
                                                            transition: 'background 0.2s'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: '500', fontSize: '0.8rem' }}>
                                                                {reply.title}
                                                                {reply.shortcut && (
                                                                    <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                                                        /{reply.shortcut}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                                {reply.content.substring(0, 60)}{reply.content.length > 60 ? '...' : ''}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteSavedReply(reply.id);
                                                            }}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                color: 'var(--text-muted)',
                                                                cursor: 'pointer',
                                                                fontSize: '0.7rem'
                                                            }}
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}

                                    {/* Create Saved Reply Modal */}
                                    {showCreateReply && (
                                        <div style={{
                                            position: 'absolute',
                                            bottom: '100%',
                                            left: 0,
                                            right: 0,
                                            background: 'var(--bg-primary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-md)',
                                            marginBottom: '0.5rem',
                                            padding: '0.75rem',
                                            boxShadow: '0 -4px 12px rgba(0,0,0,0.3)'
                                        }}>
                                            <div style={{ marginBottom: '0.5rem' }}>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    placeholder="Title (e.g., 'Greeting')"
                                                    value={newReplyTitle}
                                                    onChange={(e) => setNewReplyTitle(e.target.value)}
                                                    style={{ marginBottom: '0.5rem', fontSize: '0.8rem' }}
                                                />
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    placeholder="Shortcut (optional, e.g., 'hi')"
                                                    value={newReplyShortcut}
                                                    onChange={(e) => setNewReplyShortcut(e.target.value)}
                                                    style={{ marginBottom: '0.5rem', fontSize: '0.8rem' }}
                                                />
                                                <textarea
                                                    className="form-input"
                                                    placeholder="Message content..."
                                                    value={newReplyContent}
                                                    onChange={(e) => setNewReplyContent(e.target.value)}
                                                    rows={3}
                                                    style={{ fontSize: '0.8rem', resize: 'none' }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => {
                                                        setShowCreateReply(false);
                                                        setNewReplyTitle('');
                                                        setNewReplyContent('');
                                                        setNewReplyShortcut('');
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-primary"
                                                    onClick={handleCreateSavedReply}
                                                    disabled={!newReplyTitle.trim() || !newReplyContent.trim()}
                                                >
                                                    Save
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Message Input Row */}
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Type a message... (use /shortcut for quick replies)"
                                        value={messageText}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setMessageText(value);

                                            // Check for shortcut expansion
                                            if (value.startsWith('/') && value.length > 1) {
                                                const shortcut = value.slice(1).toLowerCase();
                                                const matchingReply = savedReplies.find(r =>
                                                    r.shortcut?.toLowerCase() === shortcut
                                                );
                                                if (matchingReply) {
                                                    // Show a hint but don't auto-expand yet
                                                }
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            // Expand shortcut on space or tab after /shortcut
                                            if ((e.key === ' ' || e.key === 'Tab') && messageText.startsWith('/')) {
                                                const shortcut = messageText.slice(1).toLowerCase().trim();
                                                const matchingReply = savedReplies.find(r =>
                                                    r.shortcut?.toLowerCase() === shortcut
                                                );
                                                if (matchingReply) {
                                                    e.preventDefault();
                                                    setMessageText(matchingReply.content);
                                                    facebookService.useSavedReply(matchingReply.id);
                                                }
                                            }
                                        }}
                                        style={{ flex: 1 }}
                                        disabled={loading}
                                    />
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={loading || !messageText.trim()}
                                    >
                                        {loading ? '⏳' : '📤'}
                                    </button>
                                </div>
                            </form>
                        </>
                    ) : (
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-muted)',
                            flexDirection: 'column',
                            gap: '1rem'
                        }}>
                            <div style={{ fontSize: '3rem' }}>💬</div>
                            <div>Select a conversation to view messages</div>
                        </div>
                    )}
                </div>

                {/* Right Sidebar - Contact Details */}
                <div
                    className={`messenger-details ${mobileView === 'details' ? 'mobile-active' : ''}`}
                    style={{
                        borderLeft: '1px solid var(--border-color)',
                        padding: '1rem',
                        background: 'var(--bg-primary)',
                        overflowY: 'auto'
                    }}>
                    {selectedConversation ? (
                        <>
                            {/* Contact Info */}
                            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                <div style={{
                                    width: '80px',
                                    height: '80px',
                                    borderRadius: '50%',
                                    background: 'var(--primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: '2rem',
                                    margin: '0 auto 0.75rem'
                                }}>
                                    {selectedConversation.participant_picture_url ? (
                                        <img
                                            src={selectedConversation.participant_picture_url}
                                            alt=""
                                            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        selectedConversation.participant_name?.charAt(0)?.toUpperCase() || '?'
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <h4 style={{ margin: 0 }}>
                                        {selectedConversation.participant_name || 'Unknown'}
                                    </h4>
                                    {!selectedConversation.participant_name && (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    // First try to fetch from Facebook
                                                    await refreshContactName();
                                                    alert('Name refreshed successfully!');
                                                } catch (err) {
                                                    console.error('Failed to refresh name:', err);
                                                    // If Facebook fails, prompt user to enter a custom name
                                                    const customName = window.prompt(
                                                        'Facebook could not provide this contact\'s name (privacy restriction).\n\nEnter a name for this contact:',
                                                        ''
                                                    );
                                                    if (customName && customName.trim()) {
                                                        try {
                                                            await setContactName(customName.trim());
                                                            alert('Name set successfully!');
                                                        } catch (setErr) {
                                                            console.error('Failed to set custom name:', setErr);
                                                            alert('Failed to save the name. Please try again.');
                                                        }
                                                    }
                                                }
                                            }}
                                            className="btn btn-sm btn-secondary"
                                            title="Fetch name from Facebook or set custom name"
                                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                                        >
                                            🔄 Set Name
                                        </button>
                                    )}
                                </div>
                                {selectedConversation.participant_email && (
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                        {selectedConversation.participant_email}
                                    </div>
                                )}
                            </div>

                            {/* Best Time to Contact (AI calculated) */}
                            {conversationInsights?.bestTimeToContact && (
                                <div style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(59, 130, 246, 0.1))', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                    <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span>⏰</span> Best Time to Contact
                                    </h5>
                                    <div style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--success)' }}>
                                        {conversationInsights.bestTimeToContact.formatted}
                                    </div>
                                    {conversationInsights.bestTimeToContact.confidence < 0.5 && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                            (Limited data - more messages will improve accuracy)
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Contact Details (Phone/Location/Email) */}
                            {(selectedConversation.contact_info || conversationInsights?.contactInfo || selectedConversation.email) && (
                                <div style={{ marginBottom: '1.5rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                                    <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>📋 Contact Details (Scraped)</h5>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                                        {(selectedConversation.contact_info?.email || conversationInsights?.contactInfo?.email || selectedConversation.participant_email) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span>📧</span> <span style={{ wordBreak: 'break-all' }}>{selectedConversation.contact_info?.email || conversationInsights?.contactInfo?.email || selectedConversation.participant_email}</span>
                                            </div>
                                        )}
                                        {(selectedConversation.contact_info?.phone || conversationInsights?.contactInfo?.phone) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span>📞</span> <span>{selectedConversation.contact_info?.phone || conversationInsights?.contactInfo?.phone}</span>
                                            </div>
                                        )}
                                        {(selectedConversation.contact_info?.location || conversationInsights?.contactInfo?.location) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span>📍</span> <span>{selectedConversation.contact_info?.location || conversationInsights?.contactInfo?.location}</span>
                                            </div>
                                        )}
                                        {conversationInsights?.contactInfo?.businessName && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span>🏢</span> <span>{conversationInsights.contactInfo.businessName}</span>
                                            </div>
                                        )}
                                        {conversationInsights?.contactInfo?.website && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span>🌐</span> <a href={conversationInsights.contactInfo.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', wordBreak: 'break-all' }}>{conversationInsights.contactInfo.website}</a>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Viewed Property Card - Enhanced */}
                            {(selectedConversation.viewed_property || conversationInsights?.viewedProperty) && (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                                        🏠 Viewed Property
                                    </label>
                                    <div style={{
                                        background: 'var(--bg-secondary)',
                                        borderRadius: 'var(--radius-md)',
                                        overflow: 'hidden',
                                        border: '1px solid var(--border-color)',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                    }}>
                                        <div style={{ height: '140px', position: 'relative' }}>
                                            <img
                                                src={(selectedConversation.viewed_property || conversationInsights?.viewedProperty).image}
                                                alt={(selectedConversation.viewed_property || conversationInsights?.viewedProperty).title}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                            {/* Price Tag */}
                                            <div style={{
                                                position: 'absolute',
                                                bottom: '10px',
                                                left: '10px',
                                                background: 'rgba(0,0,0,0.7)',
                                                color: 'white',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.9rem',
                                                fontWeight: '600'
                                            }}>
                                                ₱ {parseInt((selectedConversation.viewed_property || conversationInsights?.viewedProperty).price).toLocaleString()}
                                            </div>
                                        </div>
                                        <div style={{ padding: '1rem' }}>
                                            <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', fontWeight: '600' }}>
                                                {(selectedConversation.viewed_property || conversationInsights?.viewedProperty).title}
                                            </h4>
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--text-muted)',
                                                marginBottom: '0.5rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem'
                                            }}>
                                                <span>{(selectedConversation.viewed_property || conversationInsights?.viewedProperty).id.substring(0, 8)}...</span>
                                                <span>•</span>
                                                <span>{(selectedConversation.viewed_property || conversationInsights?.viewedProperty).bedrooms || 0} Beds</span>
                                                <span>•</span>
                                                <span>{(selectedConversation.viewed_property || conversationInsights?.viewedProperty).bathrooms || 0} Baths</span>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                                                <button
                                                    className="btn btn-sm"
                                                    style={{ width: '100%', background: 'white', color: '#111827', border: '1px solid #e5e7eb', fontWeight: '600' }}
                                                    onClick={() => alert(`Opening details for ${(selectedConversation.viewed_property || conversationInsights?.viewedProperty).title}`)}
                                                >
                                                    View Details
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-primary"
                                                    style={{ width: '100%', fontWeight: '600', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                                                    onClick={() => handleSendPropertyCard(selectedConversation.viewed_property || conversationInsights?.viewedProperty)}
                                                >
                                                    📤 Send to Chat
                                                </button>
                                                <button
                                                    className="btn btn-sm"
                                                    style={{ width: '100%', background: '#dc2626', color: 'white', border: '1px solid #dc2626', fontWeight: '600', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                                                    onClick={() => handleSendVideo(selectedConversation.viewed_property || conversationInsights?.viewedProperty)}
                                                >
                                                    🎥 Send Video
                                                </button>
                                                <button
                                                    className="btn btn-sm"
                                                    style={{ width: '100%', background: 'linear-gradient(45deg, #f59e0b, #ef4444)', color: 'white', border: 'none', fontWeight: '700', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                                                    onClick={handleSendTopSelling}
                                                >
                                                    🔥 Send Top Selling
                                                </button>
                                                <button
                                                    className="btn btn-sm"
                                                    style={{ width: '100%', background: 'white', color: '#111827', border: '1px solid #e5e7eb', fontWeight: '600', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                                                    onClick={() => {
                                                        const prop = selectedConversation.viewed_property || conversationInsights?.viewedProperty;
                                                        const inquiryMessage = `Hi, I am interested in ${prop.title}. Can you provide more details?`;
                                                        setMessageText(inquiryMessage);
                                                    }}
                                                >
                                                    💬 Inquire
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Conversations Summary (AI) */}
                            {(selectedConversation.ai_summary || conversationInsights?.aiNotes || conversationInsights?.aiSummary || aiAnalysis?.notes) && (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                                        🤖 AI Summary
                                    </label>
                                    <div style={{
                                        background: 'rgba(124, 58, 237, 0.1)',
                                        border: '1px solid rgba(124, 58, 237, 0.2)',
                                        borderRadius: 'var(--radius-md)',
                                        padding: '1rem'
                                    }}>
                                        <p style={{ fontSize: '0.85rem', lineHeight: '1.5', margin: 0, color: 'var(--text-primary)' }}>
                                            {conversationInsights?.aiNotes || conversationInsights?.aiSummary || aiAnalysis?.notes || selectedConversation.ai_summary}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Tags Section */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                                    🏷️ Tags
                                </label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.5rem' }}>
                                    {loadingTags ? (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading...</span>
                                    ) : conversationTags.length === 0 ? (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No tags</span>
                                    ) : (
                                        conversationTags.map(tag => (
                                            <span
                                                key={tag.id}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.25rem',
                                                    padding: '0.2rem 0.5rem',
                                                    background: tag.color || '#a855f7',
                                                    color: 'white',
                                                    borderRadius: '999px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: '500'
                                                }}
                                            >
                                                {tag.name}
                                                <button
                                                    onClick={() => handleRemoveTagFromConversation(tag.id)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'white',
                                                        cursor: 'pointer',
                                                        padding: '0 2px',
                                                        fontSize: '0.7rem',
                                                        opacity: 0.8
                                                    }}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))
                                    )}
                                </div>
                                {/* Add Tag Dropdown */}
                                <select
                                    className="form-select"
                                    value=""
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            handleAddTagToConversation(e.target.value);
                                            e.target.value = '';
                                        }
                                    }}
                                    style={{ fontSize: '0.75rem', padding: '0.35rem' }}
                                >
                                    <option value="">+ Add tag...</option>
                                    {tags
                                        .filter(t => !conversationTags.find(ct => ct.id === t.id))
                                        .map(tag => (
                                            <option key={tag.id} value={tag.id}>{tag.name}</option>
                                        ))
                                    }
                                </select>
                            </div>



                            {/* Link to Client & Assign Group */}
                            <div className="action-buttons-grid">
                                {/* Link to Client */}
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                                        Link to Client
                                    </label>
                                    <select
                                        className="form-select"
                                        value={selectedConversation.linked_client_id || ''}
                                        onChange={(e) => linkToClient(selectedConversation.conversation_id, e.target.value || null)}
                                        style={{ width: '100%' }}
                                    >
                                        <option value="">Not linked</option>
                                        {clients.map(client => (
                                            <option key={client.id} value={client.id}>
                                                {client.clientName}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Assign to User */}
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                                        Assigned To
                                    </label>
                                    <select
                                        className="form-select"
                                        value={selectedConversation.assigned_to || ''}
                                        onChange={(e) => assignToUser(selectedConversation.conversation_id, e.target.value || null)}
                                        style={{ width: '100%' }}
                                    >
                                        <option value="">Unassigned</option>
                                        {users.map(user => (
                                            <option key={user.id} value={user.id}>
                                                {user.name || user.email}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Lead Status */}
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                                    Lead Status (Pipeline)
                                </label>
                                <select
                                    className="form-select"
                                    value={selectedConversation.lead_status || ''}
                                    onChange={(e) => updateLeadStatus(selectedConversation.conversation_id, e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        fontWeight: '500'
                                    }}
                                >
                                    <option value="" disabled>Select Status...</option>
                                    {Object.entries(LEAD_STATUS_CONFIG).map(([value, config]) => (
                                        <option key={value} value={value}>
                                            {config.icon} {config.label}
                                        </option>
                                    ))}
                                </select>
                            </div>


                            {/* AI Analysis Button */}
                            <div style={{ marginTop: '1rem' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={analyzeCurrentConversation}
                                    disabled={analyzing || messages.length === 0}
                                    style={{ width: '100%' }}
                                >
                                    {analyzing ? '⏳ Analyzing...' : '🤖 Analyze with AI'}
                                </button>
                            </div>

                            {/* Delete Conversation Button */}
                            <div style={{ marginTop: '0.5rem' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        if (window.confirm(`Are you sure you want to delete the conversation with ${selectedConversation.participant_name}? This action cannot be undone.`)) {
                                            deleteConversation(selectedConversation.conversation_id);
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        color: '#ef4444',
                                        borderColor: '#ef4444'
                                    }}
                                >
                                    🗑️ Delete Conversation
                                </button>
                            </div>


                            {/* AI Insights - Removed per user request */}

                            {/* Existing Client Warning */}
                            {
                                existingClient && !selectedConversation.linked_client_id && (
                                    <div style={{
                                        marginTop: '1rem',
                                        padding: '1rem',
                                        background: 'var(--warning-alpha, rgba(251, 191, 36, 0.1))',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--warning)'
                                    }}>
                                        <div style={{ fontWeight: '500', color: 'var(--warning)', marginBottom: '0.5rem' }}>
                                            ⚠️ Existing Lead Found
                                        </div>
                                        <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                                            {existingClient.client_name}
                                            {existingClient.business_name && ` (${existingClient.business_name})`}
                                        </div>
                                        <button
                                            className="btn btn-sm btn-warning"
                                            onClick={() => updateExistingLead(existingClient.id)}
                                            disabled={loading}
                                            style={{ width: '100%' }}
                                        >
                                            🔄 Update This Lead
                                        </button>
                                    </div>
                                )
                            }

                            {/* Add to Pipeline Button */}
                            {
                                !selectedConversation.linked_client_id && !existingClient && (
                                    <div style={{ marginTop: '1rem' }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={async () => {
                                                // Start with basic info
                                                setTransferForm({
                                                    clientName: selectedConversation.participant_name || '',
                                                    businessName: '',
                                                    contactDetails: '',
                                                    pageLink: '',
                                                    niche: '',
                                                    notes: ''
                                                });
                                                setShowTransferModal(true);

                                                // Then run AI extraction in background
                                                if (messages && messages.length > 0) {
                                                    setExtractingDetails(true);
                                                    try {
                                                        const [details, notes] = await Promise.all([
                                                            extractContactDetails(messages, selectedConversation.participant_name),
                                                            generateNotes(messages, selectedConversation.participant_name)
                                                        ]);

                                                        // Update form with extracted data
                                                        setTransferForm(prev => ({
                                                            ...prev,
                                                            businessName: details?.businessName || prev.businessName,
                                                            contactDetails: details?.phone || details?.email || prev.contactDetails,
                                                            pageLink: details?.facebookPage || details?.website || prev.pageLink,
                                                            niche: details?.niche || prev.niche,
                                                            notes: notes || prev.notes
                                                        }));
                                                    } catch (err) {
                                                        console.error('AI extraction error:', err);
                                                    } finally {
                                                        setExtractingDetails(false);
                                                    }
                                                }
                                            }}
                                            disabled={loading || extractingDetails}
                                            style={{ width: '100%' }}
                                        >
                                            {extractingDetails ? '🤖 Analyzing...' : '➕ Add to Pipeline'}
                                        </button>
                                    </div>
                                )
                            }

                            {/* Linked Client Info */}
                            {
                                selectedConversation.linked_client && (
                                    <div style={{
                                        marginTop: '1rem',
                                        padding: '1rem',
                                        background: 'var(--bg-secondary)',
                                        borderRadius: 'var(--radius-md)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                            <h5 style={{ margin: 0, fontSize: '0.875rem' }}>
                                                🔗 Linked Client
                                            </h5>
                                            <button
                                                onClick={() => {
                                                    if (window.confirm('Unlink this conversation from the client?')) {
                                                        linkToClient(selectedConversation.conversation_id, null);
                                                    }
                                                }}
                                                style={{
                                                    padding: '0.25rem 0.5rem',
                                                    fontSize: '0.7rem',
                                                    background: 'transparent',
                                                    border: '1px solid var(--error)',
                                                    color: 'var(--error)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.target.style.background = 'var(--error)';
                                                    e.target.style.color = 'white';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.target.style.background = 'transparent';
                                                    e.target.style.color = 'var(--error)';
                                                }}
                                                title="Unlink from client"
                                            >
                                                ✕ Unlink
                                            </button>
                                        </div>
                                        <div style={{ fontWeight: '500' }}>
                                            {selectedConversation.linked_client.client_name}
                                        </div>
                                        {selectedConversation.linked_client.business_name && (
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                                {selectedConversation.linked_client.business_name}
                                            </div>
                                        )}
                                    </div>
                                )
                            }
                        </>
                    ) : (
                        <div style={{
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                            paddingTop: '2rem'
                        }}>
                            Select a conversation to view details
                        </div>
                    )
                    }
                </div >

                {/* Error Toast */}
                {
                    error && (
                        <div style={{
                            position: 'fixed',
                            bottom: '1rem',
                            right: '1rem',
                            background: 'var(--error)',
                            color: 'white',
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            zIndex: 1000
                        }}>
                            <span>⚠️ {error}</span>
                            <button
                                onClick={clearError}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '1rem'
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    )
                }

                {/* Bulk Message Modal */}
                {
                    showBulkModal && (
                        <div style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1001
                        }}>
                            <div style={{
                                background: 'var(--bg-primary)',
                                borderRadius: 'var(--radius-lg)',
                                padding: '1.5rem',
                                width: '90%',
                                maxWidth: '500px'
                            }}>
                                <h3 style={{ marginTop: 0 }}>📢 Send Bulk Message</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                    Uses ACCOUNT_UPDATE tag for Facebook compliance
                                </p>

                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                                        Send to:
                                    </label>
                                    <select
                                        className="form-input"
                                        value={bulkFilter}
                                        onChange={(e) => {
                                            setBulkFilter(e.target.value);
                                            if (e.target.value !== 'tag') {
                                                setBulkTagFilter('');
                                            }
                                        }}
                                        style={{ width: '100%' }}
                                    >
                                        <optgroup label="📋 Contact Status">
                                            <option value="all">All Conversations</option>
                                            <option value="selected">Selected Contacts ({selectedConversations.size})</option>
                                        </optgroup>
                                        <optgroup label="📅 Booking Status">
                                            <option value="booked">Booked (In Pipeline)</option>
                                            <option value="unbooked">Not Booked</option>
                                        </optgroup>
                                        <optgroup label="📊 Pipeline Status">
                                            <option value="pipeline">In Pipeline</option>
                                            <option value="not_pipeline">Not in Pipeline</option>
                                        </optgroup>
                                        <optgroup label="💬 Reply Status">
                                            <option value="no_reply">Awaiting Reply (No Response)</option>
                                            <option value="replied">Already Replied</option>
                                        </optgroup>
                                        <optgroup label="📝 Proposal Status">
                                            <option value="proposal_sent">Proposal Sent</option>
                                            <option value="proposal_waiting">Proposal Waiting</option>
                                        </optgroup>
                                        <optgroup label="🏷️ By Tag">
                                            <option value="tag">Filter by Tag...</option>
                                        </optgroup>
                                    </select>
                                </div>

                                {/* Tag Selection - shown when filter is 'tag' */}
                                {bulkFilter === 'tag' && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                                            Select Tag:
                                        </label>
                                        <select
                                            className="form-input"
                                            value={bulkTagFilter}
                                            onChange={(e) => setBulkTagFilter(e.target.value)}
                                            style={{ width: '100%' }}
                                        >
                                            <option value="">-- Select a tag --</option>
                                            {tags.map(tag => (
                                                <option key={tag.id} value={tag.id}>
                                                    {tag.name}
                                                </option>
                                            ))}
                                        </select>
                                        {tags.length === 0 && (
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                No tags created yet. Create tags in the Tags section.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Show count of recipients */}
                                {bulkFilter === 'selected' && (
                                    <div style={{
                                        padding: '0.5rem',
                                        background: 'var(--primary-alpha)',
                                        borderRadius: 'var(--radius-md)',
                                        marginBottom: '1rem',
                                        fontSize: '0.875rem'
                                    }}>
                                        {selectedConversations.size > 0
                                            ? `Will send to ${selectedConversations.size} selected contact${selectedConversations.size !== 1 ? 's' : ''}`
                                            : '⚠️ No contacts selected. Use checkbox mode to select contacts first.'
                                        }
                                    </div>
                                )}

                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                                        Message:
                                    </label>
                                    <textarea
                                        className="form-input"
                                        value={bulkMessage}
                                        onChange={(e) => setBulkMessage(e.target.value)}
                                        placeholder="Hi {first_name}! Type your message here..."
                                        rows={4}
                                        style={{ width: '100%', resize: 'vertical' }}
                                    />
                                    <div style={{
                                        marginTop: '0.5rem',
                                        padding: '0.75rem',
                                        background: 'var(--bg-secondary)',
                                        borderRadius: 'var(--radius-md)',
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)'
                                    }}>
                                        <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                                            📝 Template Variables (click to insert):
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {[
                                                { var: '{name}', desc: 'Full name' },
                                                { var: '{first_name}', desc: 'First name' },
                                                { var: '{date}', desc: 'Today\'s date' },
                                                { var: '{time}', desc: 'Current time' },
                                                { var: '{day}', desc: 'Day of week' }
                                            ].map(item => (
                                                <button
                                                    key={item.var}
                                                    type="button"
                                                    onClick={() => setBulkMessage(prev => prev + item.var)}
                                                    style={{
                                                        padding: '0.25rem 0.5rem',
                                                        background: 'var(--primary-alpha)',
                                                        border: '1px solid var(--primary)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        color: 'var(--primary)',
                                                        cursor: 'pointer',
                                                        fontSize: '0.7rem',
                                                        fontFamily: 'monospace'
                                                    }}
                                                    title={item.desc}
                                                >
                                                    {item.var}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setShowBulkModal(false)}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleSendBulkMessage}
                                        disabled={bulkSending || !bulkMessage.trim()}
                                    >
                                        {bulkSending ? 'Sending...' : '📢 Send to All'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Tags Modal */}
                {
                    showTagsModal && (
                        <div style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1001
                        }}>
                            <div style={{
                                background: 'var(--bg-primary)',
                                borderRadius: 'var(--radius-lg)',
                                padding: '1.5rem',
                                width: '90%',
                                maxWidth: '400px'
                            }}>
                                <h3 style={{ marginTop: 0 }}>🏷️ Manage Tags</h3>

                                {/* Create new tag */}
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                    <input
                                        type="color"
                                        value={newTagColor}
                                        onChange={(e) => setNewTagColor(e.target.value)}
                                        style={{ width: '40px', height: '36px', padding: 0, border: 'none', cursor: 'pointer' }}
                                    />
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={newTagName}
                                        onChange={(e) => setNewTagName(e.target.value)}
                                        placeholder="New tag name..."
                                        style={{ flex: 1 }}
                                    />
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={handleCreateTag}
                                        disabled={!newTagName.trim()}
                                    >
                                        +
                                    </button>
                                </div>

                                {/* Tag list */}
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    {tags.length === 0 ? (
                                        <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                                            No tags yet. Create one above!
                                        </p>
                                    ) : (
                                        tags.map(tag => (
                                            <div
                                                key={tag.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '0.5rem',
                                                    borderRadius: 'var(--radius-sm)',
                                                    marginBottom: '0.25rem',
                                                    background: 'var(--bg-secondary)'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{
                                                        width: '12px',
                                                        height: '12px',
                                                        borderRadius: '50%',
                                                        background: tag.color
                                                    }} />
                                                    <span>{tag.name}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteTag(tag.id)}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        color: 'var(--text-muted)'
                                                    }}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setShowTagsModal(false)}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Transfer to Pipeline Confirmation Modal */}
                {
                    showTransferModal && (
                        <div style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0,0,0,0.7)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000
                        }}>
                            <div style={{
                                background: 'var(--bg-primary)',
                                padding: '1.5rem',
                                borderRadius: 'var(--radius-lg)',
                                width: '100%',
                                maxWidth: '500px',
                                maxHeight: '90vh',
                                overflow: 'auto'
                            }}>
                                <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    ➕ Add to Pipeline
                                </h3>
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                    Review and edit the details before adding to pipeline:
                                </p>

                                {/* AI Extraction Banner */}
                                {extractingDetails && (
                                    <div style={{
                                        padding: '0.75rem',
                                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                                        borderRadius: 'var(--radius-md)',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        border: '1px solid rgba(99, 102, 241, 0.3)'
                                    }}>
                                        <span className="spinner" style={{ width: '16px', height: '16px' }}>🤖</span>
                                        <span style={{ fontSize: '0.875rem', color: 'var(--primary)' }}>
                                            AI is extracting contact details from conversation...
                                        </span>
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                                            Client Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={transferForm.clientName}
                                            onChange={(e) => setTransferForm(prev => ({ ...prev, clientName: e.target.value }))}
                                            placeholder="Enter client name"
                                            style={{
                                                width: '100%',
                                                padding: '0.5rem',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-secondary)'
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                                            Business Name
                                        </label>
                                        <input
                                            type="text"
                                            value={transferForm.businessName}
                                            onChange={(e) => setTransferForm(prev => ({ ...prev, businessName: e.target.value }))}
                                            placeholder="Enter business name"
                                            style={{
                                                width: '100%',
                                                padding: '0.5rem',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-secondary)'
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                                            Contact Details (Phone/Email)
                                        </label>
                                        <input
                                            type="text"
                                            value={transferForm.contactDetails}
                                            onChange={(e) => setTransferForm(prev => ({ ...prev, contactDetails: e.target.value }))}
                                            placeholder="Enter phone or email"
                                            style={{
                                                width: '100%',
                                                padding: '0.5rem',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-secondary)'
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                                            Facebook Page Link
                                        </label>
                                        <input
                                            type="text"
                                            value={transferForm.pageLink}
                                            onChange={(e) => setTransferForm(prev => ({ ...prev, pageLink: e.target.value }))}
                                            placeholder="Enter Facebook page URL"
                                            style={{
                                                width: '100%',
                                                padding: '0.5rem',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-secondary)'
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                                            Niche/Industry
                                        </label>
                                        <input
                                            type="text"
                                            value={transferForm.niche}
                                            onChange={(e) => setTransferForm(prev => ({ ...prev, niche: e.target.value }))}
                                            placeholder="Enter business niche"
                                            style={{
                                                width: '100%',
                                                padding: '0.5rem',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-secondary)'
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                                            Notes
                                        </label>
                                        <textarea
                                            value={transferForm.notes}
                                            onChange={(e) => setTransferForm(prev => ({ ...prev, notes: e.target.value }))}
                                            placeholder="Additional notes..."
                                            rows={3}
                                            style={{
                                                width: '100%',
                                                padding: '0.5rem',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-secondary)',
                                                resize: 'vertical'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setShowTransferModal(false)}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={async () => {
                                            await transferToClient({
                                                clientName: transferForm.clientName,
                                                businessName: transferForm.businessName,
                                                contactDetails: transferForm.contactDetails,
                                                facebookPage: transferForm.pageLink,
                                                niche: transferForm.niche,
                                                notes: transferForm.notes
                                            }, currentUserId);
                                            setShowTransferModal(false);
                                        }}
                                        disabled={!transferForm.clientName || loading}
                                    >
                                        {loading ? 'Adding...' : '✅ Add to Pipeline'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div >

            {/* Warning Dashboard Modal */}
            {
                showWarningDashboard && (
                    <WarningDashboard
                        conversations={conversations}
                        onSelectConversation={(conv) => {
                            selectConversation(conv);
                            setMobileView('chat');
                        }}
                        onClose={() => setShowWarningDashboard(false)}
                        warningSettings={warningSettings}
                    />
                )
            }

            {/* AI Control Panel Modal */}
            {
                showAIControlPanel && selectedConversation && (
                    <AIControlPanel
                        conversationId={selectedConversation.conversation_id}
                        participantName={selectedConversation.participant_name}
                        onClose={() => setShowAIControlPanel(false)}
                    />
                )
            }

            {/* AI Chatbot Settings Modal */}
            {
                showAIChatbotSettings && (
                    <AIChatbotSettings
                        onClose={() => setShowAIChatbotSettings(false)}
                    />
                )
            }

            {/* Best Times Overview Modal */}
            {
                showBestTimes && (
                    <BestTimesOverview
                        onClose={() => setShowBestTimes(false)}
                    />
                )
            }

            {/* Property Selector Modal */}
            {showPropertySelector && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2000
                }}>
                    <div style={{
                        background: 'var(--bg-primary)',
                        borderRadius: 'var(--radius-lg)',
                        width: '90%',
                        maxWidth: '800px',
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                    }}>
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Select Property to Send</h3>
                            <button onClick={() => setShowPropertySelector(false)} className="btn btn-sm btn-ghost" style={{ fontSize: '1.25rem', lineHeight: 1 }}>✕</button>
                        </div>
                        <div style={{ padding: '1rem', overflowY: 'auto' }}>
                            {properties.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                    No properties found. <br />
                                    <small>Add properties in the Properties tab first.</small>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                                    {properties.map(p => (
                                        <div key={p.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column' }}>
                                            <div style={{ height: '140px', background: '#e5e7eb', position: 'relative' }}>
                                                {p.image ? (
                                                    <img src={p.image} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: '2rem' }}>🏠</div>
                                                )}
                                                <div style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600' }}>
                                                    {typeof p.price === 'number' ? `₱ ${p.price.toLocaleString()}` : p.price}
                                                </div>
                                            </div>
                                            <div style={{ padding: '0.75rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.title}>{p.title}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{p.location || p.address || 'No location'}</div>
                                                <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        className="btn btn-sm btn-primary"
                                                        style={{ flex: 1, fontSize: '0.75rem' }}
                                                        onClick={() => {
                                                            handleSendPropertyCard(p);
                                                            setShowPropertySelector(false);
                                                        }}
                                                    >
                                                        Send
                                                    </button>
                                                    {p.videos && p.videos.length > 0 && (
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            style={{ fontSize: '0.75rem' }}
                                                            title="Send Video"
                                                            onClick={() => {
                                                                handleSendVideo(p);
                                                                setShowPropertySelector(false);
                                                            }}
                                                        >
                                                            🎥
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default MessengerInbox;

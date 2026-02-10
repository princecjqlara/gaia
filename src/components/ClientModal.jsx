import React, { useState, useEffect } from 'react';
import TagSelector from './TagSelector';
import { getSupabaseClient } from '../services/supabase';
import { getPackages, formatPrice } from '../utils/clients';
import { showToast } from '../utils/toast';

const ClientModal = ({ clientId, client, onClose, onSave, onDelete }) => {
  const [activeTab, setActiveTab] = useState('basic');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [notesMedia, setNotesMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [formData, setFormData] = useState({
    clientName: '',
    businessName: '',
    contactDetails: '',
    pageLink: '',
    assignedTo: '',
    adsExpense: 0,
    notes: '',
    tags: '',
    phase: 'booked',
    autoSwitch: false,
    autoSwitchDays: 7,
    nextPhaseDate: '',
    subscriptionUsage: 0,
    testingRound: 1,
    videosUsed: 0,
    mainVideosUsed: 0,
    photosUsed: 0,
    meetingMinutesUsed: 0
  });

  // Load available users
  useEffect(() => {
    const loadUsers = async () => {
      const client = getSupabaseClient();

      // Try localStorage first as fallback
      const cachedUsers = localStorage.getItem('gaia_users_cache');
      if (cachedUsers) {
        try {
          const parsed = JSON.parse(cachedUsers);
          if (parsed && parsed.length > 0) {
            setAvailableUsers(parsed);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      if (!client) {
        console.log('Supabase client not available, using cached users');
        return;
      }

      try {
        const { data, error } = await client
          .from('users')
          .select('id, name, email, role')
          .order('name');

        if (error) {
          console.error('Error loading users:', error);
          // Don't show toast for RLS errors when not authenticated
          if (!error.message?.includes('permission') && !error.message?.includes('RLS')) {
            showToast('Error loading users: ' + error.message, 'error');
          }
          return;
        }

        console.log('Loaded users for assignment:', data?.length || 0, data);
        if (data && data.length > 0) {
          setAvailableUsers(data);
          // Cache to localStorage for offline access
          localStorage.setItem('gaia_users_cache', JSON.stringify(data));
        }
      } catch (err) {
        console.error('Exception loading users:', err);
      }
    };

    loadUsers();
  }, []);

  useEffect(() => {
    if (client) {
      const customPkg = client.customPackage || {};
      const usageDetail = client.subscriptionUsageDetail || {
        videosUsed: 0,
        mainVideosUsed: 0,
        photosUsed: 0,
        meetingMinutesUsed: 0
      };
      // Handle assignedTo - could be UUID or name string
      let assignedToValue = client.assignedTo || '';
      if (assignedToValue && availableUsers.length > 0) {
        // Check if it's already a UUID that exists in our user list
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignedToValue);
        if (isUUID) {
          // Verify the UUID exists in available users
          const userExists = availableUsers.some(u => u.id === assignedToValue);
          if (!userExists) {
            assignedToValue = ''; // Clear if user doesn't exist
          }
        } else {
          // It's a name string, try to find matching user
          const matchingUser = availableUsers.find(
            u => u.name === assignedToValue || u.email === assignedToValue
          );
          if (matchingUser) {
            assignedToValue = matchingUser.id;
          } else {
            assignedToValue = ''; // Clear if no match found
          }
        }
      }

      setFormData({
        clientName: client.clientName || '',
        businessName: client.businessName || '',
        contactDetails: client.contactDetails || '',
        pageLink: client.pageLink || '',
        assignedTo: assignedToValue,
        adsExpense: client.adsExpense || 0,
        notes: client.notes || '',
        tags: (client.tags || []).join(', '),

        customPackage: client.customPackage || null,
        customPrice: customPkg.price || 0,
        customVideos: customPkg.videos || 0,
        customMainVideos: customPkg.mainVideos || 0,
        customPhotos: customPkg.photos || 0,
        customMeetingMins: customPkg.weeklyMeeting || 0,
        customCAPI: customPkg.capi || false,
        customAdvancedCAPI: customPkg.advancedCapi || false,
        customDailyAds: customPkg.dailyAds || false,
        customUnlimitedSetup: customPkg.unlimitedSetup || false,
        customLookalike: customPkg.lookalike || false,
        customPriority: customPkg.priority || false,
        customFeatures: customPkg.customFeatures || '',

        monthsWithClient: client.monthsWithClient || 0,
        startDate: client.startDate || '',
        phase: client.phase || 'booked',
        autoSwitch: client.autoSwitch || false,
        autoSwitchDays: client.autoSwitchDays || 7,
        nextPhaseDate: client.nextPhaseDate || '',
        subscriptionUsage: client.subscriptionUsage || 0,
        testingRound: client.testingRound || 1,
        videosUsed: usageDetail.videosUsed || 0,
        mainVideosUsed: usageDetail.mainVideosUsed || 0,
        photosUsed: usageDetail.photosUsed || 0,
        meetingMinutesUsed: usageDetail.meetingMinutesUsed || 0
      });
      // Load notes media
      setNotesMedia(client.notesMedia || []);
    } else {
      // Reset form when creating new client
      setActiveTab('basic');
      setNotesMedia([]);
    }
  }, [client]);

  const handleFileUpload = async (files) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      alert('Supabase not initialized. Please refresh the page.');
      return;
    }

    setUploading(true);
    const uploadedFiles = [];
    const tempId = clientId || `temp-${Date.now()}`;

    try {
      for (const file of Array.from(files)) {
        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert(`File ${file.name} is too large. Maximum size is 10MB.`);
          continue;
        }

        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `client-notes/${tempId}/${fileName}`;

        // Upload to Supabase Storage
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

        const { data, error } = await supabase.storage
          .from('client-media')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          console.error('Upload error:', error);
          alert(`Failed to upload ${file.name}: ${error.message}`);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('client-media')
          .getPublicUrl(filePath);

        uploadedFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
          filename: file.name,
          url: urlData.publicUrl,
          path: filePath,
          type: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString()
        });

        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
      }

      // Add uploaded files to notesMedia
      setNotesMedia([...notesMedia, ...uploadedFiles]);
    } catch (error) {
      console.error('Error uploading files:', error);
      alert('Error uploading files. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress({});
    }
  };

  const handleRemoveMedia = async (mediaItem) => {
    const supabase = getSupabaseClient();
    if (supabase && mediaItem.path) {
      try {
        // Delete from storage
        await supabase.storage
          .from('client-media')
          .remove([mediaItem.path]);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }

    // Remove from state
    setNotesMedia(notesMedia.filter(m => m.id !== mediaItem.id));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    // Validate required fields
    if (!formData.clientName || !formData.clientName.trim()) {
      showToast('Please enter a client name', 'warning');
      return;
    }
    if (!formData.businessName || !formData.businessName.trim()) {
      showToast('Please enter a business name', 'warning');
      return;
    }

    const tags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : [];

    try {
      await onSave({
        clientName: formData.clientName,
        businessName: formData.businessName,
        contactDetails: formData.contactDetails,
        pageLink: formData.pageLink,
        assignedTo: formData.assignedTo,
        adsExpense: formData.adsExpense || 0,
        notes: formData.notes,
        notesMedia: notesMedia,
        tags,
        phase: formData.phase,
        autoSwitch: formData.autoSwitch || false,
        autoSwitchDays: formData.autoSwitchDays || 7,
        nextPhaseDate: formData.nextPhaseDate,
        subscriptionUsage: formData.subscriptionUsage || 0,
        testingRound: formData.testingRound || 1,
        subscriptionUsageDetail: {
          videosUsed: formData.videosUsed || 0,
          mainVideosUsed: formData.mainVideosUsed || 0,
          photosUsed: formData.photosUsed || 0,
          meetingMinutesUsed: formData.meetingMinutesUsed || 0
        },
        subscriptionStarted: formData.phase === 'testing' || formData.phase === 'running'
      });
    } catch (error) {
      // Error handling is done in App.jsx, but we don't close the modal on error
      console.error('Error in handleSubmit:', error);
    }
  };

  return (
    <div className="modal-overlay active" onClick={(e) => e.target.id === 'clientModal' && onClose()}>
      <div className="modal" id="clientModal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{clientId ? 'Edit Client' : 'Add New Client'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <form id="clientForm" onSubmit={handleSubmit}>
            <div className="tabs">
              <button type="button" className={`tab ${activeTab === 'basic' ? 'active' : ''}`} onClick={() => setActiveTab('basic')}>
                📝 Basic Info
              </button>
              <button type="button" className={`tab ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>
                Schedule
              </button>
              <button type="button" className={`tab ${activeTab === 'booking' ? 'active' : ''}`} onClick={() => setActiveTab('booking')}>
                📅 Booking
              </button>
            </div>

            {activeTab === 'basic' && (
              <div className={`tab-content ${activeTab === 'basic' ? 'active' : ''}`}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Client Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={formData.clientName}
                      onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Business Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={formData.businessName}
                      onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Contact Details</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.contactDetails}
                      onChange={(e) => setFormData({ ...formData, contactDetails: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Page Link</label>
                  <input
                    type="url"
                    className="form-input"
                    value={formData.pageLink}
                    onChange={(e) => setFormData({ ...formData, pageLink: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Assigned To</label>
                  <select
                    className="form-select"
                    value={formData.assignedTo || ''}
                    onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  >
                    <option value="">
                      {availableUsers.length === 0 ? '— No users available (log in to see team) —' : '— Select User —'}
                    </option>
                    {availableUsers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name} {user.email ? `(${user.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-textarea"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes about the client..."
                    rows={4}
                  />

                  {/* Media Upload Section */}
                  <div style={{ marginTop: '0.75rem' }}>
                    <label className="form-label" style={{ fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                      Attach Media (Images, Videos, Documents)
                    </label>
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                      onChange={(e) => handleFileUpload(e.target.files)}
                      disabled={uploading}
                      style={{ display: 'none' }}
                      id="notes-media-upload"
                    />
                    <label
                      htmlFor="notes-media-upload"
                      className="btn btn-secondary"
                      style={{
                        display: 'inline-block',
                        cursor: uploading ? 'not-allowed' : 'pointer',
                        opacity: uploading ? 0.6 : 1,
                        marginBottom: '0.75rem'
                      }}
                    >
                      {uploading ? '⏳ Uploading...' : '📎 Upload Files'}
                    </label>

                    {/* Upload Progress */}
                    {Object.keys(uploadProgress).length > 0 && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {Object.entries(uploadProgress).map(([filename, progress]) => (
                          <div key={filename} style={{ marginBottom: '0.25rem' }}>
                            {filename}: {progress}%
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Media Preview */}
                    {notesMedia.length > 0 && (
                      <div style={{
                        marginTop: '0.75rem',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                        gap: '0.75rem'
                      }}>
                        {notesMedia.map((media) => (
                          <div
                            key={media.id}
                            style={{
                              position: 'relative',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              background: 'var(--bg-secondary)'
                            }}
                          >
                            {media.type?.startsWith('image/') ? (
                              <img
                                src={media.url}
                                alt={media.filename}
                                style={{
                                  width: '100%',
                                  height: '100px',
                                  objectFit: 'cover',
                                  display: 'block'
                                }}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                              />
                            ) : (
                              <div style={{
                                width: '100%',
                                height: '100px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'var(--bg-tertiary)',
                                fontSize: '2rem'
                              }}>
                                {media.type?.startsWith('video/') ? '🎥' : '📄'}
                              </div>
                            )}
                            <div style={{
                              padding: '0.5rem',
                              fontSize: '0.75rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {media.filename}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveMedia(media)}
                              style={{
                                position: 'absolute',
                                top: '0.25rem',
                                right: '0.25rem',
                                background: 'rgba(0, 0, 0, 0.7)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50%',
                                width: '24px',
                                height: '24px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.875rem'
                              }}
                              title="Remove"
                            >
                              ×
                            </button>
                            <a
                              href={media.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                position: 'absolute',
                                bottom: '0.25rem',
                                right: '0.25rem',
                                background: 'rgba(0, 0, 0, 0.7)',
                                color: 'white',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                textDecoration: 'none'
                              }}
                              title="Open in new tab"
                            >
                              🔗
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Tags</label>
                  <TagSelector
                    value={formData.tags}
                    onChange={(tags) => setFormData({ ...formData, tags })}
                  />
                </div>
              </div>
            )}





            {activeTab === 'schedule' && (
              <div className={`tab-content ${activeTab === 'schedule' ? 'active' : ''}`}>
                <div className="form-group">
                  <label className="form-label">Current Phase</label>
                  <select
                    className="form-select"
                    value={formData.phase}
                    onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
                  >
                    <option value="booked">📅 Booked</option>
                    <option value="follow-up">📞 Follow Up</option>
                    <option value="preparing">⏳ Preparing</option>
                    <option value="testing">🧪 Testing</option>
                    <option value="running">🚀 Running</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.autoSwitch}
                      onChange={(e) => setFormData({ ...formData, autoSwitch: e.target.checked })}
                    /> Enable Auto Phase Switch
                  </label>
                </div>

                {formData.autoSwitch && (
                  <div className="auto-switch-fields">
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Days until next phase</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.autoSwitchDays}
                          onChange={(e) => setFormData({ ...formData, autoSwitchDays: parseInt(e.target.value) || 7 })}
                          min="1"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Next Phase Date</label>
                        <input
                          type="date"
                          className="form-input"
                          value={formData.nextPhaseDate}
                          onChange={(e) => setFormData({ ...formData, nextPhaseDate: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {formData.phase === 'testing' && (
                  <div className="testing-options">
                    <h4 style={{ margin: 'var(--space-lg) 0 var(--space-md)', color: 'var(--phase-testing)' }}>
                      Testing Phase Settings
                    </h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Subscription Usage (%)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.subscriptionUsage}
                          onChange={(e) => setFormData({ ...formData, subscriptionUsage: parseInt(e.target.value) || 0 })}
                          min="0"
                          max="100"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Testing Round</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.testingRound}
                          onChange={(e) => setFormData({ ...formData, testingRound: parseInt(e.target.value) || 1 })}
                          min="1"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            subscriptionUsage: 0,
                            testingRound: (formData.testingRound || 1) + 1
                          });
                        }}
                      >
                        🔄 Start New Testing Round
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Booking Tab */}
            {activeTab === 'booking' && (
              <div className={`tab-content ${activeTab === 'booking' ? 'active' : ''}`}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>
                  📅 Schedule a Meeting with {formData.clientName || 'Client'}
                </h4>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Meeting Title</label>
                    <input
                      type="text"
                      className="form-input"
                      id="bookingTitle"
                      defaultValue={`Meeting with ${formData.clientName || 'Client'}`}
                      placeholder="e.g., Onboarding Call"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Date</label>
                    <input
                      type="date"
                      className="form-input"
                      id="bookingDate"
                      defaultValue={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time</label>
                    <input
                      type="time"
                      className="form-input"
                      id="bookingTime"
                      defaultValue="09:00"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Duration (minutes)</label>
                  <select className="form-select" id="bookingDuration" defaultValue="30">
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={async () => {
                      const title = document.getElementById('bookingTitle')?.value || 'Meeting';
                      const date = document.getElementById('bookingDate')?.value;
                      const time = document.getElementById('bookingTime')?.value || '09:00';
                      const duration = parseInt(document.getElementById('bookingDuration')?.value || '30');

                      if (!date) {
                        alert('Please select a date');
                        return;
                      }

                      const startTime = new Date(`${date}T${time}`);
                      const endTime = new Date(startTime.getTime() + duration * 60000);

                      const supabase = getSupabaseClient();
                      if (!supabase) {
                        alert('Database not connected');
                        return;
                      }

                      try {
                        // Build description with client details
                        const description = `📅 Meeting with ${formData.clientName || 'Client'}
👤 Business: ${formData.businessName || 'N/A'}
📞 Contact: ${formData.contactDetails || 'N/A'}
⏱️ Duration: ${duration} minutes`;

                        // Create calendar event
                        const { data: eventData, error: eventError } = await supabase
                          .from('calendar_events')
                          .insert({
                            title: title,
                            description: description,
                            start_time: startTime.toISOString(),
                            end_time: endTime.toISOString(),
                            client_id: clientId || null,
                            event_type: 'meeting',
                            all_day: false
                          })
                          .select()
                          .single();

                        if (eventError) {
                          console.error('Calendar event error:', eventError);
                          alert('Error creating calendar event: ' + eventError.message);
                          return;
                        }

                        console.log('✅ Calendar event created:', eventData?.id);
                        showToast(`Meeting scheduled for ${date} at ${time}!`, 'success');

                        // Try to create meeting room (optional - may not have table)
                        try {
                          const roomSlug = Math.random().toString(36).substring(2, 10);
                          const { error: roomError } = await supabase
                            .from('meeting_rooms')
                            .insert({
                              room_slug: roomSlug,
                              title: title,
                              calendar_event_id: eventData.id,
                              scheduled_at: startTime.toISOString()
                            });

                          if (!roomError) {
                            const roomLink = `${window.location.origin}/room/${roomSlug}`;
                            navigator.clipboard.writeText(roomLink);
                            alert(`Meeting scheduled!\\n\\nRoom link copied to clipboard:\\n${roomLink}`);
                          } else {
                            console.log('Meeting room creation skipped (table may not exist)');
                            alert(`Meeting scheduled for ${date} at ${time}!\\n\\nCheck your calendar.`);
                          }
                        } catch (roomErr) {
                          console.log('Meeting room feature not available');
                          alert(`Meeting scheduled for ${date} at ${time}!`);
                        }
                      } catch (err) {
                        console.error('Error creating meeting:', err);
                        alert('Error creating meeting: ' + err.message);
                      }
                    }}
                  >
                    🎥 Create Meeting Room
                  </button>
                </div>

                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  💡 This will create a video meeting room linked to this client. The room link will be copied to your clipboard.
                </div>
              </div>
            )}
          </form>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {clientId && (
            <button type="button" className="btn btn-danger" onClick={() => onDelete(clientId)}>Delete Client</button>
          )}
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>Save Client</button>
        </div>
      </div>
    </div>
  );
};

export default ClientModal;



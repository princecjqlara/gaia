import React, { useState, useEffect } from 'react';
import TagSelector from './TagSelector';
import { getSupabaseClient } from '../services/supabase';

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
    package: 'basic',
    customPackage: null,
    customPrice: 0,
    customVideos: 0,
    customMainVideos: 0,
    customPhotos: 0,
    customMeetingMins: 0,
    customCAPI: false,
    customAdvancedCAPI: false,
    customDailyAds: false,
    customUnlimitedSetup: false,
    customLookalike: false,
    customPriority: false,
    customFeatures: '',
    paymentStatus: 'unpaid',
    paymentSchedule: 'monthly',
    monthsWithClient: 0,
    startDate: '',
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
      if (!client) return;

      try {
        const { data, error } = await client
          .from('users')
          .select('id, name, email')
          .order('name');

        if (error) {
          console.error('Error loading users:', error);
          return;
        }
        setAvailableUsers(data || []);
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
        package: client.package || 'basic',
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
        paymentStatus: client.paymentStatus || 'unpaid',
        paymentSchedule: client.paymentSchedule || 'monthly',
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
        const filePath = `client-notes/${clientId || 'new'}/${fileName}`;

        // Upload to Supabase Storage
        setUploadProgress({ ...uploadProgress, [file.name]: 0 });
        
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

        setUploadProgress({ ...uploadProgress, [file.name]: 100 });
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

  const handleSubmit = (e) => {
    e.preventDefault();
    const tags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : [];
    
    // Build custom package if selected
    let customPackage = null;
    if (formData.package === 'custom') {
      customPackage = {
        price: formData.customPrice || 0,
        videos: formData.customVideos || 0,
        mainVideos: formData.customMainVideos || 0,
        photos: formData.customPhotos || 0,
        weeklyMeeting: formData.customMeetingMins || 0,
        capi: formData.customCAPI || false,
        advancedCapi: formData.customAdvancedCAPI || false,
        dailyAds: formData.customDailyAds || false,
        unlimitedSetup: formData.customUnlimitedSetup || false,
        lookalike: formData.customLookalike || false,
        priority: formData.customPriority || false,
        customFeatures: formData.customFeatures || ''
      };
    }

    onSave({
      clientName: formData.clientName,
      businessName: formData.businessName,
      contactDetails: formData.contactDetails,
      pageLink: formData.pageLink,
      assignedTo: formData.assignedTo,
      adsExpense: formData.adsExpense || 0,
      notes: formData.notes,
      notesMedia: notesMedia,
      tags,
      package: formData.package,
      customPackage,
      paymentStatus: formData.paymentStatus,
      paymentSchedule: formData.paymentSchedule,
      monthsWithClient: formData.monthsWithClient || 0,
      startDate: formData.startDate,
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
              <button type="button" className={`tab ${activeTab === 'package' ? 'active' : ''}`} onClick={() => setActiveTab('package')}>
                📦 Package
              </button>
              <button type="button" className={`tab ${activeTab === 'payment' ? 'active' : ''}`} onClick={() => setActiveTab('payment')}>
                💳 Payment
              </button>
              <button type="button" className={`tab ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>
                Schedule
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
                    <option value="">— Select User —</option>
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

            {activeTab === 'package' && (
              <div className={`tab-content ${activeTab === 'package' ? 'active' : ''}`}>
                <div className="form-group">
                  <label className="form-label">Select Package *</label>
                  <div className="package-selector">
                    {['basic', 'star', 'fire', 'crown', 'custom'].map(pkg => {
                      const packages = {
                        basic: { emoji: '🟢', price: '₱1,799', name: 'Basic' },
                        star: { emoji: '⭐', price: '₱2,999', name: 'Star' },
                        fire: { emoji: '🔥', price: '₱3,499', name: 'Fire' },
                        crown: { emoji: '👑', price: '₱5,799', name: 'Crown' },
                        custom: { emoji: '🎨', price: 'Custom', name: 'Custom' }
                      };
                      const pkgInfo = packages[pkg];
                      return (
                        <label
                          key={pkg}
                          className={`package-option ${formData.package === pkg ? 'selected' : ''}`}
                          onClick={() => setFormData({ ...formData, package: pkg })}
                        >
                          <input
                            type="radio"
                            name="package"
                            value={pkg}
                            checked={formData.package === pkg}
                            onChange={() => setFormData({ ...formData, package: pkg })}
                          />
                          <div className="package-emoji">{pkgInfo.emoji}</div>
                          <div className="package-price">{pkgInfo.price}</div>
                          <div className="package-name">{pkgInfo.name}</div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {formData.package === 'custom' && (
                  <div className="custom-package-fields" style={{ marginTop: 'var(--space-lg)' }}>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Custom Price (₱)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.customPrice || ''}
                          onChange={(e) => setFormData({ ...formData, customPrice: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">15-sec Videos</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.customVideos || ''}
                          onChange={(e) => setFormData({ ...formData, customVideos: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Main Videos</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.customMainVideos || ''}
                          onChange={(e) => setFormData({ ...formData, customMainVideos: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                          min="0"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Photos</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.customPhotos || ''}
                          onChange={(e) => setFormData({ ...formData, customPhotos: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Weekly 1-on-1 (mins)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.customMeetingMins || ''}
                          onChange={(e) => setFormData({ ...formData, customMeetingMins: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.customCAPI || false}
                          onChange={(e) => setFormData({ ...formData, customCAPI: e.target.checked })}
                        /> CAPI
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.customAdvancedCAPI || false}
                          onChange={(e) => setFormData({ ...formData, customAdvancedCAPI: e.target.checked })}
                        /> Advanced CAPI
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.customDailyAds || false}
                          onChange={(e) => setFormData({ ...formData, customDailyAds: e.target.checked })}
                        /> Daily Ads Monitoring
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.customUnlimitedSetup || false}
                          onChange={(e) => setFormData({ ...formData, customUnlimitedSetup: e.target.checked })}
                        /> Unlimited Ad Setup
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.customLookalike || false}
                          onChange={(e) => setFormData({ ...formData, customLookalike: e.target.checked })}
                        /> Lookalike Audiences
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.customPriority || false}
                          onChange={(e) => setFormData({ ...formData, customPriority: e.target.checked })}
                        /> Priority Handling
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Custom Features</label>
                      <textarea
                        className="form-textarea"
                        value={formData.customFeatures || ''}
                        onChange={(e) => setFormData({ ...formData, customFeatures: e.target.value })}
                        placeholder="List any additional custom features..."
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'payment' && (
              <div className={`tab-content ${activeTab === 'payment' ? 'active' : ''}`}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Payment Status</label>
                    <select
                      className="form-select"
                      value={formData.paymentStatus}
                      onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                      <option value="partial">Partial Payment</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Payment Schedule</label>
                    <select
                      className="form-select"
                      value={formData.paymentSchedule}
                      onChange={(e) => setFormData({ ...formData, paymentSchedule: e.target.value })}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="biweekly">Bi-Weekly</option>
                      <option value="onetime">One-Time</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Months with Client</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.monthsWithClient}
                      onChange={(e) => setFormData({ ...formData, monthsWithClient: parseInt(e.target.value) || 0 })}
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: 'var(--space-lg)' }}>
                  <label className="form-label" style={{ fontSize: '1rem', fontWeight: '600', marginBottom: 'var(--space-md)' }}>
                    Subscription Usage (Items Used)
                  </label>
                  <small style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-md)', display: 'block' }}>
                    Track how many items the client has already used from their subscription
                  </small>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">15-sec Videos Used</label>
                      <input
                        type="number"
                        className="form-input"
                        value={formData.videosUsed}
                        onChange={(e) => setFormData({ ...formData, videosUsed: parseInt(e.target.value) || 0 })}
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Main Videos Used</label>
                      <input
                        type="number"
                        className="form-input"
                        value={formData.mainVideosUsed}
                        onChange={(e) => setFormData({ ...formData, mainVideosUsed: parseInt(e.target.value) || 0 })}
                        min="0"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Photos Used</label>
                      <input
                        type="number"
                        className="form-input"
                        value={formData.photosUsed}
                        onChange={(e) => setFormData({ ...formData, photosUsed: parseInt(e.target.value) || 0 })}
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Meeting Minutes Used</label>
                      <input
                        type="number"
                        className="form-input"
                        value={formData.meetingMinutesUsed}
                        onChange={(e) => setFormData({ ...formData, meetingMinutesUsed: parseInt(e.target.value) || 0 })}
                        min="0"
                        placeholder="0"
                      />
                    </div>
                  </div>
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


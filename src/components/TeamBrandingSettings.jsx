import React, { useState, useEffect, useRef } from 'react';
import { getTeamBranding, updateTeamBranding, uploadBrandingImage } from '../services/teamBrandingService';
import { showToast } from '../utils/toast';

/**
 * Team Branding Settings Component
 * Allows admins to customize their team's public-facing property page
 */
export default function TeamBrandingSettings({ teamId, onClose }) {
    const [branding, setBranding] = useState({
        logo_url: '',
        team_display_name: '',
        tagline: 'Find Your Dream Home',
        subtitle: 'Browse our exclusive portfolio of premium properties.',
        hero_image_url: '',
        primary_color: '#10b981',
        contact_phone: '',
        contact_email: '',
        facebook_url: '',
        instagram_url: '',
        whatsapp_url: '',
        website_url: '',
        address: '',
        bio: '',
        stats: [],
        schedule_meeting_url: ''
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingHero, setUploadingHero] = useState(false);
    const [activePreviewTab, setActivePreviewTab] = useState('edit');

    const logoInputRef = useRef(null);
    const heroInputRef = useRef(null);

    useEffect(() => {
        loadBranding();
    }, [teamId]);

    async function loadBranding() {
        setLoading(true);
        const { data, error } = await getTeamBranding(teamId);
        if (!error && data) {
            setBranding(prev => ({ ...prev, ...data }));
        }
        setLoading(false);
    }

    async function handleSave() {
        setSaving(true);
        const { error } = await updateTeamBranding(teamId, branding);
        if (error) {
            showToast('Failed to save branding: ' + error.message, 'error');
        } else {
            showToast('Branding saved successfully!', 'success');
        }
        setSaving(false);
    }

    async function handleLogoUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file
        if (file.size > 5 * 1024 * 1024) {
            showToast('File too large. Max size is 5MB', 'error');
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            showToast('Invalid file type. Use JPG, PNG, GIF, or WebP', 'error');
            return;
        }

        setUploadingLogo(true);
        const { url, error } = await uploadBrandingImage(file, 'logo');
        if (error) {
            showToast('Upload failed: ' + (error.message || 'Unknown error'), 'error');
            console.error('Logo upload error:', error);
        } else {
            setBranding(prev => ({ ...prev, logo_url: url }));
            showToast('Logo uploaded!', 'success');
        }
        setUploadingLogo(false);
    }

    async function handleHeroUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingHero(true);
        const { url, error } = await uploadBrandingImage(file, 'hero');
        if (error) {
            showToast('Failed to upload hero image', 'error');
        } else {
            setBranding(prev => ({ ...prev, hero_image_url: url }));
            showToast('Hero image uploaded!', 'success');
        }
        setUploadingHero(false);
    }

    function handleChange(field, value) {
        setBranding(prev => ({ ...prev, [field]: value }));
    }

    function handleStatChange(index, field, value) {
        setBranding(prev => {
            const newStats = [...(prev.stats || [])];
            newStats[index] = { ...newStats[index], [field]: value };
            return { ...prev, stats: newStats };
        });
    }

    function addStat() {
        setBranding(prev => ({
            ...prev,
            stats: [...(prev.stats || []), { label: '', value: '' }]
        }));
    }

    function removeStat(index) {
        setBranding(prev => ({
            ...prev,
            stats: prev.stats.filter((_, i) => i !== index)
        }));
    }


    if (loading) {
        return (
            <div className="branding-settings-modal">
                <div className="modal-body" style={{ textAlign: 'center', padding: '3rem' }}>
                    Loading branding settings...
                </div>
            </div>
        );
    }

    // Sample highlights for preview
    const sampleHighlights = [
        { id: 1, name: 'Services', image: branding.logo_url || 'https://via.placeholder.com/64' },
        { id: 2, name: 'Portfolio', image: branding.hero_image_url || 'https://via.placeholder.com/64' },
        { id: 3, name: 'Contact', image: 'https://via.placeholder.com/64' },
    ];

    // Sample grid items for preview
    const sampleGridItems = [
        { id: 1, image: 'https://images.unsplash.com/photo-1600596542815-27bfef402399?w=300' },
        { id: 2, image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=300' },
        { id: 3, image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=300' },
        { id: 4, image: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=300' },
        { id: 5, image: 'https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=300' },
        { id: 6, image: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=300' },
    ];

    return (
        <div className="branding-settings-modal">
            <div className="modal-header">
                <h2>🎨 Company Profile Editor</h2>
                <button className="close-btn" onClick={onClose}>×</button>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-color, #333)',
                background: 'var(--bg-secondary, #1e1e2e)'
            }}>
                <button
                    onClick={() => setActivePreviewTab('edit')}
                    style={{
                        flex: 1,
                        padding: '12px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activePreviewTab === 'edit' ? '2px solid #6366f1' : '2px solid transparent',
                        color: activePreviewTab === 'edit' ? '#6366f1' : 'var(--text-secondary, #888)',
                        cursor: 'pointer',
                        fontWeight: activePreviewTab === 'edit' ? '600' : '400'
                    }}
                >
                    ✏️ Edit Profile
                </button>
                <button
                    onClick={() => setActivePreviewTab('preview')}
                    style={{
                        flex: 1,
                        padding: '12px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activePreviewTab === 'preview' ? '2px solid #6366f1' : '2px solid transparent',
                        color: activePreviewTab === 'preview' ? '#6366f1' : 'var(--text-secondary, #888)',
                        cursor: 'pointer',
                        fontWeight: activePreviewTab === 'preview' ? '600' : '400'
                    }}
                >
                    👁️ Live Preview
                </button>
            </div>

            {activePreviewTab === 'preview' ? (
                /* Instagram-Style Preview */
                <div style={{
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    background: '#fff',
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
                }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 16px',
                        borderBottom: '1px solid #dbdbdb',
                        background: '#fff'
                    }}>
                        <div style={{ fontSize: '20px', cursor: 'pointer' }}>⌘</div>
                        <div style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            {(branding.team_display_name || 'yourcompany').toLowerCase().replace(/\s+/g, '.')}
                            <span style={{
                                width: '16px',
                                height: '16px',
                                background: '#3897f0',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '9px',
                                color: '#fff'
                            }}>✓</span>
                        </div>
                        <div style={{ fontSize: '20px', cursor: 'pointer' }}>☰</div>
                    </div>

                    {/* Profile Section */}
                    <div style={{ padding: '16px' }}>
                        {/* Profile Header */}
                        <div style={{ display: 'flex', marginBottom: '20px' }}>
                            {/* Profile Picture */}
                            <div style={{
                                width: '77px',
                                height: '77px',
                                borderRadius: '50%',
                                padding: '3px',
                                background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                                marginRight: '28px',
                                flexShrink: 0
                            }}>
                                <div style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: '50%',
                                    border: '2px solid #fff',
                                    overflow: 'hidden'
                                }}>
                                    <img
                                        src={branding.logo_url || 'https://via.placeholder.com/77/10b981/fff?text=G'}
                                        alt="Logo"
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Stats */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '30px',
                                flex: 1
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#262626' }}>0</div>
                                    <div style={{ fontSize: '13px', color: '#8e8e8e' }}>properties</div>
                                </div>
                            </div>
                        </div>

                        {/* Profile Info */}
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{
                                fontSize: '14px',
                                fontWeight: '600',
                                color: '#262626',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                {branding.team_display_name || 'Your Company Name'}
                                <span style={{
                                    width: '14px',
                                    height: '14px',
                                    background: '#3897f0',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '8px',
                                    color: '#fff'
                                }}>✓</span>
                            </div>
                            <div style={{
                                fontSize: '14px',
                                lineHeight: '1.5',
                                color: '#262626',
                                marginTop: '4px',
                                whiteSpace: 'pre-line'
                            }}>
                                {branding.bio || '🏠 Find Your Dream Home\n📍 Serving Metro Manila\n💼 Premium Real Estate Services'}
                            </div>
                            {branding.website_url && (
                                <div style={{
                                    fontSize: '14px',
                                    color: '#00376b',
                                    marginTop: '4px',
                                    fontWeight: '600'
                                }}>
                                    {branding.website_url.replace(/^https?:\/\//, '')}
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            marginBottom: '20px'
                        }}>
                            <button style={{
                                flex: 1,
                                padding: '7px 16px',
                                background: '#0095f6',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: '600'
                            }}>
                                Schedule a Meeting
                            </button>
                            <button style={{
                                flex: 1,
                                padding: '7px 16px',
                                background: '#efefef',
                                color: '#000',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: '600'
                            }}>
                                Inquire
                            </button>
                            <button style={{
                                padding: '7px 12px',
                                background: '#efefef',
                                color: '#000',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: '600'
                            }}>
                                Contact
                            </button>
                        </div>

                        {/* Highlights */}
                        <div style={{
                            display: 'flex',
                            gap: '16px',
                            overflowX: 'auto',
                            paddingBottom: '8px',
                            marginBottom: '16px'
                        }}>
                            {sampleHighlights.map(highlight => (
                                <div key={highlight.id} style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    flexShrink: 0
                                }}>
                                    <div style={{
                                        width: '64px',
                                        height: '64px',
                                        borderRadius: '50%',
                                        padding: '2px',
                                        background: '#dbdbdb'
                                    }}>
                                        <div style={{
                                            width: '100%',
                                            height: '100%',
                                            borderRadius: '50%',
                                            border: '2px solid #fff',
                                            overflow: 'hidden'
                                        }}>
                                            <img
                                                src={highlight.image}
                                                alt={highlight.name}
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'cover'
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: '12px',
                                        color: '#262626',
                                        maxWidth: '64px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {highlight.name}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Section Label */}
                        <div style={{
                            padding: '12px 0',
                            borderTop: '1px solid #dbdbdb',
                            textAlign: 'center'
                        }}>
                            <span style={{
                                fontSize: '14px',
                                fontWeight: '600',
                                color: '#262626'
                            }}>
                                Properties
                            </span>
                        </div>

                        {/* Content Grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '3px',
                            marginTop: '4px'
                        }}>
                            {sampleGridItems.map(item => (
                                <div
                                    key={item.id}
                                    style={{
                                        aspectRatio: '1',
                                        background: '#f0f0f0',
                                        overflow: 'hidden'
                                    }}
                                >
                                    <img
                                        src={item.image}
                                        alt="Property"
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover'
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
            <div className="modal-body">
                {/* Logo Section */}
                <div className="settings-section">
                    <h3>🖼️ Logo & Brand Identity</h3>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Team Display Name</label>
                            <input
                                type="text"
                                value={branding.team_display_name || ''}
                                onChange={(e) => handleChange('team_display_name', e.target.value)}
                                placeholder="Your Team Name"
                            />
                        </div>
                        <div className="form-group">
                            <label>Primary Color</label>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input
                                    type="color"
                                    value={branding.primary_color}
                                    onChange={(e) => handleChange('primary_color', e.target.value)}
                                    style={{ width: '50px', height: '40px', cursor: 'pointer' }}
                                />
                                <input
                                    type="text"
                                    value={branding.primary_color}
                                    onChange={(e) => handleChange('primary_color', e.target.value)}
                                    style={{ flex: 1 }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Logo</label>
                        <div className="upload-area" onClick={() => logoInputRef.current?.click()}>
                            {branding.logo_url ? (
                                <img src={branding.logo_url} alt="Logo" style={{ maxHeight: '80px', objectFit: 'contain' }} />
                            ) : (
                                <span>{uploadingLogo ? 'Uploading...' : '📤 Click to upload logo'}</span>
                            )}
                        </div>
                        <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            style={{ display: 'none' }}
                        />
                    </div>
                </div>

                {/* Hero Section */}
                <div className="settings-section">
                    <h3>🏞️ Hero Banner</h3>

                    <div className="form-group">
                        <label>Tagline (Main Heading)</label>
                        <input
                            type="text"
                            value={branding.tagline}
                            onChange={(e) => handleChange('tagline', e.target.value)}
                            placeholder="Find Your Dream Home"
                        />
                    </div>

                    <div className="form-group">
                        <label>Subtitle</label>
                        <input
                            type="text"
                            value={branding.subtitle}
                            onChange={(e) => handleChange('subtitle', e.target.value)}
                            placeholder="Browse our exclusive portfolio..."
                        />
                    </div>

                    <div className="form-group">
                        <label>Hero Banner Image</label>
                        <div
                            className="upload-area hero-upload"
                            onClick={() => heroInputRef.current?.click()}
                            style={{
                                backgroundImage: branding.hero_image_url ? `url(${branding.hero_image_url})` : 'none',
                                backgroundSize: 'cover',
                                backgroundPosition: 'center'
                            }}
                        >
                            <span style={{
                                background: 'rgba(0,0,0,0.5)',
                                color: 'white',
                                padding: '0.5rem 1rem',
                                borderRadius: '8px'
                            }}>
                                {uploadingHero ? 'Uploading...' : '📤 Click to upload hero image'}
                            </span>
                        </div>
                        <input
                            ref={heroInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleHeroUpload}
                            style={{ display: 'none' }}
                        />
                    </div>
                </div>

                {/* Social Media Section */}
                <div className="settings-section">
                    <h3>📱 Social Media Links</h3>

                    <div className="form-row">
                        <div className="form-group">
                            <label>📘 Facebook Page URL</label>
                            <input
                                type="url"
                                value={branding.facebook_url || ''}
                                onChange={(e) => handleChange('facebook_url', e.target.value)}
                                placeholder="https://facebook.com/yourpage"
                            />
                        </div>
                        <div className="form-group">
                            <label>📸 Instagram URL</label>
                            <input
                                type="url"
                                value={branding.instagram_url || ''}
                                onChange={(e) => handleChange('instagram_url', e.target.value)}
                                placeholder="https://instagram.com/yourpage"
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>💬 WhatsApp Link</label>
                            <input
                                type="url"
                                value={branding.whatsapp_url || ''}
                                onChange={(e) => handleChange('whatsapp_url', e.target.value)}
                                placeholder="https://wa.me/639123456789"
                            />
                        </div>
                        <div className="form-group">
                            <label>🌐 Website URL</label>
                            <input
                                type="url"
                                value={branding.website_url || ''}
                                onChange={(e) => handleChange('website_url', e.target.value)}
                                placeholder="https://yourwebsite.com"
                            />
                        </div>
                    </div>
                </div>

                {/* About & Bio Section */}
                <div className="settings-section">
                    <h3>📖 Team Bio & Story</h3>
                    <div className="form-group">
                        <label>About the Team</label>
                        <textarea
                            value={branding.bio || ''}
                            onChange={(e) => handleChange('bio', e.target.value)}
                            placeholder="Tell your clients about your team, experience, and values..."
                            rows="4"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid var(--border-color, #444)',
                                borderRadius: '6px',
                                background: 'var(--bg-primary, #121220)',
                                color: 'var(--text-primary, #fff)',
                                fontSize: '14px',
                                resize: 'vertical'
                            }}
                        />
                    </div>
                </div>

                {/* Team Stats Section */}
                <div className="settings-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0 }}>📊 Performance Stats</h3>
                        <button className="btn btn-secondary btn-sm" onClick={addStat} style={{ padding: '4px 12px', fontSize: '12px' }}>
                            + Add Stat
                        </button>
                    </div>

                    {(branding.stats || []).map((stat, idx) => (
                        <div key={idx} className="form-row" style={{ marginBottom: '1rem', alignItems: 'flex-end' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Label</label>
                                <input
                                    type="text"
                                    value={stat.label}
                                    onChange={(e) => handleStatChange(idx, 'label', e.target.value)}
                                    placeholder="e.g. Properties Sold"
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Value</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        type="text"
                                        value={stat.value}
                                        onChange={(e) => handleStatChange(idx, 'value', e.target.value)}
                                        placeholder="e.g. 500+"
                                    />
                                    <button
                                        onClick={() => removeStat(idx)}
                                        style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', padding: '0 12px', cursor: 'pointer' }}
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {(!branding.stats || branding.stats.length === 0) && (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontStyle: 'italic' }}>No stats added yet.</p>
                    )}
                </div>


                {/* Contact Info Section */}
                <div className="settings-section">
                    <h3>📞 Contact Information</h3>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Phone Number</label>
                            <input
                                type="tel"
                                value={branding.contact_phone || ''}
                                onChange={(e) => handleChange('contact_phone', e.target.value)}
                                placeholder="+63 XXX XXX XXXX"
                            />
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input
                                type="email"
                                value={branding.contact_email || ''}
                                onChange={(e) => handleChange('contact_email', e.target.value)}
                                placeholder="contact@example.com"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Address</label>
                        <input
                            type="text"
                            value={branding.address || ''}
                            onChange={(e) => handleChange('address', e.target.value)}
                            placeholder="123 Main Street, City, Country"
                        />
                    </div>

                    <div className="form-group">
                        <label>Schedule Meeting URL (Calendly, Google Calendar, etc.)</label>
                        <input
                            type="url"
                            value={branding.schedule_meeting_url || ''}
                            onChange={(e) => handleChange('schedule_meeting_url', e.target.value)}
                            placeholder="https://calendly.com/yourname"
                        />
                    </div>
                </div>
            </div>
            )}

            <div className="modal-footer">
                <button className="btn btn-secondary" onClick={onClose}>
                    Cancel
                </button>
                <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : '💾 Save Branding'}
                </button>
            </div>

            <style jsx>{`
                .branding-settings-modal {
                    background: var(--bg-secondary, #1e1e2e);
                    border-radius: 12px;
                    width: 100%;
                    max-width: 700px;
                    max-height: 90vh;
                    overflow-y: auto;
                    color: var(--text-primary, #fff);
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px;
                    border-bottom: 1px solid var(--border-color, #333);
                    position: sticky;
                    top: 0;
                    background: var(--bg-secondary, #1e1e2e);
                    z-index: 10;
                }

                .modal-header h2 {
                    margin: 0;
                    font-size: 1.5rem;
                }

                .close-btn {
                    background: none;
                    border: none;
                    color: var(--text-secondary, #888);
                    font-size: 1.5rem;
                    cursor: pointer;
                }

                .modal-body {
                    padding: 20px;
                }

                .settings-section {
                    margin-bottom: 24px;
                    padding: 16px;
                    background: var(--bg-tertiary, #2a2a3e);
                    border-radius: 8px;
                }

                .settings-section h3 {
                    margin: 0 0 16px 0;
                    font-size: 1.1rem;
                    color: var(--text-primary, #fff);
                }

                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                }

                @media (max-width: 600px) {
                    .form-row {
                        grid-template-columns: 1fr;
                    }
                }

                .form-group {
                    margin-bottom: 16px;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 6px;
                    font-weight: 500;
                    color: var(--text-secondary, #aaa);
                    font-size: 0.875rem;
                }

                .form-group input {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid var(--border-color, #444);
                    border-radius: 6px;
                    background: var(--bg-primary, #121220);
                    color: var(--text-primary, #fff);
                    font-size: 14px;
                }

                .upload-area {
                    border: 2px dashed var(--border-color, #444);
                    border-radius: 8px;
                    padding: 2rem;
                    text-align: center;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100px;
                }

                .upload-area:hover {
                    border-color: var(--primary, #6366f1);
                    background: rgba(99, 102, 241, 0.05);
                }

                .hero-upload {
                    min-height: 150px;
                }

                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    padding: 20px;
                    border-top: 1px solid var(--border-color, #333);
                    position: sticky;
                    bottom: 0;
                    background: var(--bg-secondary, #1e1e2e);
                }

                .btn {
                    padding: 10px 20px;
                    border-radius: 6px;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                    transition: all 0.2s;
                }

                .btn-secondary {
                    background: var(--bg-tertiary, #333);
                    color: var(--text-primary, #fff);
                }

                .btn-primary {
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                }

                .btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
}

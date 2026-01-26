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
        website_url: '',
        address: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingHero, setUploadingHero] = useState(false);

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

        setUploadingLogo(true);
        const { url, error } = await uploadBrandingImage(file, 'logo');
        if (error) {
            showToast('Failed to upload logo', 'error');
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

    if (loading) {
        return (
            <div className="branding-settings-modal">
                <div className="modal-body" style={{ textAlign: 'center', padding: '3rem' }}>
                    Loading branding settings...
                </div>
            </div>
        );
    }

    return (
        <div className="branding-settings-modal">
            <div className="modal-header">
                <h2>🎨 Team Branding Settings</h2>
                <button className="close-btn" onClick={onClose}>×</button>
            </div>

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
                </div>
            </div>

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

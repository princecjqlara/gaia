import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';
import PropertyPreview from './PropertyPreview';
import TeamBrandingSettings from './TeamBrandingSettings';
import { getTeamBranding } from '../services/teamBrandingService';


import PropertyMediaShowcase from './PropertyMediaShowcase';

const PropertyManagement = ({ teamId, organizationId }) => {
    const [view, setView] = useState('list'); // 'list' or 'form'
    const [showPreview, setShowPreview] = useState(false);
    const [showBrandingSettings, setShowBrandingSettings] = useState(false);
    const [previewProperty, setPreviewProperty] = useState(null);
    const [branding, setBranding] = useState(null);
    const [properties, setProperties] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('');
    const [stats, setStats] = useState({ totalViews: 0, topProperties: [], recentViews: [] });


    const loadStats = async () => {
        try {
            const supabase = getSupabaseClient();
            if (!supabase) return;

            const { data: views, error } = await supabase
                .from('property_views')
                .select('*')
                .order('viewed_at', { ascending: false });

            if (error) throw error;

            const totalViews = views.length;
            const recentViews = views.slice(0, 5); // Last 5 views

            // Group by property
            const viewMap = {};
            views.forEach(v => {
                if (!viewMap[v.property_id]) {
                    viewMap[v.property_id] = {
                        id: v.property_id,
                        title: v.property_title || 'Unknown Property',
                        count: 0
                    };
                }
                viewMap[v.property_id].count++;
            });

            const topProperties = Object.values(viewMap)
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            setStats({ totalViews, topProperties, recentViews });
        } catch (err) {
            console.error('Error loading stats:', err);
        }
    };

    useEffect(() => {
        if (view === 'analytics') {
            loadStats();
        }
    }, [view]);

    // Form State
    const initialFormState = {
        title: '',
        type: 'House & Lot',
        status: 'For Sale',
        address: '',
        description: '',

        // Specifications
        bedrooms: 0,
        bathrooms: 0,
        garage: 0,
        floorArea: 0,
        lotArea: 0,
        yearBuilt: new Date().getFullYear(),

        // Financials
        price: 0,
        downPayment: 0,
        monthlyAmortization: 0,
        paymentTerms: '',

        // Images & Videos
        images: [], // Array of strings (urls)
        videos: [], // Array of strings (urls)

        // Primary media (first in showcase)
        primaryMediaUrl: '',
        primaryMediaType: '',

        // Personalization
        is_featured: false,
        label: '' // e.g. "Price Drop", "Just Listed"
    };


    const [formData, setFormData] = useState(initialFormState);

    // Load properties from Supabase on mount
    useEffect(() => {
        loadProperties();
    }, []);

    async function loadProperties() {
        try {
            const supabase = getSupabaseClient();
            if (!supabase) return;

            const { data, error } = await supabase
                .from('properties')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Map snake_case to camelCase for internal use
            const mappedProperties = (data || []).map(p => ({
                ...p,
                floorArea: p.floor_area,
                lotArea: p.lot_area,
                yearBuilt: p.year_built,
                downPayment: p.down_payment,
                monthlyAmortization: p.monthly_amortization,
                paymentTerms: p.payment_terms,
                is_featured: p.is_featured,
                createdAt: p.created_at,
                primaryMediaUrl: p.primary_media_url,
                primaryMediaType: p.primary_media_type
            }));

            setProperties(mappedProperties);
        } catch (err) {
            console.error('Error loading properties:', err);
        }
    }

    // Load branding on mount
    useEffect(() => {
        if (teamId) {
            loadBranding();
        }
    }, [teamId]);

    async function loadBranding() {
        const { data } = await getTeamBranding(teamId);
        if (data) setBranding(data);
    }

    if (showPreview) {
        return (
            <PropertyPreview
                properties={properties}
                onClose={() => setShowPreview(false)}
                branding={branding}
                teamId={teamId}
                organizationId={organizationId}
            />
        );
    }

    if (showBrandingSettings) {
        return (
            <div className="modal-overlay active">
                <TeamBrandingSettings
                    teamId={teamId}
                    onClose={() => {
                        setShowBrandingSettings(false);
                        loadBranding(); // Reload branding after edit
                    }}
                />
            </div>
        );
    }


    const handleSave = async () => {
        // Basic validation
        if (!formData.title) return alert('Property Title is required');

        setLoading(true);
        try {
            const supabase = getSupabaseClient();

            // Map camelCase to snake_case
            const propertyData = {
                title: formData.title,
                type: formData.type,
                status: formData.status,
                address: formData.address,
                description: formData.description,
                bedrooms: formData.bedrooms,
                bathrooms: formData.bathrooms,
                garage: formData.garage,
                floor_area: formData.floorArea,
                lot_area: formData.lotArea,
                year_built: formData.yearBuilt,
                price: formData.price,
                down_payment: formData.downPayment,
                monthly_amortization: formData.monthlyAmortization,
                payment_terms: formData.paymentTerms,
                images: formData.images,
                videos: formData.videos,
                primary_media_url: formData.primaryMediaUrl || null,
                primary_media_type: formData.primaryMediaType || null,
                is_featured: formData.is_featured,
                created_at: editingId ? undefined : new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data, error } = await supabase
                .from('properties')
                .upsert({
                    id: editingId || undefined,
                    ...propertyData
                })
                .select()
                .single();

            if (error) throw error;

            await loadProperties();
            setView('list');
            setFormData(initialFormState);
            setEditingId(null);
            alert(editingId ? 'Property updated!' : 'Property listed successfully!');
        } catch (err) {
            console.error('Error saving property:', err);
            alert('Failed to save property: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (property) => {
        setFormData({
            ...initialFormState,
            ...property,
            primaryMediaUrl: property.primaryMediaUrl || property.primary_media_url || '',
            primaryMediaType: property.primaryMediaType || property.primary_media_type || ''
        });
        setEditingId(property.id);
        setView('form');
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this property?')) return;

        try {
            const supabase = getSupabaseClient();
            const { error } = await supabase
                .from('properties')
                .delete()
                .eq('id', id);

            if (error) throw error;

            await loadProperties();
        } catch (err) {
            console.error('Error deleting property:', err);
            alert('Failed to delete property');
        }
    };

    const handleMediaUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // Use signed uploads (no preset required)

        setLoading(true);
        const newImages = [];
        const newVideos = [];

        try {
            const getSignedUpload = async () => {
                const response = await fetch('/api/webhook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'cloudinary_sign',
                        folder: 'properties'
                    })
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(data.error || 'Signed upload not available');
                }
                if (!data.signature || !data.timestamp || !data.apiKey || !data.cloudName) {
                    throw new Error('Signed upload response incomplete');
                }
                return data;
            };

            const uploadFileSigned = async (file, signed) => {
                const isVideo = file.type.startsWith('video/');
                const data = new FormData();
                data.append('file', file);
                data.append('api_key', signed.apiKey);
                data.append('timestamp', signed.timestamp);
                data.append('signature', signed.signature);
                if (signed.folder) data.append('folder', signed.folder);
                data.append('resource_type', 'auto');

                const res = await fetch(
                    `https://api.cloudinary.com/v1_1/${signed.cloudName}/${isVideo ? 'video' : 'image'}/upload`,
                    {
                        method: 'POST',
                        body: data,
                    }
                );
                const fileData = await res.json();

                return {
                    secureUrl: fileData.secure_url || null,
                    isVideo,
                    errorMessage: fileData?.error?.message || (!res.ok ? 'Upload failed' : null)
                };
            };

            for (const file of files) {
                let result = null;
                try {
                    const signed = await getSignedUpload();
                    result = await uploadFileSigned(file, signed);
                } catch (err) {
                    result = {
                        secureUrl: null,
                        isVideo: file.type.startsWith('video/'),
                        errorMessage: err?.message || 'Signed upload not available'
                    };
                }

                if (result.secureUrl) {
                    if (result.isVideo) {
                        newVideos.push(result.secureUrl);
                    } else {
                        newImages.push(result.secureUrl);
                    }
                } else {
                    const message = result.errorMessage || 'Unknown error';
                    console.error('Upload error', message);
                    alert(`Upload failed: ${message}. Ensure /api/webhook is reachable and Cloudinary API keys are set.`);
                }
            }

            setFormData(prev => {
                const nextImages = [...prev.images, ...newImages];
                const nextVideos = [...(prev.videos || []), ...newVideos];

                let nextPrimaryUrl = prev.primaryMediaUrl;
                let nextPrimaryType = prev.primaryMediaType;

                if (!nextPrimaryUrl) {
                    if (nextImages.length > 0) {
                        nextPrimaryUrl = nextImages[0];
                        nextPrimaryType = 'image';
                    } else if (nextVideos.length > 0) {
                        nextPrimaryUrl = nextVideos[0];
                        nextPrimaryType = 'video';
                    }
                }

                return {
                    ...prev,
                    images: nextImages,
                    videos: nextVideos,
                    primaryMediaUrl: nextPrimaryUrl,
                    primaryMediaType: nextPrimaryType
                };
            });
        } catch (err) {
            console.error('Error uploading media:', err);
            alert('Failed to upload media');
        } finally {
            setLoading(false);
        }
    };

    const removeImage = (index) => {
        setFormData(prev => {
            const removedUrl = prev.images[index];
            const nextImages = prev.images.filter((_, i) => i !== index);
            let nextPrimaryUrl = prev.primaryMediaUrl;
            let nextPrimaryType = prev.primaryMediaType;

            if (removedUrl && removedUrl === prev.primaryMediaUrl) {
                if (nextImages.length > 0) {
                    nextPrimaryUrl = nextImages[0];
                    nextPrimaryType = 'image';
                } else if ((prev.videos || []).length > 0) {
                    nextPrimaryUrl = prev.videos[0];
                    nextPrimaryType = 'video';
                } else {
                    nextPrimaryUrl = '';
                    nextPrimaryType = '';
                }
            }

            return {
                ...prev,
                images: nextImages,
                primaryMediaUrl: nextPrimaryUrl,
                primaryMediaType: nextPrimaryType
            };
        });
    };

    const removeVideo = (index) => {
        setFormData(prev => {
            const removedUrl = (prev.videos || [])[index];
            const nextVideos = (prev.videos || []).filter((_, i) => i !== index);
            let nextPrimaryUrl = prev.primaryMediaUrl;
            let nextPrimaryType = prev.primaryMediaType;

            if (removedUrl && removedUrl === prev.primaryMediaUrl) {
                if (nextVideos.length > 0) {
                    nextPrimaryUrl = nextVideos[0];
                    nextPrimaryType = 'video';
                } else if (prev.images.length > 0) {
                    nextPrimaryUrl = prev.images[0];
                    nextPrimaryType = 'image';
                } else {
                    nextPrimaryUrl = '';
                    nextPrimaryType = '';
                }
            }

            return {
                ...prev,
                videos: nextVideos,
                primaryMediaUrl: nextPrimaryUrl,
                primaryMediaType: nextPrimaryType
            };
        });
    };

    const generateMockData = async () => {
        const mockProperties = [
            {
                title: 'Modern Luxury Villa in Forbes Park',
                type: 'House & Lot',
                status: 'For Sale',
                address: 'Forbes Park, Makati City',
                description: 'Experience the epitome of luxury living in this stunning modern villa located in the exclusive Forbes Park. Featuring floor-to-ceiling windows, a private pool, and a lush garden sanctuary.',
                bedrooms: 5,
                bathrooms: 6,
                garage: 4,
                floor_area: 850,
                lot_area: 1200,
                year_built: 2024,
                price: 450000000,
                down_payment: 90000000,
                monthly_amortization: 2500000,
                payment_terms: 'Cash or Bank Financing',
                images: [
                    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=1000',
                    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=1000',
                    'https://images.unsplash.com/photo-1600596542815-27bfef402399?q=80&w=1000'
                ]
            },
            {
                title: 'High-Rise Condo with BGC Skyline View',
                type: 'Condominium',
                status: 'For Rent',
                address: 'Bonifacio Global City, Taguig',
                description: 'Premium corner unit with breathtaking views of the city skyline. Fully furnished with high-end appliances and Italian furniture.',
                bedrooms: 2,
                bathrooms: 2,
                garage: 1,
                floor_area: 95,
                lot_area: 0,
                year_built: 2022,
                price: 180000,
                down_payment: 36000,
                monthly_amortization: 180000,
                payment_terms: '2 months advance, 2 months deposit',
                images: [
                    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=1000',
                    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=1000'
                ]
            },
            {
                title: 'Spacious Townhouse in Quezon City',
                type: 'Townhouse',
                status: 'For Sale',
                address: 'Scout Area, Quezon City',
                description: 'Brand new 3-storey townhouse perfect for growing families. Gated community with 24/7 security.',
                bedrooms: 4,
                bathrooms: 4,
                garage: 2,
                floor_area: 280,
                lot_area: 100,
                year_built: 2025,
                price: 35000000,
                down_payment: 7000000,
                monthly_amortization: 180000,
                payment_terms: '20% DP, 80% Bank Financing',
                images: [
                    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1000',
                    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=1000'
                ]
            }
        ];

        try {
            const supabase = getSupabaseClient();
            setLoading(true);
            const { error } = await supabase
                .from('properties')
                .insert(mockProperties);

            if (error) throw error;

            await loadProperties();
            alert('Mock data loaded successfully!');
        } catch (err) {
            console.error("Error loading mock data", err);
            alert("Failed to load mock data");
        } finally {
            setLoading(false);
        }
    };

    // Render List View
    if (view === 'list') {
        return (
            <div style={{ padding: '0 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Properties</h3>
                        <p style={{ color: 'var(--text-muted)' }}>Manage your real estate listings</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => setShowBrandingSettings(true)}
                            style={{
                                background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
                                color: 'white',
                                border: 'none',
                                padding: '0.75rem 1.5rem',
                                borderRadius: '9999px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            🎨 Branding
                        </button>
                        <button
                            onClick={() => setView('analytics')}
                            style={{
                                background: view === 'analytics' ? '#111827' : 'white',
                                color: view === 'analytics' ? 'white' : '#374151',
                                border: '1px solid #e5e7eb',
                                padding: '0.75rem 1.5rem',
                                borderRadius: '9999px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            📊 Analytics
                        </button>
                        <button
                            onClick={() => {
                                // Open the team's Instagram-style profile page in a new tab
                                if (!teamId) {
                                    alert('Error: Team ID not found. Please refresh the page.');
                                    return;
                                }
                                const profileUrl = `${window.location.origin}/${teamId}`;
                                console.log('Opening profile URL:', profileUrl);
                                const newWindow = window.open(profileUrl, '_blank');
                                if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
                                    // Popup blocked, try same tab
                                    window.location.href = profileUrl;
                                }
                            }}
                            style={{
                                background: '#111827',
                                color: 'white',
                                border: 'none',
                                padding: '0.75rem 1.5rem',
                                borderRadius: '9999px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                            }}
                        >
                            👁️ Preview Site
                        </button>
                        <button
                            onClick={() => {
                                setFormData(initialFormState);
                                setEditingId(null);
                                setView('form');
                            }}
                            style={{
                                background: '#10b981', // Emerald 500
                                color: 'white',
                                border: 'none',
                                padding: '0.75rem 1.5rem',
                                borderRadius: '9999px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            + List Property
                        </button>
                    </div>
                </div>

                <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
                        <input
                            type="text"
                            placeholder="Search properties by location or title..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '1rem 1rem 1rem 3rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                fontSize: '1rem',
                                outline: 'none'
                            }}
                        />
                    </div>
                    {properties.length === 0 && (
                        <button
                            onClick={generateMockData}
                            style={{
                                padding: '0 1.5rem',
                                background: 'var(--bg-secondary)',
                                border: '1px dashed var(--border-color)',
                                borderRadius: '8px',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            🎲 Load Demo Data
                        </button>
                    )}
                </div>

                {properties.length === 0 ? (
                    <div style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: '16px',
                        padding: '4rem 2rem',
                        textAlign: 'center',
                        border: '2px dashed var(--border-color)'
                    }}>
                        <div style={{
                            width: '64px',
                            height: '64px',
                            background: 'rgba(16, 185, 129, 0.1)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.5rem',
                            fontSize: '2rem'
                        }}>
                            🏢
                        </div>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>No properties listed</h4>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Get started by adding your first property listing.</p>
                        <button
                            onClick={() => setView('form')}
                            style={{
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                padding: '0.75rem 2rem',
                                borderRadius: '9999px',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            List Property
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                        {properties.filter(p => p.title.toLowerCase().includes(filter.toLowerCase())).map(property => (
                            <div key={property.id} style={{
                                background: 'var(--bg-secondary)',
                                borderRadius: '12px',
                                overflow: 'hidden',
                                border: '1px solid var(--border-color)',
                                transition: 'transform 0.2s',
                                cursor: 'pointer'
                            }}
                                onClick={() => handleEdit(property)}
                            >
                                <div style={{
                                    height: '200px',
                                    background: '#f3f4f6',
                                    backgroundImage: (property.primaryMediaUrl || property.primary_media_url || property.images[0])
                                        ? `url(${property.primaryMediaUrl || property.primary_media_url || property.images[0]})`
                                        : 'none',
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'relative'
                                }}>
                                {!property.images[0] && <span style={{ fontSize: '2rem' }}>🏠</span>}
                                    {/* Preview Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setPreviewProperty(property);
                                        }}
                                        title="Preview Property"
                                        style={{
                                            position: 'absolute',
                                            top: '0.5rem',
                                            left: '0.5rem',
                                            background: 'rgba(16, 185, 129, 0.9)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '32px',
                                            height: '32px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            opacity: 0.9,
                                            transition: 'opacity 0.2s',
                                            zIndex: 2
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.9'}
                                    >
                                        👁️
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(property.id);
                                        }}
                                        title="Delete Property"
                                        style={{
                                            position: 'absolute',
                                            top: '0.5rem',
                                            right: '0.5rem',
                                            background: 'rgba(239, 68, 68, 0.9)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '28px',
                                            height: '28px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            opacity: 0.9,
                                            transition: 'opacity 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.9'}
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div style={{ padding: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            background: property.status === 'For Sale' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                            color: property.status === 'For Sale' ? '#059669' : '#2563eb',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontWeight: '600'
                                        }}>
                                            {property.status}
                                        </span>
                                        <span style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--primary)' }}>₱ {parseFloat(property.price).toLocaleString()}</span>
                                    </div>
                                    <h4 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{property.title}</h4>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        📍 {property.address}
                                    </p>

                                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                        <span>🛏️ {property.bedrooms} Beds</span>
                                        <span>🚿 {property.bathrooms} Baths</span>
                                        <span>📐 {property.floorArea} sqm</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (view === 'analytics') {
        return (
            <div style={{ padding: '0 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Analytics Dashboard</h3>
                        <p style={{ color: 'var(--text-muted)' }}>Overview of your property performance</p>
                    </div>
                    <button
                        onClick={() => setView('list')}
                        style={{
                            background: 'white',
                            color: '#374151',
                            border: '1px solid #e5e7eb',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '9999px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        ← Back to List
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                    <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Total Property Views</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#10b981' }}>{stats.totalViews}</div>
                    </div>
                    <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Listed Properties</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#3b82f6' }}>{properties.length}</div>
                    </div>
                    <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Top Performer</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {stats.topProperties[0]?.title || 'N/A'}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#10b981' }}>{stats.topProperties[0]?.count || 0} views</div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '2rem' }}>
                    <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                        <h4 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>Most Viewed Properties</h4>
                        {stats.topProperties.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No data available yet</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {stats.topProperties.map((p, idx) => (
                                    <div key={idx} style={{ paddingBottom: '1rem', borderBottom: idx < stats.topProperties.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ fontWeight: '600' }}>{idx + 1}. {p.title}</span>
                                            <span style={{ fontWeight: 'bold' }}>{p.count} views</span>
                                        </div>
                                        <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${(p.count / stats.topProperties[0].count) * 100}%`,
                                                background: '#10b981',
                                                borderRadius: '4px'
                                            }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                        <h4 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>Recent Activity</h4>
                        {stats.recentViews.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No recent views</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {stats.recentViews.map((v, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }}></div>
                                        <div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>Property Viewed</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{v.property_title || 'Unknown Property'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{new Date(v.viewed_at).toLocaleString()}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Render Form View
    return (
        <div style={{ padding: '0 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{editingId ? 'Edit Property' : 'List New Property'}</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Add a new property to your portfolio</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={() => setView('list')}
                        style={{
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-color)',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '9999px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        style={{
                            background: '#86efac', // Light green
                            color: '#064e3b',
                            border: 'none',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '9999px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                    >
                        {editingId ? 'Save Changes' : 'List Property'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '2rem' }}>
                {/* Left Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* Property Details */}
                    <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>🏠</div>
                            <h4 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)' }}>Property Details</h4>
                        </div>

                        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', background: 'rgba(16, 185, 129, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                            <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input
                                    type="checkbox"
                                    id="is_featured"
                                    checked={formData.is_featured}
                                    onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                                <label htmlFor="is_featured" style={{ cursor: 'pointer', fontWeight: '600', color: 'var(--text-primary)' }}>⭐ Featured Listing</label>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.label || ''}
                                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                    placeholder="Custom Label (e.g. Just Listed, Price Drop)"
                                    style={{ padding: '0.5rem 0.75rem' }}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Property Title</label>

                            <input
                                type="text"
                                className="form-input"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="e.g. Modern 3-Bedroom Villa in Makati"
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label className="form-label">Property Type</label>
                                <select
                                    className="form-input"
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                >
                                    <option>House & Lot</option>
                                    <option>Condominium</option>
                                    <option>Townhouse</option>
                                    <option>Lot Only</option>
                                    <option>Commercial</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select
                                    className="form-input"
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                >
                                    <option>For Sale</option>
                                    <option>For Rent</option>
                                    <option>Pre-selling</option>
                                    <option>Sold</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Address / Location</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                placeholder="e.g. 123 Leviste St, Salcedo Village, Makati"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea
                                className="form-input"
                                rows="4"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Describe the property features, amenities, etc..."
                            />
                        </div>
                    </div>

                    {/* Specifications */}
                    <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>📏</div>
                            <h4 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)' }}>Specifications</h4>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label className="form-label">Bedrooms</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.bedrooms}
                                    onChange={(e) => setFormData({ ...formData, bedrooms: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Bathrooms</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.bathrooms}
                                    onChange={(e) => setFormData({ ...formData, bathrooms: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Garage</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.garage}
                                    onChange={(e) => setFormData({ ...formData, garage: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Floor Area (sqm)</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.floorArea}
                                    onChange={(e) => setFormData({ ...formData, floorArea: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Lot Area (sqm)</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.lotArea}
                                    onChange={(e) => setFormData({ ...formData, lotArea: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Year Built</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.yearBuilt}
                                    onChange={(e) => setFormData({ ...formData, yearBuilt: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* Financials */}
                    <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>💵</div>
                            <h4 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)' }}>Financials</h4>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Selling Price</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold' }}>₱</span>
                                <input
                                    type="number"
                                    className="form-input"
                                    style={{ paddingLeft: '2.5rem' }}
                                    value={formData.price}
                                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Down Payment</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold' }}>₱</span>
                                <input
                                    type="number"
                                    className="form-input"
                                    style={{ paddingLeft: '2.5rem' }}
                                    value={formData.downPayment}
                                    onChange={(e) => setFormData({ ...formData, downPayment: parseFloat(e.target.value) || 0 })}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Monthly Amortization (Est.)</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold' }}>₱</span>
                                <input
                                    type="number"
                                    className="form-input"
                                    style={{ paddingLeft: '2.5rem' }}
                                    value={formData.monthlyAmortization}
                                    onChange={(e) => setFormData({ ...formData, monthlyAmortization: parseFloat(e.target.value) || 0 })}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Payment Terms</label>
                            <textarea
                                className="form-input"
                                rows="3"
                                value={formData.paymentTerms}
                                onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                                placeholder="e.g. 20% DP payable in 12 months, 80% Bank Financing"
                            />
                        </div>
                    </div>

                    {/* Media Section (Images & Videos) */}
                    <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '1.5rem', gridColumn: '1 / -1' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--text-primary)' }}>Media Gallery</h4>

                        {/* Images */}
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Photos</label>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.5rem' }}>
                                {formData.images.map((url, idx) => (
                                    <div key={idx} style={{ position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden' }}>
                                        <img src={url} alt={`Upload ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        {formData.primaryMediaUrl === url && (
                                            <span style={{
                                                position: 'absolute',
                                                left: '6px',
                                                top: '6px',
                                                background: 'rgba(16,185,129,0.9)',
                                                color: '#fff',
                                                fontSize: '10px',
                                                fontWeight: '700',
                                                padding: '2px 6px',
                                                borderRadius: '999px'
                                            }}>
                                                First
                                            </span>
                                        )}
                                        <button
                                            onClick={() => removeImage(idx)}
                                            style={{
                                                position: 'absolute', top: '4px', right: '4px',
                                                background: 'rgba(0,0,0,0.5)', color: 'white',
                                                border: 'none', borderRadius: '50%',
                                                width: '20px', height: '20px', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '12px'
                                            }}
                                        >
                                            ✕
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                primaryMediaUrl: url,
                                                primaryMediaType: 'image'
                                            }))}
                                            style={{
                                                position: 'absolute',
                                                left: '4px',
                                                bottom: '4px',
                                                background: 'rgba(0,0,0,0.6)',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '999px',
                                                padding: '4px 6px',
                                                fontSize: '10px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Set first
                                        </button>
                                    </div>
                                ))}
                                <label style={{
                                    aspectRatio: '1',
                                    border: '2px dashed var(--border-color)',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    background: 'var(--bg-primary)'
                                }}>
                                    <input type="file" multiple accept="image/*" onChange={handleMediaUpload} style={{ display: 'none' }} />
                                    <span style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>📸</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Add Photos</span>
                                </label>
                            </div>
                        </div>

                        {/* Videos */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Videos</label>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem' }}>
                                {formData.videos && formData.videos.map((url, idx) => (
                                    <div key={idx} style={{ position: 'relative', background: '#000', borderRadius: '8px', overflow: 'hidden', aspectRatio: '16/9' }}>
                                        <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        {formData.primaryMediaUrl === url && (
                                            <span style={{
                                                position: 'absolute',
                                                left: '6px',
                                                top: '6px',
                                                background: 'rgba(16,185,129,0.9)',
                                                color: '#fff',
                                                fontSize: '10px',
                                                fontWeight: '700',
                                                padding: '2px 6px',
                                                borderRadius: '999px'
                                            }}>
                                                First
                                            </span>
                                        )}
                                        <button
                                            onClick={() => removeVideo(idx)}
                                            style={{
                                                position: 'absolute', top: '4px', right: '4px',
                                                background: 'rgba(0,0,0,0.5)', color: 'white',
                                                border: 'none', borderRadius: '50%',
                                                width: '24px', height: '24px', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                zIndex: 10
                                            }}
                                        >
                                            ×
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                primaryMediaUrl: url,
                                                primaryMediaType: 'video'
                                            }))}
                                            style={{
                                                position: 'absolute',
                                                left: '4px',
                                                bottom: '4px',
                                                background: 'rgba(0,0,0,0.6)',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '999px',
                                                padding: '4px 6px',
                                                fontSize: '10px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Set first
                                        </button>
                                        <div style={{
                                            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
                                        }}>
                                            <span style={{ fontSize: '1.5rem', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>▶️</span>
                                        </div>
                                    </div>
                                ))}
                                <label style={{
                                    aspectRatio: '16/9',
                                    border: '2px dashed var(--border-color)',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    background: 'var(--bg-primary)'
                                }}>
                                    <input type="file" multiple accept="video/*" onChange={handleMediaUpload} style={{ display: 'none' }} />
                                    <span style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🎥</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Add Video</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Advanced Personalization */}
                    <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6' }}>✨</div>
                            <h4 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)' }}>Advanced Personalization</h4>
                        </div>

                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', cursor: 'pointer' }} onClick={() => setFormData({ ...formData, is_featured: !formData.is_featured })}>
                            <div style={{
                                width: '40px',
                                height: '24px',
                                background: formData.is_featured ? '#10b981' : '#444',
                                borderRadius: '12px',
                                position: 'relative',
                                transition: 'all 0.3s ease'
                            }}>
                                <div style={{
                                    width: '18px',
                                    height: '18px',
                                    background: 'white',
                                    borderRadius: '50%',
                                    position: 'absolute',
                                    top: '3px',
                                    left: formData.is_featured ? '19px' : '3px',
                                    transition: 'all 0.3s ease'
                                }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Featured Listing</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Show in the featured carousel on preview</div>
                            </div>
                        </div>

                        <div className="form-group" style={{ marginTop: '1rem' }}>
                            <label className="form-label">Custom Label</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.label || ''}
                                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                placeholder="e.g. Just Listed, Price Drop, New"
                            />
                        </div>
                    </div>

                    {editingId && (

                        <button
                            onClick={() => handleDelete(editingId)}
                            style={{
                                width: '100%',
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                border: 'none',
                                padding: '1rem',
                                borderRadius: '8px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                marginTop: '1rem'
                            }}
                        >
                            Delete Property
                        </button>
                    )}

                </div>
            </div>

            {/* Single Property Preview Modal */}
            {previewProperty && (
                <PropertyMediaShowcase
                    properties={[previewProperty]}
                    branding={branding}
                    initialPropertyIndex={0}
                    onClose={() => setPreviewProperty(null)}
                    teamId={teamId}
                    organizationId={organizationId}
                />
            )}
        </div>
    );
};

export default PropertyManagement;

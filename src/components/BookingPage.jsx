import React, { useState, useEffect } from 'react';

/**
 * Public Booking Page
 * Accessed via /book/:pageId?psid=xxx&name=xxx
 */
const BookingPage = () => {
    // Get URL params
    const urlParams = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split('/');
    const pageId = pathParts[pathParts.indexOf('book') + 1];
    const psid = urlParams.get('psid');
    const contactName = urlParams.get('name') || '';

    // State
    const [settings, setSettings] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedTime, setSelectedTime] = useState(null);
    const [availableSlots, setAvailableSlots] = useState([]);
    const [formData, setFormData] = useState({
        name: decodeURIComponent(contactName),
        email: '',
        phone: '',
        notes: ''
    });
    const [customFormData, setCustomFormData] = useState({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Load booking settings
    useEffect(() => {
        loadSettings();
    }, [pageId]);

    // Load available slots when date changes
    useEffect(() => {
        if (selectedDate && pageId) {
            loadAvailableSlots(selectedDate);
        }
    }, [selectedDate, pageId]);

    const loadSettings = async () => {
        try {
            const response = await fetch(`/api/booking/settings?pageId=${pageId}`);
            if (!response.ok) throw new Error('Failed to load booking settings');
            const data = await response.json();
            setSettings(data);

            // Initialize custom form data
            if (data.custom_form && Array.isArray(data.custom_form)) {
                const initialCustomData = {};
                data.custom_form.forEach(field => {
                    initialCustomData[field.name] = '';
                });
                setCustomFormData(initialCustomData);
            }
        } catch (err) {
            setError('Unable to load booking settings. Please try again later.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadAvailableSlots = async (date) => {
        try {
            const dateStr = date.toISOString().split('T')[0];
            const response = await fetch(`/api/booking/available?pageId=${pageId}&date=${dateStr}`);
            if (!response.ok) throw new Error('Failed to load slots');
            const data = await response.json();
            setAvailableSlots(data.slots || []);
        } catch (err) {
            console.error('Error loading slots:', err);
            setAvailableSlots([]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedDate || !selectedTime) {
            setError('Please select a date and time');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const response = await fetch('/api/booking/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageId,
                    psid,
                    date: selectedDate.toISOString().split('T')[0],
                    time: selectedTime,
                    contactName: formData.name,
                    contactEmail: formData.email,
                    contactPhone: formData.phone,
                    notes: formData.notes,
                    customFormData
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Booking failed');
            }

            setSuccess(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // Generate calendar days
    const generateCalendarDays = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startPadding = firstDay.getDay();
        const days = [];

        // Add padding for days before the month starts
        for (let i = 0; i < startPadding; i++) {
            days.push(null);
        }

        // Add days of the month
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + (settings?.max_advance_days || 30));

        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month, day);
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
            const isWorkingDay = settings?.working_days?.includes(dayName) ?? true;
            const isPast = date < today;
            const isTooFar = date > maxDate;

            days.push({
                day,
                date,
                disabled: isPast || isTooFar || !isWorkingDay,
                isToday: date.toDateString() === today.toDateString(),
                isSelected: selectedDate?.toDateString() === date.toDateString()
            });
        }

        return days;
    };

    const formatTime = (time) => {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
    };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.loading}>Loading...</div>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.successIcon}>✅</div>
                    <h2 style={styles.successTitle}>Booking Confirmed!</h2>
                    <p style={styles.successText}>
                        Your appointment has been scheduled for:
                    </p>
                    <div style={styles.bookingDetails}>
                        <div style={styles.detailItem}>
                            📅 {selectedDate?.toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </div>
                        <div style={styles.detailItem}>
                            🕐 {formatTime(selectedTime)}
                        </div>
                    </div>
                    <p style={styles.confirmMessage}>
                        {settings?.confirmation_message || 'We look forward to meeting with you!'}
                    </p>
                    <p style={styles.returnMessage}>
                        Please return to Messenger for confirmation.
                    </p>
                    <button
                        onClick={() => window.close()}
                        style={styles.closeButton}
                    >
                        Close Window
                    </button>
                </div>
            </div>
        );
    }

    const calendarDays = generateCalendarDays();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.badge}>📅 Book an Appointment</div>
                <h1 style={styles.title}>Choose Your Preferred Time</h1>
                <p style={styles.subtitle}>Select a date and time slot that works best for you</p>

                {error && (
                    <div style={styles.error}>{error}</div>
                )}

                <div style={styles.grid}>
                    {/* Calendar */}
                    <div style={styles.calendarSection}>
                        <div style={styles.calendarHeader}>
                            <button
                                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                                style={styles.navButton}
                            >
                                ‹
                            </button>
                            <span style={styles.monthTitle}>
                                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                            </span>
                            <button
                                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                                style={styles.navButton}
                            >
                                ›
                            </button>
                        </div>

                        <div style={styles.weekdays}>
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                <div key={day} style={styles.weekday}>{day}</div>
                            ))}
                        </div>

                        <div style={styles.days}>
                            {calendarDays.map((dayInfo, index) => (
                                <div
                                    key={index}
                                    style={{
                                        ...styles.day,
                                        ...(dayInfo?.disabled ? styles.dayDisabled : {}),
                                        ...(dayInfo?.isSelected ? styles.daySelected : {}),
                                        ...(dayInfo?.isToday && !dayInfo?.isSelected ? styles.dayToday : {})
                                    }}
                                    onClick={() => !dayInfo?.disabled && dayInfo && setSelectedDate(dayInfo.date)}
                                >
                                    {dayInfo?.day}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Time Slots */}
                    <div style={styles.slotsSection}>
                        <h3 style={styles.slotsTitle}>🕐 Available Times</h3>
                        {selectedDate ? (
                            availableSlots.length > 0 ? (
                                <div style={styles.slots}>
                                    {availableSlots.map(slot => (
                                        <button
                                            key={slot}
                                            style={{
                                                ...styles.slot,
                                                ...(selectedTime === slot ? styles.slotSelected : {})
                                            }}
                                            onClick={() => setSelectedTime(slot)}
                                        >
                                            {formatTime(slot)}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p style={styles.noSlots}>No available slots for this date</p>
                            )
                        ) : (
                            <p style={styles.noSlots}>Select a date to see available times</p>
                        )}
                    </div>
                </div>

                {/* Contact Form */}
                {selectedDate && selectedTime && (
                    <form onSubmit={handleSubmit} style={styles.form}>
                        <h3 style={styles.formTitle}>📋 Your Information</h3>

                        <div style={styles.formRow}>
                            <input
                                type="text"
                                placeholder="Your Name *"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.formRow}>
                            <input
                                type="email"
                                placeholder="Email Address"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                style={styles.input}
                            />
                            <input
                                type="tel"
                                placeholder="Phone Number"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                style={styles.input}
                            />
                        </div>

                        {/* Custom Form Fields */}
                        {settings?.custom_form?.map(field => (
                            <div key={field.name} style={styles.formRow}>
                                {field.type === 'textarea' ? (
                                    <textarea
                                        placeholder={field.label + (field.required ? ' *' : '')}
                                        required={field.required}
                                        value={customFormData[field.name] || ''}
                                        onChange={e => setCustomFormData({
                                            ...customFormData,
                                            [field.name]: e.target.value
                                        })}
                                        style={{ ...styles.input, minHeight: '80px' }}
                                    />
                                ) : field.type === 'select' ? (
                                    <select
                                        required={field.required}
                                        value={customFormData[field.name] || ''}
                                        onChange={e => setCustomFormData({
                                            ...customFormData,
                                            [field.name]: e.target.value
                                        })}
                                        style={styles.input}
                                    >
                                        <option value="">{field.label}</option>
                                        {field.options?.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type={field.type || 'text'}
                                        placeholder={field.label + (field.required ? ' *' : '')}
                                        required={field.required}
                                        value={customFormData[field.name] || ''}
                                        onChange={e => setCustomFormData({
                                            ...customFormData,
                                            [field.name]: e.target.value
                                        })}
                                        style={styles.input}
                                    />
                                )}
                            </div>
                        ))}

                        <div style={styles.formRow}>
                            <textarea
                                placeholder="Additional notes (optional)"
                                value={formData.notes}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                style={{ ...styles.input, minHeight: '80px' }}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            style={styles.submitButton}
                        >
                            {submitting ? 'Booking...' : '✅ Confirm Booking'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

// Styles
const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%)',
        padding: '2rem',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    },
    card: {
        background: 'white',
        borderRadius: '16px',
        padding: '2rem',
        maxWidth: '800px',
        width: '100%',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
    },
    badge: {
        display: 'inline-block',
        background: '#e8f5e9',
        color: '#2e7d32',
        padding: '0.5rem 1rem',
        borderRadius: '20px',
        fontSize: '0.875rem',
        fontWeight: '500',
        marginBottom: '1rem'
    },
    title: {
        fontSize: '1.75rem',
        fontWeight: '700',
        color: '#1a1a1a',
        margin: '0 0 0.5rem 0'
    },
    subtitle: {
        color: '#666',
        margin: '0 0 2rem 0'
    },
    loading: {
        textAlign: 'center',
        padding: '3rem',
        color: '#666'
    },
    error: {
        background: '#ffebee',
        color: '#c62828',
        padding: '1rem',
        borderRadius: '8px',
        marginBottom: '1rem'
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem',
        marginBottom: '2rem'
    },
    calendarSection: {
        background: '#f8f9fa',
        borderRadius: '12px',
        padding: '1.5rem'
    },
    calendarHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem'
    },
    navButton: {
        background: 'none',
        border: 'none',
        fontSize: '1.5rem',
        cursor: 'pointer',
        padding: '0.5rem',
        borderRadius: '50%',
        width: '36px',
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    monthTitle: {
        fontWeight: '600',
        fontSize: '1rem',
        color: '#1a1a1a'
    },
    weekdays: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '4px',
        marginBottom: '0.5rem'
    },
    weekday: {
        textAlign: 'center',
        fontSize: '0.75rem',
        color: '#555',
        padding: '0.5rem',
        fontWeight: '500'
    },
    days: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '4px'
    },
    day: {
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '0.875rem',
        transition: 'all 0.2s',
        color: '#1a1a1a'
    },
    dayDisabled: {
        color: '#999',
        cursor: 'not-allowed',
        opacity: '0.6'
    },
    daySelected: {
        background: '#2e7d32',
        color: 'white'
    },
    dayToday: {
        border: '2px solid #2e7d32'
    },
    slotsSection: {
        padding: '1rem'
    },
    slotsTitle: {
        fontSize: '1rem',
        fontWeight: '600',
        marginBottom: '1rem',
        color: '#1a1a1a',
        textDecoration: 'none'
    },
    slots: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.5rem'
    },
    slot: {
        padding: '0.75rem',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        background: 'white',
        cursor: 'pointer',
        fontSize: '0.875rem',
        transition: 'all 0.2s'
    },
    slotSelected: {
        background: '#e8f5e9',
        borderColor: '#2e7d32',
        color: '#2e7d32',
        fontWeight: '500'
    },
    noSlots: {
        color: '#999',
        textAlign: 'center',
        padding: '2rem'
    },
    form: {
        borderTop: '1px solid #eee',
        paddingTop: '2rem'
    },
    formTitle: {
        fontSize: '1rem',
        fontWeight: '600',
        marginBottom: '1rem'
    },
    formRow: {
        display: 'flex',
        gap: '1rem',
        marginBottom: '1rem'
    },
    input: {
        flex: 1,
        padding: '0.875rem 1rem',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        fontSize: '0.875rem',
        outline: 'none',
        transition: 'border-color 0.2s'
    },
    submitButton: {
        width: '100%',
        padding: '1rem',
        background: '#2e7d32',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'background 0.2s'
    },
    successIcon: {
        fontSize: '4rem',
        textAlign: 'center',
        marginBottom: '1rem'
    },
    successTitle: {
        textAlign: 'center',
        fontSize: '1.5rem',
        fontWeight: '700',
        marginBottom: '0.5rem'
    },
    successText: {
        textAlign: 'center',
        color: '#666',
        marginBottom: '1rem'
    },
    bookingDetails: {
        background: '#e8f5e9',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem'
    },
    detailItem: {
        fontSize: '1.125rem',
        marginBottom: '0.5rem',
        textAlign: 'center'
    },
    confirmMessage: {
        textAlign: 'center',
        color: '#666',
        marginBottom: '1rem'
    },
    returnMessage: {
        textAlign: 'center',
        color: '#2e7d32',
        fontWeight: '500',
        marginBottom: '1.5rem'
    },
    closeButton: {
        display: 'block',
        width: '100%',
        padding: '1rem',
        background: '#f5f5f5',
        border: 'none',
        borderRadius: '8px',
        fontSize: '1rem',
        cursor: 'pointer'
    }
};

export default BookingPage;

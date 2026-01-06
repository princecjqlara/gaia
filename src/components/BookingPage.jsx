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
    const [redirectCountdown, setRedirectCountdown] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 600);

    // Handle resize for mobile detection
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 600);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    // Auto-redirect countdown effect for successful bookings
    useEffect(() => {
        if (success && settings?.auto_redirect_enabled !== false) {
            const delay = settings?.auto_redirect_delay || 5;
            setRedirectCountdown(delay);

            // Build messenger URL
            const formattedDateStr = selectedDate?.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) || '';
            const formattedTimeStr = selectedTime ? formatTime(selectedTime) : '';
            const prefillMessage = settings?.messenger_prefill_message ||
                `Hi! I just booked an appointment for ${formattedDateStr} at ${formattedTimeStr}. Please confirm my booking. Thank you!`;
            const finalMessage = prefillMessage
                .replace('{date}', formattedDateStr)
                .replace('{time}', formattedTimeStr)
                .replace('{name}', formData.name);
            const messengerUrl = `https://m.me/${pageId}?text=${encodeURIComponent(finalMessage)}`;

            const interval = setInterval(() => {
                setRedirectCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        window.location.href = messengerUrl;
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(interval);
        }
    }, [success, settings, selectedDate, selectedTime, formData.name, pageId]);

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
            const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
            // Check available_days (numeric array) or fall back to working_days (string array) or default to Mon-Fri
            const availableDays = settings?.available_days || [1, 2, 3, 4, 5]; // Default Mon-Fri
            const isWorkingDay = Array.isArray(availableDays)
                ? availableDays.includes(dayOfWeek)
                : (settings?.working_days?.includes(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]) ?? true);
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
        // Build messenger redirect URL with prefilled message
        const formattedDateStr = selectedDate?.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const formattedTimeStr = formatTime(selectedTime);
        const prefillMessage = settings?.messenger_prefill_message ||
            `Hi! I just booked an appointment for ${formattedDateStr} at ${formattedTimeStr}. Please confirm my booking. Thank you!`;

        // Replace placeholders in message
        const finalMessage = prefillMessage
            .replace('{date}', formattedDateStr)
            .replace('{time}', formattedTimeStr)
            .replace('{name}', formData.name);

        const messengerUrl = `https://m.me/${pageId}?text=${encodeURIComponent(finalMessage)}`;

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
                            📅 {formattedDateStr}
                        </div>
                        <div style={styles.detailItem}>
                            🕐 {formattedTimeStr}
                        </div>
                    </div>
                    <p style={styles.confirmMessage}>
                        {settings?.confirmation_message || 'Your booking has been confirmed! We look forward to meeting with you.'}
                    </p>

                    {/* Messenger Button - Optional, booking already confirmed */}
                    <a
                        href={messengerUrl}
                        style={styles.messengerButton}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        💬 Chat with Us on Messenger
                        {redirectCountdown !== null && redirectCountdown > 0 && (
                            <span style={styles.countdown}> ({redirectCountdown}s)</span>
                        )}
                    </a>

                    <p style={styles.redirectNote}>
                        {redirectCountdown !== null && redirectCountdown > 0
                            ? `Redirecting to Messenger in ${redirectCountdown} seconds...`
                            : 'Your booking is confirmed! You can optionally send us a message above.'}
                    </p>

                    <button
                        onClick={() => {
                            setRedirectCountdown(null); // Cancel auto-redirect
                            window.close();
                        }}
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

                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
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

                    {/* Time Selection */}
                    <div style={styles.slotsSection}>
                        <h3 style={styles.slotsTitle}>🕐 Available Times</h3>

                        {/* Next Hour Quick Book Option */}
                        {settings?.allow_next_hour && selectedDate && (
                            <button
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    marginBottom: '1rem',
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '0.95rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem'
                                }}
                                onClick={() => {
                                    const now = new Date();
                                    const nextHour = new Date(now);
                                    nextHour.setHours(nextHour.getHours() + 1);
                                    nextHour.setMinutes(0);
                                    const timeStr = `${String(nextHour.getHours()).padStart(2, '0')}:${String(nextHour.getMinutes()).padStart(2, '0')}`;
                                    setSelectedTime(timeStr);
                                    setSelectedDate(new Date());
                                }}
                            >
                                ⚡ Book Next Hour ({(() => {
                                    const next = new Date();
                                    next.setHours(next.getHours() + 1);
                                    next.setMinutes(0);
                                    return next.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                                })()})
                            </button>
                        )}

                        {selectedDate ? (
                            settings?.booking_mode === 'flexible' ? (
                                /* Flexible Time Picker */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.875rem', color: '#555' }}>
                                        Pick your preferred time:
                                    </label>
                                    <input
                                        type="time"
                                        value={selectedTime || ''}
                                        onChange={(e) => setSelectedTime(e.target.value)}
                                        min={settings?.start_time || '09:00'}
                                        max={settings?.end_time || '17:00'}
                                        style={{
                                            padding: '1rem',
                                            fontSize: '1.25rem',
                                            border: '2px solid #e0e0e0',
                                            borderRadius: '8px',
                                            textAlign: 'center'
                                        }}
                                    />
                                    <small style={{ color: '#888', fontSize: '0.75rem' }}>
                                        Available: {settings?.start_time || '09:00'} - {settings?.end_time || '17:00'}
                                    </small>
                                </div>
                            ) : (
                                /* Fixed Time Slots */
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

                        {/* Dynamic Form Fields from custom_fields (new) or custom_form (legacy) */}
                        {(settings?.custom_fields || settings?.custom_form || [
                            { id: 'name', label: 'Your Name', type: 'text', required: true },
                            { id: 'phone', label: 'Phone Number', type: 'tel', required: true },
                            { id: 'email', label: 'Email Address', type: 'email', required: false },
                            { id: 'notes', label: 'Additional Notes', type: 'textarea', required: false }
                        ]).map(field => (
                            <div key={field.id || field.name} style={styles.formRow}>
                                {field.type === 'textarea' ? (
                                    <textarea
                                        placeholder={field.label + (field.required ? ' *' : '')}
                                        required={field.required}
                                        value={formData[field.id || field.name] || customFormData[field.id || field.name] || ''}
                                        onChange={e => {
                                            const fieldKey = field.id || field.name;
                                            if (['name', 'email', 'phone', 'notes'].includes(fieldKey)) {
                                                setFormData({ ...formData, [fieldKey]: e.target.value });
                                            } else {
                                                setCustomFormData({ ...customFormData, [fieldKey]: e.target.value });
                                            }
                                        }}
                                        style={{ ...styles.input, minHeight: '80px' }}
                                    />
                                ) : (
                                    <input
                                        type={field.type || 'text'}
                                        placeholder={field.label + (field.required ? ' *' : '')}
                                        required={field.required}
                                        value={formData[field.id || field.name] || customFormData[field.id || field.name] || ''}
                                        onChange={e => {
                                            const fieldKey = field.id || field.name;
                                            if (['name', 'email', 'phone', 'notes'].includes(fieldKey)) {
                                                setFormData({ ...formData, [fieldKey]: e.target.value });
                                            } else {
                                                setCustomFormData({ ...customFormData, [fieldKey]: e.target.value });
                                            }
                                        }}
                                        style={styles.input}
                                    />
                                )}
                            </div>
                        ))}

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
        </div >
    );
};

// Styles
const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%)',
        padding: '0.5rem',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    },
    card: {
        background: 'white',
        borderRadius: '16px',
        padding: '1rem',
        maxWidth: '450px',
        width: '100%',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        boxSizing: 'border-box'
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
        padding: '1rem',
        minWidth: 0,
        overflow: 'hidden'
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
        fontSize: '0.65rem',
        color: '#555',
        padding: '0.25rem',
        fontWeight: '600'
    },
    days: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '2px'
    },
    day: {
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '0.8rem',
        transition: 'all 0.2s',
        color: '#1a1a1a',
        minWidth: 0
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
        marginBottom: '0.5rem',
        color: '#1a1a1a'
    },
    successText: {
        textAlign: 'center',
        color: '#333',
        marginBottom: '1rem'
    },
    bookingDetails: {
        background: '#d4edda',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid #c3e6cb'
    },
    detailItem: {
        fontSize: '1.125rem',
        marginBottom: '0.5rem',
        textAlign: 'center',
        color: '#155724',
        fontWeight: '600'
    },
    confirmMessage: {
        textAlign: 'center',
        color: '#333',
        marginBottom: '1.5rem',
        fontSize: '1rem'
    },
    messengerButton: {
        display: 'block',
        width: '100%',
        padding: '1rem',
        background: '#0084ff',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer',
        textDecoration: 'none',
        textAlign: 'center',
        marginBottom: '0.75rem',
        transition: 'background 0.2s'
    },
    countdown: {
        fontWeight: '400',
        opacity: '0.9'
    },
    redirectNote: {
        textAlign: 'center',
        color: '#666',
        fontSize: '0.875rem',
        marginBottom: '1rem'
    },
    closeButton: {
        display: 'block',
        width: '100%',
        padding: '1rem',
        background: '#f5f5f5',
        border: '1px solid #ddd',
        borderRadius: '8px',
        fontSize: '1rem',
        cursor: 'pointer',
        color: '#333'
    }
};

export default BookingPage;

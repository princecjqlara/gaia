import React, { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../services/supabase';

/**
 * Attendance Dashboard Component
 * Shows team member attendance with daily/hourly breakdown
 */
const AttendanceDashboard = ({ users = [] }) => {
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });
    const [dateRange, setDateRange] = useState('day'); // 'day', 'week', 'month'
    const [expandedUser, setExpandedUser] = useState(null);

    // Calculate date range
    const getDateRange = useCallback(() => {
        const end = new Date(selectedDate);
        end.setHours(23, 59, 59, 999);

        let start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);

        if (dateRange === 'week') {
            start.setDate(start.getDate() - 6);
        } else if (dateRange === 'month') {
            start.setDate(1);
        }

        return { start, end };
    }, [selectedDate, dateRange]);

    // Load shifts data
    const loadShifts = useCallback(async () => {
        setLoading(true);
        const supabase = getSupabaseClient();
        if (!supabase) {
            setLoading(false);
            return;
        }

        try {
            const { start, end } = getDateRange();

            const { data, error } = await supabase
                .from('user_shifts')
                .select('*, user:user_id(id, name, email, role)')
                .gte('clock_in', start.toISOString())
                .lte('clock_in', end.toISOString())
                .order('clock_in', { ascending: false });

            if (error) throw error;
            setShifts(data || []);
        } catch (err) {
            console.error('Error loading shifts:', err);
        } finally {
            setLoading(false);
        }
    }, [getDateRange]);

    useEffect(() => {
        loadShifts();
    }, [loadShifts]);

    // Group shifts by user
    const shiftsByUser = shifts.reduce((acc, shift) => {
        const userId = shift.user_id;
        if (!acc[userId]) {
            acc[userId] = {
                user: shift.user,
                shifts: [],
                totalMinutes: 0,
                sessionCount: 0
            };
        }
        acc[userId].shifts.push(shift);
        acc[userId].totalMinutes += shift.duration_minutes || 0;
        acc[userId].sessionCount++;
        return acc;
    }, {});

    // Group shifts by day for expanded view
    const groupShiftsByDay = (userShifts) => {
        const byDay = {};
        userShifts.forEach(shift => {
            const day = new Date(shift.clock_in).toLocaleDateString();
            if (!byDay[day]) {
                byDay[day] = { shifts: [], totalMinutes: 0 };
            }
            byDay[day].shifts.push(shift);
            byDay[day].totalMinutes += shift.duration_minutes || 0;
        });
        return byDay;
    };

    // Format duration
    const formatDuration = (minutes) => {
        if (!minutes) return '0m';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    };

    // Format time
    const formatTime = (timestamp) => {
        if (!timestamp) return '-';
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Get hour of day for heatmap
    const getHourlyActivity = (userShifts) => {
        const hours = Array(24).fill(0);
        userShifts.forEach(shift => {
            const startHour = new Date(shift.clock_in).getHours();
            const endHour = shift.clock_out
                ? new Date(shift.clock_out).getHours()
                : new Date().getHours();

            for (let h = startHour; h <= endHour && h < 24; h++) {
                hours[h]++;
            }
        });
        return hours;
    };

    return (
        <div style={{
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            border: '1px solid var(--border-color)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    📊 Attendance Dashboard
                </h2>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {/* Date Range Selector */}
                    <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                        className="form-input"
                        style={{ width: 'auto' }}
                    >
                        <option value="day">Today</option>
                        <option value="week">Last 7 Days</option>
                        <option value="month">This Month</option>
                    </select>

                    {/* Date Picker */}
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="form-input"
                        style={{ width: 'auto' }}
                    />

                    {/* Refresh */}
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={loadShifts}
                        disabled={loading}
                    >
                        {loading ? '⏳' : '🔄'}
                    </button>
                </div>
            </div>

            {/* Summary Stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
            }}>
                <div style={{
                    background: 'var(--bg-secondary)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                        {Object.keys(shiftsByUser).length}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Active Members
                    </div>
                </div>
                <div style={{
                    background: 'var(--bg-secondary)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)' }}>
                        {shifts.length}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Total Sessions
                    </div>
                </div>
                <div style={{
                    background: 'var(--bg-secondary)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--warning)' }}>
                        {formatDuration(shifts.reduce((sum, s) => sum + (s.duration_minutes || 0), 0))}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Total Hours
                    </div>
                </div>
            </div>

            {/* Team Members List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    Loading attendance data...
                </div>
            ) : Object.keys(shiftsByUser).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    No attendance records for this period
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {Object.entries(shiftsByUser).map(([userId, data]) => (
                        <div key={userId} style={{
                            background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                            overflow: 'hidden',
                            border: '1px solid var(--border-color)'
                        }}>
                            {/* User Summary Row */}
                            <div
                                onClick={() => setExpandedUser(expandedUser === userId ? null : userId)}
                                style={{
                                    padding: '1rem',
                                    display: 'grid',
                                    gridTemplateColumns: '1fr auto auto auto auto',
                                    gap: '1rem',
                                    alignItems: 'center',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontWeight: 'bold',
                                        fontSize: '0.875rem'
                                    }}>
                                        {data.user?.name?.charAt(0) || '?'}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: '500' }}>
                                            {data.user?.name || 'Unknown User'}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            {data.user?.role || 'user'}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                                        {data.sessionCount}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        Sessions
                                    </div>
                                </div>

                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontWeight: 'bold', color: 'var(--success)' }}>
                                        {formatDuration(data.totalMinutes)}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        Total Time
                                    </div>
                                </div>

                                {/* Hourly Activity Mini Heatmap */}
                                <div style={{
                                    display: 'flex',
                                    gap: '1px',
                                    padding: '0.25rem',
                                    background: 'var(--bg-primary)',
                                    borderRadius: '4px'
                                }}>
                                    {getHourlyActivity(data.shifts).slice(6, 22).map((count, i) => (
                                        <div
                                            key={i}
                                            title={`${i + 6}:00 - ${count} session(s)`}
                                            style={{
                                                width: '8px',
                                                height: '20px',
                                                borderRadius: '2px',
                                                background: count > 0
                                                    ? `rgba(34, 197, 94, ${Math.min(count * 0.3 + 0.2, 1)})`
                                                    : 'var(--bg-secondary)'
                                            }}
                                        />
                                    ))}
                                </div>

                                <div style={{ fontSize: '1.25rem', color: 'var(--text-secondary)' }}>
                                    {expandedUser === userId ? '▼' : '▶'}
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {expandedUser === userId && (
                                <div style={{
                                    borderTop: '1px solid var(--border-color)',
                                    padding: '1rem',
                                    background: 'var(--bg-primary)'
                                }}>
                                    {Object.entries(groupShiftsByDay(data.shifts)).map(([day, dayData]) => (
                                        <div key={day} style={{ marginBottom: '1rem' }}>
                                            <div style={{
                                                fontWeight: '500',
                                                marginBottom: '0.5rem',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <span>📅 {day}</span>
                                                <span style={{
                                                    fontSize: '0.875rem',
                                                    color: 'var(--success)',
                                                    fontWeight: 'bold'
                                                }}>
                                                    Total: {formatDuration(dayData.totalMinutes)}
                                                </span>
                                            </div>

                                            <table style={{
                                                width: '100%',
                                                borderCollapse: 'collapse',
                                                fontSize: '0.875rem'
                                            }}>
                                                <thead>
                                                    <tr style={{ color: 'var(--text-secondary)' }}>
                                                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Clock In</th>
                                                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Clock Out</th>
                                                        <th style={{ textAlign: 'right', padding: '0.5rem' }}>Duration</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {dayData.shifts.map((shift, idx) => (
                                                        <tr key={shift.id || idx} style={{
                                                            borderTop: '1px solid var(--border-color)'
                                                        }}>
                                                            <td style={{ padding: '0.5rem' }}>
                                                                <span style={{ color: 'var(--success)' }}>▶</span>
                                                                {' '}{formatTime(shift.clock_in)}
                                                            </td>
                                                            <td style={{ padding: '0.5rem' }}>
                                                                {shift.clock_out ? (
                                                                    <>
                                                                        <span style={{ color: 'var(--error)' }}>■</span>
                                                                        {' '}{formatTime(shift.clock_out)}
                                                                    </>
                                                                ) : (
                                                                    <span style={{
                                                                        color: 'var(--success)',
                                                                        fontWeight: '500'
                                                                    }}>
                                                                        ● Currently Online
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td style={{
                                                                padding: '0.5rem',
                                                                textAlign: 'right',
                                                                fontWeight: '500'
                                                            }}>
                                                                {formatDuration(shift.duration_minutes)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AttendanceDashboard;

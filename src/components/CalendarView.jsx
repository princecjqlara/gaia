import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';
import { notificationService } from '../services/notificationService';

const CalendarView = ({ clients, isOpen, onClose, currentUserId, currentUserName, users = [] }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [showMeetingDetails, setShowMeetingDetails] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [meetingForm, setMeetingForm] = useState({
    title: '',
    description: '',
    client_id: '',
    attendees: [],
    start_time: '',
    end_time: '',
    event_type: 'meeting',
    status: 'scheduled',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadEvents();
    }
  }, [isOpen, currentDate]);

  useEffect(() => {
    if (isOpen && clients) {
      const clientEvents = generateClientEvents();
      setEvents(prev => {
        const dbEvents = prev.filter(e => !e.id?.startsWith?.('payment-') && !e.id?.startsWith?.('phase-'));
        return [...dbEvents, ...clientEvents];
      });
    }
  }, [isOpen, clients, currentDate]);

  const loadEvents = async () => {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      setLoading(true);
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const { data, error } = await client
        .from('calendar_events')
        .select('*')
        .gte('start_time', startOfMonth.toISOString())
        .lte('start_time', endOfMonth.toISOString())
        .order('start_time');

      if (!error) {
        setEvents(data || []);
      }
    } catch (error) {
      console.error('Error loading calendar events:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateClientEvents = () => {
    const clientEvents = [];
    if (!clients || !Array.isArray(clients)) return clientEvents;

    clients.forEach(client => {
      if (!client?.startDate) return;
      const startDate = new Date(client.startDate);
      if (isNaN(startDate.getTime())) return;

      if (client.paymentSchedule === 'monthly') {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + (client.monthsWithClient || 0) + 1);

        if (dueDate.getMonth() === currentDate.getMonth() &&
          dueDate.getFullYear() === currentDate.getFullYear()) {
          clientEvents.push({
            id: `payment-${client.id}`,
            title: `💰 ${client.clientName || 'Payment'}`,
            start_time: dueDate.toISOString(),
            event_type: 'payment_due',
            client_id: client.id,
            color: client.paymentStatus === 'paid' ? '#22c55e' : '#ef4444'
          });
        }
      }
    });
    return clientEvents;
  };

  const handleScheduleMeeting = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    setMeetingForm({
      title: '',
      description: '',
      client_id: '',
      attendees: currentUserId ? [currentUserId] : [],
      start_time: `${dateStr}T09:00`,
      end_time: `${dateStr}T10:00`,
      event_type: 'meeting',
      status: 'scheduled',
      notes: ''
    });
    setShowMeetingForm(true);
  };

  const handleSaveMeeting = async () => {
    const client = getSupabaseClient();
    if (!client || !meetingForm.title.trim()) {
      alert('Please enter a meeting title');
      return;
    }

    try {
      setSaving(true);
      const eventData = {
        title: meetingForm.title,
        description: meetingForm.description,
        client_id: meetingForm.client_id || null,
        attendees: meetingForm.attendees,
        start_time: new Date(meetingForm.start_time).toISOString(),
        end_time: new Date(meetingForm.end_time).toISOString(),
        event_type: 'meeting',
        status: 'scheduled',
        notes: '',
        created_by: currentUserId
      };

      const { data, error } = await client
        .from('calendar_events')
        .insert(eventData)
        .select()
        .single();

      if (error) throw error;

      setEvents(prev => [...prev, { ...data, color: '#3b82f6' }]);
      setShowMeetingForm(false);

    } catch (error) {
      console.error('Error saving meeting:', error);
      alert('Failed to save meeting: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMeeting = async (status, notes) => {
    const client = getSupabaseClient();
    if (!client || !selectedMeeting) return;

    try {
      setSaving(true);
      const oldStatus = selectedMeeting.status;

      const { error } = await client
        .from('calendar_events')
        .update({ status, notes, updated_at: new Date().toISOString() })
        .eq('id', selectedMeeting.id);

      if (error) throw error;

      // Get assigned user for the client
      const meetingClient = clients?.find(c => c.id === selectedMeeting.client_id);
      const assignedUserId = meetingClient?.assignedTo;
      const clientName = meetingClient?.clientName || 'Unknown';

      // Send notifications based on status change
      if (status === 'rescheduled' && oldStatus !== 'rescheduled') {
        await notificationService.notifyMeetingRescheduled(
          selectedMeeting, clientName, assignedUserId, currentUserName || 'Admin'
        );
      } else if (status === 'cancelled' && oldStatus !== 'cancelled') {
        await notificationService.notifyMeetingCancelled(
          selectedMeeting, clientName, assignedUserId, currentUserName || 'Admin'
        );
      } else if (status === 'done' && oldStatus !== 'done') {
        await notificationService.notifyMeetingCompleted(
          selectedMeeting, clientName, assignedUserId, notes
        );
      }

      setEvents(prev => prev.map(e => e.id === selectedMeeting.id ? { ...e, status, notes } : e));
      setShowMeetingDetails(false);
      setSelectedMeeting(null);

    } catch (error) {
      console.error('Error updating meeting:', error);
      alert('Failed to update meeting');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!eventId || (typeof eventId === 'string' && eventId.startsWith('payment-'))) return;
    if (!confirm('Delete this meeting?')) return;

    const client = getSupabaseClient();
    if (!client) return;

    try {
      await client.from('calendar_events').delete().eq('id', eventId);
      setEvents(prev => prev.filter(e => e.id !== eventId));
      setShowMeetingDetails(false);
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  const getClientName = (clientId) => clients?.find(c => c.id === clientId)?.clientName || 'Unknown';

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) days.push(new Date(year, month, day));
    return days;
  };

  const getEventsForDate = (date) => {
    if (!date) return [];
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(e => new Date(e.start_time).toISOString().split('T')[0] === dateStr);
  };

  const navigateMonth = (dir) => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setMonth(prev.getMonth() + dir);
      return d;
    });
  };

  const getEventColor = (event) => {
    if (event.status === 'done') return '#22c55e';
    if (event.status === 'cancelled') return '#6b7280';
    if (event.status === 'rescheduled') return '#f59e0b';
    if (event.color) return event.color;
    return '#3b82f6';
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = isMobile ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{
        maxWidth: isMobile ? '100%' : '900px',
        maxHeight: '90vh',
        overflowY: 'auto',
        margin: isMobile ? '0' : '2rem auto',
        borderRadius: isMobile ? '0' : '8px',
        width: isMobile ? '100%' : 'auto',
        height: isMobile ? '100%' : 'auto'
      }}>
        <div className="modal-header" style={{ padding: isMobile ? '0.75rem' : '1rem' }}>
          <h3 className="modal-title" style={{ fontSize: isMobile ? '1rem' : '1.25rem' }}>📅 Calendar</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: isMobile ? '0.5rem' : '1rem' }}>
          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => navigateMonth(-1)} style={{ padding: isMobile ? '0.4rem 0.6rem' : '0.5rem 1rem', fontSize: isMobile ? '0.75rem' : '0.875rem' }}>←</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ fontWeight: '600', fontSize: isMobile ? '0.875rem' : '1rem' }}>
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </span>
              <button className="btn btn-primary" onClick={() => handleScheduleMeeting(new Date())} style={{ padding: isMobile ? '0.4rem 0.6rem' : '0.5rem 1rem', fontSize: isMobile ? '0.7rem' : '0.875rem' }}>
                {isMobile ? '+' : '+ Meeting'}
              </button>
            </div>
            <button className="btn btn-secondary" onClick={() => navigateMonth(1)} style={{ padding: isMobile ? '0.4rem 0.6rem' : '0.5rem 1rem', fontSize: isMobile ? '0.75rem' : '0.875rem' }}>→</button>
          </div>

          {/* Calendar Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
            {dayNames.map(day => (
              <div key={day} style={{ padding: isMobile ? '0.25rem' : '0.5rem', textAlign: 'center', fontWeight: '600', background: 'var(--bg-secondary)', fontSize: isMobile ? '0.65rem' : '0.75rem' }}>{day}</div>
            ))}
            {getDaysInMonth().map((date, i) => {
              const dayEvents = getEventsForDate(date);
              const isToday = date && date.toDateString() === new Date().toDateString();
              return (
                <div
                  key={i}
                  onClick={() => date && handleScheduleMeeting(date)}
                  style={{
                    minHeight: isMobile ? '50px' : '70px',
                    padding: '2px',
                    background: isToday ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-primary)',
                    cursor: date ? 'pointer' : 'default'
                  }}
                >
                  {date && (
                    <>
                      <div style={{ fontWeight: isToday ? 'bold' : 'normal', fontSize: isMobile ? '0.65rem' : '0.75rem', color: isToday ? 'var(--primary)' : 'var(--text-primary)', marginBottom: '1px' }}>
                        {date.getDate()}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        {dayEvents.slice(0, isMobile ? 2 : 3).map(event => (
                          <div
                            key={event.id}
                            onClick={e => { e.stopPropagation(); if (event.event_type === 'meeting') { setSelectedMeeting(event); setShowMeetingDetails(true); } }}
                            style={{ fontSize: isMobile ? '0.5rem' : '0.6rem', padding: '1px 2px', background: getEventColor(event), color: 'white', borderRadius: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={event.title}
                          >
                            {isMobile ? '•' : event.title.substring(0, 12)}
                          </div>
                        ))}
                        {dayEvents.length > (isMobile ? 2 : 3) && (
                          <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>+{dayEvents.length - (isMobile ? 2 : 3)}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-footer" style={{ padding: isMobile ? '0.5rem' : '1rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      {/* Meeting Form Modal */}
      {showMeetingForm && (
        <div className="modal-overlay active" onClick={() => setShowMeetingForm(false)} style={{ zIndex: 1001 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: isMobile ? '95%' : '450px', margin: 'auto' }}>
            <div className="modal-header">
              <h3 className="modal-title">📅 New Meeting</h3>
              <button className="modal-close" onClick={() => setShowMeetingForm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input type="text" className="form-input" value={meetingForm.title} onChange={e => setMeetingForm({ ...meetingForm, title: e.target.value })} placeholder="Meeting title" />
              </div>
              <div className="form-group">
                <label className="form-label">Client</label>
                <select className="form-select" value={meetingForm.client_id} onChange={e => setMeetingForm({ ...meetingForm, client_id: e.target.value })}>
                  <option value="">— Select —</option>
                  {clients?.map(c => <option key={c.id} value={c.id}>{c.clientName || c.businessName}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div className="form-group">
                  <label className="form-label">Start</label>
                  <input type="datetime-local" className="form-input" value={meetingForm.start_time} onChange={e => setMeetingForm({ ...meetingForm, start_time: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">End</label>
                  <input type="datetime-local" className="form-input" value={meetingForm.end_time} onChange={e => setMeetingForm({ ...meetingForm, end_time: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMeetingForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveMeeting} disabled={saving}>{saving ? '...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Meeting Details Modal */}
      {showMeetingDetails && selectedMeeting && (
        <MeetingDetailsModal
          meeting={selectedMeeting}
          onClose={() => { setShowMeetingDetails(false); setSelectedMeeting(null); }}
          onUpdate={handleUpdateMeeting}
          onDelete={() => handleDeleteEvent(selectedMeeting.id)}
          getClientName={getClientName}
          saving={saving}
          isMobile={isMobile}
        />
      )}
    </div>
  );
};

const MeetingDetailsModal = ({ meeting, onClose, onUpdate, onDelete, getClientName, saving, isMobile }) => {
  const [notes, setNotes] = useState(meeting.notes || '');
  const [status, setStatus] = useState(meeting.status || 'scheduled');

  const formatDateTime = (dateStr) => new Date(dateStr).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });

  const statusOptions = [
    { key: 'scheduled', label: 'Scheduled', color: '#3b82f6' },
    { key: 'done', label: 'Done', color: '#22c55e' },
    { key: 'rescheduled', label: 'Rescheduled', color: '#f59e0b' },
    { key: 'cancelled', label: 'Cancelled', color: '#6b7280' }
  ];

  return (
    <div className="modal-overlay active" onClick={onClose} style={{ zIndex: 1001 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: isMobile ? '95%' : '450px', margin: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title" style={{ fontSize: isMobile ? '1rem' : '1.125rem' }}>📅 {meeting.title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDateTime(meeting.start_time)}</span>
            {meeting.client_id && <span style={{ fontSize: '0.75rem', background: 'var(--bg-secondary)', padding: '0.125rem 0.5rem', borderRadius: '4px' }}>{getClientName(meeting.client_id)}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Meeting Notes</label>
            <textarea className="form-input" value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="What was discussed? Action items..." style={{ fontSize: isMobile ? '0.875rem' : '1rem' }} />
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              {statusOptions.map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatus(s.key)}
                  style={{
                    padding: '0.5rem',
                    background: status === s.key ? s.color : 'var(--bg-secondary)',
                    color: status === s.key ? 'white' : 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: isMobile ? '0.75rem' : '0.875rem'
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn" onClick={onDelete} style={{ background: '#ef4444', color: 'white', fontSize: isMobile ? '0.75rem' : '0.875rem' }}>Delete</button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: isMobile ? '0.75rem' : '0.875rem' }}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onUpdate(status, notes)} disabled={saving} style={{ fontSize: isMobile ? '0.75rem' : '0.875rem' }}>{saving ? '...' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;

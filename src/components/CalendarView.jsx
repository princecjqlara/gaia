import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';
import { notificationService } from '../services/notificationService';

const CalendarView = ({ clients, isOpen, onClose, currentUserId, currentUserName, users = [] }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [showMeetingDetails, setShowMeetingDetails] = useState(false);
  const [showDayView, setShowDayView] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [meetingForm, setMeetingForm] = useState({
    title: '', description: '', client_id: '', attendees: [],
    start_time: '', end_time: '', event_type: 'meeting', status: 'scheduled', notes: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { if (isOpen) loadEvents(); }, [isOpen, currentDate]);

  useEffect(() => {
    if (isOpen && clients) {
      const clientEvents = generateClientEvents();
      setEvents(prev => [...prev.filter(e => !e.id?.startsWith?.('payment-')), ...clientEvents]);
    }
  }, [isOpen, clients, currentDate]);

  const loadEvents = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      setLoading(true);
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const { data } = await client.from('calendar_events').select('*').gte('start_time', start.toISOString()).lte('start_time', end.toISOString()).order('start_time');
      setEvents(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const generateClientEvents = () => {
    if (!clients?.length) return [];
    return clients.filter(c => c.startDate && c.paymentSchedule === 'monthly').map(c => {
      const d = new Date(c.startDate);
      d.setMonth(d.getMonth() + (c.monthsWithClient || 0) + 1);
      if (d.getMonth() !== currentDate.getMonth() || d.getFullYear() !== currentDate.getFullYear()) return null;
      return { id: `payment-${c.id}`, title: `💰 ${c.clientName}`, start_time: d.toISOString(), end_time: d.toISOString(), event_type: 'payment_due', client_id: c.id, color: c.paymentStatus === 'paid' ? '#22c55e' : '#ef4444' };
    }).filter(Boolean);
  };

  const handleDayClick = (date) => { setSelectedDay(date); setShowDayView(true); };
  const handleScheduleMeeting = (date) => {
    const dateStr = (date || new Date()).toISOString().split('T')[0];
    setMeetingForm({ title: '', description: '', client_id: '', attendees: currentUserId ? [currentUserId] : [], start_time: `${dateStr}T09:00`, end_time: `${dateStr}T10:00`, event_type: 'meeting', status: 'scheduled', notes: '' });
    setShowMeetingForm(true); setShowDayView(false);
  };

  const handleSaveMeeting = async () => {
    const client = getSupabaseClient();
    if (!client || !meetingForm.title.trim()) { alert('Enter title'); return; }
    try {
      setSaving(true);
      const { data, error } = await client.from('calendar_events').insert({ title: meetingForm.title, description: meetingForm.description, client_id: meetingForm.client_id || null, attendees: meetingForm.attendees, start_time: new Date(meetingForm.start_time).toISOString(), end_time: new Date(meetingForm.end_time).toISOString(), event_type: 'meeting', status: 'scheduled', notes: '', created_by: currentUserId }).select().single();
      if (error) throw error;
      setEvents(prev => [...prev, { ...data, color: '#3b82f6' }]); setShowMeetingForm(false);
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleUpdateMeeting = async (status, notes) => {
    const client = getSupabaseClient();
    if (!client || !selectedMeeting) return;
    try {
      setSaving(true);
      const oldStatus = selectedMeeting.status;
      await client.from('calendar_events').update({ status, notes }).eq('id', selectedMeeting.id);
      const mc = clients?.find(c => c.id === selectedMeeting.client_id);
      if (status === 'rescheduled' && oldStatus !== 'rescheduled') await notificationService.notifyMeetingRescheduled(selectedMeeting, mc?.clientName || 'Unknown', mc?.assignedTo, currentUserName);
      setEvents(prev => prev.map(e => e.id === selectedMeeting.id ? { ...e, status, notes } : e));
      setShowMeetingDetails(false);
    } catch (e) { alert('Error'); }
    finally { setSaving(false); }
  };

  const handleDeleteEvent = async (id) => {
    if (!id || id.startsWith?.('payment-') || !confirm('Delete?')) return;
    const client = getSupabaseClient();
    if (client) await client.from('calendar_events').delete().eq('id', id);
    setEvents(prev => prev.filter(e => e.id !== id)); setShowMeetingDetails(false);
  };

  const getClientName = (id) => clients?.find(c => c.id === id)?.clientName || '';
  const getDaysInMonth = () => {
    const y = currentDate.getFullYear(), m = currentDate.getMonth();
    const days = [];
    for (let i = 0; i < new Date(y, m, 1).getDay(); i++) days.push(null);
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) days.push(new Date(y, m, d));
    return days;
  };
  const getEventsForDate = (date) => date ? events.filter(e => new Date(e.start_time).toDateString() === date.toDateString()) : [];
  const navigateMonth = (dir) => setCurrentDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + dir); return d; });
  const getEventColor = (e) => e.status === 'done' ? '#22c55e' : e.status === 'cancelled' ? '#6b7280' : e.status === 'rescheduled' ? '#f59e0b' : e.color || '#3b82f6';
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = isMobile ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: isMobile ? '100%' : '900px', width: isMobile ? '100%' : 'auto', height: isMobile ? '100vh' : 'auto', maxHeight: '90vh', margin: isMobile ? '0' : 'auto', borderRadius: isMobile ? '0' : '8px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ padding: isMobile ? '0.5rem 0.75rem' : '1rem', flexShrink: 0 }}>
          <h3 style={{ fontSize: isMobile ? '1rem' : '1.25rem', margin: 0 }}>📅 Calendar</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: isMobile ? '0.5rem' : '1rem', flex: 1, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => navigateMonth(-1)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}>←</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: '600', fontSize: isMobile ? '0.875rem' : '1rem' }}>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
              <button className="btn btn-primary" onClick={() => handleScheduleMeeting(new Date())} style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem' }}>+</button>
            </div>
            <button className="btn btn-secondary" onClick={() => navigateMonth(1)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}>→</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
            {dayNames.map(d => <div key={d} style={{ padding: '0.3rem', textAlign: 'center', fontWeight: '600', background: 'var(--bg-secondary)', fontSize: '0.65rem' }}>{d}</div>)}
            {getDaysInMonth().map((date, i) => {
              const dayEvents = getEventsForDate(date);
              const isToday = date?.toDateString() === new Date().toDateString();
              return (
                <div key={i} onClick={() => date && handleDayClick(date)} style={{ minHeight: isMobile ? '45px' : '60px', padding: '2px', background: isToday ? 'rgba(59,130,246,0.15)' : 'var(--bg-primary)', cursor: date ? 'pointer' : 'default' }}>
                  {date && <>
                    <div style={{ fontWeight: isToday ? 'bold' : 'normal', fontSize: '0.65rem', color: isToday ? 'var(--primary)' : 'var(--text-primary)' }}>{date.getDate()}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      {dayEvents.slice(0, 2).map(e => <div key={e.id} style={{ fontSize: '0.5rem', padding: '1px', background: getEventColor(e), color: 'white', borderRadius: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isMobile ? '•' : e.title.substring(0, 8)}</div>)}
                      {dayEvents.length > 2 && <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>+{dayEvents.length - 2}</div>}
                    </div>
                  </>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-footer" style={{ padding: isMobile ? '0.5rem' : '1rem', flexShrink: 0 }}><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
      </div>

      {showDayView && selectedDay && <GanttDayView date={selectedDay} events={getEventsForDate(selectedDay)} onClose={() => setShowDayView(false)} onSchedule={() => handleScheduleMeeting(selectedDay)} onEventClick={(e) => { setSelectedMeeting(e); setShowMeetingDetails(true); setShowDayView(false); }} getEventColor={getEventColor} getClientName={getClientName} isMobile={isMobile} />}
      {showMeetingForm && <MeetingForm meetingForm={meetingForm} setMeetingForm={setMeetingForm} onClose={() => setShowMeetingForm(false)} onSave={handleSaveMeeting} clients={clients} saving={saving} isMobile={isMobile} />}
      {showMeetingDetails && selectedMeeting && <MeetingDetailsModal meeting={selectedMeeting} onClose={() => { setShowMeetingDetails(false); setSelectedMeeting(null); }} onUpdate={handleUpdateMeeting} onDelete={() => handleDeleteEvent(selectedMeeting.id)} getClientName={getClientName} saving={saving} isMobile={isMobile} />}
    </div>
  );
};

// Gantt-style Day View
const GanttDayView = ({ date, events, onClose, onSchedule, onEventClick, getEventColor, getClientName, isMobile }) => {
  const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM to 8 PM
  const meetings = events.filter(e => e.event_type === 'meeting');
  const otherEvents = events.filter(e => e.event_type !== 'meeting');

  const getPosition = (time) => {
    const d = new Date(time);
    const h = d.getHours() + d.getMinutes() / 60;
    return Math.max(0, Math.min(100, ((h - 7) / 13) * 100));
  };

  const getWidth = (start, end) => {
    const s = new Date(start), e = new Date(end);
    const duration = (e - s) / (1000 * 60 * 60); // hours
    return Math.max(5, (duration / 13) * 100);
  };

  // Assign rows to avoid overlaps
  const assignRows = (meetings) => {
    const sorted = [...meetings].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    const rows = [];
    sorted.forEach(meeting => {
      const start = new Date(meeting.start_time);
      const end = new Date(meeting.end_time);
      let placed = false;
      for (let r = 0; r < rows.length; r++) {
        const canPlace = rows[r].every(m => new Date(m.end_time) <= start || new Date(m.start_time) >= end);
        if (canPlace) { rows[r].push(meeting); meeting.row = r; placed = true; break; }
      }
      if (!placed) { meeting.row = rows.length; rows.push([meeting]); }
    });
    return rows.length;
  };

  const rowCount = assignRows(meetings);
  const formatTime = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div className="modal-overlay active" onClick={onClose} style={{ zIndex: 1001 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: isMobile ? '100%' : '700px', width: isMobile ? '100%' : 'auto', height: isMobile ? '100vh' : 'auto', maxHeight: '90vh', margin: isMobile ? '0' : 'auto', borderRadius: isMobile ? '0' : '8px', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ padding: '0.75rem', background: 'var(--bg-secondary)' }}>
          <h3 style={{ fontSize: '1rem', margin: 0 }}>{date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '0.75rem', flex: 1, overflow: 'auto' }}>
          <button className="btn btn-primary" onClick={onSchedule} style={{ width: '100%', marginBottom: '1rem', fontSize: '0.875rem' }}>+ New Meeting</button>

          {otherEvents.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              {otherEvents.map(e => <div key={e.id} style={{ padding: '0.5rem', background: getEventColor(e), color: 'white', borderRadius: '4px', marginBottom: '0.25rem', fontSize: '0.75rem' }}>{e.title}</div>)}
            </div>
          )}

          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Schedule ({meetings.length} meetings)</div>

          {/* Gantt Timeline */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.5rem', overflow: 'hidden' }}>
            {/* Hour labels */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginBottom: '0.5rem' }}>
              {hours.map(h => (
                <div key={h} style={{ flex: 1, fontSize: '0.55rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  {h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}
                </div>
              ))}
            </div>

            {/* Timeline grid with meetings */}
            <div style={{ position: 'relative', minHeight: Math.max(80, rowCount * 45 + 20) + 'px' }}>
              {/* Grid lines */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' }}>
                {hours.map((h, i) => (
                  <div key={h} style={{ flex: 1, borderLeft: i > 0 ? '1px dashed var(--border-color)' : 'none', opacity: 0.5 }} />
                ))}
              </div>

              {/* Meetings as bars */}
              {meetings.map(meeting => {
                const left = getPosition(meeting.start_time);
                const width = getWidth(meeting.start_time, meeting.end_time);
                const top = (meeting.row || 0) * 42 + 5;

                return (
                  <div
                    key={meeting.id}
                    onClick={() => onEventClick(meeting)}
                    title={`${meeting.title}\n${formatTime(meeting.start_time)} - ${formatTime(meeting.end_time)}`}
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: `${Math.min(width, 100 - left)}%`,
                      top: `${top}px`,
                      height: '36px',
                      background: `linear-gradient(135deg, ${getEventColor(meeting)}, ${getEventColor(meeting)}dd)`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      overflow: 'hidden',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      transition: 'transform 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'; }}
                  >
                    <div style={{ fontSize: '0.7rem', fontWeight: '600', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {meeting.title}
                    </div>
                    <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>
                      {formatTime(meeting.start_time)} {getClientName(meeting.client_id) && `• ${getClientName(meeting.client_id)}`}
                    </div>
                  </div>
                );
              })}

              {meetings.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No meetings</div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ padding: '0.5rem', flexShrink: 0 }}><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
};

const MeetingForm = ({ meetingForm, setMeetingForm, onClose, onSave, clients, saving, isMobile }) => (
  <div className="modal-overlay active" onClick={onClose} style={{ zIndex: 1001 }}>
    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: isMobile ? '95%' : '450px', margin: 'auto' }}>
      <div className="modal-header"><h3>📅 New Meeting</h3><button className="modal-close" onClick={onClose}>✕</button></div>
      <div className="modal-body">
        <div className="form-group"><label className="form-label">Title *</label><input type="text" className="form-input" value={meetingForm.title} onChange={e => setMeetingForm({ ...meetingForm, title: e.target.value })} /></div>
        <div className="form-group"><label className="form-label">Client</label><select className="form-select" value={meetingForm.client_id} onChange={e => setMeetingForm({ ...meetingForm, client_id: e.target.value })}><option value="">— Select —</option>{clients?.map(c => <option key={c.id} value={c.id}>{c.clientName}</option>)}</select></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div className="form-group"><label className="form-label">Start</label><input type="datetime-local" className="form-input" value={meetingForm.start_time} onChange={e => setMeetingForm({ ...meetingForm, start_time: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">End</label><input type="datetime-local" className="form-input" value={meetingForm.end_time} onChange={e => setMeetingForm({ ...meetingForm, end_time: e.target.value })} /></div>
        </div>
      </div>
      <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? '...' : 'Save'}</button></div>
    </div>
  </div>
);

const MeetingDetailsModal = ({ meeting, onClose, onUpdate, onDelete, getClientName, saving, isMobile }) => {
  const [notes, setNotes] = useState(meeting.notes || '');
  const [status, setStatus] = useState(meeting.status || 'scheduled');
  const statusOptions = [{ key: 'scheduled', label: 'Scheduled', color: '#3b82f6' }, { key: 'done', label: 'Done', color: '#22c55e' }, { key: 'rescheduled', label: 'Rescheduled', color: '#f59e0b' }, { key: 'cancelled', label: 'Cancelled', color: '#6b7280' }];

  return (
    <div className="modal-overlay active" onClick={onClose} style={{ zIndex: 1002 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: isMobile ? '95%' : '450px', margin: 'auto' }}>
        <div className="modal-header"><h3 style={{ fontSize: '1rem' }}>📅 {meeting.title}</h3><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div style={{ marginBottom: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(meeting.start_time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}{meeting.client_id && ` • ${getClientName(meeting.client_id)}`}</div>
          <div className="form-group"><label className="form-label">Notes</label><textarea className="form-input" value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Meeting notes..." /></div>
          <div className="form-group"><label className="form-label">Status</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>{statusOptions.map(s => <button key={s.key} onClick={() => setStatus(s.key)} style={{ padding: '0.5rem', background: status === s.key ? s.color : 'var(--bg-secondary)', color: status === s.key ? 'white' : 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem' }}>{s.label}</button>)}</div></div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}><button className="btn" onClick={onDelete} style={{ background: '#ef4444', color: 'white', fontSize: '0.75rem' }}>Delete</button><div style={{ display: 'flex', gap: '0.5rem' }}><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onUpdate(status, notes)} disabled={saving}>{saving ? '...' : 'Save'}</button></div></div>
      </div>
    </div>
  );
};

export default CalendarView;

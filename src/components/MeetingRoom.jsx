// MeetingRoom.jsx - Video call room with live captions
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '../services/supabase';
import { useSpeechCaptions } from '../hooks/useSpeechCaptions';

// Throttle helper
const createThrottle = (ms) => {
    let last = 0;
    return () => {
        const now = Date.now();
        if (now - last > ms) {
            last = now;
            return true;
        }
        return false;
    };
};

const MeetingRoom = ({
    roomSlug,
    roomId,
    currentUser,
    onClose,
    onRoomNotFound
}) => {
    const [room, setRoom] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [transcripts, setTranscripts] = useState([]);
    const [liveTexts, setLiveTexts] = useState({}); // { odId: "text..." }
    const [captionsEnabled, setCaptionsEnabled] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [showCaptions, setShowCaptions] = useState(true);

    const localVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const throttleInterimRef = useRef(createThrottle(800));
    const supabaseChannelRef = useRef(null);

    const displayName = currentUser?.name || currentUser?.email?.split('@')[0] || 'Guest';
    const userId = currentUser?.id;

    // Load room data
    useEffect(() => {
        loadRoom();
        return () => {
            cleanup();
        };
    }, [roomSlug, roomId]);

    const loadRoom = async () => {
        const client = getSupabaseClient();
        if (!client) return;

        try {
            setLoading(true);
            let query = client.from('meeting_rooms').select('*');

            if (roomId) {
                query = query.eq('id', roomId);
            } else if (roomSlug) {
                query = query.eq('room_slug', roomSlug);
            } else {
                throw new Error('No room identifier');
            }

            const { data, error } = await query.single();

            if (error || !data) {
                onRoomNotFound?.();
                setError('Room not found');
                return;
            }

            setRoom(data);
            await joinRoom(data.id);
            await subscribeToRoom(data.id);
            await loadTranscripts(data.id);

        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const joinRoom = async (roomId) => {
        const client = getSupabaseClient();
        if (!client) return;

        // Add self to participants
        await client.from('room_participants').insert({
            room_id: roomId,
            user_id: userId,
            display_name: displayName,
            is_active: true
        });

        // Update room status to active if scheduled
        await client.from('meeting_rooms')
            .update({ status: 'active' })
            .eq('id', roomId)
            .eq('status', 'scheduled');
    };

    const subscribeToRoom = async (roomId) => {
        const client = getSupabaseClient();
        if (!client) return;

        // Subscribe to transcript events
        const channel = client.channel(`room:${roomId}`)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'transcript_events', filter: `room_id=eq.${roomId}` },
                (payload) => {
                    const event = payload.new;
                    if (event.is_final) {
                        // Add to final transcripts
                        setTranscripts(prev => [...prev, event]);
                        // Clear live text for this user
                        setLiveTexts(prev => {
                            const next = { ...prev };
                            delete next[event.user_id];
                            return next;
                        });
                    } else {
                        // Update live text
                        setLiveTexts(prev => ({
                            ...prev,
                            [event.user_id]: { text: event.text, name: event.display_name }
                        }));
                    }
                }
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'room_participants', filter: `room_id=eq.${roomId}` },
                (payload) => {
                    loadParticipants(roomId);
                }
            )
            .subscribe();

        supabaseChannelRef.current = channel;
        await loadParticipants(roomId);
    };

    const loadParticipants = async (roomId) => {
        const client = getSupabaseClient();
        if (!client) return;

        const { data } = await client
            .from('room_participants')
            .select('*')
            .eq('room_id', roomId)
            .eq('is_active', true);

        setParticipants(data || []);
    };

    const loadTranscripts = async (roomId) => {
        const client = getSupabaseClient();
        if (!client) return;

        const { data } = await client
            .from('transcript_events')
            .select('*')
            .eq('room_id', roomId)
            .eq('is_final', true)
            .order('created_at', { ascending: true })
            .limit(100);

        setTranscripts(data || []);
    };

    const cleanup = async () => {
        // Stop local stream
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }

        // Leave room
        if (room?.id && userId) {
            const client = getSupabaseClient();
            if (client) {
                await client.from('room_participants')
                    .update({ is_active: false, left_at: new Date().toISOString() })
                    .eq('room_id', room.id)
                    .eq('user_id', userId);
            }
        }

        // Unsubscribe
        if (supabaseChannelRef.current) {
            supabaseChannelRef.current.unsubscribe();
        }
    };

    // Start local video (camera is optional)
    const startLocalVideo = async () => {
        try {
            // Try to get both video and audio
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
        } catch (e) {
            console.warn('Failed to get video, trying audio only:', e);
            // Try audio only if video fails
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: true
                });
                localStreamRef.current = audioStream;
                setIsVideoOff(true); // Mark video as off
            } catch (audioError) {
                console.warn('No media devices available:', audioError);
                // Allow user to join without any media - just captions/presence
                setIsVideoOff(true);
                setIsMuted(true);
            }
        }
    };

    useEffect(() => {
        if (room && !loading) {
            startLocalVideo();
        }
    }, [room, loading]);

    // Toggle mute
    const toggleMute = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                // Fix: toggle to the opposite of current muted state
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        } else {
            setIsMuted(!isMuted);
        }
    };

    // Toggle video
    const toggleVideo = () => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                // Fix: toggle to the opposite of current state
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoOff(!videoTrack.enabled);
            } else {
                // No video track available
                setIsVideoOff(true);
            }
        } else {
            setIsVideoOff(!isVideoOff);
        }
    };

    // Speech recognition handlers
    const handleInterimSpeech = useCallback(async (text) => {
        if (!throttleInterimRef.current()) return;
        if (!room?.id) return;

        const client = getSupabaseClient();
        if (!client) return;

        await client.from('transcript_events').insert({
            room_id: room.id,
            user_id: userId,
            display_name: displayName,
            text,
            is_final: false
        });
    }, [room?.id, userId, displayName]);

    const handleFinalSpeech = useCallback(async (text) => {
        if (!room?.id) return;

        const client = getSupabaseClient();
        if (!client) return;

        await client.from('transcript_events').insert({
            room_id: room.id,
            user_id: userId,
            display_name: displayName,
            text,
            is_final: true
        });
    }, [room?.id, userId, displayName]);

    const { isSupported, isListening, error: speechError, interim } = useSpeechCaptions({
        enabled: captionsEnabled,
        language: 'en-US',
        onInterim: handleInterimSpeech,
        onFinal: handleFinalSpeech
    });

    // Leave room
    const handleLeave = async () => {
        await cleanup();
        onClose?.();
    };

    // Copy room link
    const copyRoomLink = () => {
        const link = `${window.location.origin}/room/${room?.room_slug}`;
        navigator.clipboard.writeText(link);
        alert('Room link copied!');
    };

    if (loading) {
        return (
            <div className="modal-overlay active">
                <div className="modal" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div>Loading meeting room...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="modal-overlay active">
                <div className="modal" style={{ textAlign: 'center', padding: '2rem' }}>
                    <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>❌ {error}</div>
                    <button className="btn btn-secondary" onClick={onClose}>Close</button>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay active" style={{ background: 'rgba(0,0,0,0.95)' }}>
            <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{room?.title}</h2>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {participants.length} participant{participants.length !== 1 ? 's' : ''}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" onClick={copyRoomLink} title="Copy link">
                            🔗 Share
                        </button>
                        <button className="btn btn-danger" onClick={handleLeave}>
                            Leave
                        </button>
                    </div>
                </div>

                {/* Main content */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* Video area */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem' }}>
                        {/* Video grid */}
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', alignContent: 'center' }}>
                            {/* Local video */}
                            <div style={{ position: 'relative', background: 'var(--bg-tertiary)', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9' }}>
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                                />
                                {isVideoOff && (
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)' }}>
                                        <div style={{ fontSize: '3rem' }}>📷</div>
                                    </div>
                                )}
                                <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.7)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                                    {displayName} (You) {isMuted && '🔇'}
                                </div>
                            </div>

                            {/* Other participants would go here */}
                            {participants.filter(p => p.user_id !== userId).map(p => (
                                <div key={p.id} style={{ position: 'relative', background: 'var(--bg-tertiary)', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ fontSize: '3rem' }}>👤</div>
                                    <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.7)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                                        {p.display_name} {p.is_muted && '🔇'}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', padding: '1rem 0' }}>
                            <button
                                className={`btn ${isMuted ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={toggleMute}
                                style={{ padding: '1rem', borderRadius: '50%', width: '60px', height: '60px' }}
                            >
                                {isMuted ? '🔇' : '🎤'}
                            </button>
                            <button
                                className={`btn ${isVideoOff ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={toggleVideo}
                                style={{ padding: '1rem', borderRadius: '50%', width: '60px', height: '60px' }}
                            >
                                {isVideoOff ? '📷' : '🎥'}
                            </button>
                            <button
                                className={`btn ${captionsEnabled ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setCaptionsEnabled(!captionsEnabled)}
                                disabled={!isSupported}
                                style={{ padding: '1rem', borderRadius: '50%', width: '60px', height: '60px' }}
                                title={isSupported ? 'Toggle captions' : 'Captions not supported'}
                            >
                                💬
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowCaptions(!showCaptions)}
                                style={{ padding: '1rem', borderRadius: '50%', width: '60px', height: '60px' }}
                            >
                                📜
                            </button>
                        </div>
                    </div>

                    {/* Captions panel */}
                    {showCaptions && (
                        <div style={{ width: '350px', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', fontWeight: '600' }}>
                                💬 Live Captions
                                {captionsEnabled && isListening && <span style={{ marginLeft: '0.5rem', color: 'var(--success)' }}>●</span>}
                            </div>

                            <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
                                {/* Final transcripts */}
                                {transcripts.map((t, i) => (
                                    <div key={t.id || i} style={{ marginBottom: '0.75rem' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            {t.display_name}
                                        </div>
                                        <div style={{ fontSize: '0.875rem' }}>{t.text}</div>
                                    </div>
                                ))}

                                {/* Live texts from others */}
                                {Object.entries(liveTexts).map(([uid, data]) => (
                                    <div key={uid} style={{ marginBottom: '0.75rem', opacity: 0.7 }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            {data.name} <span style={{ color: 'var(--warning)' }}>(typing...)</span>
                                        </div>
                                        <div style={{ fontSize: '0.875rem', fontStyle: 'italic' }}>{data.text}</div>
                                    </div>
                                ))}

                                {/* My interim */}
                                {captionsEnabled && interim && (
                                    <div style={{ marginBottom: '0.75rem', opacity: 0.7 }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            You <span style={{ color: 'var(--success)' }}>(speaking...)</span>
                                        </div>
                                        <div style={{ fontSize: '0.875rem', fontStyle: 'italic' }}>{interim}</div>
                                    </div>
                                )}

                                {transcripts.length === 0 && !interim && Object.keys(liveTexts).length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                        {captionsEnabled
                                            ? 'Start speaking to see captions...'
                                            : 'Enable captions to see live transcription'}
                                    </div>
                                )}
                            </div>

                            {speechError && (
                                <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', fontSize: '0.75rem' }}>
                                    ⚠️ {speechError}
                                </div>
                            )}

                            {!isSupported && (
                                <div style={{ padding: '0.75rem', background: 'rgba(251,191,36,0.1)', color: 'var(--warning)', fontSize: '0.75rem' }}>
                                    ⚠️ Your browser doesn't support live captions (try Chrome/Edge)
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MeetingRoom;

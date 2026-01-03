// MeetingRoom.jsx - Video call room with live captions, lobby, and screen share
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

// Session storage key for participant tracking
const getSessionKey = (roomId) => `meeting_participant_${roomId}`;

// Guest lobby component with audio visualizer and device selection
const GuestLobby = ({ onJoin, onCancel, roomTitle, isLoggedIn, displayName: prefilledName }) => {
    const [name, setName] = useState(prefilledName || '');
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [stream, setStream] = useState(null);
    const [waiting, setWaiting] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [devices, setDevices] = useState({ video: [], audio: [] });
    const [selectedVideoDevice, setSelectedVideoDevice] = useState('');
    const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
    const videoRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationRef = useRef(null);

    useEffect(() => {
        loadDevices();
        startPreview();
        return () => {
            cleanup();
        };
    }, []);

    const cleanup = () => {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
    };

    const loadDevices = async () => {
        try {
            const deviceList = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = deviceList.filter(d => d.kind === 'videoinput');
            const audioDevices = deviceList.filter(d => d.kind === 'audioinput');
            setDevices({ video: videoDevices, audio: audioDevices });
            if (videoDevices.length > 0) setSelectedVideoDevice(videoDevices[0].deviceId);
            if (audioDevices.length > 0) setSelectedAudioDevice(audioDevices[0].deviceId);
        } catch (e) {
            console.warn('Could not enumerate devices:', e);
        }
    };

    const startPreview = async (videoId, audioId) => {
        // Stop existing stream
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }

        try {
            const constraints = {
                video: videoId ? { deviceId: { exact: videoId } } : true,
                audio: audioId ? { deviceId: { exact: audioId } } : true
            };
            const s = await navigator.mediaDevices.getUserMedia(constraints);
            setStream(s);
            if (videoRef.current) {
                videoRef.current.srcObject = s;
            }
            // Start audio level monitoring
            startAudioMonitoring(s);
        } catch (e) {
            console.warn('No camera access:', e);
        }
    };

    const startAudioMonitoring = (mediaStream) => {
        try {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            analyserRef.current = audioContextRef.current.createAnalyser();
            const source = audioContextRef.current.createMediaStreamSource(mediaStream);
            source.connect(analyserRef.current);
            analyserRef.current.fftSize = 256;
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

            const updateLevel = () => {
                if (analyserRef.current) {
                    analyserRef.current.getByteFrequencyData(dataArray);
                    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                    setAudioLevel(avg / 255 * 100);
                }
                animationRef.current = requestAnimationFrame(updateLevel);
            };
            updateLevel();
        } catch (e) {
            console.warn('Audio monitoring failed:', e);
        }
    };

    const handleDeviceChange = (type, deviceId) => {
        if (type === 'video') {
            setSelectedVideoDevice(deviceId);
            startPreview(deviceId, selectedAudioDevice);
        } else {
            setSelectedAudioDevice(deviceId);
            startPreview(selectedVideoDevice, deviceId);
        }
    };

    const toggleVideo = () => {
        if (stream) {
            const track = stream.getVideoTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setVideoEnabled(track.enabled);
            }
        }
    };

    const toggleAudio = () => {
        if (stream) {
            const track = stream.getAudioTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setAudioEnabled(track.enabled);
            }
        }
    };

    const handleJoin = () => {
        const joinName = isLoggedIn ? prefilledName : name.trim();
        if (!joinName) {
            alert('Please enter your name');
            return;
        }
        if (!isLoggedIn) {
            setWaiting(true);
        }
        cleanup();
        onJoin(joinName, { videoEnabled, audioEnabled, selectedVideoDevice, selectedAudioDevice });
    };

    return (
        <div className="modal-overlay active" style={{ background: 'rgba(0,0,0,0.95)' }}>
            <div style={{ maxWidth: '550px', margin: 'auto', padding: '2rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ color: 'white', marginBottom: '0.5rem' }}>Join: {roomTitle}</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Set up your camera and microphone</p>
                </div>

                {/* Video preview */}
                <div style={{ position: 'relative', background: 'var(--bg-tertiary)', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', marginBottom: '1rem' }}>
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: videoEnabled && stream ? 'block' : 'none' }}
                    />
                    {(!videoEnabled || !stream) && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)' }}>
                            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: 'white' }}>
                                {(isLoggedIn ? prefilledName : name)?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                        </div>
                    )}
                </div>

                {/* Audio level indicator */}
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>🎤 Microphone Level</span>
                        <span style={{ fontSize: '0.7rem', color: audioLevel > 10 ? 'var(--success)' : 'var(--text-muted)' }}>
                            {audioLevel > 10 ? '● Working' : '○ Speak to test'}
                        </span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${Math.min(audioLevel * 2, 100)}%`,
                            background: audioLevel > 50 ? '#22c55e' : audioLevel > 20 ? '#84cc16' : '#6366f1',
                            transition: 'width 0.1s ease-out'
                        }} />
                    </div>
                </div>

                {/* Device selection */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Camera</label>
                        <select
                            className="form-input"
                            value={selectedVideoDevice}
                            onChange={e => handleDeviceChange('video', e.target.value)}
                            style={{ fontSize: '0.8rem', padding: '0.5rem' }}
                        >
                            {devices.video.map(d => (
                                <option key={d.deviceId} value={d.deviceId}>
                                    {d.label || `Camera ${devices.video.indexOf(d) + 1}`}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Microphone</label>
                        <select
                            className="form-input"
                            value={selectedAudioDevice}
                            onChange={e => handleDeviceChange('audio', e.target.value)}
                            style={{ fontSize: '0.8rem', padding: '0.5rem' }}
                        >
                            {devices.audio.map(d => (
                                <option key={d.deviceId} value={d.deviceId}>
                                    {d.label || `Mic ${devices.audio.indexOf(d) + 1}`}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                    <button
                        className={`btn ${audioEnabled ? 'btn-secondary' : 'btn-danger'}`}
                        onClick={toggleAudio}
                        style={{ padding: '0.75rem', borderRadius: '50%', width: '50px', height: '50px' }}
                    >
                        {audioEnabled ? '🎤' : '🔇'}
                    </button>
                    <button
                        className={`btn ${videoEnabled ? 'btn-secondary' : 'btn-danger'}`}
                        onClick={toggleVideo}
                        style={{ padding: '0.75rem', borderRadius: '50%', width: '50px', height: '50px' }}
                    >
                        {videoEnabled ? '🎥' : '📷'}
                    </button>
                </div>

                {/* Name input - only for guests */}
                {!isLoggedIn && (
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <label className="form-label" style={{ color: 'white' }}>Your Name</label>
                        <input
                            type="text"
                            className="form-input"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Enter your name..."
                            disabled={waiting}
                        />
                    </div>
                )}

                {waiting ? (
                    <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '8px', color: 'var(--warning)' }}>
                        ⏳ Waiting for host to let you in...
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="btn btn-secondary" onClick={onCancel} style={{ flex: 1 }}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" onClick={handleJoin} style={{ flex: 2 }}>
                            {isLoggedIn ? 'Join Meeting' : 'Ask to Join'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
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
    const [waitingParticipants, setWaitingParticipants] = useState([]);
    const [transcripts, setTranscripts] = useState([]);
    const [liveTexts, setLiveTexts] = useState({});
    const [captionsEnabled, setCaptionsEnabled] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [showCaptions, setShowCaptions] = useState(true);
    const [myParticipantId, setMyParticipantId] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [showLobby, setShowLobby] = useState(false);
    const [guestSettings, setGuestSettings] = useState(null);

    const localVideoRef = useRef(null);
    const screenVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const screenStreamRef = useRef(null);
    const throttleInterimRef = useRef(createThrottle(800));
    const supabaseChannelRef = useRef(null);
    const emptyRoomTimerRef = useRef(null);

    // Determine if user is logged in (has ID)
    const isLoggedIn = !!currentUser?.id;
    const isGuest = !isLoggedIn;
    const displayName = isLoggedIn
        ? (currentUser?.name || currentUser?.email?.split('@')[0] || 'User')
        : guestSettings?.name || 'Guest';

    // Show lobby for device setup (guests and logged-in users)
    useEffect(() => {
        // Show lobby for setup unless we already have settings
        if (!guestSettings) {
            setShowLobby(true);
            setLoading(false);
        }
    }, [guestSettings]);

    // Load room data
    useEffect(() => {
        if (!guestSettings) return; // Wait for lobby
        loadRoom();
        return () => {
            cleanup();
        };
    }, [roomSlug, roomId, guestSettings]);

    const loadRoom = async () => {
        const client = getSupabaseClient();
        if (!client) {
            setError('Database connection not available');
            setLoading(false);
            return;
        }

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

            // Check if user is host (creator or admin)
            const hostCheck = data.created_by === currentUser?.id || currentUser?.role === 'admin';
            setIsHost(hostCheck || isLoggedIn); // Any logged in user can admit guests

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

        // Check session storage for existing participant
        const sessionKey = getSessionKey(roomId);
        const existingParticipantId = sessionStorage.getItem(sessionKey);

        if (existingParticipantId) {
            // Reactivate existing participant
            const { data } = await client.from('room_participants')
                .update({ is_active: true, status: isGuest ? 'waiting' : 'active' })
                .eq('id', existingParticipantId)
                .select()
                .single();

            if (data) {
                setMyParticipantId(data.id);
                return;
            }
        }

        // Deactivate any old entries for this user
        if (currentUser?.id) {
            await client.from('room_participants')
                .update({ is_active: false, left_at: new Date().toISOString() })
                .eq('room_id', roomId)
                .eq('user_id', currentUser.id)
                .eq('is_active', true);
        }

        // Add self to participants
        const status = isGuest ? 'waiting' : 'active';
        const { data } = await client.from('room_participants').insert({
            room_id: roomId,
            user_id: currentUser?.id || null,
            display_name: displayName,
            is_active: true,
            status: status
        }).select().single();

        if (data) {
            setMyParticipantId(data.id);
            sessionStorage.setItem(sessionKey, data.id);
        }

        // Update room status to active if scheduled
        await client.from('meeting_rooms')
            .update({ status: 'active' })
            .eq('id', roomId)
            .eq('status', 'scheduled');
    };

    const subscribeToRoom = async (roomId) => {
        const client = getSupabaseClient();
        if (!client) return;

        const channel = client.channel(`room:${roomId}`)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'transcript_events', filter: `room_id=eq.${roomId}` },
                (payload) => {
                    const event = payload.new;
                    if (event.is_final) {
                        setTranscripts(prev => [...prev, event]);
                        setLiveTexts(prev => {
                            const next = { ...prev };
                            delete next[event.user_id];
                            return next;
                        });
                    } else {
                        setLiveTexts(prev => ({
                            ...prev,
                            [event.user_id]: { text: event.text, name: event.display_name }
                        }));
                    }
                }
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'room_participants', filter: `room_id=eq.${roomId}` },
                () => {
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
            .eq('is_active', true)
            .order('joined_at', { ascending: true });

        const all = data || [];
        setParticipants(all.filter(p => p.status === 'active'));
        setWaitingParticipants(all.filter(p => p.status === 'waiting'));

        // Check if room is empty and start timer
        const activeCount = all.filter(p => p.status === 'active').length;
        if (activeCount === 0 && !emptyRoomTimerRef.current) {
            startEmptyRoomTimer(roomId);
        } else if (activeCount > 0 && emptyRoomTimerRef.current) {
            clearTimeout(emptyRoomTimerRef.current);
            emptyRoomTimerRef.current = null;
        }
    };

    const startEmptyRoomTimer = (roomId) => {
        emptyRoomTimerRef.current = setTimeout(async () => {
            const client = getSupabaseClient();
            if (client) {
                await client.from('meeting_rooms')
                    .update({ status: 'ended' })
                    .eq('id', roomId);
            }
        }, 5 * 60 * 1000); // 5 minutes
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

    const admitParticipant = async (participantId) => {
        const client = getSupabaseClient();
        if (!client) return;

        await client.from('room_participants')
            .update({ status: 'active' })
            .eq('id', participantId);
    };

    const denyParticipant = async (participantId) => {
        const client = getSupabaseClient();
        if (!client) return;

        await client.from('room_participants')
            .update({ status: 'denied', is_active: false })
            .eq('id', participantId);
    };

    const cleanup = async () => {
        // Stop all streams
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
        }

        // Leave room
        if (myParticipantId) {
            const client = getSupabaseClient();
            if (client) {
                await client.from('room_participants')
                    .update({ is_active: false, left_at: new Date().toISOString() })
                    .eq('id', myParticipantId);
            }
            // Clear session storage
            if (room?.id) {
                sessionStorage.removeItem(getSessionKey(room.id));
            }
        }

        // Unsubscribe
        if (supabaseChannelRef.current) {
            supabaseChannelRef.current.unsubscribe();
        }

        // Clear empty room timer
        if (emptyRoomTimerRef.current) {
            clearTimeout(emptyRoomTimerRef.current);
        }
    };

    // Start local video
    const startLocalVideo = async () => {
        try {
            const constraints = {
                video: guestSettings?.videoEnabled !== false,
                audio: true
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            // Apply guest settings
            if (guestSettings) {
                if (!guestSettings.videoEnabled) {
                    stream.getVideoTracks().forEach(t => t.stop());
                    setIsVideoOff(true);
                }
                if (!guestSettings.audioEnabled) {
                    stream.getAudioTracks().forEach(t => { t.enabled = false; });
                    setIsMuted(true);
                }
            }
        } catch (e) {
            console.warn('Failed to get video:', e);
            setIsVideoOff(true);
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                localStreamRef.current = audioStream;
            } catch (audioError) {
                console.warn('No media:', audioError);
                setIsMuted(true);
            }
        }
    };

    useEffect(() => {
        if (room && !loading && !showLobby) {
            startLocalVideo();
        }
    }, [room, loading, showLobby]);

    // Toggle mute
    const toggleMute = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        } else {
            setIsMuted(!isMuted);
        }
    };

    // Toggle video - actually stop track
    const toggleVideo = () => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                if (videoTrack.enabled) {
                    // Stop the track completely
                    videoTrack.stop();
                    setIsVideoOff(true);
                } else {
                    // Restart video
                    navigator.mediaDevices.getUserMedia({ video: true })
                        .then(stream => {
                            const newTrack = stream.getVideoTracks()[0];
                            localStreamRef.current.addTrack(newTrack);
                            if (localVideoRef.current) {
                                localVideoRef.current.srcObject = localStreamRef.current;
                            }
                            setIsVideoOff(false);
                        })
                        .catch(e => console.warn('Could not restart video:', e));
                }
            } else {
                // No track, try to start video
                navigator.mediaDevices.getUserMedia({ video: true })
                    .then(stream => {
                        const newTrack = stream.getVideoTracks()[0];
                        if (localStreamRef.current) {
                            localStreamRef.current.addTrack(newTrack);
                            if (localVideoRef.current) {
                                localVideoRef.current.srcObject = localStreamRef.current;
                            }
                        }
                        setIsVideoOff(false);
                    })
                    .catch(e => {
                        console.warn('Could not start video:', e);
                        setIsVideoOff(true);
                    });
            }
        } else {
            setIsVideoOff(!isVideoOff);
        }
    };

    // Screen sharing
    const toggleScreenShare = async () => {
        if (isScreenSharing) {
            // Stop screen share
            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach(t => t.stop());
                screenStreamRef.current = null;
            }
            setIsScreenSharing(false);
        } else {
            // Start screen share
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                screenStreamRef.current = stream;
                if (screenVideoRef.current) {
                    screenVideoRef.current.srcObject = stream;
                }
                setIsScreenSharing(true);
                // Handle when user stops sharing via browser UI
                stream.getVideoTracks()[0].onended = () => {
                    setIsScreenSharing(false);
                    screenStreamRef.current = null;
                };
            } catch (e) {
                console.warn('Screen share failed:', e);
            }
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
            user_id: currentUser?.id || null,
            display_name: displayName,
            text,
            is_final: false
        });
    }, [room?.id, currentUser?.id, displayName]);

    const handleFinalSpeech = useCallback(async (text) => {
        if (!room?.id) return;

        const client = getSupabaseClient();
        if (!client) return;

        await client.from('transcript_events').insert({
            room_id: room.id,
            user_id: currentUser?.id || null,
            display_name: displayName,
            text,
            is_final: true
        });
    }, [room?.id, currentUser?.id, displayName]);

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

    // Handle guest lobby submit
    const handleGuestJoin = (name, settings) => {
        setGuestSettings({ name, ...settings });
        setShowLobby(false);
    };

    // Show lobby for all users (device setup)
    if (showLobby) {
        return (
            <GuestLobby
                roomTitle={roomSlug || 'Meeting'}
                onJoin={handleGuestJoin}
                onCancel={onClose}
                isLoggedIn={isLoggedIn}
                displayName={isLoggedIn ? (currentUser?.name || currentUser?.email?.split('@')[0] || 'User') : ''}
            />
        );
    }

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

    // Check if guest is still waiting
    const myParticipant = participants.find(p => p.id === myParticipantId) ||
        waitingParticipants.find(p => p.id === myParticipantId);
    if (isGuest && myParticipant?.status === 'waiting') {
        return (
            <div className="modal-overlay active" style={{ background: 'rgba(0,0,0,0.95)' }}>
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                    <h2 style={{ color: 'white', marginBottom: '0.5rem' }}>Waiting for host</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                        The host will let you in shortly...
                    </p>
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                </div>
            </div>
        );
    }

    // Check if denied
    if (myParticipant?.status === 'denied') {
        return (
            <div className="modal-overlay active" style={{ background: 'rgba(0,0,0,0.95)' }}>
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                    <h2 style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>Access Denied</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                        The host has denied your request to join.
                    </p>
                    <button className="btn btn-secondary" onClick={onClose}>Close</button>
                </div>
            </div>
        );
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'active': return '#22c55e';
            case 'scheduled': return '#3b82f6';
            case 'ended': return '#6b7280';
            default: return '#6b7280';
        }
    };

    const isMe = (p) => p.id === myParticipantId;

    return (
        <div className="modal-overlay active" style={{ background: 'rgba(0,0,0,0.95)' }}>
            <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{room?.title}</h2>
                            <span style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '12px',
                                fontSize: '0.7rem',
                                background: getStatusColor(room?.status),
                                color: 'white',
                                textTransform: 'uppercase',
                                fontWeight: '600'
                            }}>
                                {room?.status === 'active' ? '● LIVE' : room?.status}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {participants.length} in call
                            {waitingParticipants.length > 0 && <span style={{ color: 'var(--warning)' }}> • {waitingParticipants.length} waiting</span>}
                            {' • '}Joined as <strong>{displayName}</strong>
                            {isGuest && <span style={{ color: 'var(--warning)' }}> (Guest)</span>}
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

                {/* Waiting room notification for hosts */}
                {isHost && waitingParticipants.length > 0 && (
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(251, 191, 36, 0.1)', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--warning)', marginBottom: '0.5rem' }}>
                            👋 {waitingParticipants.length} waiting to join
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {waitingParticipants.map(p => (
                                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', padding: '0.25rem 0.5rem', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '0.875rem' }}>{p.display_name}</span>
                                    <button className="btn btn-success" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }} onClick={() => admitParticipant(p.id)}>
                                        Admit
                                    </button>
                                    <button className="btn btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }} onClick={() => denyParticipant(p.id)}>
                                        Deny
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Main content */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* Video area */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem' }}>
                        {/* Screen share display */}
                        {isScreenSharing && (
                            <div style={{ flex: 2, marginBottom: '1rem', position: 'relative', background: 'var(--bg-tertiary)', borderRadius: '12px', overflow: 'hidden' }}>
                                <video
                                    ref={screenVideoRef}
                                    autoPlay
                                    playsInline
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                                <div style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.7)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--success)' }}>
                                    📺 Screen Sharing
                                </div>
                            </div>
                        )}

                        {/* Video grid */}
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', alignContent: 'start', overflow: 'auto' }}>
                            {/* Local video */}
                            <div style={{ position: 'relative', background: 'var(--bg-tertiary)', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', border: '2px solid var(--primary)' }}>
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: isVideoOff ? 'none' : 'block' }}
                                />
                                {isVideoOff && (
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)' }}>
                                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
                                            {displayName.charAt(0).toUpperCase()}
                                        </div>
                                    </div>
                                )}
                                <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.7)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: 'var(--primary)' }}>●</span>
                                    {displayName} (You) {isMuted && '🔇'}
                                </div>
                            </div>

                            {/* Other participants */}
                            {participants.filter(p => !isMe(p)).map(p => (
                                <div key={p.id} style={{ position: 'relative', background: 'var(--bg-tertiary)', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: 'white' }}>
                                        {(p.display_name || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.7)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                                        {p.display_name || 'User'}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', padding: '1rem 0' }}>
                            <button
                                className={`btn ${isMuted ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={toggleMute}
                                style={{ padding: '1rem', borderRadius: '50%', width: '56px', height: '56px' }}
                                title={isMuted ? 'Unmute' : 'Mute'}
                            >
                                {isMuted ? '🔇' : '🎤'}
                            </button>
                            <button
                                className={`btn ${isVideoOff ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={toggleVideo}
                                style={{ padding: '1rem', borderRadius: '50%', width: '56px', height: '56px' }}
                                title={isVideoOff ? 'Start video' : 'Stop video'}
                            >
                                {isVideoOff ? '📷' : '🎥'}
                            </button>
                            <button
                                className={`btn ${isScreenSharing ? 'btn-success' : 'btn-secondary'}`}
                                onClick={toggleScreenShare}
                                style={{ padding: '1rem', borderRadius: '50%', width: '56px', height: '56px' }}
                                title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
                            >
                                📺
                            </button>
                            <button
                                className={`btn ${captionsEnabled ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setCaptionsEnabled(!captionsEnabled)}
                                disabled={!isSupported}
                                style={{ padding: '1rem', borderRadius: '50%', width: '56px', height: '56px' }}
                                title={isSupported ? (captionsEnabled ? 'Stop captions' : 'Start captions') : 'Captions not supported'}
                            >
                                💬
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowCaptions(!showCaptions)}
                                style={{ padding: '1rem', borderRadius: '50%', width: '56px', height: '56px' }}
                                title={showCaptions ? 'Hide panel' : 'Show panel'}
                            >
                                📜
                            </button>
                        </div>
                    </div>

                    {/* Captions panel */}
                    {showCaptions && (
                        <div style={{ width: '320px', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>💬 Transcript</span>
                                {captionsEnabled && isListening && <span style={{ color: 'var(--success)', fontSize: '0.75rem' }}>● Recording</span>}
                            </div>

                            <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
                                {transcripts.map((t, i) => (
                                    <div key={t.id || i} style={{ marginBottom: '0.75rem' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            {t.display_name}
                                        </div>
                                        <div style={{ fontSize: '0.875rem' }}>{t.text}</div>
                                    </div>
                                ))}

                                {Object.entries(liveTexts).map(([uid, data]) => (
                                    <div key={uid} style={{ marginBottom: '0.75rem', opacity: 0.7 }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            {data.name} <span style={{ color: 'var(--warning)' }}>(speaking...)</span>
                                        </div>
                                        <div style={{ fontSize: '0.875rem', fontStyle: 'italic' }}>{data.text}</div>
                                    </div>
                                ))}

                                {captionsEnabled && interim && (
                                    <div style={{ marginBottom: '0.75rem', opacity: 0.7 }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            You <span style={{ color: 'var(--success)' }}>(speaking...)</span>
                                        </div>
                                        <div style={{ fontSize: '0.875rem', fontStyle: 'italic' }}>{interim}</div>
                                    </div>
                                )}

                                {transcripts.length === 0 && !interim && Object.keys(liveTexts).length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontSize: '0.875rem' }}>
                                        {captionsEnabled ? 'Start speaking...' : 'Enable captions to record'}
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
                                    ⚠️ Use Chrome/Edge for captions
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

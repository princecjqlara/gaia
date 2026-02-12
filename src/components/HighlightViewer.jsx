import React, { useEffect, useId, useRef } from 'react';

const HighlightViewer = ({
    isOpen,
    highlightTitle,
    media = [],
    mediaIndex = 0,
    onClose,
    onPrev,
    onNext,
    onGoToSection,
    showGoToSection
}) => {
    const dialogRef = useRef(null);
    const closeButtonRef = useRef(null);
    const titleId = useId();

    useEffect(() => {
        if (!isOpen) return undefined;

        const previousActive = document.activeElement;
        const focusTimer = window.setTimeout(() => {
            closeButtonRef.current?.focus();
        }, 0);

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose?.();
            }
            if (event.key === 'ArrowLeft') {
                onPrev?.();
            }
            if (event.key === 'ArrowRight') {
                onNext?.();
            }
            if (event.key === 'Tab') {
                const focusable = dialogRef.current?.querySelectorAll(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                if (!focusable || focusable.length === 0) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.clearTimeout(focusTimer);
            window.removeEventListener('keydown', handleKeyDown);
            if (previousActive && typeof previousActive.focus === 'function') {
                previousActive.focus();
            }
        };
    }, [isOpen, onClose, onPrev, onNext]);

    if (!isOpen) return null;

    const currentMedia = media[mediaIndex] || {};
    const isVideo = currentMedia.type === 'video';

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                zIndex: 1000
            }}
        >
            <div
                ref={dialogRef}
                onClick={(event) => event.stopPropagation()}
                style={{
                    width: 'min(920px, 100%)',
                    background: '#111',
                    borderRadius: '16px',
                    color: '#fff',
                    overflow: 'hidden',
                    boxShadow: '0 30px 60px rgba(0,0,0,0.35)'
                }}
            >
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.12)'
                }}>
                    <div id={titleId} style={{ fontSize: '14px', fontWeight: '600' }}>
                        {highlightTitle}
                    </div>
                    <button
                        type="button"
                        ref={closeButtonRef}
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.35)',
                            color: '#fff',
                            padding: '6px 12px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            cursor: 'pointer'
                        }}
                    >
                        Close
                    </button>
                </div>
                <div style={{
                    position: 'relative',
                    background: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '320px'
                }}>
                    {isVideo ? (
                        <video
                            src={currentMedia.url}
                            controls
                            playsInline
                            style={{
                                width: '100%',
                                maxHeight: '70vh',
                                objectFit: 'contain'
                            }}
                        />
                    ) : (
                        <img
                            src={currentMedia.url}
                            alt={highlightTitle}
                            style={{
                                width: '100%',
                                maxHeight: '70vh',
                                objectFit: 'contain'
                            }}
                        />
                    )}
                    <button
                        type="button"
                        onClick={onPrev}
                        disabled={mediaIndex <= 0}
                        style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                            border: '1px solid rgba(255,255,255,0.3)',
                            padding: '8px 12px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            cursor: mediaIndex <= 0 ? 'not-allowed' : 'pointer',
                            opacity: mediaIndex <= 0 ? 0.4 : 1
                        }}
                    >
                        Prev
                    </button>
                    <button
                        type="button"
                        onClick={onNext}
                        disabled={mediaIndex >= media.length - 1}
                        style={{
                            position: 'absolute',
                            right: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                            border: '1px solid rgba(255,255,255,0.3)',
                            padding: '8px 12px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            cursor: mediaIndex >= media.length - 1 ? 'not-allowed' : 'pointer',
                            opacity: mediaIndex >= media.length - 1 ? 0.4 : 1
                        }}
                    >
                        Next
                    </button>
                </div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderTop: '1px solid rgba(255,255,255,0.12)'
                }}>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                        {media.length > 0 ? `${mediaIndex + 1} / ${media.length}` : '0 / 0'}
                    </div>
                    {showGoToSection && (
                        <button
                            type="button"
                            onClick={onGoToSection}
                            style={{
                                background: '#fff',
                                color: '#000',
                                border: 'none',
                                padding: '8px 14px',
                                borderRadius: '999px',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Go to section
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HighlightViewer;

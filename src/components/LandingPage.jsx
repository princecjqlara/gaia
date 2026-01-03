// LandingPage.jsx - Ares Media landing page
import React from 'react';

const LandingPage = ({ onLogin, onSignUp }) => {
    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Background effects */}
            <div style={{
                position: 'absolute',
                top: '20%',
                left: '10%',
                width: '300px',
                height: '300px',
                background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
                borderRadius: '50%',
                filter: 'blur(60px)',
                pointerEvents: 'none'
            }} />
            <div style={{
                position: 'absolute',
                bottom: '20%',
                right: '10%',
                width: '400px',
                height: '400px',
                background: 'radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 70%)',
                borderRadius: '50%',
                filter: 'blur(80px)',
                pointerEvents: 'none'
            }} />

            {/* Logo and branding */}
            <div style={{ textAlign: 'center', marginBottom: '3rem', position: 'relative', zIndex: 1 }}>
                <div style={{
                    fontSize: '4rem',
                    fontWeight: '800',
                    background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 50%, #f59e0b 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    marginBottom: '0.5rem',
                    letterSpacing: '-0.02em'
                }}>
                    ARES MEDIA
                </div>
                <div style={{
                    fontSize: '1.25rem',
                    color: 'rgba(255,255,255,0.6)',
                    fontWeight: '300',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase'
                }}>
                    Digital Marketing Agency
                </div>
            </div>

            {/* Tagline */}
            <div style={{
                textAlign: 'center',
                marginBottom: '3rem',
                maxWidth: '600px',
                position: 'relative',
                zIndex: 1
            }}>
                <h2 style={{
                    fontSize: '2rem',
                    fontWeight: '600',
                    color: 'white',
                    marginBottom: '1rem',
                    lineHeight: '1.3'
                }}>
                    Grow Your Business with Strategic Marketing
                </h2>
                <p style={{
                    fontSize: '1.125rem',
                    color: 'rgba(255,255,255,0.7)',
                    lineHeight: '1.6'
                }}>
                    We help businesses scale through data-driven marketing strategies,
                    creative content, and cutting-edge digital solutions.
                </p>
            </div>

            {/* CTA Buttons */}
            <div style={{
                display: 'flex',
                gap: '1rem',
                flexWrap: 'wrap',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 1
            }}>
                <button
                    onClick={onLogin}
                    style={{
                        padding: '1rem 2.5rem',
                        fontSize: '1rem',
                        fontWeight: '600',
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)'
                    }}
                    onMouseEnter={e => {
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 8px 25px rgba(99, 102, 241, 0.5)';
                    }}
                    onMouseLeave={e => {
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 4px 15px rgba(99, 102, 241, 0.4)';
                    }}
                >
                    Sign In
                </button>
                <button
                    onClick={onSignUp}
                    style={{
                        padding: '1rem 2.5rem',
                        fontSize: '1rem',
                        fontWeight: '600',
                        background: 'transparent',
                        color: 'white',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={e => {
                        e.target.style.background = 'rgba(255,255,255,0.1)';
                        e.target.style.borderColor = 'rgba(255,255,255,0.5)';
                    }}
                    onMouseLeave={e => {
                        e.target.style.background = 'transparent';
                        e.target.style.borderColor = 'rgba(255,255,255,0.3)';
                    }}
                >
                    Create Account
                </button>
            </div>

            {/* Footer */}
            <div style={{
                position: 'absolute',
                bottom: '2rem',
                textAlign: 'center',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '0.875rem'
            }}>
                © 2026 Ares Media. All rights reserved.
            </div>
        </div>
    );
};

export default LandingPage;

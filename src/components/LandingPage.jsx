import React, { useState, useEffect } from 'react';

const LandingPage = ({ onLogin, onSignUp }) => {
    const [email, setEmail] = useState('');

    return (
        <div className="landing-page" style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1e1e2e 0%, #2a2a3e 100%)',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            color: '#fff',
            overflow: 'hidden'
        }}>
            <style>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-20px); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
                .floating-card {
                    animation: float 6s ease-in-out infinite;
                }
                .floating-card:nth-child(2) {
                    animation-delay: 1s;
                }
                .floating-card:nth-child(3) {
                    animation-delay: 2s;
                }
            `}</style>

            {/* Navigation */}
            <nav style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1.5rem 4rem',
                position: 'relative',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '1.5rem'
                    }}>G</div>
                    <span style={{ fontSize: '1.5rem', fontWeight: '700' }}>GAIA</span>
                </div>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                    <a href="#features" style={{ color: '#a1a1aa', textDecoration: 'none', fontWeight: '500' }}>Features</a>
                    <a href="#pricing" style={{ color: '#a1a1aa', textDecoration: 'none', fontWeight: '500' }}>Pricing</a>
                    <a href="#about" style={{ color: '#a1a1aa', textDecoration: 'none', fontWeight: '500' }}>About</a>
                    <button
                        onClick={onLogin}
                        style={{
                            background: 'transparent',
                            border: '1px solid #6366f1',
                            color: '#6366f1',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '9999px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            transition: 'all 0.3s'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.background = '#6366f1';
                            e.target.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'transparent';
                            e.target.style.color = '#6366f1';
                        }}
                    >
                        Log In
                    </button>
                    <button
                        onClick={onSignUp}
                        style={{
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            border: 'none',
                            color: '#fff',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '9999px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
                            transition: 'transform 0.3s'
                        }}
                        onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                        onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                    >
                        Get Started
                    </button>
                </div>
            </nav>

            {/* Hero Section */}
            <section style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 'calc(100vh - 100px)',
                padding: '4rem',
                gap: '4rem'
            }}>
                {/* Left Content */}
                <div style={{ maxWidth: '600px', flex: 1 }}>
                    <div style={{
                        display: 'inline-block',
                        background: 'rgba(99, 102, 241, 0.1)',
                        color: '#6366f1',
                        padding: '0.5rem 1rem',
                        borderRadius: '9999px',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        marginBottom: '1.5rem'
                    }}>
                        ✨ New: Property Management Suite
                    </div>
                    <h1 style={{
                        fontSize: '4rem',
                        fontWeight: '800',
                        lineHeight: 1.1,
                        marginBottom: '1.5rem',
                        background: 'linear-gradient(135deg, #fff 0%, #a1a1aa 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                    }}>
                        Manage Your Real Estate Business with Ease
                    </h1>
                    <p style={{
                        fontSize: '1.25rem',
                        color: '#a1a1aa',
                        marginBottom: '2rem',
                        lineHeight: 1.6
                    }}>
                        GAIA helps real estate professionals track clients, manage properties, 
                        and close deals faster with AI-powered insights and seamless Facebook integration.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '3rem' }}>
                        <button
                            onClick={onSignUp}
                            style={{
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                border: 'none',
                                color: '#fff',
                                padding: '1rem 2rem',
                                borderRadius: '9999px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '1.1rem',
                                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
                                transition: 'all 0.3s'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.transform = 'translateY(-2px)';
                                e.target.style.boxShadow = '0 6px 25px rgba(99, 102, 241, 0.5)';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.transform = 'translateY(0)';
                                e.target.style.boxShadow = '0 4px 20px rgba(99, 102, 241, 0.4)';
                            }}
                        >
                            Start Free Trial →
                        </button>
                        <button
                            onClick={onLogin}
                            style={{
                                background: 'transparent',
                                border: '1px solid #4b5563',
                                color: '#fff',
                                padding: '1rem 2rem',
                                borderRadius: '9999px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '1.1rem',
                                transition: 'all 0.3s'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.borderColor = '#6366f1';
                                e.target.style.color = '#6366f1';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.borderColor = '#4b5563';
                                e.target.style.color = '#fff';
                            }}
                        >
                            Sign In
                        </button>
                    </div>
                    
                    {/* Stats */}
                    <div style={{ display: 'flex', gap: '2rem' }}>
                        <div>
                            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#6366f1' }}>10K+</div>
                            <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Active Users</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#6366f1' }}>$2.5B</div>
                            <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Properties Managed</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#6366f1' }}>98%</div>
                            <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Satisfaction Rate</div>
                        </div>
                    </div>
                </div>

                {/* Right Content - Floating Cards */}
                <div style={{ 
                    position: 'relative', 
                    width: '500px', 
                    height: '500px',
                    display: isMobile() ? 'none' : 'block'
                }}>
                    {/* Background Circle */}
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '400px',
                        height: '400px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)'
                    }} />

                    {/* Floating Card 1 */}
                    <div className="floating-card" style={{
                        position: 'absolute',
                        top: '20px',
                        right: '20px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '20px',
                        padding: '1.5rem',
                        width: '280px',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <div style={{
                                width: '50px',
                                height: '50px',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.5rem'
                            }}>🏠</div>
                            <div>
                                <div style={{ fontWeight: '600' }}>Property Listed</div>
                                <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Just now</div>
                            </div>
                        </div>
                        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#10b981' }}>₱ 12,500,000</div>
                        <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Modern Villa in Makati</div>
                    </div>

                    {/* Floating Card 2 */}
                    <div className="floating-card" style={{
                        position: 'absolute',
                        top: '50%',
                        left: '0',
                        transform: 'translateY(-50%)',
                        background: 'rgba(255, 255, 255, 0.05)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '20px',
                        padding: '1.5rem',
                        width: '260px',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>👤</div>
                            <div>
                                <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>New Lead</div>
                                <div style={{ color: '#10b981', fontSize: '0.75rem' }}>Hot 🔥</div>
                            </div>
                        </div>
                        <div style={{ color: '#e5e7eb', marginBottom: '0.5rem' }}>Interested in Condo</div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem' }}>Qualified</span>
                        </div>
                    </div>

                    {/* Floating Card 3 */}
                    <div className="floating-card" style={{
                        position: 'absolute',
                        bottom: '20px',
                        right: '40px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '20px',
                        padding: '1.5rem',
                        width: '250px',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <span style={{ color: '#9ca3af' }}>Monthly Revenue</span>
                            <span style={{ color: '#10b981', fontSize: '0.875rem' }}>↑ 24%</span>
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>₱ 850K</div>
                        <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: '75%', height: '100%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: '3px' }} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" style={{ padding: '6rem 4rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <h2 style={{ fontSize: '3rem', fontWeight: '700', marginBottom: '1rem' }}>Everything You Need</h2>
                    <p style={{ color: '#9ca3af', fontSize: '1.25rem', maxWidth: '600px', margin: '0 auto' }}>
                        Powerful tools designed specifically for real estate professionals
                    </p>
                </div>
                
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '2rem',
                    maxWidth: '1200px',
                    margin: '0 auto'
                }}>
                    {[
                        { icon: '👥', title: 'Client Management', desc: 'Track leads, manage contacts, and never lose a potential buyer' },
                        { icon: '🏠', title: 'Property Listings', desc: 'Showcase properties with photos, videos, and detailed information' },
                        { icon: '🤖', title: 'AI Assistant', desc: 'Get smart recommendations and automate repetitive tasks' },
                        { icon: '📊', title: 'Analytics Dashboard', desc: 'Track performance, view trends, and make data-driven decisions' },
                        { icon: '💬', title: 'Messenger Integration', desc: 'Connect with Facebook Messenger to capture leads automatically' },
                        { icon: '📅', title: 'Meeting Scheduler', desc: 'Book appointments and manage your calendar effortlessly' }
                    ].map((feature, idx) => (
                        <div key={idx} style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '20px',
                            padding: '2rem',
                            transition: 'all 0.3s',
                            cursor: 'default'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.transform = 'translateY(-5px)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}
                        >
                            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{feature.icon}</div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>{feature.title}</h3>
                            <p style={{ color: '#9ca3af', lineHeight: 1.6 }}>{feature.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA Section */}
            <section style={{ 
                padding: '6rem 4rem', 
                textAlign: 'center',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))'
            }}>
                <h2 style={{ fontSize: '3rem', fontWeight: '700', marginBottom: '1rem' }}>
                    Ready to Transform Your Business?
                </h2>
                <p style={{ color: '#9ca3af', fontSize: '1.25rem', maxWidth: '600px', margin: '0 auto 2rem' }}>
                    Join thousands of real estate professionals who trust GAIA to manage their business
                </p>
                <button
                    onClick={onSignUp}
                    style={{
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        border: 'none',
                        color: '#fff',
                        padding: '1.25rem 3rem',
                        borderRadius: '9999px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '1.2rem',
                        boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
                        transition: 'all 0.3s'
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.transform = 'translateY(-2px) scale(1.05)';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.transform = 'translateY(0) scale(1)';
                    }}
                >
                    Get Started for Free
                </button>
            </section>

            {/* Footer */}
            <footer style={{ 
                padding: '3rem 4rem', 
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                textAlign: 'center',
                color: '#6b7280'
            }}>
                <div style={{ marginBottom: '1rem' }}>
                    <span style={{ fontWeight: '700', fontSize: '1.25rem', color: '#fff' }}>GAIA</span>
                </div>
                <div style={{ fontSize: '0.875rem' }}>
                    © 2026 GAIA. All rights reserved.
                </div>
            </footer>
        </div>
    );
};

function isMobile() {
    if (typeof window !== 'undefined') {
        return window.innerWidth < 1024;
    }
    return false;
}

export default LandingPage;

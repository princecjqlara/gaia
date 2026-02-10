import React, { useState } from 'react';

const RalphHello = () => {
    const [count, setCount] = useState(0);

    const containerStyle = {
        padding: '20px',
        backgroundColor: '#f9f9f9',
        borderRadius: '12px',
        textAlign: 'center',
        margin: '20px auto',
        maxWidth: '400px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        fontFamily: 'system-ui, -apple-system, sans-serif'
    };

    const buttonStyle = {
        padding: '12px 24px',
        backgroundColor: '#0070f3',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: '600',
        transition: 'transform 0.1s ease',
        outline: 'none'
    };

    const headingStyle = {
        color: '#1a1a1a',
        marginBottom: '16px'
    };

    const countStyle = {
        fontSize: '1.2rem',
        color: '#666',
        marginBottom: '20px'
    };

    return (
        <div style={containerStyle}>
            <h1 style={headingStyle}>Hello Ralph!</h1>
            <p style={countStyle}>Fist Bumps: <strong>{count}</strong></p>
            <button
                style={buttonStyle}
                onClick={() => setCount(prev => prev + 1)}
                onMouseDown={(e) => e.target.style.transform = 'scale(0.95)'}
                onMouseUp={(e) => e.target.style.transform = 'scale(1)'}
            >
                Bump Fist 👊
            </button>
        </div>
    );
};

export default RalphHello;

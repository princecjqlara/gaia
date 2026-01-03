import React, { useState, useEffect } from 'react';

const LoginModal = ({ onLogin, onSignUp, isSignUpMode = false, onClose }) => {
  const [isSignUp, setIsSignUp] = useState(isSignUpMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync with prop
  useEffect(() => {
    setIsSignUp(isSignUpMode);
  }, [isSignUpMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (!name.trim()) {
          setError('Please enter your name');
          setLoading(false);
          return;
        }
        await onSignUp(email, password, name);
        setSuccess('Account created successfully! Please check your email to confirm your account.');
        // Auto switch to login after 2 seconds
        setTimeout(() => {
          setIsSignUp(false);
          setSuccess('');
        }, 2000);
      } else {
        await onLogin(email, password);
      }
    } catch (err) {
      setError(err.message || (isSignUp ? 'Failed to create account' : 'Invalid email or password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay active">
      <div className="modal" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isSignUp ? '📝 Create Account' : '🔐 Sign In'}
          </h3>
          {onClose && <button className="modal-close" onClick={onClose}>✕</button>}
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(false);
                setError('');
                setSuccess('');
              }}
              style={{
                flex: 1,
                padding: '0.5rem',
                background: !isSignUp ? 'var(--primary)' : 'transparent',
                color: !isSignUp ? 'white' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(true);
                setError('');
                setSuccess('');
              }}
              style={{
                flex: 1,
                padding: '0.5rem',
                background: isSignUp ? 'var(--primary)' : 'transparent',
                color: isSignUp ? 'white' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Sign Up
            </button>
          </div>

          <form id="loginForm" onSubmit={handleSubmit}>
            {isSignUp && (
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  required={isSignUp}
                  placeholder="Your Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                required
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
              />
              {isSignUp && (
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  Password must be at least 6 characters
                </small>
              )}
            </div>
            {error && (
              <div className="form-error" style={{ color: 'var(--error)', marginBottom: '1rem' }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ color: 'var(--success)', marginBottom: '1rem', padding: '0.5rem', background: 'rgba(74, 222, 128, 0.1)', borderRadius: '4px' }}>
                {success}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={loading}
            >
              {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;


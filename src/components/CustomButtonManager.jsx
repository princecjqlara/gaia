import React, { useState, useEffect } from 'react';

const CustomButtonManager = () => {
  const [showModal, setShowModal] = useState(false);
  const [buttons, setButtons] = useState([]);
  const [newButton, setNewButton] = useState({
    label: '',
    url: '',
    color: '#a3e635',
    icon: '🔗'
  });

  // Load saved buttons from localStorage
  useEffect(() => {
    const savedButtons = localStorage.getItem('custom_buttons');
    if (savedButtons) {
      try {
        setButtons(JSON.parse(savedButtons));
      } catch (e) {
        console.error('Failed to parse saved buttons:', e);
      }
    }
  }, []);

  // Save buttons to localStorage
  const saveButtons = (updatedButtons) => {
    setButtons(updatedButtons);
    localStorage.setItem('custom_buttons', JSON.stringify(updatedButtons));
  };

  const handleAddButton = () => {
    if (!newButton.label.trim() || !newButton.url.trim()) {
      alert('Please enter both label and URL');
      return;
    }

    const updatedButtons = [...buttons, {
      ...newButton,
      id: Date.now().toString()
    }];
    
    saveButtons(updatedButtons);
    setNewButton({ label: '', url: '', color: '#a3e635', icon: '🔗' });
    setShowModal(false);
  };

  const handleDeleteButton = (id) => {
    const updatedButtons = buttons.filter(btn => btn.id !== id);
    saveButtons(updatedButtons);
  };

  return (
    <>
      {/* Button to open custom button manager */}
      <button
        className="btn btn-secondary"
        onClick={() => setShowModal(true)}
        style={{ marginRight: '0.5rem' }}
      >
        🎨 Custom Buttons
      </button>

      {/* Render custom buttons */}
      {buttons.map(button => (
        <a
          key={button.id}
          href={button.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          style={{
            marginRight: '0.5rem',
            background: button.color,
            color: '#000',
            border: 'none'
          }}
        >
          {button.icon} {button.label}
        </a>
      ))}

      {/* Modal for managing custom buttons */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>🎨 Custom Buttons</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>Add New Button</h3>
                <div className="form-group">
                  <label className="form-label">Button Label</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newButton.label}
                    onChange={(e) => setNewButton({ ...newButton, label: e.target.value })}
                    placeholder="e.g., My Dashboard"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">URL</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newButton.url}
                    onChange={(e) => setNewButton({ ...newButton, url: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Icon</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newButton.icon}
                      onChange={(e) => setNewButton({ ...newButton, icon: e.target.value })}
                      placeholder="🔗"
                      style={{ fontSize: '1.2rem' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Color</label>
                    <input
                      type="color"
                      className="form-input"
                      value={newButton.color}
                      onChange={(e) => setNewButton({ ...newButton, color: e.target.value })}
                      style={{ height: '40px', padding: '0.25rem' }}
                    />
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleAddButton}
                  style={{ marginTop: '0.5rem' }}
                >
                  Add Button
                </button>
              </div>

              <div>
                <h3 style={{ marginBottom: '0.5rem' }}>Your Custom Buttons</h3>
                {buttons.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No custom buttons yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {buttons.map(button => (
                      <div
                        key={button.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem',
                          background: 'var(--bg-tertiary)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.2rem' }}>{button.icon}</span>
                          <div>
                            <div style={{ fontWeight: '600' }}>{button.label}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{button.url}</div>
                          </div>
                        </div>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteButton(button.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CustomButtonManager;
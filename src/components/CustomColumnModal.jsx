import React, { useState, useEffect } from 'react';

const CustomColumnModal = ({ isOpen, onClose, onSubmit, existingColumn = null }) => {
  const [name, setName] = useState(existingColumn?.name || '');
  const [dataType, setDataType] = useState(existingColumn?.dataType || 'short-text');
  const [options, setOptions] = useState(existingColumn?.options?.join('\n') || '');
  const [width, setWidth] = useState(existingColumn?.width || 'auto');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    setName(existingColumn?.name || '');
    setDataType(existingColumn?.dataType || 'short-text');
    setOptions(existingColumn?.options?.join(String.fromCharCode(10)) || '');
    setWidth(existingColumn?.width || 'auto');
    setErrors({});
  }, [existingColumn, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};

    // Validate name
    if (!name.trim()) {
      newErrors.name = 'Column name is required';
    } else if (name.length > 30) {
      newErrors.name = 'Name must be 30 characters or less';
    }

    // Validate options if dropdown type
    if (dataType === 'dropdown') {
      const optionList = options.split('\n').filter(opt => opt.trim());
      if (optionList.length === 0) {
        newErrors.options = 'At least one option is required for dropdown';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const columnData = {
      name: name.trim(),
      dataType,
      width: width === 'auto' ? undefined : width,
      id: existingColumn?.id || `custom_${Date.now()}`
    };

    // Add options for dropdown
    if (dataType === 'dropdown') {
      columnData.options = options.split('\n').map(opt => opt.trim()).filter(opt => opt);
    }

    onSubmit(columnData);
    onClose();
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {existingColumn ? '✏️ Edit Custom Column' : '➕ Add Custom Column'}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">
                Column Name *
              </label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors({ ...errors, name: undefined });
                }}
                placeholder="e.g., Budget, Status, Notes"
                autoFocus
              />
              {errors.name && (
                <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.name}</div>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">
                Data Type *
              </label>
              <select
                className="form-select"
                value={dataType}
                onChange={(e) => setDataType(e.target.value)}
              >
                <option value="short-text">Short Text</option>
                <option value="number">Number</option>
                <option value="price">Price ($)</option>
                <option value="dropdown">Dropdown</option>
              </select>
            </div>

            {dataType === 'dropdown' && (
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">
                  Dropdown Options (one per line) *
                </label>
                <textarea
                  className="form-textarea"
                  value={options}
                  onChange={(e) => {
                    setOptions(e.target.value);
                    if (errors.options) setErrors({ ...errors, options: undefined });
                  }}
                  placeholder="Option 1&#10;Option 2&#10;Option 3"
                  rows={4}
                />
                {errors.options && (
                  <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.options}</div>
                )}
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Enter one option per line
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">
                Column Width
              </label>
              <select
                className="form-select"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              >
                <option value="auto">Auto (flexible)</option>
                <option value="100px">100px</option>
                <option value="120px">120px</option>
                <option value="150px">150px</option>
                <option value="200px">200px</option>
                <option value="250px">250px</option>
              </select>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Recommended: 120px for dropdowns, 100px for numbers
              </div>
            </div>

            <div style={{ 
              padding: '1rem', 
              background: 'var(--bg-secondary)', 
              borderRadius: 'var(--radius-md)',
              marginBottom: '1rem'
            }}>
              <div style={{ fontWeight: '500', marginBottom: '0.5rem' }}>Preview:</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                <div>Name: <strong>{name || 'New Column'}</strong></div>
                <div>Type: {dataType}</div>
                {dataType === 'dropdown' && options && (
                  <div>
                    Options: {options.split('\n').filter(opt => opt.trim()).length} options
                  </div>
                )}
                <div>Width: {width}</div>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              {existingColumn ? 'Update Column' : 'Add Column'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomColumnModal;

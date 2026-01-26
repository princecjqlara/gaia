import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

const TAG_COLORS = ['#a3e635', '#34d399', '#22d3ee', '#818cf8', '#f472b6', '#fb923c', '#facc15', '#f87171'];

const TagManagementModal = ({ isOpen, onClose, onTagsUpdated }) => {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#a3e635');

  useEffect(() => {
    if (isOpen) {
      loadTags();
    }
  }, [isOpen]);

  const loadTags = async () => {
    const client = getSupabaseClient();
    if (!client) {
      // Offline mode - load from localStorage
      const stored = localStorage.getItem('gaia_tags');
      if (stored) {
        try {
          setTags(JSON.parse(stored));
        } catch (e) {
          console.error('Error loading tags from localStorage:', e);
          setTags([]);
        }
      } else {
        setTags([]);
      }
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await client
        .from('tags')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setTags(data || []);

      // Also save to localStorage for offline access
      localStorage.setItem('gaia_tags', JSON.stringify(data || []));
    } catch (error) {
      console.error('Error loading tags:', error);
      // Fallback to localStorage
      const stored = localStorage.getItem('gaia_tags');
      if (stored) {
        try {
          setTags(JSON.parse(stored));
        } catch (e) {
          setTags([]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const checkTagUsage = async (tagName) => {
    const client = getSupabaseClient();
    if (!client) {
      // Offline mode - can't check usage, assume 0
      return 0;
    }

    try {
      // Query clients that have this tag in their tags array
      // Using .cs() (contains) filter for array queries
      const { data, error } = await client
        .from('clients')
        .select('id')
        .contains('tags', [tagName]);

      if (error) throw error;
      return data?.length || 0;
    } catch (error) {
      console.error('Error checking tag usage:', error);
      // Fallback: fetch all clients and filter in JavaScript
      try {
        const { data: allClients, error: fetchError } = await client
          .from('clients')
          .select('id, tags');

        if (fetchError) throw fetchError;
        const count = (allClients || []).filter(c =>
          Array.isArray(c.tags) && c.tags.includes(tagName)
        ).length;
        return count;
      } catch (fallbackError) {
        console.error('Error in fallback tag usage check:', fallbackError);
        return 0;
      }
    }
  };

  const handleDeleteClick = async (tagId, tagName) => {
    // Check how many clients use this tag
    const clientCount = await checkTagUsage(tagName);
    setDeleteConfirm({ tagId, tagName, clientCount });
  };

  const handleDeleteTag = async (tagId, tagName, removeFromClients = false) => {
    setSaving(true);
    const updatedTags = tags.filter(t => t.id !== tagId);
    setTags(updatedTags);

    const client = getSupabaseClient();
    if (client) {
      try {
        // If removeFromClients is true, remove the tag from all clients first
        if (removeFromClients) {
          // Get all clients that have this tag
          let clientsWithTag;
          try {
            const { data, error: fetchError } = await client
              .from('clients')
              .select('id, tags')
              .contains('tags', [tagName]);

            if (fetchError) throw fetchError;
            clientsWithTag = data;
          } catch (fetchError) {
            // Fallback: fetch all clients and filter
            const { data: allClients, error: allError } = await client
              .from('clients')
              .select('id, tags');

            if (allError) throw allError;
            clientsWithTag = (allClients || []).filter(c =>
              Array.isArray(c.tags) && c.tags.includes(tagName)
            );
          }

          // Remove the tag from each client's tags array
          if (clientsWithTag && clientsWithTag.length > 0) {
            const updatePromises = clientsWithTag.map(clientRecord => {
              const updatedTags = (clientRecord.tags || []).filter(t => t !== tagName);
              return client
                .from('clients')
                .update({ tags: updatedTags })
                .eq('id', clientRecord.id);
            });

            await Promise.all(updatePromises);
          }
        }

        // Delete the tag from the tags table
        const { error } = await client
          .from('tags')
          .delete()
          .eq('id', tagId);

        if (error) throw error;
        localStorage.setItem('gaia_tags', JSON.stringify(updatedTags));
      } catch (error) {
        console.error('Error deleting tag:', error);
        // Revert on error
        setTags(tags);
        alert('Error deleting tag: ' + error.message);
      }
    } else {
      localStorage.setItem('gaia_tags', JSON.stringify(updatedTags));
    }

    setSaving(false);
    setDeleteConfirm(null);
    if (onTagsUpdated) onTagsUpdated();
  };

  const handleAddTag = async () => {
    if (!newTagName.trim()) {
      alert('Please enter a tag name');
      return;
    }

    // Check if tag already exists
    if (tags.some(t => t.name.toLowerCase() === newTagName.trim().toLowerCase())) {
      alert('A tag with this name already exists');
      return;
    }

    setSaving(true);
    const newTag = {
      id: Date.now().toString(),
      name: newTagName.trim(),
      color: newTagColor
    };

    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client
          .from('tags')
          .insert({ name: newTag.name, color: newTag.color })
          .select()
          .single();

        if (error) throw error;

        const updatedTags = [...tags, data];
        setTags(updatedTags);
        localStorage.setItem('gaia_tags', JSON.stringify(updatedTags));
      } catch (error) {
        console.error('Error adding tag:', error);
        alert('Error adding tag: ' + error.message);
        setSaving(false);
        return;
      }
    } else {
      const updatedTags = [...tags, newTag];
      setTags(updatedTags);
      localStorage.setItem('gaia_tags', JSON.stringify(updatedTags));
    }

    setNewTagName('');
    setNewTagColor('#a3e635');
    setSaving(false);
    if (onTagsUpdated) onTagsUpdated();
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3 className="modal-title">🏷️ Manage Tags</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Loading tags...
            </div>
          ) : (
            <div>
              {/* Add New Tag Form */}
              <div style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)'
              }}>
                <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-primary)' }}>➕ Add New Tag</h4>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Tag Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="e.g., VIP, Priority, New..."
                      disabled={saving}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Color</label>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {TAG_COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewTagColor(color)}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: color,
                            border: newTagColor === color ? '3px solid white' : '2px solid transparent',
                            boxShadow: newTagColor === color ? '0 0 0 2px var(--primary)' : 'none',
                            cursor: 'pointer'
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleAddTag}
                    disabled={saving || !newTagName.trim()}
                    style={{ height: '38px' }}
                  >
                    {saving ? 'Adding...' : 'Add Tag'}
                  </button>
                </div>
                {newTagName.trim() && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Preview: </span>
                    <span style={{
                      background: newTagColor,
                      color: 'black',
                      padding: '0.25rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: '600',
                      fontSize: '0.875rem'
                    }}>
                      {newTagName.trim()}
                    </span>
                  </div>
                )}
              </div>

              <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Available Tags</h4>
              {tags.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No tags available.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {tags.map(tag => (
                    <div
                      key={tag.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.875rem'
                      }}
                    >
                      <span className="tag" style={{
                        background: tag.color || '#a3e635',
                        color: 'black',
                        padding: '0.25rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: '600'
                      }}>
                        {tag.name}
                      </span>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteClick(tag.id, tag.name)}
                        disabled={saving}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        title="Delete tag"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay active" style={{ zIndex: 2000 }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 className="modal-title">🗑️ Delete Tag</h3>
              <button className="modal-close" onClick={cancelDelete}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                Are you sure you want to delete the tag <strong>"{deleteConfirm.tagName}"</strong>?
              </p>
              {deleteConfirm.clientCount > 0 && (
                <div style={{
                  padding: '1rem',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-lg)',
                  marginBottom: '1rem'
                }}>
                  <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: '600' }}>
                    This tag is currently used by <strong>{deleteConfirm.clientCount}</strong> client{deleteConfirm.clientCount !== 1 ? 's' : ''}.
                  </p>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleDeleteTag(deleteConfirm.tagId, deleteConfirm.tagName, true)}
                  disabled={saving}
                  style={{ width: '100%' }}
                >
                  {saving ? 'Deleting...' : `Remove from all clients & delete tag`}
                </button>
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={() => handleDeleteTag(deleteConfirm.tagId, deleteConfirm.tagName, false)}
                  disabled={saving}
                  style={{ width: '100%' }}
                >
                  {saving ? 'Deleting...' : `Keep on clients & delete tag option`}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={cancelDelete}
                  disabled={saving}
                  style={{ width: '100%' }}
                >
                  Cancel
                </button>
              </div>
              {deleteConfirm.clientCount > 0 && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    <strong>Option 1:</strong> Removes the tag from all {deleteConfirm.clientCount} client{deleteConfirm.clientCount !== 1 ? 's' : ''} and deletes the tag definition.
                  </p>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    <strong>Option 2:</strong> Keeps the tag on clients but removes it from the available tags list (orphaned tag).
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TagManagementModal;



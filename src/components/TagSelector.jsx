import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '../services/supabase';

const TagSelector = ({ value, onChange }) => {
  const [availableTags, setAvailableTags] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const prevValueRef = useRef(value);
  const isInternalChange = useRef(false);

  useEffect(() => {
    loadAvailableTags();
  }, []);

  // Only sync from parent value when it actually changes from external source
  useEffect(() => {
    // Skip if this is an internal change we triggered
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }

    // Only update if value changed
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      if (value) {
        if (typeof value === 'string') {
          const tags = value.split(',').map(t => t.trim()).filter(t => t);
          setSelectedTags(tags);
        } else if (Array.isArray(value)) {
          setSelectedTags(value);
        }
      } else {
        setSelectedTags([]);
      }
    }
  }, [value]);

  // Notify parent of changes
  const notifyParent = useCallback((tags) => {
    if (onChange) {
      const newValue = tags.join(', ');
      isInternalChange.current = true;
      prevValueRef.current = newValue;
      onChange(newValue);
    }
  }, [onChange]);

  const loadAvailableTags = async () => {
    const client = getSupabaseClient();
    if (!client) {
      // Offline mode - load from localStorage
      const stored = localStorage.getItem('gaia_tags');
      if (stored) {
        try {
          const tags = JSON.parse(stored);
          setAvailableTags(tags.map(t => t.name));
        } catch (e) {
          console.error('Error loading tags:', e);
        }
      }
      return;
    }

    try {
      const { data, error } = await client
        .from('tags')
        .select('name')
        .order('name', { ascending: true });

      if (error) throw error;
      setAvailableTags((data || []).map(t => t.name));

      // Also save to localStorage
      localStorage.setItem('gaia_tags', JSON.stringify(data || []));
    } catch (error) {
      console.error('Error loading tags:', error);
      // Fallback to localStorage
      const stored = localStorage.getItem('gaia_tags');
      if (stored) {
        try {
          const tags = JSON.parse(stored);
          setAvailableTags(tags.map(t => t.name));
        } catch (e) {
          // Ignore
        }
      }
    }
  };

  const filteredSuggestions = availableTags.filter(tag =>
    tag.toLowerCase().includes(inputValue.toLowerCase()) &&
    !selectedTags.includes(tag)
  );

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    setShowSuggestions(value.length > 0 && filteredSuggestions.length > 0);
  };

  const handleAddTag = (tag) => {
    if (tag && !selectedTags.includes(tag)) {
      const newTags = [...selectedTags, tag];
      setSelectedTags(newTags);
      notifyParent(newTags);
      setInputValue('');
      setShowSuggestions(false);
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    const newTags = selectedTags.filter(t => t !== tagToRemove);
    setSelectedTags(newTags);
    notifyParent(newTags);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      const tagToAdd = inputValue.trim();
      // Only allow adding tags that exist in availableTags (case-insensitive)
      const matchingTag = availableTags.find(tag => tag.toLowerCase() === tagToAdd.toLowerCase());
      if (matchingTag && !selectedTags.includes(matchingTag)) {
        handleAddTag(matchingTag);
      } else if (!matchingTag) {
        // Show message that tag doesn't exist
        alert('This tag does not exist. Please select from available tags.');
        setInputValue('');
        setShowSuggestions(false);
      }
    } else if (e.key === 'Backspace' && !inputValue && selectedTags.length > 0) {
      handleRemoveTag(selectedTags[selectedTags.length - 1]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          padding: '0.5rem',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          minHeight: '44px',
          alignItems: 'center'
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {selectedTags.map(tag => (
          <span
            key={tag}
            className="tag"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.25rem 0.75rem',
              background: 'var(--primary)',
              color: 'black',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.875rem',
              fontWeight: '600'
            }}
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveTag(tag);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'black',
                cursor: 'pointer',
                padding: 0,
                marginLeft: '0.25rem',
                fontSize: '1rem',
                lineHeight: 1
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="form-input"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (inputValue && filteredSuggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          placeholder={selectedTags.length === 0 ? "Type to search tags..." : ""}
          style={{
            border: 'none',
            background: 'transparent',
            flex: 1,
            minWidth: '120px',
            outline: 'none',
            padding: 0
          }}
        />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '0.25rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            maxHeight: '200px',
            overflowY: 'auto',
            zIndex: 1000,
            boxShadow: 'var(--shadow-lg)'
          }}
        >
          {filteredSuggestions.map(tag => (
            <div
              key={tag}
              onClick={() => handleAddTag(tag)}
              style={{
                padding: '0.75rem 1rem',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border-light)',
                transition: 'background-color var(--transition-fast)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {tag}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TagSelector;



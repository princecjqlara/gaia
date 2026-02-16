import React, { useState, useEffect } from 'react';
import { showToast } from '../utils/toast';

const EvaluationQuestionsModal = ({ isOpen, onClose }) => {
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadQuestions();
    }
  }, [isOpen]);

  const loadQuestions = async () => {
    try {
      const saved = localStorage.getItem('evaluation_questions');
      const defaultQuestions = [
        'What is your primary business goal?',
        'What is your marketing budget?',
        'Who is your target audience?',
        'What has been your biggest marketing challenge?',
        'Why are you looking for our services now?'
      ];
      let loaded = saved ? JSON.parse(saved) : null;

      if (!loaded) {
        try {
          const resp = await fetch('/api/sync-settings');
          const data = await resp.json();
          if (resp.ok && data?.config?.evaluation_questions?.length > 0) {
            loaded = data.config.evaluation_questions;
            console.log('[EVAL] Loaded questions from ai_chatbot_config');
          }
        } catch (err) {
          console.error('[EVAL] Could not load questions from API:', err.message);
        }
      }

      if (!loaded) {
        loaded = defaultQuestions;
      }
      setQuestions(loaded);

      // Auto-sync to DB so webhook server can use them
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey) {
          const { createClient } = await import('@supabase/supabase-js');
          const db = createClient(supabaseUrl, supabaseKey);
          // Save as separate key for easy webhook access
          await db.from('settings').upsert({
            key: 'evaluation_questions',
            value: { questions: loaded },
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' });
          console.log('[EVAL] ✅ Questions auto-synced to DB on load');
        }
      } catch (syncErr) {
        console.error('[EVAL] Auto-sync failed:', syncErr.message);
      }
    } catch (err) {
      console.error('Error loading questions:', err);
    }
  };

  const saveQuestions = async (updatedQuestions) => {
    try {
      localStorage.setItem('evaluation_questions', JSON.stringify(updatedQuestions));
      setQuestions(updatedQuestions);

      // Also sync into ai_chatbot_config so the webhook server can use them
      try {
        const config = JSON.parse(localStorage.getItem('ai_chatbot_config') || '{}');
        config.evaluation_questions = updatedQuestions;
        localStorage.setItem('ai_chatbot_config', JSON.stringify(config));

        try {
          const resp = await fetch('/api/sync-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
          });
          const data = await resp.json();
          if (!resp.ok) {
            console.error('[EVAL] Sync via API failed:', data?.error || 'Unknown error');
          } else {
            console.log('[EVAL] ✅ Config synced via API');
          }
        } catch (apiErr) {
          console.error('[EVAL] Sync via API failed:', apiErr.message);
        }

        // Sync to database
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey) {
          const { createClient } = await import('@supabase/supabase-js');
          const db = createClient(supabaseUrl, supabaseKey);
          await db.from('settings').upsert({
            key: 'ai_chatbot_config',
            value: config,
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' });
          console.log('[EVAL] ✅ Questions synced to database');
        }
      } catch (syncErr) {
        console.error('[EVAL] Sync to DB failed (non-fatal):', syncErr.message);
      }

      showToast('Questions saved successfully', 'success');
    } catch (err) {
      showToast('Error saving questions', 'error');
    }
  };

  const handleAddQuestion = () => {
    if (!newQuestion.trim()) {
      showToast('Please enter a question', 'warning');
      return;
    }
    const updated = [...questions, newQuestion.trim()];
    saveQuestions(updated);
    setNewQuestion('');
  };

  const handleEditQuestion = (index) => {
    setEditingIndex(index);
    setNewQuestion(questions[index]);
  };

  const handleUpdateQuestion = () => {
    if (!newQuestion.trim()) {
      showToast('Please enter a question', 'warning');
      return;
    }
    const updated = [...questions];
    updated[editingIndex] = newQuestion.trim();
    saveQuestions(updated);
    setNewQuestion('');
    setEditingIndex(null);
  };

  const handleDeleteQuestion = (index) => {
    if (window.confirm('Are you sure you want to delete this question?')) {
      const updated = questions.filter((_, i) => i !== index);
      saveQuestions(updated);
    }
  };

  const handleResetToDefaults = () => {
    if (window.confirm('Reset to default questions? This will remove all custom questions.')) {
      const defaultQuestions = [
        'What is your primary business goal?',
        'What is your marketing budget?',
        'Who is your target audience?',
        'What has been your biggest marketing challenge?',
        'Why are you looking for our services now?'
      ];
      saveQuestions(defaultQuestions);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">📝 Evaluation Questions</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflow: 'auto' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Manage the questions that will be asked to contacts during the AI evaluation process.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Enter a new question..."
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  editingIndex !== null ? handleUpdateQuestion() : handleAddQuestion();
                }
              }}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={editingIndex !== null ? handleUpdateQuestion : handleAddQuestion}
            >
              {editingIndex !== null ? 'Update' : 'Add'}
            </button>
            {editingIndex !== null && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditingIndex(null);
                  setNewQuestion('');
                }}
              >
                Cancel
              </button>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Questions ({questions.length})
            </div>
            {questions.length === 0 ? (
              <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '4px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No questions added yet. Add your first question above.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {questions.map((question, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '0.75rem 1rem',
                      background: 'var(--bg-secondary)',
                      border: `1px solid ${editingIndex === index ? 'var(--primary)' : 'var(--border-color)'}`,
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <span style={{ flex: 1 }}>{index + 1}. {question}</span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleEditQuestion(index)}
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleDeleteQuestion(index)}
                        title="Delete"
                        style={{ color: '#ef4444' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleResetToDefaults}
            style={{ fontSize: '0.875rem' }}
          >
            🔄 Reset to Default Questions
          </button>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default EvaluationQuestionsModal;

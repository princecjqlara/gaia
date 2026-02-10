import React, { useState, useEffect, useRef } from 'react';
import { nvidiaChat } from '../services/aiService';
import { showToast } from '../utils/toast';

const EvaluationModal = ({ isOpen, onClose, client, onEvaluationComplete }) => {
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [messages, setMessages] = useState([]);
  const [userAnswer, setUserAnswer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [aiResponses, setAiResponses] = useState([]);
  const [showAllAnswers, setShowAllAnswers] = useState(false);
  const [userScore, setUserScore] = useState(85);
  const [meetsThreshold, setMeetsThreshold] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      loadQuestions();
      initializeChat();
      inputRef.current?.focus();
    }
  }, [isOpen, client]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, showAllAnswers]);

  // Check if score meets threshold
  useEffect(() => {
    const threshold = (() => {
      try {
        return parseInt(localStorage.getItem('evaluation_threshold')) || 70;
      } catch {
        return 70;
      }
    })();
    setMeetsThreshold(userScore >= threshold);
  }, [userScore]);

  const loadQuestions = () => {
    try {
      const saved = localStorage.getItem('evaluation_questions');
      const defaultQuestions = [
        'What is your primary business goal?',
        'What is your marketing budget?',
        'Who is your target audience?',
        'What has been your biggest marketing challenge?',
        'Why are you looking for our services now?'
      ];
      const loaded = saved ? JSON.parse(saved) : defaultQuestions;
      setQuestions(loaded);
      setAnswers(new Array(loaded.length).fill(''));
      setAiResponses(new Array(loaded.length).fill(''));
    } catch (err) {
      console.error('Error loading questions:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const initializeChat = () => {
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setAiResponses([]);
    setUserScore(85);
    addMessage('ai', `Hello ${client?.clientName || 'there'}! I'll be asking you some questions to help us understand your needs better. Let's start!`);
    setTimeout(() => {
      addQuestionMessage(0);
    }, 500);
  };

  const addQuestionMessage = (index) => {
    if (index < questions.length) {
      addMessage('ai', questions[index]);
    } else {
      showSummary();
    }
  };

  const addMessage = (sender, content) => {
    setMessages(prev => [...prev, { sender, content, timestamp: new Date() }]);
  };

  const handleSendAnswer = async () => {
    if (!userAnswer.trim()) return;

    const answer = userAnswer.trim();
    const currentIdx = currentQuestionIndex;

    // Store the user's answer
    setAnswers(prev => {
      const updated = [...prev];
      updated[currentIdx] = answer;
      return updated;
    });

    // Add user message to chat
    addMessage('user', answer);
    setUserAnswer('');
    setIsProcessing(true);

    // Get AI acknowledgment
    try {
      const prompt = [
        {
          role: 'system',
          content: 'You are a friendly and professional business consultant. Acknowledge the user\'s answer with a brief appreciative response (1-2 sentences), then move to the next question if there is one. If this is the final answer, express appreciation and mention that you\'ll now generate an evaluation summary.'
        },
        {
          role: 'user',
          content: `User answered: "${answer}". Question was: "${questions[currentIdx]}". ${currentIdx < questions.length - 1 ? `Next question will be: "${questions[currentIdx + 1]}"` : 'This was the last question.'}`
        }
      ];

      const aiResponse = await nvidiaChat(prompt, { temperature: 0.7, maxTokens: 150 });
      setAiResponses(prev => {
        const updated = [...prev];
        updated[currentIdx] = aiResponse || 'Thank you for your answer!';
        return updated;
      });

      if (aiResponse) {
        addMessage('ai', aiResponse);
      }

      // Move to next question or show summary
      setTimeout(() => {
        if (currentIdx < questions.length - 1) {
          setCurrentQuestionIndex(prev => prev + 1);
          setTimeout(() => addQuestionMessage(currentIdx + 1), 500);
        } else {
          setTimeout(() => showSummary(), 1000);
        }
      }, 1000);

    } catch (error) {
      console.error('Error getting AI response:', error);
      showToast('Error processing answer', 'error');

      // Move to next question anyway
      setTimeout(() => {
        if (currentIdx < questions.length - 1) {
          setCurrentQuestionIndex(prev => prev + 1);
          addQuestionMessage(currentIdx + 1);
        } else {
          showSummary();
        }
      }, 500);
    } finally {
      setIsProcessing(false);
    }
  };

  const showSummary = () => {
    setShowAllAnswers(true);
    addMessage('ai', `Thank you! I've recorded all your answers. Please review them below and set a satisfaction score (0-100%).`);
  };

  const handleCompleteEvaluation = async () => {
    const score = parseInt(userScore);
    if (isNaN(score) || score < 0 || score > 100) {
      showToast('Please enter a score between 0 and 100', 'warning');
      return;
    }

    // Build evaluation notes
    const evaluationNotes = `
📊 EVALUATION SUMMARY
======================
Score: ${score}%
Date: ${new Date().toLocaleDateString()}

Q&A Details:
${questions.map((q, i) => `
Q${i + 1}: ${q}
A${i + 1}: ${answers[i] || '(No answer)'}
`).join('\n')}

======================
Evaluation completed via AI chatbot.
`.trim();

    // Add summary notes to existing notes
    const updatedNotes = client?.notes
      ? `${client.notes}\n\n${evaluationNotes}`
      : evaluationNotes;

    // Get the evaluation threshold
    const threshold = (() => {
      try {
        return parseInt(localStorage.getItem('evaluation_threshold')) || 70;
      } catch {
        return 70;
      }
    })();

    // Only move to evaluated stage if score meets threshold
    const moveToEvaluated = score >= threshold;

    onEvaluationComplete({
      phase: moveToEvaluated ? 'evaluated' : client?.phase,
      notes: updatedNotes,
      evaluationScore: score,
      evaluationDate: new Date().toISOString(),
      evaluationAnswers: answers,
      evaluationQuestions: questions
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            🤖 AI Evaluation: {client?.clientName}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Chat Messages */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '1rem',
            background: 'var(--bg-tertiary)',
            borderRadius: '4px',
            marginBottom: '1rem',
            border: '1px solid var(--border-color)'
          }}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: '0.75rem'
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '0.75rem 1rem',
                    borderRadius: '12px',
                    background: msg.sender === 'user'
                      ? 'var(--primary)'
                      : 'var(--bg-secondary)',
                    color: msg.sender === 'user' ? 'white' : 'var(--text-primary)',
                    position: 'relative'
                  }}
                >
                  {msg.content}
                  <div
                    style={{
                      fontSize: '0.65rem',
                      opacity: 0.7,
                      marginTop: '0.25rem'
                    }}
                  >
                    {msg.sender === 'ai' ? '🤖 AI' : '👤 You'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {isProcessing && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '0.75rem' }}>
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '12px',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-muted)'
                  }}
                >
                  🤔 AI is thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Summary View - shown after all questions answered */}
          {showAllAnswers && (
            <div style={{
              padding: '1rem',
              background: 'var(--bg-secondary)',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              marginBottom: '1rem'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '0.75rem' }}>📋 Q&A Summary</div>
              {questions.map((q, i) => (
                <div key={i} style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: i < questions.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    Q{i + 1}: {q}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    A: {answers[i] || '(No answer)'}
                  </div>
                </div>
              ))}

              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                  Overall Satisfaction Score: {userScore}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={userScore}
                  onChange={(e) => setUserScore(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: '700', color: `var(--${userScore >= 70 ? 'success' : userScore >= 40 ? 'warning' : 'danger'})`, marginTop: '0.5rem' }}>
                  {userScore}%
                </div>

                {/* Threshold Warning */}
                {!meetsThreshold && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '4px',
                    textAlign: 'center',
                    fontSize: '0.875rem',
                    color: 'var(--warning)'
                  }}>
                    ⚠️ Score is below threshold. Client will stay in current stage.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Input - hidden when showing summary */}
          {!showAllAnswers && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                ref={inputRef}
                type="text"
                className="form-input"
                placeholder="Type your answer..."
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isProcessing) {
                    handleSendAnswer();
                  }
                }}
                disabled={isProcessing}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSendAnswer}
                disabled={isProcessing || !userAnswer.trim()}
              >
                {isProcessing ? '⏳' : 'Send'}
              </button>
            </div>
          )}

          {/* Progress indicator */}
          {!showAllAnswers && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>
              Question {currentQuestionIndex + 1} of {questions.length}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!showAllAnswers ? (
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={initializeChat}>
                🔄 Restart
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCompleteEvaluation}
              >
                {meetsThreshold
                  ? '✅ Complete & Move to Evaluated Stage'
                  : '✅ Complete (Score Below Threshold)'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EvaluationModal;

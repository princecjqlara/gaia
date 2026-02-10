import React, { useState, useEffect } from 'react';

// Helper to get payment date indicator
const getPaymentDateIndicator = (client) => {
  if (!client.nextPaymentDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const paymentDate = new Date(client.nextPaymentDate);
  paymentDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((paymentDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: 'PAST DUE', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
  } else if (diffDays === 0) {
    return { text: 'DUE TODAY', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
  } else if (diffDays <= 3) {
    return { text: `DUE IN ${diffDays}d`, color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' };
  }
  return null;
};

// Check if client is new (added within 3 days)
const isNewClient = (client) => {
  if (!client.createdAt) return false;
  const createdDate = new Date(client.createdAt);
  const now = new Date();
  const diffDays = (now - createdDate) / (1000 * 60 * 60 * 24);
  return diffDays <= 3;
};



const ClientCard = ({ client, onView, onEdit, onEvaluate, onManageQuestions }) => {

  const priority = client.priority || 1;
  const paymentIndicator = getPaymentDateIndicator(client);
  const isNew = isNewClient(client);

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', client.id);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
    e.currentTarget.style.cursor = 'grabbing';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    e.currentTarget.style.cursor = 'grab';
  };

  return (
    <div
      className="client-card"
      data-id={client.id}
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        cursor: 'grab'
      }}
      title="Drag to move between phases"
    >
      <div className="client-priority">{priority}</div>

      {/* Badges row */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
        {isNew && (
          <span style={{
            fontSize: '0.6rem',
            padding: '0.1rem 0.4rem',
            borderRadius: '4px',
            background: 'rgba(34,197,94,0.15)',
            color: '#22c55e',
            fontWeight: '600'
          }}>
            ✨ NEW
          </span>
         )}
      </div>

      <div className="client-header">
        <div>
          <div className="client-name">{client.clientName}</div>
          <div className="client-business">{client.businessName}</div>
        </div>
      </div>
      <div className="client-meta">
        {(client.assignedUser || client.assignedTo) && (
          <span>👤 {client.assignedUser?.name || client.assignedUser?.email || client.assignedTo}</span>
        )}
      </div>
      {client.phase === 'testing' && (
        <div className="testing-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${client.subscriptionUsage || 0}%` }}
            />
          </div>
          <div className="progress-label">
            <span>Usage: {client.subscriptionUsage || 0}%</span>
            <span>Round #{client.testingRound || 1}</span>
          </div>
        </div>
      )}
      {client.tags && client.tags.length > 0 && (
        <div className="client-tags" style={{ marginTop: 'var(--space-sm)' }}>
          {client.tags.map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      )}
      <div className="client-actions" onMouseDown={(e) => e.stopPropagation()}>
        <button
          className="btn btn-sm btn-ghost"
          onClick={onView}
          draggable="false"
          onDragStart={(e) => e.preventDefault()}
        >
          👁️ View
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={onEdit}
          draggable="false"
          onDragStart={(e) => e.preventDefault()}
        >
          ✏️ Edit
        </button>
        {client.phase !== 'evaluated' && onEvaluate && (
          <button
            className="btn btn-sm btn-primary"
            onClick={onEvaluate}
            draggable="false"
            onDragStart={(e) => e.preventDefault()}
            title="Start AI Evaluation"
          >
            🤖 Evaluate
          </button>
        )}
        {onManageQuestions && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={onManageQuestions}
            draggable="false"
            onDragStart={(e) => e.preventDefault()}
            title="Manage Evaluation Questions"
          >
            📝 Questions
          </button>
        )}
      </div>
    </div>
  );
};

export default ClientCard;


import React, { useState, useRef, useMemo } from 'react';
import ClientCard from './ClientCard';

const ITEMS_PER_PAGE = 10;

const phaseConfig = {
  booked: { emoji: '📅', title: 'BOOKED' },
  'follow-up': { emoji: '📞', title: 'FOLLOW UP' },
  preparing: { emoji: '⏳', title: 'PREPARING' }
};

const PhaseColumn = ({ phase, clients, onViewClient, onEditClient, onMoveClient }) => {
  const config = phaseConfig[phase] || { emoji: '', title: phase.toUpperCase() };
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const dragCounterRef = useRef(0);

  // Filter clients by search term
  const filteredClients = useMemo(() => {
    if (!searchTerm.trim()) return clients;
    const term = searchTerm.toLowerCase();
    return clients.filter(client => {
      const searchable = [
        client.clientName,
        client.businessName,
        client.contactDetails,
        ...(client.tags || [])
      ].join(' ').toLowerCase();
      return searchable.includes(term);
    });
  }, [clients, searchTerm]);

  // Paginate clients
  const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE);
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredClients.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredClients, currentPage]);

  // Reset page when search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!isDraggingOver) {
      setIsDraggingOver(true);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const currentTarget = e.currentTarget;
    const relatedTarget = e.relatedTarget;
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingOver(false);
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCounterRef.current = 0;
    const clientId = e.dataTransfer.getData('text/plain');
    if (clientId && onMoveClient) {
      onMoveClient(clientId, phase);
    }
  };

  return (
    <div
      className="phase-column"
      data-phase={phase}
      style={{
        borderColor: isDraggingOver ? 'var(--primary)' : '',
        borderWidth: isDraggingOver ? '2px' : '1px',
        transition: 'border-color 0.2s ease'
      }}
    >
      <div className="phase-header">
        <div className="phase-title">
          <span>{config.emoji}</span> {config.title}
        </div>
        <span className="phase-count">{clients.length}</span>
      </div>

      {/* Search Box */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <input
          type="text"
          placeholder="🔍 Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '0.4rem 0.6rem',
            fontSize: '0.75rem',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)'
          }}
        />
      </div>

      <div
        className="phase-clients"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ minHeight: '100px', flex: 1, overflow: 'auto' }}
      >
        {paginatedClients.length === 0 ? (
          <div className="phase-empty">
            {searchTerm ? 'No matching clients' : 'No clients in this phase'}
          </div>
        ) : (
          paginatedClients.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              onView={() => onViewClient(client.id)}
              onEdit={() => onEditClient(client.id)}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          padding: '0.5rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.75rem'
        }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{
              padding: '0.25rem 0.5rem',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 1 ? 0.5 : 1
            }}
          >
            ←
          </button>
          <span style={{ color: 'var(--text-muted)' }}>
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: '0.25rem 0.5rem',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              opacity: currentPage === totalPages ? 0.5 : 1
            }}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
};

export default PhaseColumn;

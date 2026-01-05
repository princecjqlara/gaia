import React from 'react';

const FiltersBar = ({
  searchTerm,
  onSearchChange,
  filterPhase,
  onPhaseFilterChange,
  filterPackage,
  onPackageFilterChange,
  filterPayment,
  onPaymentFilterChange,
  filterAssignedTo,
  onAssignedToFilterChange,
  users = [],
  viewMode,
  onViewModeChange
}) => {
  return (
    <section className="filters-bar">
      <div className="search-box">
        <input
          type="text"
          className="form-input"
          id="searchInput"
          placeholder="Search clients, businesses..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      {onViewModeChange && (
        <div className="view-toggle" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className={`btn btn-sm ${viewMode === 'kanban' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onViewModeChange('kanban')}
            title="Kanban View"
            style={{ padding: '0.5rem 1rem' }}
          >
            📋 Kanban
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onViewModeChange('table')}
            title="Table View"
            style={{ padding: '0.5rem 1rem' }}
          >
            📊 Table
          </button>
        </div>
      )}
      <select
        className="form-select filter-select"
        id="filterPhase"
        value={filterPhase}
        onChange={(e) => onPhaseFilterChange(e.target.value)}
      >
        <option value="">All Phases</option>
        <option value="booked">📅 Booked</option>
        <option value="follow-up">📞 Follow Up</option>
        <option value="preparing">⏳ Preparing</option>
        <option value="testing">🧪 Testing</option>
        <option value="running">🚀 Running</option>
      </select>
      <select
        className="form-select filter-select"
        id="filterPackage"
        value={filterPackage}
        onChange={(e) => onPackageFilterChange(e.target.value)}
      >
        <option value="">All Packages</option>
        <option value="basic">🟢 ₱1,799</option>
        <option value="star">⭐ ₱2,999</option>
        <option value="fire">🔥 ₱3,499</option>
        <option value="crown">👑 ₱5,799</option>
        <option value="custom">🎨 Custom</option>
      </select>
      <select
        className="form-select filter-select"
        id="filterPayment"
        value={filterPayment}
        onChange={(e) => onPaymentFilterChange(e.target.value)}
      >
        <option value="">All Payment Status</option>
        <option value="paid">Paid</option>
        <option value="unpaid">Unpaid</option>
        <option value="partial">Partial</option>
      </select>
      {onAssignedToFilterChange && (
        <select
          className="form-select filter-select"
          id="filterAssignedTo"
          value={filterAssignedTo || ''}
          onChange={(e) => onAssignedToFilterChange(e.target.value)}
        >
          <option value="">All Team Members</option>
          <option value="unassigned">Unassigned</option>
          {users.map(user => (
            <option key={user.id} value={user.id}>
              {user.name || user.email}
            </option>
          ))}
        </select>
      )}
    </section>
  );
};

export default FiltersBar;


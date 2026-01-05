import React from 'react';
import PhaseColumn from './PhaseColumn';
import ClientsTable from './ClientsTable';

const PhasesContainer = ({ clients, filters, onViewClient, onEditClient, onMoveClient, viewMode = 'kanban' }) => {
  const phases = ['booked', 'follow-up', 'preparing', 'testing', 'running'];

  const getClientsByPhase = (phase) => {
    let filtered = clients.filter(c => c.phase === phase);

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(client => {
        const searchable = [
          client.clientName,
          client.businessName,
          client.contactDetails,
          ...(client.tags || [])
        ].join(' ').toLowerCase();
        return searchable.includes(term);
      });
    }

    if (filters.filterPackage) {
      filtered = filtered.filter(c => c.package === filters.filterPackage);
    }

    if (filters.filterPayment) {
      filtered = filtered.filter(c => c.paymentStatus === filters.filterPayment);
    }

    // Filter by assigned user
    if (filters.filterAssignedTo) {
      if (filters.filterAssignedTo === 'unassigned') {
        filtered = filtered.filter(c => !c.assignedTo);
      } else {
        filtered = filtered.filter(c => c.assignedTo === filters.filterAssignedTo);
      }
    }

    filtered.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    return filtered;
  };

  if (viewMode === 'table') {
    return (
      <section className="clients-table-section" id="clientsTableSection">
        <ClientsTable
          clients={clients}
          filters={filters}
          onViewClient={onViewClient}
          onEditClient={onEditClient}
          onMoveClient={onMoveClient}
        />
      </section>
    );
  }

  return (
    <section className="phases-container" id="phasesContainer">
      {phases.map(phase => (
        <PhaseColumn
          key={phase}
          phase={phase}
          clients={getClientsByPhase(phase)}
          onViewClient={onViewClient}
          onEditClient={onEditClient}
          onMoveClient={onMoveClient}
        />
      ))}
    </section>
  );
};

export default PhasesContainer;


import React, { useState, useEffect } from 'react';
import PhaseColumn from './PhaseColumn';
import ClientsTable from './ClientsTable';

const PhasesContainer = ({ clients, filters, onViewClient, onEditClient, onMoveClient, onUpdateClient, viewMode = 'kanban', onEvaluate, onManageQuestions }) => {
  const [phases, setPhases] = useState(['evaluated', 'booked', 'follow-up', 'preparing']);
  const [stageConfig, setStageConfig] = useState({});

  // Default stages config
  const defaultStageConfig = {
    evaluated: { emoji: '✅', title: 'EVALUATED', color: '#22c55e' },
    booked: { emoji: '📅', title: 'BOOKED', color: '#3b82f6' },
    'follow-up': { emoji: '📞', title: 'FOLLOW UP', color: '#f59e0b' },
    preparing: { emoji: '⏳', title: 'PREPARING', color: '#8b5cf6' }
  };

  // Default stages array
  const defaultStages = [
    { id: '0', stage_key: 'evaluated', display_name: 'Evaluated', emoji: '✅', color: '#22c55e', order_position: 0, is_system_default: true },
    { id: '1', stage_key: 'booked', display_name: 'Booked', emoji: '📅', color: '#3b82f6', order_position: 1, is_system_default: true },
    { id: '2', stage_key: 'follow-up', display_name: 'Follow-up', emoji: '💬', color: '#f59e0b', order_position: 2, is_system_default: false },
    { id: '3', stage_key: 'preparing', display_name: 'Preparing', emoji: '⏳', color: '#8b5cf6', order_position: 3, is_system_default: false },
    { id: '4', stage_key: 'testing', display_name: 'Testing', emoji: '🧪', color: '#ec4899', order_position: 4, is_system_default: false },
    { id: '5', stage_key: 'running', display_name: 'Running', emoji: '🚀', color: '#10b981', order_position: 5, is_system_default: false }
  ];

  // Load custom stages from localStorage on mount
  useEffect(() => {
    const loadCustomStages = () => {
      try {
        const customStages = localStorage.getItem('custom_stages');

        // Migration: If custom_stages exists but doesn't have 'evaluated', add it
        if (customStages) {
          const parsed = JSON.parse(customStages);
          if (Array.isArray(parsed) && parsed.length > 0) {
              let stagesToUse = parsed;

              // Ensure system default stages (evaluated and booked) are always present
              const systemDefaultStages = defaultStages.filter(s => s.is_system_default);
              const systemStageKeys = systemDefaultStages.map(s => s.stage_key);

              // Check if any system default stage is missing
              const hasEvaluated = parsed.some(s => s.stage_key === 'evaluated');
              const hasBooked = parsed.some(s => s.stage_key === 'booked');

              if (!hasEvaluated || !hasBooked) {
                // Rebuild stages with system defaults included
                const existingSystemStages = parsed.filter(s => s.is_system_default);
                const existingCustomStages = parsed.filter(s => !s.is_system_default);

                // Merge: system defaults + custom stages
                const allStages = [...systemDefaultStages, ...existingCustomStages];
                stagesToUse = allStages;

                // Save to localStorage
                localStorage.setItem('custom_stages', JSON.stringify(allStages));
                console.log('Migrated: Ensured system default stages present');
              }

              // Extract stage keys in order
              const stageKeys = stagesToUse
                .sort((a, b) => (a.order_position || 0) - (b.order_position || 0))
                .map(s => s.stage_key);

              setPhases(stageKeys);

              // Create stage config mapping
              const config = {};
              stagesToUse.forEach(stage => {
              config[stage.stage_key] = {
                display_name: stage.display_name,
                emoji: stage.emoji,
                color: stage.color,
                is_system_default: stage.is_system_default
              };
            });
            setStageConfig(config);
            return;
          }
        }

        // Initialize with default stages if nothing valid found
        localStorage.setItem('custom_stages', JSON.stringify(defaultStages));

        // Always ensure system default stages exist
        const finalStages = defaultStages;

        // Extract stage keys in order
        const stageKeys = finalStages
          .sort((a, b) => (a.order_position || 0) - (b.order_position || 0))
          .map(s => s.stage_key);

        setPhases(stageKeys);

        // Create stage config mapping
        const config = {};
        finalStages.forEach(stage => {
          config[stage.stage_key] = {
            display_name: stage.display_name,
            emoji: stage.emoji,
            color: stage.color,
            is_system_default: stage.is_system_default
          };
        });
        setStageConfig(config);

      } catch (err) {
        console.error('Error loading custom stages:', err);
        // Fallback: initialize with defaults
        try {
          localStorage.setItem('custom_stages', JSON.stringify(defaultStages));
        } catch (e) {
          console.error('Failed to save default stages:', e);
        }
        const config = {};
        defaultStages.forEach(stage => {
          config[stage.stage_key] = {
            display_name: stage.display_name,
            emoji: stage.emoji,
            color: stage.color,
            is_system_default: stage.is_system_default
          };
        });
        setStageConfig(config);
        setPhases(defaultStages.map(s => s.stage_key));
      }
    };

    loadCustomStages();

    // Listen for storage changes (in case settings are updated in another tab)
    const handleStorageChange = (e) => {
      if (e.key === 'custom_stages') {
        loadCustomStages();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

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
          onUpdateClient={onUpdateClient}
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
          stageConfig={stageConfig[phase]}
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

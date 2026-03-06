import React, { useState, useEffect } from 'react';
import PhaseColumn from './PhaseColumn';
import ClientsTable from './ClientsTable';

const REMOVED_STAGE_KEYS = new Set(['followup', 'preparing', 'testing', 'running']);

const normalizeStageToken = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const isRemovedStage = (stage) => {
  const keyToken = normalizeStageToken(stage?.stage_key);
  const labelToken = normalizeStageToken(stage?.display_name);
  return REMOVED_STAGE_KEYS.has(keyToken) || REMOVED_STAGE_KEYS.has(labelToken);
};

const PhasesContainer = ({ clients, filters, onViewClient, onEditClient, onMoveClient, onUpdateClient, viewMode = 'kanban', onEvaluate, onManageQuestions }) => {
  const [phases, setPhases] = useState(['evaluated', 'booked']);
  const [stageConfig, setStageConfig] = useState({});

  // Default stages array
  const defaultStages = [
    { id: '0', stage_key: 'evaluated', display_name: 'Evaluated', emoji: '✅', color: '#22c55e', order_position: 0, is_system_default: true },
    { id: '1', stage_key: 'booked', display_name: 'Booked', emoji: '📅', color: '#3b82f6', order_position: 1, is_system_default: true }
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
            const filteredStages = parsed.filter((stage) => !isRemovedStage(stage));
            let stagesToUse = filteredStages;

            // Ensure system default stages (evaluated and booked) are always present
            const systemDefaultStages = defaultStages.filter(s => s.is_system_default);
            // Check if any system default stage is missing
            const hasEvaluated = stagesToUse.some(s => s.stage_key === 'evaluated');
            const hasBooked = stagesToUse.some(s => s.stage_key === 'booked');

            if (!hasEvaluated || !hasBooked || filteredStages.length !== parsed.length) {
              // Rebuild stages with system defaults included
              const existingCustomStages = stagesToUse.filter(s => !s.is_system_default);

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

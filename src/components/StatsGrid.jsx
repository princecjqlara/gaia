import React, { useState, useEffect } from 'react';
import { formatPrice } from '../utils/clients';

const DEPRECATED_STAGE_KEYS = new Set(['followup', 'preparing', 'testing', 'running']);

const normalizeStageToken = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const isDeprecatedStage = (stage) => {
  const keyToken = normalizeStageToken(stage?.stage_key);
  const labelToken = normalizeStageToken(stage?.display_name);
  return DEPRECATED_STAGE_KEYS.has(keyToken) || DEPRECATED_STAGE_KEYS.has(labelToken);
};

const StatsGrid = ({ metrics, role }) => {
  const [customStages, setCustomStages] = useState([]);

  // Load custom stages from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('custom_stages');
      if (stored) {
        const parsed = JSON.parse(stored) || [];
        setCustomStages(parsed.filter((stage) => !isDeprecatedStage(stage)));
      }
    } catch (err) {
      console.error('Error loading custom stages:', err);
    }
  }, []);

  // Use custom stages for metrics if available, otherwise use default
  const getStageMetrics = () => {
    if (customStages && customStages.length > 0 && metrics.stageMetrics) {
      return customStages
        .sort((a, b) => (a.order_position || 0) - (b.order_position || 0))
        .slice(0, 4) // Show first 4 stages
        .map(stage => ({
          icon: stage.emoji,
          label: stage.display_name,
          value: metrics.stageMetrics[stage.stage_key] || 0
        }));
    }
    // Fallback to default stages
    return [
      { icon: '✅', label: 'Evaluated', value: metrics.evaluated },
      { icon: '📅', label: 'Booked', value: metrics.booked },
    ];
  };

  const stageMetrics = getStageMetrics();

  return (
    <section className="stats-grid" id="statsGrid">
      <div className="stat-card">
        <div className="stat-icon">👥</div>
        <div className="stat-value">{metrics.totalClients}</div>
        <div className="stat-label">Total Clients</div>
      </div>
      {stageMetrics.map((stage, index) => (
        <div key={`stage-${index}`} className="stat-card">
          <div className="stat-icon">{stage.icon}</div>
          <div className="stat-value">{stage.value}</div>
          <div className="stat-label">{stage.label}</div>
        </div>
      ))}

    </section>
  );
};

export default StatsGrid;


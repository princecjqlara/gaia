import { useState, useEffect } from 'react';
import { getPackagePrice } from '../utils/clients';

export const useMetrics = (clients) => {
  const [metrics, setMetrics] = useState({
    totalClients: 0,
    booked: 0,
    followUp: 0,
    preparing: 0,
    testing: 0,
    running: 0,
    monthlyRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    stageMetrics: {}
  });
  const [customStages, setCustomStages] = useState([]);

  // Load custom stages from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('custom_stages');
      if (stored) {
        setCustomStages(JSON.parse(stored) || []);
      }
    } catch (err) {
      console.error('Error loading custom stages:', err);
    }
  }, []);

  const updateMetrics = () => {
    // Changed to track ALL paid clients regardless of phase
    const paidClients = clients.filter(c => c.paymentStatus === 'paid');

    const expenses = JSON.parse(localStorage.getItem('gaia_expenses') || '{}');
    const revenue = paidClients.reduce((total, client) => {
      return total + getPackagePrice(client);
    }, 0);

    const totalExpenses = paidClients.reduce((total, client) => {
      const pkgExpense = expenses[client.package] || 0;
      const adsExpense = client.adsExpense || 0;
      return total + pkgExpense + adsExpense;
    }, 0);

    const netProfit = revenue - totalExpenses;

    // Expected Value: sum of ALL clients' package prices (regardless of phase or payment)
    const expectedValue = clients.reduce((total, client) => {
      return total + getPackagePrice(client);
    }, 0);

    // Generate stage metrics dynamically based on custom stages
    const stageMetrics = {};
    if (customStages && customStages.length > 0) {
      customStages.forEach(stage => {
        stageMetrics[stage.stage_key] = clients.filter(c => c.phase === stage.stage_key).length;
      });
    } else {
      // Fallback to default stages
      stageMetrics.booked = clients.filter(c => c.phase === 'booked').length;
      stageMetrics['follow-up'] = clients.filter(c => c.phase === 'follow-up').length;
      stageMetrics.preparing = clients.filter(c => c.phase === 'preparing').length;
      stageMetrics.testing = clients.filter(c => c.phase === 'testing').length;
      stageMetrics.running = clients.filter(c => c.phase === 'running').length;
    }

    setMetrics({
      totalClients: clients.length,
      booked: stageMetrics.booked || 0,
      followUp: stageMetrics['follow-up'] || 0,
      preparing: stageMetrics.preparing || 0,
      testing: stageMetrics.testing || 0,
      running: stageMetrics.running || 0,
      monthlyRevenue: revenue,
      totalExpenses: totalExpenses,
      netProfit: netProfit,
      expectedValue: expectedValue,
      stageMetrics: stageMetrics
    });
  };

  useEffect(() => {
    updateMetrics();
  }, [clients, customStages]);

  return { metrics, updateMetrics, customStages };
};




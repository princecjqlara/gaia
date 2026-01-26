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
    netProfit: 0
  });

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

    setMetrics({
      totalClients: clients.length,
      booked: clients.filter(c => c.phase === 'booked').length,
      followUp: clients.filter(c => c.phase === 'follow-up').length,
      preparing: clients.filter(c => c.phase === 'preparing').length,
      testing: 0,
      running: 0,
      monthlyRevenue: revenue,
      totalExpenses: totalExpenses,
      netProfit: netProfit,
      expectedValue: expectedValue
    });
  };

  useEffect(() => {
    updateMetrics();
  }, [clients]);

  return { metrics, updateMetrics };
};



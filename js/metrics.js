/* ============================================
   Metrics Module - Dashboard Statistics
   ============================================ */

const Metrics = {
    // Calculate all metrics
    calculate() {
        const clients = Storage.getClients();
        const runningPaidClients = clients.filter(c => c.phase === 'running' && c.paymentStatus === 'paid');

        const revenue = this.calculateMonthlyRevenue(runningPaidClients);
        const expenses = this.calculateTotalExpenses(runningPaidClients);
        const profit = revenue - expenses;

        return {
            totalClients: clients.length,
            totalClients: clients.length,
            booked: clients.filter(c => c.phase === 'booked').length,
            preparing: clients.filter(c => c.phase === 'preparing').length,
            testing: clients.filter(c => c.phase === 'testing').length,
            running: clients.filter(c => c.phase === 'running').length,
            monthlyRevenue: revenue,
            totalExpenses: expenses,
            netProfit: profit,
            paidClients: clients.filter(c => c.paymentStatus === 'paid').length,
            unpaidClients: clients.filter(c => c.paymentStatus === 'unpaid').length
        };
    },

    // Calculate monthly revenue from running clients
    calculateMonthlyRevenue(clients) {
        return clients.reduce((total, client) => {
            return total + Clients.getPackagePrice(client);
        }, 0);
    },

    // Calculate total expenses (package expense + ads expense)
    calculateTotalExpenses(clients) {
        const packageExpenses = Storage.getExpenses();

        return clients.reduce((total, client) => {
            const pkgExpense = packageExpenses[client.package] || 0;
            const adsExpense = client.adsExpense || 0;
            return total + pkgExpense + adsExpense;
        }, 0);
    },

    // Update dashboard display
    updateDashboard() {
        const metrics = this.calculate();

        const update = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        update('statTotalClients', metrics.totalClients);
        update('statBooked', metrics.booked);
        update('statPreparing', metrics.preparing);
        update('statTesting', metrics.testing);
        update('statRunning', metrics.running);
        update('statRevenue', Clients.formatPrice(metrics.monthlyRevenue));
        update('statExpenses', Clients.formatPrice(metrics.totalExpenses));
        update('statProfit', Clients.formatPrice(metrics.netProfit));
    }
};

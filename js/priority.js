/* ============================================
   Priority Module - Priority Queue Management
   ============================================ */

const Priority = {
    // Recalculate priorities for all clients
    recalculateAll() {
        const clients = Storage.getClients();
        const byPhase = { preparing: [], testing: [], running: [] };

        clients.forEach(client => {
            if (byPhase[client.phase]) byPhase[client.phase].push(client);
        });

        Object.keys(byPhase).forEach(phase => {
            this.calculatePhasePriorities(byPhase[phase]);
        });
    },

    // Calculate priorities for clients in a phase (first come, first serve)
    calculatePhasePriorities(clients) {
        if (clients.length === 0) return;

        clients.sort((a, b) => {
            const dateA = new Date(a.phaseEnteredAt || a.createdAt);
            const dateB = new Date(b.phaseEnteredAt || b.createdAt);
            return dateA - dateB;
        });

        clients.forEach((client, index) => {
            const newPriority = index + 1;
            if (client.priority !== newPriority) {
                Storage.updateClient(client.id, { priority: newPriority });
            }
        });
    },

    // Get priority for new client
    getNewClientPriority(phase) {
        const clients = Storage.getClients().filter(c => c.phase === phase);
        return clients.length + 1;
    },

    // Get sorted clients by priority
    getSortedClients(phase) {
        return Storage.getClients()
            .filter(c => c.phase === phase)
            .sort((a, b) => (a.priority || 999) - (b.priority || 999));
    }
};

/* ============================================
   Phases Module - Phase Management & Transitions
   ============================================ */

const Phases = {
    // Phase order for transitions
    order: ['booked', 'preparing', 'testing', 'running'],

    // Get next phase
    getNextPhase(currentPhase) {
        const index = this.order.indexOf(currentPhase);
        if (index < this.order.length - 1) {
            return this.order[index + 1];
        }
        return null; // Already at running (final phase)
    },

    // Get previous phase
    getPreviousPhase(currentPhase) {
        const index = this.order.indexOf(currentPhase);
        if (index > 0) {
            return this.order[index - 1];
        }
        return null; // Already at preparing (first phase)
    },

    // Move client to next phase
    moveToNextPhase(clientId) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/ba30085e-3ebc-4936-81b7-428dd068dfa1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'phases.js:28',message:'moveToNextPhase entry',data:{clientId:clientId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        const client = Storage.getClient(clientId);
        if (!client) {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/ba30085e-3ebc-4936-81b7-428dd068dfa1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'phases.js:31',message:'client not found',data:{clientId:clientId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return null;
        }

        const nextPhase = this.getNextPhase(client.phase);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/ba30085e-3ebc-4936-81b7-428dd068dfa1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'phases.js:34',message:'phase transition',data:{fromPhase:client.phase,toPhase:nextPhase,hasNextPhase:!!nextPhase},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        if (!nextPhase) {
            App.showToast('Client is already in the final phase', 'warning');
            return null;
        }

        const fromPhase = client.phase;
        const updates = {
            phase: nextPhase,
            phaseEnteredAt: new Date().toISOString()
        };

        // If moving to testing, start subscription
        if (nextPhase === 'testing') {
            updates.subscriptionStarted = true;
            updates.subscriptionUsage = 0;
            updates.testingRound = client.testingRound || 1;
        }

        // Update auto switch date if enabled
        if (client.autoSwitch) {
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + (client.autoSwitchDays || 7));
            updates.nextPhaseDate = nextDate.toISOString().split('T')[0];
        }

        // Update client and log history
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/ba30085e-3ebc-4936-81b7-428dd068dfa1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'phases.js:59',message:'before updateClient',data:{clientId:clientId,updates:updates},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        const updatedClient = Storage.updateClient(clientId, updates);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/ba30085e-3ebc-4936-81b7-428dd068dfa1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'phases.js:61',message:'after updateClient',data:{updatedClientId:updatedClient?.id,newPhase:updatedClient?.phase},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        Storage.addHistoryEntry(clientId, client.clientName, fromPhase, nextPhase, Storage.getCurrentUser());
        Priority.recalculateAll();

        return updatedClient;
    },

    // Move client to specific phase
    moveToPhase(clientId, targetPhase) {
        if (!this.order.includes(targetPhase)) {
            console.error('Invalid phase:', targetPhase);
            return null;
        }

        const client = Storage.getClient(clientId);
        if (!client) return null;

        const updates = {
            phase: targetPhase,
            phaseEnteredAt: new Date().toISOString()
        };

        // Handle testing phase specifics
        if (targetPhase === 'testing' && !client.subscriptionStarted) {
            updates.subscriptionStarted = true;
            updates.subscriptionUsage = 0;
        }

        // Update auto switch date if enabled
        if (client.autoSwitch) {
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + (client.autoSwitchDays || 7));
            updates.nextPhaseDate = nextDate.toISOString().split('T')[0];
        }

        const updatedClient = Storage.updateClient(clientId, updates);
        Priority.recalculateAll();

        return updatedClient;
    },

    // Start new testing round
    startNewTestingRound(clientId) {
        const client = Storage.getClient(clientId);
        if (!client || client.phase !== 'testing') {
            App.showToast('Client must be in testing phase', 'warning');
            return null;
        }

        const updates = {
            testingRound: (client.testingRound || 1) + 1,
            subscriptionUsage: 0
        };

        return Storage.updateClient(clientId, updates);
    },

    // Check and process auto-switches
    processAutoSwitches() {
        const clients = Storage.getClients();
        const today = new Date().toISOString().split('T')[0];
        let switched = 0;

        clients.forEach(client => {
            if (client.autoSwitch && client.nextPhaseDate && client.nextPhaseDate <= today) {
                const nextPhase = this.getNextPhase(client.phase);
                if (nextPhase) {
                    this.moveToNextPhase(client.id);
                    switched++;
                }
            }
        });

        if (switched > 0) {
            App.showToast(`Auto-switched ${switched} client(s) to next phase`, 'success');
        }

        return switched;
    },

    // Get clients by phase
    getClientsByPhase(phase) {
        return Storage.getClients().filter(c => c.phase === phase);
    },

    // Render phase column
    renderPhaseColumn(phase) {
        const container = document.getElementById(`${phase}Clients`);
        const countEl = document.getElementById(`${phase}Count`);

        if (!container) return;

        let clients = this.getClientsByPhase(phase);

        // Apply filters
        clients = this.applyFilters(clients);

        // Sort by priority
        clients.sort((a, b) => (a.priority || 999) - (b.priority || 999));

        // Update count
        if (countEl) {
            countEl.textContent = clients.length;
        }

        // Render cards
        if (clients.length === 0) {
            container.innerHTML = '<div class="phase-empty">No clients in this phase</div>';
        } else {
            container.innerHTML = clients.map(c => Clients.renderClientCard(c)).join('');
        }

        // Add event listeners
        this.attachCardListeners(container);
    },

    // Apply current filters to clients
    applyFilters(clients) {
        const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const phaseFilter = document.getElementById('filterPhase')?.value || '';
        const packageFilter = document.getElementById('filterPackage')?.value || '';
        const paymentFilter = document.getElementById('filterPayment')?.value || '';

        return clients.filter(client => {
            // Search filter
            if (searchTerm) {
                const searchable = [
                    client.clientName,
                    client.businessName,
                    client.contactDetails,
                    ...(client.tags || [])
                ].join(' ').toLowerCase();

                if (!searchable.includes(searchTerm)) {
                    return false;
                }
            }

            // Package filter
            if (packageFilter && client.package !== packageFilter) {
                return false;
            }

            // Payment filter
            if (paymentFilter && client.paymentStatus !== paymentFilter) {
                return false;
            }

            return true;
        });
    },

    // Attach event listeners to cards
    attachCardListeners(container) {
        // View buttons
        container.querySelectorAll('.view-client-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                App.openViewModal(id);
            });
        });

        // Edit buttons
        container.querySelectorAll('.edit-client-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                App.openEditModal(id);
            });
        });

        // Move next buttons
        container.querySelectorAll('.move-next-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.moveToNextPhase(id);
                App.refreshUI();
                App.showToast('Client moved to next phase', 'success');
            });
        });

        // Archive buttons
        container.querySelectorAll('.archive-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                if (confirm('Archive this client? They will be removed from active view.')) {
                    Storage.deleteClient(id);
                    App.refreshUI();
                    App.showToast('Client archived', 'info');
                }
            });
        });

        // Card click for view
        container.querySelectorAll('.client-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                App.openViewModal(id);
            });
        });

        // Drag and drop
        this.setupDragAndDrop(container);
    },

    // Setup drag and drop for priority reordering
    setupDragAndDrop(container) {
        container.querySelectorAll('.client-card').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                card.classList.add('dragging');
                e.dataTransfer.setData('text/plain', card.dataset.id);
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
            });
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = container.querySelector('.dragging');
            const siblings = [...container.querySelectorAll('.client-card:not(.dragging)')];

            const nextSibling = siblings.find(sibling => {
                const box = sibling.getBoundingClientRect();
                return e.clientY < box.top + box.height / 2;
            });

            if (nextSibling) {
                container.insertBefore(dragging, nextSibling);
            } else if (siblings.length > 0) {
                container.appendChild(dragging);
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            // Update priorities based on new order
            const cards = container.querySelectorAll('.client-card');
            cards.forEach((card, index) => {
                Storage.updateClient(card.dataset.id, { priority: index + 1 });
            });
            App.refreshUI();
        });
    },

    // Render all phase columns
    renderAllPhases() {
        this.order.forEach(phase => this.renderPhaseColumn(phase));
        this.setupCrossColumnDragDrop();
    },

    // Setup cross-column drag and drop
    setupCrossColumnDragDrop() {
        const columns = document.querySelectorAll('.phase-column');

        columns.forEach(column => {
            const phase = column.dataset.phase;
            const container = column.querySelector('.phase-clients');

            column.addEventListener('dragover', (e) => {
                e.preventDefault();
                column.style.borderColor = 'var(--primary)';
            });

            column.addEventListener('dragleave', () => {
                column.style.borderColor = '';
            });

            column.addEventListener('drop', (e) => {
                e.preventDefault();
                column.style.borderColor = '';

                const clientId = e.dataTransfer.getData('text/plain');
                if (!clientId) return;

                const client = Storage.getClient(clientId);
                if (!client || client.phase === phase) return;

                // Move client to this phase
                const fromPhase = client.phase;
                const updates = {
                    phase: phase,
                    phaseEnteredAt: new Date().toISOString()
                };

                // Handle resubscription (reset to preparing)
                if (phase === 'preparing' && fromPhase !== 'preparing') {
                    updates.resubscriptionCount = (client.resubscriptionCount || 0) + 1;
                }

                // Handle testing phase
                if (phase === 'testing') {
                    updates.subscriptionStarted = true;
                    if (fromPhase === 'preparing') {
                        updates.subscriptionUsage = 0;
                        updates.testingRound = 1;
                    }
                }

                Storage.updateClient(clientId, updates);
                Storage.addHistoryEntry(clientId, client.clientName, fromPhase, phase, Storage.getCurrentUser());
                Priority.recalculateAll();
                App.refreshUI();
                App.showToast(`Moved ${client.clientName} to ${phase}`, 'success');
            });
        });
    }
};

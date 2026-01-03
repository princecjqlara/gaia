import { notificationService } from '../services/notificationService';
import { getSupabaseClient } from '../services/supabase';

export const usePhases = (clients, filters, currentUser = null, updateClient = null) => {

  const getClientsByPhase = (phase) => {
    let filtered = clients.filter(c => c.phase === phase);

    // Apply filters
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

    // Sort by priority
    filtered.sort((a, b) => (a.priority || 999) - (b.priority || 999));

    return filtered;
  };

  const moveToNextPhase = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return null;

    const order = ['booked', 'follow-up', 'preparing', 'testing', 'running'];
    const currentIndex = order.indexOf(client.phase);
    if (currentIndex < order.length - 1) {
      const nextPhase = order[currentIndex + 1];
      updateClient(clientId, {
        phase: nextPhase,
        phaseEnteredAt: new Date().toISOString()
      });
      return nextPhase;
    }
    return null;
  };

  const moveClientToPhase = async (clientId, targetPhase) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return null;

    // Don't move if already in target phase
    if (client.phase === targetPhase) return null;

    const fromPhase = client.phase;
    const updates = {
      phase: targetPhase,
      phaseEnteredAt: new Date().toISOString()
    };

    // Handle resubscription (reset to preparing)
    if (targetPhase === 'preparing' && fromPhase !== 'preparing') {
      updates.resubscriptionCount = (client.resubscriptionCount || 0) + 1;
    }

    // Handle testing phase
    if (targetPhase === 'testing') {
      updates.subscriptionStarted = true;
      if (fromPhase === 'preparing') {
        updates.subscriptionUsage = 0;
        updates.testingRound = 1;
      }
    }

    // Update auto switch date if enabled
    if (client.autoSwitch) {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + (client.autoSwitchDays || 7));
      updates.nextPhaseDate = nextDate.toISOString().split('T')[0];
    }

    // Update local storage first (for immediate UI update)
    updateClient(clientId, updates);

    // Update Supabase and create stage history (if online)
    const supabaseClient = getSupabaseClient();
    if (supabaseClient && currentUser) {
      try {
        // Map client updates to Supabase format
        const supabaseUpdates = {
          phase: targetPhase,
          updated_at: new Date().toISOString()
        };

        // Add other fields if they exist in updates
        if (updates.resubscriptionCount !== undefined) {
          supabaseUpdates.resubscription_count = updates.resubscriptionCount;
        }
        if (updates.subscriptionStarted !== undefined) {
          supabaseUpdates.subscription_started = updates.subscriptionStarted;
        }
        if (updates.subscriptionUsage !== undefined) {
          supabaseUpdates.subscription_usage = updates.subscriptionUsage;
        }
        if (updates.testingRound !== undefined) {
          supabaseUpdates.testing_round = updates.testingRound;
        }
        if (updates.nextPhaseDate) {
          supabaseUpdates.next_phase_date = updates.nextPhaseDate;
        }

        // Update client in Supabase
        const { error: updateError } = await supabaseClient
          .from('clients')
          .update(supabaseUpdates)
          .eq('id', clientId);

        if (updateError) {
          console.error('Error updating client in Supabase:', updateError);
        }

        // Create stage history record
        const { error: historyError } = await supabaseClient
          .from('stage_history')
          .insert({
            client_id: clientId,
            from_phase: fromPhase,
            to_phase: targetPhase,
            changed_by: currentUser.id,
            changed_by_name: currentUser.email || 'Unknown User'
          });

        if (historyError) {
          console.error('Error creating stage history:', historyError);
        }

        // Create notification for phase transition
        let targetUserId = client.assignedTo;

        // If assignedTo is not a UUID, try to find user by name
        if (targetUserId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
          const { data: user } = await supabaseClient
            .from('users')
            .select('id')
            .or(`name.eq.${targetUserId},email.eq.${targetUserId}`)
            .limit(1)
            .maybeSingle()
            .catch(() => ({ data: null }));

          if (user?.id) {
            targetUserId = user.id;
          } else {
            // If user not found, skip notification
            return targetPhase;
          }
        }

        if (targetUserId) {
          await notificationService.notifyPhaseTransition(
            clientId,
            fromPhase,
            targetPhase,
            targetUserId,
            client.clientName || 'Unknown Client'
          );
        }
      } catch (error) {
        // Don't block phase transition if Supabase update fails
        console.error('Error updating client in Supabase:', error);
      }
    }

    return targetPhase;
  };

  const renderAllPhases = () => {
    // This will be handled by the PhasesContainer component
    return {
      booked: getClientsByPhase('booked'),
      'follow-up': getClientsByPhase('follow-up'),
      preparing: getClientsByPhase('preparing'),
      testing: getClientsByPhase('testing'),
      running: getClientsByPhase('running')
    };
  };

  return {
    getClientsByPhase,
    moveToNextPhase,
    moveClientToPhase,
    renderAllPhases
  };
};


import { getSupabaseClient } from './supabase';

// Service to automatically create notifications
export const notificationService = {
  // Check and create payment due notifications
  async checkPaymentDueNotifications(clients, defaultUserId) {
    const client = getSupabaseClient();
    if (!client) return;

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    if (!clients || !Array.isArray(clients)) return;

    for (const clientRecord of clients) {
      if (!clientRecord || !clientRecord.startDate || !clientRecord.paymentSchedule) continue;

      try {
        const startDate = new Date(clientRecord.startDate);
        if (isNaN(startDate.getTime())) continue;

        const monthsWithClient = clientRecord.monthsWithClient || 0;

        if (clientRecord.paymentSchedule === 'monthly') {
          const nextPaymentDate = new Date(startDate);
          nextPaymentDate.setMonth(nextPaymentDate.getMonth() + monthsWithClient + 1);

          const daysUntilDue = Math.ceil((nextPaymentDate - now) / (1000 * 60 * 60 * 24));

          if (daysUntilDue <= 3) {
            const isOverdue = daysUntilDue < 0;
            const notificationType = isOverdue ? 'payment_overdue' : 'payment_due';
            const priority = isOverdue ? 'urgent' : 'high';

            let targetUserId = defaultUserId;
            if (clientRecord.assignedTo) {
              const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (uuidRegex.test(clientRecord.assignedTo)) {
                targetUserId = clientRecord.assignedTo;
              }
            }

            if (targetUserId) {
              await this.createNotification({
                user_id: targetUserId,
                type: notificationType,
                title: `Payment ${isOverdue ? 'Overdue' : 'Due Soon'}: ${clientRecord.clientName || 'Unknown'}`,
                message: `Payment for ${clientRecord.clientName || 'Unknown'} is ${isOverdue ? Math.abs(daysUntilDue) + ' days overdue' : 'due in ' + daysUntilDue + ' days'}.`,
                related_client_id: clientRecord.id,
                related_entity_type: 'payment',
                priority,
                action_url: `#client-${clientRecord.id}`
              });
            }
          }
        }
      } catch (error) {
        console.error('Error processing payment notification for client:', clientRecord.id, error);
      }
    }
  },

  // Notify about meeting reschedule
  async notifyMeetingRescheduled(meeting, clientName, assignedUserId, reschedulerName) {
    if (!assignedUserId) return;

    const meetingTime = new Date(meeting.start_time).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    await this.createNotification({
      user_id: assignedUserId,
      type: 'meeting_rescheduled',
      title: `Meeting Rescheduled: ${meeting.title}`,
      message: `Meeting "${meeting.title}" for ${clientName} has been rescheduled by ${reschedulerName}. New time: ${meetingTime}`,
      related_client_id: meeting.client_id,
      related_entity_type: 'meeting',
      priority: 'high',
      action_url: `#calendar`
    });
  },

  // Notify about meeting cancelled
  async notifyMeetingCancelled(meeting, clientName, assignedUserId, cancellerName) {
    if (!assignedUserId) return;

    await this.createNotification({
      user_id: assignedUserId,
      type: 'meeting_cancelled',
      title: `Meeting Cancelled: ${meeting.title}`,
      message: `Meeting "${meeting.title}" for ${clientName} has been cancelled by ${cancellerName}.`,
      related_client_id: meeting.client_id,
      related_entity_type: 'meeting',
      priority: 'normal',
      action_url: `#calendar`
    });
  },

  // Notify about meeting completed
  async notifyMeetingCompleted(meeting, clientName, assignedUserId, notes) {
    if (!assignedUserId) return;

    await this.createNotification({
      user_id: assignedUserId,
      type: 'meeting_done',
      title: `Meeting Completed: ${meeting.title}`,
      message: notes ? `Meeting notes: ${notes.substring(0, 100)}${notes.length > 100 ? '...' : ''}` : `Meeting "${meeting.title}" for ${clientName} has been marked as done.`,
      related_client_id: meeting.client_id,
      related_entity_type: 'meeting',
      priority: 'normal',
      action_url: `#calendar`
    });
  },

  // Admin send message to user
  async sendAdminMessage(targetUserId, title, message, senderId) {
    await this.createNotification({
      user_id: targetUserId,
      type: 'admin_message',
      title: title,
      message: message,
      related_entity_type: 'message',
      related_entity_id: senderId,
      priority: 'high',
      action_url: `#notifications`
    }, true); // Force create even if similar exists
  },

  // User reply to notification
  async replyToNotification(originalNotificationId, replyMessage, senderId, recipientId) {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      // Get original notification
      const { data: original } = await client
        .from('notifications')
        .select('title')
        .eq('id', originalNotificationId)
        .single();

      await this.createNotification({
        user_id: recipientId,
        type: 'message_reply',
        title: `Reply: ${original?.title || 'Message'}`,
        message: replyMessage,
        related_entity_type: 'message',
        related_entity_id: originalNotificationId,
        priority: 'normal',
        action_url: `#notifications`
      }, true);

      return true;
    } catch (error) {
      console.error('Error sending reply:', error);
      return false;
    }
  },

  // Create notification for phase transitions
  async notifyPhaseTransition(clientId, fromPhase, toPhase, userId, clientName) {
    await this.createNotification({
      user_id: userId,
      type: 'phase_transition',
      title: `Phase Changed: ${toPhase}`,
      message: `${clientName} moved from ${fromPhase || 'unknown'} to ${toPhase}.`,
      related_client_id: clientId,
      related_entity_type: 'phase',
      priority: 'normal',
      action_url: `#client-${clientId}`
    });
  },

  // Create notification for testing phase completion
  async notifyTestingComplete(clientId, userId, clientName) {
    await this.createNotification({
      user_id: userId,
      type: 'testing_complete',
      title: `Testing Complete: ${clientName}`,
      message: `${clientName} has completed testing phase and is ready to move to running.`,
      related_client_id: clientId,
      related_entity_type: 'phase',
      priority: 'high',
      action_url: `#client-${clientId}`
    });
  },

  // Create notification for client milestones
  async notifyMilestone(clientId, userId, clientName, months) {
    await this.createNotification({
      user_id: userId,
      type: 'milestone',
      title: `🎯 ${months} Month Anniversary: ${clientName}`,
      message: `Congratulations! ${clientName} has been with us for ${months} months.`,
      related_client_id: clientId,
      related_entity_type: 'milestone',
      priority: 'normal',
      action_url: `#client-${clientId}`
    });
  },

  // Generic notification creator
  async createNotification(notificationData, forceCreate = false) {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      // Check if notifications table exists (graceful degradation)
      if (!forceCreate) {
        const { data: existing } = await client
          .from('notifications')
          .select('id, created_at')
          .eq('user_id', notificationData.user_id)
          .eq('type', notificationData.type)
          .eq('related_client_id', notificationData.related_client_id || '')
          .eq('read', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .catch(() => ({ data: null }));

        if (existing) {
          const existingDate = new Date(existing.created_at);
          const hoursSince = (new Date() - existingDate) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            return false;
          }
        }
      }

      const { error } = await client
        .from('notifications')
        .insert(notificationData);

      if (error) {
        if (error.code === '42P01') {
          console.warn('Notifications table not found.');
          return false;
        }
        throw error;
      }
      return true;
    } catch (error) {
      if (error.code !== '42P01') {
        console.error('Error creating notification:', error);
      }
      return false;
    }
  }
};

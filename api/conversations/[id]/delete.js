import facebookService from '../../../src/services/facebookService';

export default async function handler(req, res) {
    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'Conversation ID is required' });
    }

    try {
        console.log(`[API] Request to delete conversation: ${id}`);
        const result = await facebookService.deleteConversation(id);

        return res.status(200).json({
            success: true,
            message: 'Conversation and all related data deleted successfully',
            details: result
        });
    } catch (error) {
        console.error('[API] Delete conversation error:', error);
        return res.status(500).json({ error: 'Failed to delete conversation', details: error.message });
    }
}

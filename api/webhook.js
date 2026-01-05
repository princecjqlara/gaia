/**
 * Facebook Webhook Handler (root path)
 * Handles webhook verification and incoming messages
 */

export default function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Handle GET request - Webhook Verification
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        console.log('Webhook verification attempt:', { mode, token, challenge });

        const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || 'TEST_TOKEN';

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('Webhook verified successfully');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(challenge);
        } else {
            console.error('Webhook verification failed', { mode, token, expectedToken: VERIFY_TOKEN });
            return res.status(403).send('Verification failed');
        }
    }

    // Handle POST request - Incoming Messages
    if (req.method === 'POST') {
        const body = req.body;

        console.log('Webhook received:', JSON.stringify(body, null, 2));

        if (body.object === 'page') {
            body.entry?.forEach(entry => {
                const messagingEvents = entry.messaging || [];

                messagingEvents.forEach(event => {
                    const senderId = event.sender?.id;

                    if (event.message) {
                        console.log('New message from:', senderId, 'Text:', event.message.text);
                    }

                    if (event.postback) {
                        console.log('Postback from:', senderId, 'Payload:', event.postback.payload);
                    }
                });
            });

            return res.status(200).send('EVENT_RECEIVED');
        }

        return res.status(404).send('Unknown object type');
    }

    return res.status(405).send('Method not allowed');
}

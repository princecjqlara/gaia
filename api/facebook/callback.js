/**
 * Facebook OAuth Callback Handler
 * Exchanges authorization code for access token
 */

export default async function handler(req, res) {
    const { code, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
        console.error('Facebook OAuth error:', error, error_description);
        return res.redirect(`/?error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code) {
        return res.redirect('/?error=No authorization code received');
    }

    try {
        const appId = process.env.FACEBOOK_APP_ID;
        const appSecret = process.env.FACEBOOK_APP_SECRET;
        const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://arescampy.vercel.app'}/api/facebook/callback`;

        // Exchange code for access token
        const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;

        const tokenResponse = await fetch(tokenUrl);
        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('Token exchange error:', tokenData.error);
            return res.redirect(`/?error=${encodeURIComponent(tokenData.error.message)}`);
        }

        const userAccessToken = tokenData.access_token;

        // Get user's pages
        const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${userAccessToken}`;
        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
            console.error('Pages fetch error:', pagesData.error);
            return res.redirect(`/?error=${encodeURIComponent(pagesData.error.message)}`);
        }

        // Store pages info in a session/cookie or redirect with data
        // For now, redirect with success message
        const pageCount = pagesData.data?.length || 0;

        console.log('Connected pages:', pagesData.data);

        // Redirect back to app with success
        // In production, you'd store the page tokens in your database
        return res.redirect(`/?facebook_connected=true&pages=${pageCount}`);

    } catch (error) {
        console.error('OAuth callback error:', error);
        return res.redirect(`/?error=${encodeURIComponent(error.message)}`);
    }
}

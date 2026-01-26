/**
 * Facebook OAuth Callback Handler
 * Exchanges authorization code for access token and returns pages
 */

export default async function handler(req, res) {
    const { code, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
        console.error('Facebook OAuth error:', error, error_description);
        return res.redirect(`/?fb_error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code) {
        return res.redirect('/?fb_error=No authorization code received');
    }

    try {
        const appId = process.env.FACEBOOK_APP_ID;
        const appSecret = process.env.FACEBOOK_APP_SECRET;
        const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://gaia.vercel.app'}/api/facebook/callback`;

        // Exchange code for access token
        const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;

        const tokenResponse = await fetch(tokenUrl);
        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('Token exchange error:', tokenData.error);
            return res.redirect(`/?fb_error=${encodeURIComponent(tokenData.error.message)}`);
        }

        const userAccessToken = tokenData.access_token;

        // Get user's pages with relevant fields
        const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,picture&access_token=${userAccessToken}`;
        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
            console.error('Pages fetch error:', pagesData.error);
            return res.redirect(`/?fb_error=${encodeURIComponent(pagesData.error.message)}`);
        }

        const pages = pagesData.data || [];

        if (pages.length === 0) {
            return res.redirect('/?fb_error=No Facebook Pages found. Make sure you have admin access to at least one Facebook Page.');
        }

        // Encode pages data for URL (simplified - just essential info for selection)
        const pagesForSelection = pages.map(p => ({
            id: p.id,
            name: p.name,
            token: p.access_token,
            picture: p.picture?.data?.url
        }));

        // Store in base64 encoded JSON for URL safety
        const encodedPages = Buffer.from(JSON.stringify(pagesForSelection)).toString('base64');

        // Redirect with pages data for selection
        return res.redirect(`/?fb_pages=${encodedPages}`);

    } catch (error) {
        console.error('OAuth callback error:', error);
        return res.redirect(`/?fb_error=${encodeURIComponent(error.message)}`);
    }
}


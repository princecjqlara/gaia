# Property Media Showcase for Messenger

This feature adds a TikTok/Reels-style immersive property viewing experience for Facebook Messenger contacts.

## Features

1. **Auto-play Media**: Videos automatically play when the property showcase opens
2. **Horizontal Scroll**: Swipe or use arrows to browse through multiple images/videos per property
3. **Dual Action Buttons**: 
   - "Inquire Now" - Opens lead capture form
   - "See Details" - Toggle expanded property information
4. **Retractable Details**: Users can hide details to focus on media viewing
5. **Scroll Prompts**: Periodic "Scroll up for more properties" hint appears every 15 seconds

## Components Created

### 1. PropertyMediaShowcase.jsx
**Location**: `src/components/PropertyMediaShowcase.jsx`

The main immersive property viewing component with:
- Full-screen TikTok-style interface
- Vertical swipe to navigate between properties
- Horizontal navigation for property media
- Auto-play video support with mute toggle
- Expandable/collapsible details panel
- Lead capture modal

**Usage**:
```jsx
<PropertyMediaShowcase
    properties={properties}
    branding={branding}
    initialPropertyIndex={0}
    onClose={() => setShowShowcase(false)}
    visitorName={visitorName}
    participantId={participantId}
    teamId={teamId}
    organizationId={organizationId}
/>
```

### 2. MessengerPropertyButton.jsx
**Location**: `src/components/MessengerPropertyButton.jsx`

Button component to send property showcase cards to Messenger contacts.

**Usage**:
```jsx
<MessengerPropertyButton
    property={selectedProperty}
    participantId={conversation.participant_id}
    onSend={(property) => console.log('Sent:', property.title)}
/>
```

### 3. MessengerPropertyIntegration.jsx
**Location**: `src/components/MessengerPropertyIntegration.jsx`

Example integration showing how to add property buttons to your Messenger interface.

### 4. PublicPropertiesContainer.jsx (Updated)
**Location**: `src/components/PublicPropertiesContainer.jsx`

Updated to support `?mode=showcase` query parameter to automatically render the immersive view.

## API Endpoint

### Webhook Handler
**Location**: `api/webhook.js`

New handler for `send_property_showcase` action that sends a Facebook Messenger generic template with a web URL button.

**Request Format**:
```json
{
    "action": "send_property_showcase",
    "participantId": "123456789",
    "propertyId": "property-uuid",
    "propertyTitle": "Luxury Condo in Makati",
    "propertyImage": "https://example.com/image.jpg",
    "propertyPrice": "8500000",
    "teamId": "team-uuid"
}
```

## How It Works

### User Flow:

1. **Agent sends property** from Messenger interface using `MessengerPropertyButton`
2. **Contact receives** a Facebook Messenger card with property image, title, and "View Property" button
3. **Contact clicks** the button which opens the webview with `?mode=showcase` parameter
4. **Immersive view** loads showing the property with auto-play video (if available)
5. **Contact can**:
   - Swipe vertically to see other properties
   - Tap arrows to browse media horizontally
   - Tap "See Details" to expand property info
   - Tap "Inquire Now" to submit lead form
   - Tap "Hide Details" to collapse info and focus on media

### URL Format:

```
/property/{propertyId}?mode=showcase&pid={participantId}
```

- `mode=showcase` - Triggers the immersive TikTok-style view
- `pid={participantId}` - Participant ID for tracking and lead attribution

## Integration Steps

### 1. Add Property Button to Messenger

In your Messenger component, import and use `MessengerPropertyButton`:

```jsx
import MessengerPropertyButton from './MessengerPropertyButton';

// In your conversation view
<MessengerPropertyButton
    property={selectedProperty}
    participantId={currentConversation.participant_id}
    onSend={(property) => {
        // Optional: Log to analytics
        console.log('Property sent:', property.id);
    }}
/>
```

### 2. Configure Webhook

Ensure your Facebook webhook is configured to handle the `send_property_showcase` action. The webhook endpoint (`/api/webhook`) now supports:

- `action: "property_click"` - Log property views and send follow-up messages
- `action: "send_property_showcase"` - Send property showcase buttons to contacts

### 3. URL Routing

The `PublicPropertiesContainer` now checks for `?mode=showcase` in the URL and renders `PropertyMediaShowcase` instead of the traditional `PropertyPreview`.

### 4. Styling

The showcase uses:
- CSS variables from your existing theme
- Mobile-first design
- Full-screen fixed positioning
- Touch gesture support for swiping

## Customization

### Branding

The showcase inherits branding from `teamBrandingService`:
- Primary color for buttons
- Logo and team name
- Contact information

### Scroll Hint Timing

Modify the interval in `PropertyMediaShowcase.jsx`:

```jsx
// Line ~75 - Change 15000 to desired milliseconds
const interval = setInterval(() => {
    // ... hint logic
}, 15000); // Currently shows every 15 seconds
```

### Video Auto-play

Videos auto-play muted. Users can tap the mute button to enable sound:

```jsx
// In PropertyMediaShowcase.jsx
<video
    autoPlay
    muted={isMuted}  // Starts muted
    loop
    playsInline
    // ...
/>
```

## Data Flow

```
Agent UI
    ↓ (clicks Send Property)
MessengerPropertyButton
    ↓ POST /api/webhook
Webhook Handler
    ↓ Facebook Graph API
Messenger Contact (receives card)
    ↓ (clicks View Property)
Webview opens with ?mode=showcase
    ↓
PropertyMediaShowcase renders
    ↓
Contact views properties, can inquire
```

## Mobile Gestures

- **Swipe Up**: Next property
- **Swipe Down**: Previous property
- **Tap Left Arrow**: Previous media
- **Tap Right Arrow**: Next media
- **Tap Video**: Toggle mute/unmute

## Security Considerations

- Participant ID is passed via URL but is not sensitive (Facebook PSID)
- Lead forms submit through existing `createPropertyLead` service
- Webhook validates conversation exists before sending messages
- Page access tokens are required for all Facebook API calls

## Testing

1. Start development server
2. Open a conversation in Messenger interface
3. Click "Send Property" button
4. Check Messenger for the card
5. Click "View Property" button
6. Test swiping, media navigation, and lead form

## Troubleshooting

### Property not showing
- Check that `mode=showcase` is in URL
- Verify properties array is not empty
- Check browser console for errors

### Video not auto-playing
- Browsers block auto-play with sound; video starts muted
- User must interact to enable sound
- Check video URL is valid and accessible

### Scroll hint not appearing
- Only shows if more than 1 property
- Only shows every 15 seconds (configurable)
- Hides automatically after 3 seconds

### Button not sending
- Verify webhook endpoint is accessible
- Check Facebook page access token is valid
- Ensure conversation exists in database
- Check browser network tab for API errors

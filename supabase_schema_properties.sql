-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- 1. Properties Table
-- Stores the real estate listings
CREATE TABLE IF NOT EXISTS properties (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    -- House & Lot, Condo, etc.
    status TEXT DEFAULT 'For Sale',
    -- For Sale, Sold, etc.
    -- Location & Details
    address TEXT,
    description TEXT,
    -- Specifications
    bedrooms INTEGER DEFAULT 0,
    bathrooms INTEGER DEFAULT 0,
    garage INTEGER DEFAULT 0,
    floor_area DECIMAL DEFAULT 0,
    lot_area DECIMAL DEFAULT 0,
    year_built INTEGER,
    -- Financials
    price DECIMAL(12, 2) DEFAULT 0,
    down_payment DECIMAL(12, 2) DEFAULT 0,
    monthly_amortization DECIMAL(12, 2) DEFAULT 0,
    payment_terms TEXT,
    -- Media]
    images TEXT [] DEFAULT ARRAY []::TEXT [],
    -- Array of Cloudinary URLs
    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Search vector for full text search could be added here
    is_featured BOOLEAN DEFAULT false
);
-- 2. Property Views / Tracking Table
-- Tracks every interaction with a property
CREATE TABLE IF NOT EXISTS property_views (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    -- Who viewed it?
    client_id UUID REFERENCES clients(id) ON DELETE
    SET NULL,
        -- Linked CRM client
        user_id UUID REFERENCES auth.users(id) ON DELETE
    SET NULL,
        -- Internal user/agent
        visitor_session_id TEXT,
        -- For anonymous public visitors (cookie ID)
        -- What did they do?
        action TEXT NOT NULL DEFAULT 'view',
        -- 'view_page', 'view_gallery', 'check_price', 'inquiry_click'
        duration_seconds INTEGER,
        -- Time spent on page
        -- Context
        source TEXT,
        -- 'messenger', 'website', 'email_link'
        device_info JSONB DEFAULT '{}',
        -- User agent, device type
        created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 3. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_property_views_property_id ON property_views(property_id);
CREATE INDEX IF NOT EXISTS idx_property_views_client_id ON property_views(client_id);
CREATE INDEX IF NOT EXISTS idx_property_views_created_at ON property_views(created_at);
-- 4. Enable Row Level Security (RLS)
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_views ENABLE ROW LEVEL SECURITY;
-- 5. RLS Policies
-- Properties: Everyone can read, only authenticated users can insert/update
CREATE POLICY "Public properties are viewable by everyone" ON properties FOR
SELECT USING (true);
CREATE POLICY "Authenticated users can manage properties" ON properties FOR ALL USING (auth.role() = 'authenticated');
-- Property Views: Public can insert (tracking), Agents can read all
CREATE POLICY "Anyone can insert views" ON property_views FOR
INSERT WITH CHECK (true);
CREATE POLICY "Agents can view tracking data" ON property_views FOR
SELECT USING (auth.role() = 'authenticated');
-- 6. Helper View for Analytics
CREATE OR REPLACE VIEW property_analytics_summary AS
SELECT p.id AS property_id,
    p.title,
    COUNT(pv.id) AS total_views,
    COUNT(DISTINCT pv.visitor_session_id) AS unique_visitors,
    COUNT(
        CASE
            WHEN pv.action = 'inquiry_click' THEN 1
        END
    ) AS inquiries,
    MAX(pv.created_at) AS last_viewed_at
FROM properties p
    LEFT JOIN property_views pv ON p.id = pv.property_id
GROUP BY p.id;
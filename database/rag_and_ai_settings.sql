-- RAG Documents Migration
-- Run in Supabase SQL Editor

-- Documents table
CREATE TABLE IF NOT EXISTS rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    full_content TEXT,
    chunk_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Chunks table for split documents
CREATE TABLE IF NOT EXISTS rag_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES rag_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    start_pos INTEGER,
    end_pos INTEGER,
    -- embedding VECTOR(1536), -- Uncomment after enabling pgvector extension
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_rag_documents_created ON rag_documents(created_at DESC);

-- RLS policies
ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage documents
CREATE POLICY "Users can manage rag_documents" ON rag_documents
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Users can manage rag_chunks" ON rag_chunks
    FOR ALL USING (true) WITH CHECK (true);

-- AI Settings table
CREATE TABLE IF NOT EXISTS ai_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    ai_enabled BOOLEAN DEFAULT true,
    auto_correct_captions BOOLEAN DEFAULT true,
    show_reply_suggestions BOOLEAN DEFAULT true,
    show_conversation_scoring BOOLEAN DEFAULT true,
    custom_prompt TEXT DEFAULT '',
    conversation_flow_prompt TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage ai_settings" ON ai_settings
    FOR ALL USING (true) WITH CHECK (true);

-- Create default settings for existing users
INSERT INTO ai_settings (user_id, ai_enabled)
SELECT id, true FROM users
ON CONFLICT DO NOTHING;

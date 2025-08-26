-- Users table (with authentication support)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions for token management (optional but recommended)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat groups
CREATE TABLE IF NOT EXISTS chat_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Group memberships (current state)
CREATE TABLE IF NOT EXISTS group_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, group_id)
);

-- Membership events (for sync and audit trail)
CREATE TABLE IF NOT EXISTS membership_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    group_id UUID NOT NULL REFERENCES chat_groups(id),
    action VARCHAR(10) NOT NULL CHECK (action IN ('JOIN', 'LEAVE', 'REMOVE')),
    performed_by UUID NOT NULL REFERENCES users(id),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sync_status VARCHAR(10) DEFAULT 'synced' CHECK (sync_status IN ('pending', 'synced', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    message_type VARCHAR(10) DEFAULT 'text' CHECK (message_type IN ('text', 'system')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    server_received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sync_status VARCHAR(10) DEFAULT 'synced' CHECK (sync_status IN ('pending', 'synced', 'failed')),
    local_id VARCHAR(255), -- For mapping client-side temporary IDs
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Conflict resolution policies (admin-configurable)
CREATE TABLE IF NOT EXISTS conflict_resolution_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_name VARCHAR(100) NOT NULL,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('MESSAGE', 'MEMBERSHIP', 'GROUP')),
    conflict_type VARCHAR(100) NOT NULL,
    resolution_strategy VARCHAR(100) NOT NULL,
    parameters JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_by_admin_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(entity_type, conflict_type) -- Only one active policy per conflict type
);

-- Conflict resolution log (audit trail of resolved conflicts)
CREATE TABLE IF NOT EXISTS conflict_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conflict_type VARCHAR(100) NOT NULL,
    policy_id UUID REFERENCES conflict_resolution_policies(id),
    resolution_strategy VARCHAR(100) NOT NULL,
    affected_entity_type VARCHAR(20) NOT NULL,
    affected_entity_id UUID,
    affected_user_id UUID REFERENCES users(id),
    conflict_details JSONB NOT NULL,
    resolution_details JSONB NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sync metadata (track last sync times per user)
CREATE TABLE IF NOT EXISTS user_sync_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_sync TIMESTAMP WITH TIME ZONE,
    last_membership_sync TIMESTAMP WITH TIME ZONE,
    last_group_sync TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_chat_groups_created_by ON chat_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_chat_groups_created_at ON chat_groups(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_groups_name ON chat_groups(name);

CREATE INDEX IF NOT EXISTS idx_group_memberships_user_id ON group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_group_memberships_group_id ON group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_group_memberships_is_active ON group_memberships(is_active);
CREATE INDEX IF NOT EXISTS idx_group_memberships_last_modified ON group_memberships(last_modified);

CREATE INDEX IF NOT EXISTS idx_membership_events_user_id ON membership_events(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_events_group_id ON membership_events(group_id);
CREATE INDEX IF NOT EXISTS idx_membership_events_timestamp ON membership_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_membership_events_sync_status ON membership_events(sync_status);

CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_server_received_at ON messages(server_received_at);
CREATE INDEX IF NOT EXISTS idx_messages_sync_status ON messages(sync_status);
CREATE INDEX IF NOT EXISTS idx_messages_local_id ON messages(local_id);

CREATE INDEX IF NOT EXISTS idx_conflict_policies_entity_type ON conflict_resolution_policies(entity_type);
CREATE INDEX IF NOT EXISTS idx_conflict_policies_conflict_type ON conflict_resolution_policies(conflict_type);
CREATE INDEX IF NOT EXISTS idx_conflict_policies_is_active ON conflict_resolution_policies(is_active);

CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_affected_user_id ON conflict_resolutions(affected_user_id);
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_resolved_at ON conflict_resolutions(resolved_at);

CREATE INDEX IF NOT EXISTS idx_user_sync_metadata_user_id ON user_sync_metadata(user_id);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_groups_updated_at BEFORE UPDATE ON chat_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_memberships_updated_at BEFORE UPDATE ON group_memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conflict_policies_updated_at BEFORE UPDATE ON conflict_resolution_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_metadata_updated_at BEFORE UPDATE ON user_sync_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample hardcoded users (as requested in requirements)
INSERT INTO users (id, username, display_name, email, password_hash, is_admin) VALUES
('11111111-1111-1111-1111-111111111111', 'admin', 'System Administrator', 'admin@chatapp.com', '$2b$10$hardcoded_hash_replace_in_production', true),
('22222222-2222-2222-2222-222222222222', 'alice', 'Alice Johnson', 'alice@example.com', '$2b$10$hardcoded_hash_replace_in_production', false),
('33333333-3333-3333-3333-333333333333', 'bob', 'Bob Smith', 'bob@example.com', '$2b$10$hardcoded_hash_replace_in_production', false),
('44444444-4444-4444-4444-444444444444', 'charlie', 'Charlie Brown', 'charlie@example.com', '$2b$10$hardcoded_hash_replace_in_production', false);

-- Sample default conflict resolution policies
INSERT INTO conflict_resolution_policies (policy_name, entity_type, conflict_type, resolution_strategy, created_by_admin_id) VALUES
('Default Duplicate Join Policy', 'MEMBERSHIP', 'DUPLICATE_JOIN', 'IGNORE_DUPLICATE', '11111111-1111-1111-1111-111111111111'),
('Default Duplicate Leave Policy', 'MEMBERSHIP', 'DUPLICATE_LEAVE', 'IGNORE_DUPLICATE', '11111111-1111-1111-1111-111111111111'),
('Default Simultaneous Leave Add Policy', 'MEMBERSHIP', 'SIMULTANEOUS_LEAVE_ADD', 'LATEST_TIMESTAMP_WINS', '11111111-1111-1111-1111-111111111111'),
('Default Send to Left Group Policy', 'MESSAGE', 'SEND_TO_LEFT_GROUP', 'REJECT_MESSAGE', '11111111-1111-1111-1111-111111111111'),
('Default Send to Deleted Group Policy', 'MESSAGE', 'SEND_TO_DELETED_GROUP', 'REJECT_MESSAGE', '11111111-1111-1111-1111-111111111111'),
('Default Duplicate Message Policy', 'MESSAGE', 'DUPLICATE_MESSAGE', 'DEDUPE_BY_CONTENT_AND_TIME', '11111111-1111-1111-1111-111111111111'),
('Default Message Order Conflict Policy', 'MESSAGE', 'MESSAGE_ORDER_CONFLICT', 'SERVER_RECEIPT_ORDER', '11111111-1111-1111-1111-111111111111');

-- Sample chat groups
INSERT INTO chat_groups (id, name, description, created_by) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'General', 'General discussion for everyone', '11111111-1111-1111-1111-111111111111'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Random', 'Off-topic conversations', '22222222-2222-2222-2222-222222222222');

-- Sample group memberships
INSERT INTO group_memberships (user_id, group_id) VALUES
('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Sample membership events (for the initial joins above)
INSERT INTO membership_events (user_id, group_id, action, performed_by) VALUES
('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'JOIN', '11111111-1111-1111-1111-111111111111'),
('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'JOIN', '22222222-2222-2222-2222-222222222222'),
('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'JOIN', '33333333-3333-3333-3333-333333333333'),
('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'JOIN', '22222222-2222-2222-2222-222222222222'),
('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'JOIN', '44444444-4444-4444-4444-444444444444');

-- Sample messages
INSERT INTO messages (group_id, user_id, content, message_type) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Welcome to the General chat!', 'system'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Hello everyone!', 'text'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Hey Alice! Good to see you here.', 'text'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'This is the random channel for off-topic stuff', 'text'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'Perfect! I have lots of random things to share 😄', 'text');

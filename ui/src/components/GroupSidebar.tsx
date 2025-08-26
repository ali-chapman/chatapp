import { useState } from 'react';
import { useApp } from '../hooks/useApp';

export function GroupSidebar() {
  const { state, dispatch, createGroup, joinGroup, isUserMember } = useApp();
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setIsCreating(true);
    try {
      await createGroup(newGroupName.trim(), newGroupDescription.trim() || undefined);
      setNewGroupName('');
      setNewGroupDescription('');
    } catch (error) {
      console.error('Failed to create group:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinGroup = async (groupId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent group selection when clicking join button

    setJoiningGroupId(groupId);
    try {
      await joinGroup(groupId);
    } catch (error) {
      console.error('Failed to join group:', error);
    } finally {
      setJoiningGroupId(null);
    }
  };

  return (
    <div className="group-sidebar">
      <div className="sidebar-header">
        <h2>Groups</h2>
        <div className="status-indicator">
          <span className={`status ${state.isOnline ? 'online' : 'offline'}`}>
            {state.isOnline ? '🟢' : '🔴'} {state.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="groups-list">
        {state.groups.map(group => {
          const isMember = isUserMember(group.id);
          const isJoining = joiningGroupId === group.id;

          return (
            <div
              key={group.id}
              className={`group-item ${state.activeGroupId === group.id ? 'active' : ''} ${!isMember ? 'not-member' : ''}`}
            >
              <button
                className="group-main-button"
                onClick={() => dispatch({ type: 'SET_ACTIVE_GROUP', payload: group.id })}
              >
                <div className="group-name">{group.name}</div>
                {group.description && <div className="group-description">{group.description}</div>}
                {!isMember && (
                  <div className="membership-status">
                    Not a member {!state.isOnline && isJoining && <span className="pending-sync">• Joining when online</span>}
                  </div>
                )}
              </button>
              {!isMember && (
                <button
                  className="join-button"
                  onClick={(e) => handleJoinGroup(group.id, e)}
                  disabled={isJoining}
                  title={state.isOnline ? 'Join this group' : 'Join this group (will sync when online)'}
                >
                  {isJoining ? '...' : 'Join'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="create-group">
        <form onSubmit={handleCreateGroup}>
          <input
            type="text"
            placeholder="Group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            disabled={isCreating}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newGroupDescription}
            onChange={(e) => setNewGroupDescription(e.target.value)}
            disabled={isCreating}
          />
          <button
            type="submit"
            disabled={isCreating || !newGroupName.trim()}
          >
            {isCreating ? 'Creating...' : 'Create Group'}
          </button>
        </form>
        {!state.isOnline && (
          <div className="offline-warning">Groups will be created when you're back online</div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useApp } from '../hooks/useApp';
import { AddMemberModal } from './AddMemberModal';

export function GroupHeader() {
  const { state, loadGroupData, logout } = useApp();
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  if (!state.activeGroupId) {
    return (
      <div className="group-header">
        <h3>No group selected</h3>
      </div>
    );
  }

  const activeGroup = state.groups.find(g => g.id === state.activeGroupId);
  const groupData = state.groupData[state.activeGroupId];
  console.log('GroupHeader render', { activeGroup, groupData: state.groupData });

  if (!activeGroup) {
    return (
      <div className="group-header">
        <h3>Group not found</h3>
      </div>
    );
  }

  const isGroupCreator = state.user?.id === activeGroup.createdBy.id;

  const handleAddMemberModalClose = () => {
    setShowAddMemberModal(false);
    // Refresh group data to get updated member list
    if (state.activeGroupId) {
      loadGroupData(state.activeGroupId);
    }
  };

  return (
    <div className="group-header">
      <div className="group-info">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3>{activeGroup.name}</h3>
            {activeGroup.description && <p>{activeGroup.description}</p>}
            <div className="group-meta">
              <span>Created by {activeGroup.createdBy.displayName}</span>
              {groupData && (
                <span> • {groupData.members.length} members</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: '#666' }}>
              Logged in as {state.user?.displayName}
            </span>
            <button
              className="btn btn-small"
              onClick={logout}
              style={{ backgroundColor: '#dc3545', color: 'white' }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {groupData && (
        <div className="members-section">
          <div className="members-header">
            <strong>Members ({groupData.members.length}):</strong>
            {isGroupCreator && (
              <button
                className="btn btn-small btn-primary"
                onClick={() => setShowAddMemberModal(true)}
              >
                Add Member
              </button>
            )}
          </div>
          <div className="members-list">
            {groupData.members.map(member => (
              <span key={member.userId} className="member">
                {member.displayName}
              </span>
            ))}
          </div>
        </div>
      )}

      {showAddMemberModal && (
        <AddMemberModal
          isOpen={showAddMemberModal}
          onClose={handleAddMemberModalClose}
          groupId={state.activeGroupId!}
          currentMembers={groupData?.members.map(m => m.userId) || []}
        />
      )}
    </div>
  );
}

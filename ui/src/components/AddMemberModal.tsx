import { useState, useEffect } from 'react';
import { useApp } from '../hooks/useApp';
import * as api from '../api';
import type { User } from '../types';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  currentMembers: string[]; // Array of user IDs already in the group
}

export function AddMemberModal({ isOpen, onClose, groupId, currentMembers }: AddMemberModalProps) {
  const { state } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const allUsers = await api.getAllUsers();

      // Filter out users who are already members and the current user
      const availableUsers = allUsers.filter(user =>
        !currentMembers.includes(user.id) && user.id !== state.user?.id
      );

      setUsers(availableUsers);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) return;

    try {
      setLoading(true);
      setError(null);

      await api.addUserToGroup(groupId, selectedUserId);

      // Close modal and reset state
      setSelectedUserId('');
      onClose();

      // The parent component should refresh the member list
    } catch (err: unknown) {
      console.error('Failed to add member:', err);
      if (err && typeof err === 'object' && 'status' in err) {
        const errorWithStatus = err as { status: number };
        if (errorWithStatus.status === 403) {
          setError('Only the group creator can add members');
        } else if (errorWithStatus.status === 409) {
          setError('User is already a member of this group');
        } else {
          setError('Failed to add member to group');
        }
      } else {
        setError('Failed to add member to group');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Member to Group</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-message">{error}</div>
          )}

          {loading ? (
            <div className="loading">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="no-users">No users available to add</div>
          ) : (
            <div className="form-group">
              <label htmlFor="user-select">Select user to add:</label>
              <select
                id="user-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={loading}
              >
                <option value="">Choose a user...</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} (@{user.username})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleAddMember}
            disabled={!selectedUserId || loading}
          >
            {loading ? 'Adding...' : 'Add Member'}
          </button>
        </div>
      </div>
    </div>
  );
}

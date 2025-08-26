/* eslint-disable react-refresh/only-export-components */
/* eslint-disable prefer-const */
import React, { createContext, useReducer, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, ChatGroup, GroupData, Message, PendingMembershipEvent } from '../types';
import * as api from '../api';
import * as db from '../database';
import { syncService } from '../services/syncService';

interface AppState {
  user: User | null;
  groups: ChatGroup[];
  activeGroupId: string | null;
  groupData: Record<string, GroupData>;
  isOnline: boolean;
  isInitializing: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

type AppAction =
  | { type: 'SET_INITIALIZING'; payload: boolean }
  | { type: 'SET_USER'; payload: User }
  | { type: 'SET_GROUPS'; payload: ChatGroup[] }
  | { type: 'SET_ACTIVE_GROUP'; payload: string }
  | { type: 'SET_GROUP_DATA'; payload: { groupId: string; data: GroupData } }
  | { type: 'SET_ONLINE'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_MESSAGE'; payload: { groupId: string; message: Message } }
  | { type: 'UPDATE_MESSAGE'; payload: { groupId: string; localId: string; message: Message } }
  | { type: 'ADD_GROUP'; payload: ChatGroup }
  | { type: 'UPDATE_GROUP'; payload: { localId: string; group: ChatGroup } }
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT' };

const initialState: AppState = {
  user: null,
  groups: [],
  activeGroupId: null,
  groupData: {},
  isOnline: navigator.onLine,
  isInitializing: false,
  isAuthenticated: false,
  error: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_INITIALIZING':
      return { ...state, isInitializing: action.payload };
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_GROUPS':
      return { ...state, groups: action.payload };
    case 'SET_ACTIVE_GROUP':
      return { ...state, activeGroupId: action.payload };
    case 'SET_GROUP_DATA':
      return {
        ...state,
        groupData: {
          ...state.groupData,
          [action.payload.groupId]: action.payload.data,
        },
      };
    case 'SET_ONLINE':
      return { ...state, isOnline: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'ADD_MESSAGE': {
      const { groupId, message } = action.payload;
      const currentData = state.groupData[groupId];
      if (!currentData) return state;

      // Check if message already exists (avoid duplicates)
      const messageExists = currentData.messages.some(m => m.id === message.id);
      if (messageExists) return state;

      return {
        ...state,
        groupData: {
          ...state.groupData,
          [groupId]: {
            ...currentData,
            messages: [...currentData.messages, message],
          },
        },
      };
    }
    case 'UPDATE_MESSAGE': {
      const { groupId, localId, message } = action.payload;
      const currentData = state.groupData[groupId];
      if (!currentData) return state;

      // Find and replace the message with the matching localId
      const updatedMessages = currentData.messages.map(m =>
        m.id === localId ? message : m
      );

      return {
        ...state,
        groupData: {
          ...state.groupData,
          [groupId]: {
            ...currentData,
            messages: updatedMessages,
          },
        },
      };
    }
    case 'ADD_GROUP': {
      const group = action.payload;

      // Check if group already exists (avoid duplicates)
      const groupExists = state.groups.some(g => g.id === group.id);
      if (groupExists) return state;

      return {
        ...state,
        groups: [...state.groups, group],
      };
    }
    case 'UPDATE_GROUP': {
      const { localId, group } = action.payload;

      // Find and replace the group with the matching localId
      // Handle case where group.id might be the localId for newly created groups
      const updatedGroups = state.groups.map(g =>
        g.localId === localId || g.id === localId ? group : g
      );

      return {
        ...state,
        groups: updatedGroups,
      };
    }
    case 'LOGIN': {
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        error: null,
      };
    }
    case 'LOGOUT': {
      return {
        ...initialState,
        isOnline: state.isOnline,
      };
    }
    default:
      return state;
  }
}

export interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  login: (user: User) => Promise<void>;
  logout: () => void;
  initializeApp: () => Promise<void>;
  loadGroupData: (groupId: string) => Promise<void>;
  sendMessage: (groupId: string, content: string) => Promise<void>;
  createGroup: (name: string, description?: string) => Promise<ChatGroup>;
  joinGroup: (groupId: string) => Promise<void>;
  isUserMember: (groupId: string) => boolean;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const login = async (user: User) => {
    // Set the user ID in the API
    api.setCurrentUserId(user.id);

    // Store user in local database
    await db.storeUser(user);

    // Update state
    dispatch({ type: 'LOGIN', payload: user });

    // Initialize the app after login
    await initializeApp();
  };

  const logout = () => {
    // Clear the user ID from API
    api.setCurrentUserId(null);

    // Clear state
    dispatch({ type: 'LOGOUT' });

    // Stop sync service
    syncService.stop();
  };

  const initializeApp = useCallback(async () => {
    try {
      dispatch({ type: 'SET_INITIALIZING', payload: true });

      await db.initDatabase();

      let user = state.user;

      if (state.isOnline && user) {
        try {
          const updatedUser = await api.getCurrentUser();
          await db.storeUser(updatedUser);
          user = updatedUser;
          dispatch({ type: 'SET_USER', payload: updatedUser });
        } catch {
          console.warn('Failed to fetch user from API, using cached data');
        }
      }

      let groups = await db.getGroups();
      console.log('Loaded groups from DB:', groups);
      const pendingGroups = await db.getPendingGroups();

      // Add pending groups as local groups
      const pendingAsGroups = pendingGroups.map(p => ({
        id: p.localId,
        localId: p.localId,
        entityType: 'GROUP' as const,
        name: p.name,
        description: p.description,
        createdBy: user!,
        createdAt: p.createdAt,
        updatedAt: p.createdAt,
        isActive: true,
        syncStatus: 'pending' as const,
        members: [{
          userId: user!.id,
          username: user!.username,
          displayName: user!.displayName,
          joinedAt: new Date().toISOString(),
        }], // Creator is automatically a member
      }));

      groups = [...groups, ...pendingAsGroups];

      if (state.isOnline) {
        try {
          const { groups: fetchedGroups } = await api.getGroups();

          console.log('Loaded groups from API:', groups);
          await db.storeGroups(fetchedGroups);
          groups = [...fetchedGroups, ...pendingAsGroups];
        } catch {
          console.warn('Failed to fetch groups from API, using cached data');
        }
      }

      dispatch({ type: 'SET_GROUPS', payload: groups });

      if (groups.length > 0 && !state.activeGroupId) {
        dispatch({ type: 'SET_ACTIVE_GROUP', payload: groups[0].id });
        await loadGroupData(groups[0].id);
      }

      // Start sync service after successful initialization
      syncService.start();

    } catch (error) {
      console.error('Failed to initialize app:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to initialize application' });
    } finally {
      dispatch({ type: 'SET_INITIALIZING', payload: false });
    }
  }, [state.isOnline, state.user,]);

  const loadGroupData = async (groupId: string) => {
    try {
      let groupData = await db.getGroupData(groupId);

      if (!groupData) return;

      dispatch({ type: 'SET_GROUP_DATA', payload: { groupId, data: groupData } });

      // Check if user is a member after loading data from database
      const isUserGroupMember = groupData.members.some(member => member.userId === state.user?.id);
      if (!isUserGroupMember) {
        console.log('User is not a member of group', groupId, 'limiting data access');
        // Update group data to show empty messages since user is not a member
        const limitedGroupData: GroupData = {
          ...groupData,
          messages: [],
        };
        dispatch({ type: 'SET_GROUP_DATA', payload: { groupId, data: limitedGroupData } });
      }

      if (state.isOnline) {
        try {
          const [messagesResponse, membersResponse] = await Promise.all([
            api.getGroupMessages(groupId, groupData.syncState.lastSyncTimestamp),
            api.getGroupMembers(groupId)
          ]);

          console.log('Fetched messages and members for group', groupId, messagesResponse, membersResponse);
          if (messagesResponse.messages.length > 0) {
            await db.storeMessages(groupId, messagesResponse.messages);
          }

          await db.storeMembers(groupId, membersResponse.members);

          await db.storeSyncState(groupId, {
            ...groupData.syncState,
            lastSyncTimestamp: messagesResponse.syncTimestamp || new Date().toISOString()
          });

          // Reload group data from database to get properly merged messages
          const updatedGroupData = await db.getGroupData(groupId);
          if (updatedGroupData) {
            dispatch({ type: 'SET_GROUP_DATA', payload: { groupId, data: updatedGroupData } });
          }
        } catch (err) {
          console.warn('Failed to sync group data, using cached data', err);
        }
      }
    } catch (error) {
      console.error('Failed to load group data:', error);
    }
  };

  const sendMessage = async (groupId: string, content: string) => {
    const localId = crypto.randomUUID();
    const tempMessage = {
      id: localId,
      groupId,
      user: {
        id: state.user!.id,
        username: state.user!.username,
        displayName: state.user!.displayName,
        isAdmin: state.user!.isAdmin,
        createdAt: state.user!.createdAt,
      },
      content,
      messageType: 'text' as const,
      createdAt: new Date().toISOString(),
      syncStatus: 'pending' as const,
    };

    dispatch({ type: 'ADD_MESSAGE', payload: { groupId, message: tempMessage } });
    await db.addPendingMessage(groupId, tempMessage);

    if (state.isOnline) {
      try {
        const sentMessage = await api.sendMessage(groupId, content, localId);
        dispatch({ type: 'UPDATE_MESSAGE', payload: { groupId, localId, message: { ...sentMessage, syncStatus: 'synced' } } });
        await db.removePendingMessages(groupId, [localId]);
        await db.storeMessages(groupId, [{ ...sentMessage, syncStatus: 'synced' }]);
      } catch (error) {
        console.error('Failed to send message:', error);
        dispatch({
          type: 'UPDATE_MESSAGE', payload: {
            groupId,
            localId,
            message: { ...tempMessage, syncStatus: 'failed' }
          }
        });
      }
    } else {
      // When offline, trigger sync to ensure message gets synced when back online
      syncService.triggerSync();
    }
  };

  const isUserMember = (groupId: string): boolean => {
    const group = state.groups.find(g => g.id === groupId);
    if (!group || !state.user) return false;
    return group.members?.some(member => member.userId === state.user!.id);
  };

  const joinGroup = async (groupId: string) => {
    if (!state.user) return;

    const localId = crypto.randomUUID();
    const pendingEvent: PendingMembershipEvent = {
      localId,
      groupId,
      action: 'JOIN',
      timestamp: new Date().toISOString(),
    };

    // Optimistically update the UI - add user to the group's user list
    const updatedGroups = state.groups.map(group => {
      if (group.id === groupId) {
        // Check if user is already in the group to avoid duplicates
        const isAlreadyMember = group.members.some(member => member.userId === state.user!.id);
        if (!isAlreadyMember) {
          const newMember = {
            userId: state.user!.id,
            username: state.user!.username,
            displayName: state.user!.displayName,
            joinedAt: new Date().toISOString(),
          };
          return {
            ...group,
            members: [...group.members, newMember]
          };
        }
      }
      return group;
    });

    dispatch({ type: 'SET_GROUPS', payload: updatedGroups });

    if (state.isOnline) {
      try {
        await api.joinGroup(groupId);

        // Refresh the groups to get updated membership from server
        const { groups: fetchedGroups } = await api.getGroups();
        await db.storeGroups(fetchedGroups);
        dispatch({ type: 'SET_GROUPS', payload: fetchedGroups });
      } catch (error) {
        console.error('Failed to join group:', error);

        // Revert the optimistic update on error
        dispatch({ type: 'SET_GROUPS', payload: state.groups });
        throw error;
      }
    } else {
      // Store the pending membership event for later sync
      await db.addPendingMembershipEvent(pendingEvent);
      // Update local storage with optimistic change
      await db.storeGroups(updatedGroups);
    }
  };

  const createGroup = async (name: string, description?: string) => {
    const localId = crypto.randomUUID();
    const tempGroup: ChatGroup = {
      id: localId,
      localId,
      entityType: 'GROUP',
      name,
      description,
      createdBy: state.user!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      syncStatus: 'pending',
      members: [{
        userId: state.user!.id,
        username: state.user!.username,
        displayName: state.user!.displayName,
        joinedAt: new Date().toISOString(),
      }], // Creator is automatically a member
    };

    // Add the group optimistically to the UI
    dispatch({ type: 'ADD_GROUP', payload: tempGroup });

    // Store as pending in the local database
    await db.addPendingGroup({
      localId,
      name,
      description,
      createdAt: tempGroup.createdAt,
    });

    // Store the group in the database and create initial group data structure
    await db.storeGroups([tempGroup]);
    await db.storeSyncState(localId, {
      lastSyncTimestamp: '1970-01-01T00:00:00.000Z',
      pendingMessages: [],
      pendingMembershipEvents: [],
      pendingGroups: [],
    });

    if (state.isOnline) {
      try {
        const serverGroup = await api.createGroup(name, description, localId);
        const syncedGroup = {
          ...serverGroup,
          syncStatus: 'synced' as const,
          localId // Preserve the localId for tracking purposes
        };

        // Update the group with server data
        dispatch({ type: 'UPDATE_GROUP', payload: { localId, group: syncedGroup } });

        // If this group is currently active, update the active group ID to use the server ID
        if (state.activeGroupId === localId) {
          dispatch({ type: 'SET_ACTIVE_GROUP', payload: syncedGroup.id });
        }

        // Remove from pending groups and store as synced
        await db.removePendingGroups([localId]);

        // Remove the old group with localId as key from database
        await db.removeGroupById(localId);

        // Store the updated group with server ID
        const updatedGroups = state.groups.map(g =>
          g.localId === localId || g.id === localId ? syncedGroup : g
        );
        await db.storeGroups(updatedGroups);


        return syncedGroup;
      } catch (error) {
        console.error('Failed to create group:', error);

        // Update the group to show it failed to sync
        const failedGroup = { ...tempGroup, syncStatus: 'failed' as const };
        dispatch({ type: 'UPDATE_GROUP', payload: { localId, group: failedGroup } });


        return tempGroup; // Return the local group so UI can still work
      }
    } else {
      // When offline, trigger sync to ensure group gets synced when back online
      syncService.triggerSync();
      return tempGroup;
    }
  };

  // Remove automatic initialization - now happens after login

  useEffect(() => {
    const handleOnline = () => dispatch({ type: 'SET_ONLINE', payload: true });
    const handleOffline = () => dispatch({ type: 'SET_ONLINE', payload: false });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // Listen for sync completion events - use ref to access current state
    const handleSyncComplete = async (groupId: string) => {
      console.log('Sync completed for group:', groupId);

      // Refresh the groups list to get any ID updates from sync
      const updatedGroups = await db.getGroups();
      dispatch({ type: 'SET_GROUPS', payload: updatedGroups });

      // If the active group was updated (local ID -> server ID), update the active group ID
      const currentActiveGroup = state.groups.find(g => g.id === state.activeGroupId || g.localId === state.activeGroupId);
      if (currentActiveGroup && currentActiveGroup.localId === state.activeGroupId) {
        const updatedActiveGroup = updatedGroups.find(g => g.localId === currentActiveGroup.localId);
        if (updatedActiveGroup && updatedActiveGroup.id !== state.activeGroupId) {
          dispatch({ type: 'SET_ACTIVE_GROUP', payload: updatedActiveGroup.id });
        }
      }

      // Always refresh group data if it's loaded
      const updatedGroupData = await db.getGroupData(groupId);
      if (updatedGroupData) {
        console.log('Updating group data after sync:', groupId, updatedGroupData.messages.length, 'messages');
        dispatch({ type: 'SET_GROUP_DATA', payload: { groupId, data: updatedGroupData } });
      }
    };

    syncService.onSyncComplete(handleSyncComplete);

    return () => {
      syncService.removeSyncListener(handleSyncComplete);
    };
  }, []); // Empty dependency array - this should run once and register the permanent handler

  return (
    <AppContext.Provider value={{
      state,
      dispatch,
      login,
      logout,
      initializeApp,
      loadGroupData,
      sendMessage,
      createGroup,
      joinGroup,
      isUserMember
    }}>
      {children}
    </AppContext.Provider>
  );
}


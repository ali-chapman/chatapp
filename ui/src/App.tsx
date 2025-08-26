import { AppProvider } from './context/AppContext';
import { useApp } from './hooks/useApp';
import { LoginScreen } from './components/LoginScreen';
import { GroupSidebar } from './components/GroupSidebar';
import { GroupHeader } from './components/GroupHeader';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import './App.css';

function ChatApp() {
  const { state, login } = useApp();

  // Show login screen if not authenticated
  if (!state.isAuthenticated) {
    return <LoginScreen onLogin={login} />;
  }

  if (state.isInitializing) {
    return <div className="loading">Loading...</div>;
  }

  if (state.error) {
    return <div className="error">{state.error}</div>;
  }

  return (
    <div className="app">
      <GroupSidebar />
      <div className="chat-area">
        <GroupHeader />
        <MessageList />
        <MessageInput />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ChatApp />
    </AppProvider>
  );
}
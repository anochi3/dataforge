import { useAuth } from '../auth/context';

export function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <main className="container">
      <header className="topbar">
        <h1>DataForge</h1>
        <div className="topbar-right">
          <span>{user?.email}</span>
          <button onClick={logout}>Log out</button>
        </div>
      </header>
      <p>Your datasets will appear here.</p>
    </main>
  );
}
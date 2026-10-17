import { useEffect, useState } from 'react';
import { authApi } from '../api/auth.js';
import { AuthContext } from './auth-context.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let active = true;
    authApi
      .refresh()
      .then((session) => active && setUser(session.user))
      .catch(() => {})
      .finally(() => active && setIsRestoring(false));
    return () => {
      active = false;
    };
  }, []);

  // login/signup only fetch the session; callers commit it with setUser once the
  // route transition has covered the screen (otherwise GuestRoute redirects mid-animation).
  const login = (credentials) => authApi.login(credentials);
  const signup = (details) => authApi.signup(details);

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext value={{ user, setUser, isRestoring, login, signup, logout }}>
      {children}
    </AuthContext>
  );
}

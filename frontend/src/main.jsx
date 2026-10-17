import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/instrument-serif';
import '@fontsource/instrument-serif/400-italic.css';
import './styles.css';
import { AppRoutes } from './AppRoutes.jsx';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { HeartbreakProvider } from './components/HeartbreakTransition.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <HeartbreakProvider>
          <AppRoutes />
        </HeartbreakProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);

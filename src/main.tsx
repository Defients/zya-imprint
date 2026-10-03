import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PasswordGate } from './components/PasswordGate';
import { ToastProvider } from './components/Toast';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <PasswordGate>
        <App />
      </PasswordGate>
    </ToastProvider>
  </StrictMode>,
);

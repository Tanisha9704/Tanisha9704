import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { App } from './App';
import { MultiWalletProvider } from './wallet/multiWalletProvider';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MultiWalletProvider>
      <App />
      <Toaster position="top-right" toastOptions={{ style: { background: '#111', color: '#fff' } }} />
    </MultiWalletProvider>
  </React.StrictMode>,
);

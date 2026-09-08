import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/App';
import { ChannelPreviewRuntime } from '@/components/channel-preview-runtime';
import { AuthProvider, ToastProvider } from '@/components/providers';
import '@/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider><App /><ChannelPreviewRuntime /></AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

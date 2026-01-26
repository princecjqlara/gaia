import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { OrganizationProvider } from './hooks/useOrganization';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <OrganizationProvider>
      <App />
    </OrganizationProvider>
  </React.StrictMode>
);

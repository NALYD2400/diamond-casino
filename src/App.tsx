import React from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { CasinoUserProvider } from './context/CasinoUserContext';
import { CasinoAdminProvider } from './context/CasinoAdminContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { router } from './router';

export default function App() {
  return (
    <ErrorBoundary>
      <CasinoUserProvider>
        <CasinoAdminProvider>
          <RouterProvider router={router} />
        </CasinoAdminProvider>
      </CasinoUserProvider>
    </ErrorBoundary>
  );
}

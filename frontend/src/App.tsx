import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CompanyProvider, useCompany } from './context/CompanyContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CompanySetup from './pages/CompanySetup';
import Clients from './pages/Clients';
import Vehicles from './pages/Vehicles';
import ServiceOrders from './pages/ServiceOrders';
import ServiceOrderForm from './pages/ServiceOrderForm';
import Quotes from './pages/Quotes';
import QuoteForm from './pages/QuoteForm';
import Notes from './pages/Notes';
import CompanySettings from './pages/CompanySettings';
import AdminPanel from './pages/AdminPanel';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Um 4xx é resposta do servidor, não falha de rede: repetir só atrasa a
      // mensagem de erro que o usuário precisa ver.
      retry: (tentativa, erro) => {
        const status = (erro as { status?: number })?.status ?? 0;
        if (status >= 400 && status < 500) return false;
        return tentativa < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

const Carregando = () => <div style={{ padding: '2rem' }}>Carregando…</div>;

const PrivateRoute = ({ children }: { children: ReactElement }) => {
  const { user, isLoading } = useCompany();
  if (isLoading) return <Carregando />;
  if (!user) return <Navigate to="/login" replace />;

  // Admin sem empresa vai para o painel administrativo; usuário comum precisa
  // cadastrar a oficina antes de qualquer outra coisa.
  if (!user.company_id) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/setup'} replace />;
  }
  return children;
};

/** O painel admin é a única rota que funciona sem empresa selecionada. */
const AdminRoute = ({ children }: { children: ReactElement }) => {
  const { user, isLoading } = useCompany();
  if (isLoading) return <Carregando />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
};

const SetupRoute = ({ children }: { children: ReactElement }) => {
  const { user, isLoading } = useCompany();
  if (isLoading) return <Carregando />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.company_id) return <Navigate to="/dashboard" replace />;
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<SetupRoute><CompanySetup /></SetupRoute>} />

      <Route path="/admin" element={<AdminRoute><Layout /></AdminRoute>}>
        <Route index element={<AdminPanel />} />
      </Route>

      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />

        <Route path="service-orders" element={<ServiceOrders />} />
        <Route path="service-orders/new" element={<ServiceOrderForm />} />
        <Route path="service-orders/:id" element={<ServiceOrderForm />} />

        <Route path="quotes" element={<Quotes />} />
        <Route path="quotes/new" element={<QuoteForm />} />
        <Route path="quotes/:id" element={<QuoteForm />} />

        <Route path="clients" element={<Clients />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="notes" element={<Notes />} />
        <Route path="settings" element={<CompanySettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CompanyProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </CompanyProvider>
    </QueryClientProvider>
  );
}

export default App;

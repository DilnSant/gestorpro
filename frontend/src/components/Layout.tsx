import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import {
  LayoutDashboard, Users, Car, FileText, FileSignature, StickyNote,
  LogOut, Settings, Building2, Menu, X, ArrowLeft,
} from 'lucide-react';

const MENU = [
  { path: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { path: '/service-orders', label: 'Ordens de serviço', icon: FileText },
  { path: '/quotes', label: 'Orçamentos', icon: FileSignature },
  { path: '/clients', label: 'Clientes', icon: Users },
  { path: '/vehicles', label: 'Veículos', icon: Car },
  { path: '/notes', label: 'Notas', icon: StickyNote },
];

const Layout = () => {
  const { user, logout, impersonando, sairDaImpersonacao } = useCompany();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);

  // Navegar fecha o menu no celular; sem isso o drawer fica por cima da página nova.
  useEffect(() => setMenuAberto(false), [location.pathname]);

  const voltarAoAdmin = async () => {
    setSaindo(true);
    try {
      await sairDaImpersonacao();
      navigate('/admin');
    } finally {
      setSaindo(false);
    }
  };

  return (
    <div className="layout-container">
      {menuAberto && (
        <div className="sidebar-backdrop" onClick={() => setMenuAberto(false)} aria-hidden="true" />
      )}

      <aside className={`sidebar ${menuAberto ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>{user?.company?.name ?? 'GestorPro'}</h2>
          {user?.company?.name && <p className="company-badge">GestorPro</p>}
        </div>

        <nav className="sidebar-nav">
          {MENU.map(({ path, label, icon: Icone }) => (
            <Link
              key={path}
              to={path}
              className={`nav-item ${location.pathname.startsWith(path) ? 'active' : ''}`}
            >
              <Icone size={20} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link to="/settings" className={`nav-item ${location.pathname === '/settings' ? 'active' : ''}`}>
            <Settings size={20} />
            <span>Configurações</span>
          </Link>

          {user?.role === 'admin' && (
            <Link to="/admin" className={`nav-item ${location.pathname === '/admin' ? 'active' : ''}`}>
              <Building2 size={20} />
              <span>Painel admin</span>
            </Link>
          )}

          {impersonando && (
            <button onClick={voltarAoAdmin} className="nav-item btn-logout" disabled={saindo}>
              <ArrowLeft size={20} />
              <span>{saindo ? 'Voltando…' : 'Voltar ao admin'}</span>
            </button>
          )}

          <button onClick={logout} className="nav-item btn-logout">
            <LogOut size={20} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            className="menu-toggle"
            onClick={() => setMenuAberto((aberto) => !aberto)}
            aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuAberto}
          >
            {menuAberto ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div className="user-info">Olá, {user?.name}</div>
        </header>

        <div className="page-content">
          {impersonando && (
            <div className="impersonation-banner">
              <span>
                Você está acessando como <strong>{impersonando}</strong>. Tudo o que fizer aqui
                afeta os dados dessa oficina.
              </span>
              <button className="btn-secondary" onClick={voltarAoAdmin} disabled={saindo}>
                {saindo ? 'Voltando…' : 'Voltar ao admin'}
              </button>
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;

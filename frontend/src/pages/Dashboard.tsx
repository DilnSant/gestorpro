import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle, DollarSign, Users, Wrench } from 'lucide-react';
import { api, formatarData, formatarMoeda } from '../lib/api';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { SkeletonRows } from '../components/Skeleton';

// Todos os números vêm do backend, calculados no banco. A versão anterior desta
// tela exibia valores fixos escritos no código ("12 OS abertas", "R$ 15.420,00").
type Resumo = {
  open_orders: number;
  completed_this_month: number;
  revenue_this_month: number;
  total_clients: number;
  by_status: Record<string, number>;
  recent_orders: {
    id: string;
    order_number: string;
    client_name: string | null;
    vehicle_info: string | null;
    status: string;
    entry_date: string | null;
    total_amount: number;
  }[];
};

const Dashboard = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Resumo>('/api/company/dashboard'),
  });

  const cartoes = [
    {
      title: 'OS abertas',
      value: data ? String(data.open_orders) : '—',
      icon: <Activity size={22} color="var(--primary-color)" />,
    },
    {
      title: 'Concluídas no mês',
      value: data ? String(data.completed_this_month) : '—',
      icon: <CheckCircle size={22} color="var(--status-completed)" />,
    },
    {
      title: 'Receita do mês',
      value: data ? formatarMoeda(data.revenue_this_month) : '—',
      icon: <DollarSign size={22} color="var(--status-completed)" />,
    },
    {
      title: 'Total de clientes',
      value: data ? String(data.total_clients) : '—',
      icon: <Users size={22} color="var(--text-secondary)" />,
    },
  ];

  const porStatus = Object.entries(data?.by_status ?? {}).filter(([, qtd]) => qtd > 0);

  return (
    <>
      <PageHeader title="Painel" subtitle="Como está a oficina hoje" />

      {error && (
        <div className="alert-error">
          {error instanceof Error ? error.message : 'Não foi possível carregar os números.'}
        </div>
      )}

      <div className="grid-stats">
        {cartoes.map((cartao) => (
          <div key={cartao.title} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '0.875rem', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-md)', display: 'flex' }}>
              {cartao.icon}
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{cartao.title}</p>
              <p style={{ margin: '0.125rem 0 0', fontSize: '1.5rem', fontWeight: 700 }}>
                {isLoading ? <span className="skeleton" style={{ display: 'inline-block', width: '4rem', height: '1.25rem' }} /> : cartao.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {porStatus.length > 0 && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Ordens por etapa</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {porStatus.map(([status, quantidade]) => (
              <div
                key={status}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.875rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
              >
                <StatusBadge status={status} />
                <strong>{quantidade}</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                  {quantidade === 1 ? 'ordem' : 'ordens'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Ordens de serviço recentes</h3>
          <Link to="/service-orders" style={{ color: 'var(--primary-color)', fontSize: '0.875rem', fontWeight: 500 }}>
            Ver todas
          </Link>
        </div>

        {isLoading ? (
          <SkeletonRows count={3} />
        ) : !data || data.recent_orders.length === 0 ? (
          <EmptyState
            icon={<Wrench size={28} />}
            title="Nenhuma ordem de serviço ainda"
            description="Assim que a primeira OS for criada, ela aparece aqui com a situação atual."
            action={<Link to="/service-orders/new" className="btn-primary">Criar a primeira OS</Link>}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {data.recent_orders.map((os) => (
              <Link
                key={os.id}
                to={`/service-orders/${os.id}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '0.875rem 1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
              >
                <div>
                  <strong>{os.order_number}</strong>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {os.client_name ?? 'Cliente não informado'} · {os.vehicle_info ?? 'Veículo não informado'} · {formatarData(os.entry_date)}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <StatusBadge status={os.status} />
                  <span style={{ fontWeight: 600 }}>{formatarMoeda(os.total_amount)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default Dashboard;

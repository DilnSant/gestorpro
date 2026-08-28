import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Wrench } from 'lucide-react';
import { api, formatarData, formatarMoeda } from '../lib/api';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { SkeletonCards } from '../components/Skeleton';

type Ordem = {
  id: string;
  order_number: string;
  client_name: string | null;
  vehicle_info: string | null;
  status: string;
  entry_date: string | null;
  total_amount: number;
};

const STATUS_FILTRO = [
  { value: '', label: 'Todas as situações' },
  { value: 'pending', label: 'Pendente' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'waiting_parts', label: 'Aguardando peças' },
  { value: 'completed', label: 'Concluída' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'cancelled', label: 'Cancelada' },
];

const ServiceOrders = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [erro, setErro] = useState('');

  const { data: ordens = [], isLoading } = useQuery({
    queryKey: ['service-orders'],
    queryFn: () => api.get<Ordem[]>('/api/service-orders'),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete(`/api/service-orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Não foi possível excluir.'),
  });

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ordens.filter((os) => {
      if (status && os.status !== status) return false;
      if (!termo) return true;
      return [os.order_number, os.client_name, os.vehicle_info]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(termo));
    });
  }, [ordens, busca, status]);

  const confirmarExclusao = (os: Ordem) => {
    if (window.confirm(`Excluir a ordem ${os.order_number}? Essa ação não pode ser desfeita.`)) {
      excluir.mutate(os.id);
    }
  };

  return (
    <>
      <PageHeader
        title="Ordens de serviço"
        subtitle={`${ordens.length} ${ordens.length === 1 ? 'ordem cadastrada' : 'ordens cadastradas'}`}
        actions={
          <Link to="/service-orders/new" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={18} /> Nova OS
          </Link>
        }
      />

      {erro && <div className="alert-error">{erro}</div>}

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Buscar por número, cliente ou veículo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar ordens de serviço"
        />
        <select
          className="search-input"
          style={{ maxWidth: '220px' }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filtrar por situação"
        >
          {STATUS_FILTRO.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <SkeletonCards />
      ) : filtradas.length === 0 ? (
        <EmptyState
          icon={<Wrench size={28} />}
          title={ordens.length === 0 ? 'Nenhuma ordem de serviço ainda' : 'Nada encontrado'}
          description={
            ordens.length === 0
              ? 'Crie a primeira ordem a partir de um orçamento aprovado ou direto pelo botão Nova OS.'
              : 'Nenhuma ordem corresponde à busca. Tente outro termo ou limpe o filtro de situação.'
          }
          action={
            ordens.length === 0 ? (
              <Link to="/service-orders/new" className="btn-primary">Nova OS</Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid-cards">
          {filtradas.map((os) => (
            <article key={os.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.0625rem' }}>{os.order_number}</h3>
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    {os.client_name ?? 'Cliente não informado'}
                  </p>
                </div>
                <div className="card-actions">
                  <button
                    className="icon-btn"
                    onClick={() => navigate(`/service-orders/${os.id}`)}
                    aria-label={`Editar ordem ${os.order_number}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => confirmarExclusao(os)}
                    aria-label={`Excluir ordem ${os.order_number}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <p style={{ margin: '0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {os.vehicle_info ?? 'Veículo não informado'} · Entrada {formatarData(os.entry_date)}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <StatusBadge status={os.status} />
                <strong>{formatarMoeda(os.total_amount)}</strong>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
};

export default ServiceOrders;

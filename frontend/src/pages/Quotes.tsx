import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, FileSignature, ArrowRightCircle } from 'lucide-react';
import { api, formatarData, formatarMoeda } from '../lib/api';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { SkeletonCards } from '../components/Skeleton';

type Orcamento = {
  id: string;
  quote_number: string;
  client_name: string | null;
  vehicle_info: string | null;
  status: string;
  valid_until: string | null;
  total_amount: number;
};

const STATUS_FILTRO = [
  { value: '', label: 'Todas as situações' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'sent', label: 'Enviado' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'rejected', label: 'Recusado' },
  { value: 'converted', label: 'Convertido em OS' },
];

const Quotes = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [erro, setErro] = useState('');

  const { data: orcamentos = [], isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => api.get<Orcamento[]>('/api/quotes'),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete(`/api/quotes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotes'] }),
    onError: (e) => setErro(e instanceof Error ? e.message : 'Não foi possível excluir.'),
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return orcamentos.filter((orc) => {
      if (status && orc.status !== status) return false;
      if (!termo) return true;
      return [orc.quote_number, orc.client_name, orc.vehicle_info]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(termo));
    });
  }, [orcamentos, busca, status]);

  const confirmarExclusao = (orc: Orcamento) => {
    setErro('');
    if (window.confirm(`Excluir o orçamento ${orc.quote_number}? Essa ação não pode ser desfeita.`)) {
      excluir.mutate(orc.id);
    }
  };

  return (
    <>
      <PageHeader
        title="Orçamentos"
        subtitle={`${orcamentos.length} ${orcamentos.length === 1 ? 'orçamento cadastrado' : 'orçamentos cadastrados'}`}
        actions={
          <Link to="/quotes/new" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={18} /> Novo orçamento
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
          aria-label="Buscar orçamentos"
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
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={<FileSignature size={28} />}
          title={orcamentos.length === 0 ? 'Nenhum orçamento ainda' : 'Nada encontrado'}
          description={
            orcamentos.length === 0
              ? 'Monte um orçamento para o cliente aprovar. Depois de aprovado, ele vira ordem de serviço em um clique.'
              : 'Nenhum orçamento corresponde à busca. Tente outro termo ou limpe o filtro de situação.'
          }
          action={
            orcamentos.length === 0 ? (
              <Link to="/quotes/new" className="btn-primary">Novo orçamento</Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid-cards">
          {filtrados.map((orc) => (
            <article key={orc.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.0625rem' }}>{orc.quote_number}</h3>
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    {orc.client_name ?? 'Cliente não informado'}
                  </p>
                </div>
                <div className="card-actions">
                  <button
                    className="icon-btn"
                    onClick={() => navigate(`/quotes/${orc.id}`)}
                    aria-label={`Abrir orçamento ${orc.quote_number}`}
                  >
                    <Pencil size={16} />
                  </button>
                  {orc.status !== 'converted' && (
                    <button
                      className="icon-btn danger"
                      onClick={() => confirmarExclusao(orc)}
                      aria-label={`Excluir orçamento ${orc.quote_number}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              <p style={{ margin: '0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {orc.vehicle_info ?? 'Veículo não informado'} · Válido até {formatarData(orc.valid_until)}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <StatusBadge status={orc.status} />
                <strong>{formatarMoeda(orc.total_amount)}</strong>
              </div>

              {/* Converter só faz sentido no orçamento aprovado e ainda não convertido. */}
              {orc.status === 'approved' && (
                <button
                  className="btn-primary"
                  style={{ marginTop: '1rem', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  onClick={() => navigate(`/service-orders/new?from_quote_id=${orc.id}`)}
                >
                  <ArrowRightCircle size={18} /> Converter em OS
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
};

export default Quotes;

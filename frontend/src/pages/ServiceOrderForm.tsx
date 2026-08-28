import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import DocumentForm, { type DocumentoBase } from '../components/DocumentForm';
import PageHeader from '../components/PageHeader';

const STATUS = [
  { value: 'pending', label: 'Pendente' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'waiting_parts', label: 'Aguardando peças' },
  { value: 'completed', label: 'Concluída' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'cancelled', label: 'Cancelada' },
];

const CAMPOS_DATA = [
  { name: 'entry_date', label: 'Entrada' },
  { name: 'estimated_date', label: 'Previsão de entrega' },
  { name: 'completion_date', label: 'Conclusão' },
];

type Ordem = DocumentoBase & { order_number?: string };

const ServiceOrderForm = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const deQuoteId = params.get('from_quote_id');
  const editando = Boolean(id);
  const convertendo = Boolean(deQuoteId) && !editando;

  const [erroConversao, setErroConversao] = useState('');
  // A conversão cria uma OS no servidor. Sem esta trava, o StrictMode do React
  // (que monta o efeito duas vezes em desenvolvimento) geraria duas ordens.
  const jaConverteu = useRef(false);

  const { data: ordem, isLoading } = useQuery({
    queryKey: ['service-order', id],
    queryFn: () => api.get<Ordem>(`/api/service-orders/${id}`),
    enabled: editando,
  });

  useEffect(() => {
    if (!convertendo || jaConverteu.current) return;
    jaConverteu.current = true;

    api
      .post<{ id: string }>(`/api/quotes/${deQuoteId}/convert`)
      .then((nova) => {
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
        queryClient.invalidateQueries({ queryKey: ['service-orders'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        navigate(`/service-orders/${nova.id}`, { replace: true });
      })
      .catch((e) => setErroConversao(e instanceof Error ? e.message : 'Não foi possível converter.'));
  }, [convertendo, deQuoteId, navigate, queryClient]);

  if (convertendo) {
    return (
      <>
        <PageHeader title="Converter orçamento" />
        {erroConversao ? (
          <>
            <div className="alert-error">{erroConversao}</div>
            <button className="btn-secondary" onClick={() => navigate('/quotes')}>
              Voltar aos orçamentos
            </button>
          </>
        ) : (
          <p>Convertendo orçamento em ordem de serviço…</p>
        )}
      </>
    );
  }

  if (editando && isLoading) return <p>Carregando ordem de serviço…</p>;

  const salvar = async (dados: Record<string, unknown>) => {
    const salva = editando
      ? await api.put(`/api/service-orders/${id}`, dados)
      : await api.post('/api/service-orders', dados);
    queryClient.invalidateQueries({ queryKey: ['service-orders'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    return salva;
  };

  return (
    <>
      <PageHeader
        title={editando ? `Ordem de serviço ${ordem?.order_number ?? ''}` : 'Nova ordem de serviço'}
        subtitle={editando ? undefined : 'O número é gerado automaticamente ao salvar.'}
      />
      <DocumentForm
        titulo="Dados da ordem"
        documento={ordem}
        statusOpcoes={STATUS}
        camposData={CAMPOS_DATA}
        onSalvar={salvar}
        voltarPara="/service-orders"
      />
    </>
  );
};

export default ServiceOrderForm;

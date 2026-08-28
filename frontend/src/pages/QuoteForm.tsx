import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import DocumentForm, { type DocumentoBase } from '../components/DocumentForm';
import PageHeader from '../components/PageHeader';

const STATUS = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'sent', label: 'Enviado' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'rejected', label: 'Recusado' },
];

const CAMPOS_DATA = [{ name: 'valid_until', label: 'Válido até' }];

type Orcamento = DocumentoBase & { quote_number?: string; status?: string };

const QuoteForm = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const editando = Boolean(id);

  const { data: orcamento, isLoading } = useQuery({
    queryKey: ['quote', id],
    queryFn: () => api.get<Orcamento>(`/api/quotes/${id}`),
    enabled: editando,
  });

  if (editando && isLoading) return <p>Carregando orçamento…</p>;

  // Um orçamento convertido virou OS: editá-lo faria o documento divergir da
  // ordem que ele originou, então a tela abre em leitura.
  const convertido = orcamento?.status === 'converted';

  const salvar = async (dados: Record<string, unknown>) => {
    const salvo = editando
      ? await api.put(`/api/quotes/${id}`, dados)
      : await api.post('/api/quotes', dados);
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    return salvo;
  };

  return (
    <>
      <PageHeader
        title={editando ? `Orçamento ${orcamento?.quote_number ?? ''}` : 'Novo orçamento'}
        subtitle={editando ? undefined : 'O número é gerado automaticamente ao salvar.'}
      />
      <DocumentForm
        titulo="Dados do orçamento"
        documento={orcamento}
        statusOpcoes={
          convertido ? [...STATUS, { value: 'converted', label: 'Convertido em OS' }] : STATUS
        }
        camposData={CAMPOS_DATA}
        somenteLeitura={convertido}
        aviso={
          convertido
            ? 'Este orçamento já virou ordem de serviço e por isso não pode mais ser alterado.'
            : undefined
        }
        onSalvar={salvar}
        voltarPara="/quotes"
      />
    </>
  );
};

export default QuoteForm;

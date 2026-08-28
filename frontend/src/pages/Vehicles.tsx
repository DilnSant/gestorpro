import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Car } from 'lucide-react';
import { api } from '../lib/api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonCards } from '../components/Skeleton';

type Veiculo = {
  id: string;
  client_id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  km: number | null;
  chassis: string | null;
  client?: { id: string; name: string } | null;
};

type Cliente = { id: string; name: string };

const Vehicles = () => {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Veiculo | null>(null);
  const [erro, setErro] = useState('');

  const { data: veiculos = [], isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get<Veiculo[]>('/api/vehicles'),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<Cliente[]>('/api/clients'),
  });

  const salvar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      editando ? api.put(`/api/vehicles/${editando.id}`, dados) : api.post('/api/vehicles', dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      fechar();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Não foi possível salvar.'),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete(`/api/vehicles/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
    onError: (e) => setErro(e instanceof Error ? e.message : 'Não foi possível excluir.'),
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return veiculos;
    return veiculos.filter((v) =>
      [v.plate, v.brand, v.model, v.client?.name]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(termo)),
    );
  }, [veiculos, busca]);

  const abrir = (veiculo: Veiculo | null) => {
    setEditando(veiculo);
    setErro('');
    setAberto(true);
  };

  const fechar = () => {
    setAberto(false);
    setEditando(null);
    setErro('');
  };

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const dados = Object.fromEntries(form) as Record<string, unknown>;
    // Campos numéricos vazios viram null; string vazia faria o servidor recusar.
    dados.year = form.get('year') ? Number(form.get('year')) : null;
    dados.km = form.get('km') ? Number(form.get('km')) : null;
    salvar.mutate(dados);
  };

  const confirmarExclusao = (veiculo: Veiculo) => {
    setErro('');
    if (window.confirm(`Excluir o veículo ${veiculo.plate}? Veículos com ordens de serviço não podem ser excluídos.`)) {
      excluir.mutate(veiculo.id);
    }
  };

  const semClientes = clientes.length === 0;

  return (
    <>
      <PageHeader
        title="Veículos"
        subtitle={`${veiculos.length} ${veiculos.length === 1 ? 'veículo cadastrado' : 'veículos cadastrados'}`}
        actions={
          <button
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={() => abrir(null)}
            disabled={semClientes}
            title={semClientes ? 'Cadastre um cliente antes' : undefined}
          >
            <Plus size={18} /> Novo veículo
          </button>
        }
      />

      {erro && !aberto && <div className="alert-error">{erro}</div>}

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Buscar por placa, marca, modelo ou dono"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar veículos"
        />
      </div>

      {isLoading ? (
        <SkeletonCards />
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={<Car size={28} />}
          title={veiculos.length === 0 ? 'Nenhum veículo ainda' : 'Nada encontrado'}
          description={
            semClientes
              ? 'Todo veículo pertence a um cliente. Cadastre um cliente primeiro e depois volte aqui.'
              : veiculos.length === 0
                ? 'Cadastre o primeiro veículo para poder abrir orçamentos e ordens de serviço sobre ele.'
                : 'Nenhum veículo corresponde à busca. Tente outro termo.'
          }
          action={
            veiculos.length === 0 && !semClientes ? (
              <button className="btn-primary" onClick={() => abrir(null)}>Novo veículo</button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid-cards">
          {filtrados.map((veiculo) => (
            <article key={veiculo.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.0625rem' }}>{veiculo.plate}</h3>
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    {[veiculo.brand, veiculo.model].filter(Boolean).join(' ') || 'Modelo não informado'}
                    {veiculo.year ? ` · ${veiculo.year}` : ''}
                  </p>
                </div>
                <div className="card-actions">
                  <button className="icon-btn" onClick={() => abrir(veiculo)} aria-label={`Editar veículo ${veiculo.plate}`}>
                    <Pencil size={16} />
                  </button>
                  <button className="icon-btn danger" onClick={() => confirmarExclusao(veiculo)} aria-label={`Excluir veículo ${veiculo.plate}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '0.875rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                <p style={{ margin: 0 }}>Dono: {veiculo.client?.name ?? 'não informado'}</p>
                <p style={{ margin: '0.25rem 0 0' }}>
                  {veiculo.color || 'Cor não informada'}
                  {veiculo.km !== null ? ` · ${veiculo.km.toLocaleString('pt-BR')} km` : ''}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      {aberto && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={editando ? 'Editar veículo' : 'Novo veículo'}>
          <div className="card modal">
            <h2>{editando ? 'Editar veículo' : 'Novo veículo'}</h2>
            {erro && <div className="alert-error">{erro}</div>}

            <form onSubmit={enviar}>
              <div className="form-grid">
                <div className="field full">
                  <label htmlFor="client_id">Cliente dono *</label>
                  <select id="client_id" name="client_id" defaultValue={editando?.client_id ?? ''} required>
                    <option value="">Selecione…</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="plate">Placa *</label>
                  <input id="plate" name="plate" defaultValue={editando?.plate} required />
                </div>
                <div className="field">
                  <label htmlFor="brand">Marca</label>
                  <input id="brand" name="brand" defaultValue={editando?.brand ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor="model">Modelo</label>
                  <input id="model" name="model" defaultValue={editando?.model ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor="year">Ano</label>
                  <input id="year" name="year" type="number" min="1900" max="2100" defaultValue={editando?.year ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor="color">Cor</label>
                  <input id="color" name="color" defaultValue={editando?.color ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor="km">Quilometragem</label>
                  <input id="km" name="km" type="number" min="0" defaultValue={editando?.km ?? ''} />
                </div>
                <div className="field full">
                  <label htmlFor="chassis">Chassi</label>
                  <input id="chassis" name="chassis" defaultValue={editando?.chassis ?? ''} />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={fechar}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={salvar.isPending}>
                  {salvar.isPending ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default Vehicles;

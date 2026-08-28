import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Users, Mail, Phone } from 'lucide-react';
import { api } from '../lib/api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonCards } from '../components/Skeleton';

type Cliente = {
  id: string;
  name: string;
  cpf_cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

const Clients = () => {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [erro, setErro] = useState('');

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<Cliente[]>('/api/clients'),
  });

  const salvar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      editando ? api.put(`/api/clients/${editando.id}`, dados) : api.post('/api/clients', dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      fechar();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Não foi possível salvar.'),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete(`/api/clients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Não foi possível excluir.'),
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return clientes;
    return clientes.filter((c) =>
      [c.name, c.cpf_cnpj, c.phone, c.email].filter(Boolean).some((v) => v!.toLowerCase().includes(termo)),
    );
  }, [clientes, busca]);

  const abrir = (cliente: Cliente | null) => {
    setEditando(cliente);
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
    salvar.mutate(Object.fromEntries(form));
  };

  // O backend recusa excluir cliente com veículo ou OS; o aviso explica isso antes.
  const confirmarExclusao = (cliente: Cliente) => {
    setErro('');
    if (window.confirm(`Excluir ${cliente.name}? Clientes com veículos ou ordens de serviço não podem ser excluídos.`)) {
      excluir.mutate(cliente.id);
    }
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${clientes.length} ${clientes.length === 1 ? 'cliente cadastrado' : 'clientes cadastrados'}`}
        actions={
          <button className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => abrir(null)}>
            <Plus size={18} /> Novo cliente
          </button>
        }
      />

      {erro && !aberto && <div className="alert-error">{erro}</div>}

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Buscar por nome, CPF/CNPJ, telefone ou e-mail"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar clientes"
        />
      </div>

      {isLoading ? (
        <SkeletonCards />
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title={clientes.length === 0 ? 'Nenhum cliente ainda' : 'Nada encontrado'}
          description={
            clientes.length === 0
              ? 'Cadastre o primeiro cliente para poder registrar veículos, orçamentos e ordens de serviço.'
              : 'Nenhum cliente corresponde à busca. Tente outro termo.'
          }
          action={
            clientes.length === 0 ? (
              <button className="btn-primary" onClick={() => abrir(null)}>Novo cliente</button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid-cards">
          {filtrados.map((cliente) => (
            <article key={cliente.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.0625rem' }}>{cliente.name}</h3>
                  {cliente.cpf_cnpj && (
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                      {cliente.cpf_cnpj}
                    </p>
                  )}
                </div>
                <div className="card-actions">
                  <button className="icon-btn" onClick={() => abrir(cliente)} aria-label={`Editar ${cliente.name}`}>
                    <Pencil size={16} />
                  </button>
                  <button className="icon-btn danger" onClick={() => confirmarExclusao(cliente)} aria-label={`Excluir ${cliente.name}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.375rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Phone size={14} /> {cliente.phone || 'Telefone não informado'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Mail size={14} /> {cliente.email || 'E-mail não informado'}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {aberto && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={editando ? 'Editar cliente' : 'Novo cliente'}>
          <div className="card modal">
            <h2>{editando ? 'Editar cliente' : 'Novo cliente'}</h2>
            {erro && <div className="alert-error">{erro}</div>}

            <form onSubmit={enviar}>
              <div className="form-grid">
                <div className="field full">
                  <label htmlFor="name">Nome *</label>
                  <input id="name" name="name" defaultValue={editando?.name} required />
                </div>
                <div className="field">
                  <label htmlFor="cpf_cnpj">CPF / CNPJ</label>
                  <input id="cpf_cnpj" name="cpf_cnpj" defaultValue={editando?.cpf_cnpj ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor="phone">Telefone</label>
                  <input id="phone" name="phone" defaultValue={editando?.phone ?? ''} />
                </div>
                <div className="field full">
                  <label htmlFor="email">E-mail</label>
                  <input id="email" name="email" type="email" defaultValue={editando?.email ?? ''} />
                </div>
                <div className="field full">
                  <label htmlFor="address">Endereço</label>
                  <input id="address" name="address" defaultValue={editando?.address ?? ''} />
                </div>
                <div className="field full">
                  <label htmlFor="notes">Observações</label>
                  <textarea id="notes" name="notes" rows={3} defaultValue={editando?.notes ?? ''} />
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

export default Clients;

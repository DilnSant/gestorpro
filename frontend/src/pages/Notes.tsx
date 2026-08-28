import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, StickyNote, Paperclip, X } from 'lucide-react';
import { api, formatarData } from '../lib/api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonCards } from '../components/Skeleton';

type Nota = {
  id: string;
  title: string;
  content: string | null;
  type: string;
  related_id: string | null;
  file_urls: string | null;
  createdAt: string;
};

const TIPOS = [
  { value: 'general', label: 'Geral' },
  { value: 'service_order', label: 'Ordem de serviço' },
  { value: 'client', label: 'Cliente' },
  { value: 'vehicle', label: 'Veículo' },
];

const rotuloTipo = (tipo: string) => TIPOS.find((t) => t.value === tipo)?.label ?? tipo;

const lerAnexos = (bruto: string | null): string[] => {
  if (!bruto) return [];
  try {
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista.filter((u) => typeof u === 'string') : [];
  } catch {
    return [];
  }
};

const Notes = () => {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Nota | null>(null);
  const [anexos, setAnexos] = useState<string[]>([]);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const [erro, setErro] = useState('');
  const [tipoSelecionado, setTipoSelecionado] = useState('general');
  const [vinculo, setVinculo] = useState('');

  // As listas para o seletor de vínculo só são buscadas quando o tipo escolhido
  // realmente precisa delas.
  const precisaDe = (t: string) => aberto && tipoSelecionado === t;

  const { data: clientes = [], isLoading: carregandoClientes } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/api/clients'),
    enabled: precisaDe('client'),
  });

  const { data: veiculos = [], isLoading: carregandoVeiculos } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get<{ id: string; plate: string; brand: string | null; model: string | null }[]>('/api/vehicles'),
    enabled: precisaDe('vehicle'),
  });

  const { data: ordens = [], isLoading: carregandoOrdens } = useQuery({
    queryKey: ['service-orders'],
    queryFn: () => api.get<{ id: string; order_number: string; client_name: string | null }[]>('/api/service-orders'),
    enabled: precisaDe('service_order'),
  });

  const carregandoVinculos = carregandoClientes || carregandoVeiculos || carregandoOrdens;

  const opcoesVinculo = useMemo(() => {
    if (tipoSelecionado === 'client') {
      return clientes.map((c) => ({ id: c.id, rotulo: c.name }));
    }
    if (tipoSelecionado === 'vehicle') {
      return veiculos.map((v) => ({
        id: v.id,
        rotulo: [v.plate, [v.brand, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' — '),
      }));
    }
    if (tipoSelecionado === 'service_order') {
      return ordens.map((os) => ({
        id: os.id,
        rotulo: `${os.order_number}${os.client_name ? ` — ${os.client_name}` : ''}`,
      }));
    }
    return [];
  }, [tipoSelecionado, clientes, veiculos, ordens]);

  const { data: notas = [], isLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: () => api.get<Nota[]>('/api/notes'),
  });

  const salvar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      editando ? api.put(`/api/notes/${editando.id}`, dados) : api.post('/api/notes', dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      fechar();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Não foi possível salvar.'),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete(`/api/notes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
    onError: (e) => setErro(e instanceof Error ? e.message : 'Não foi possível excluir.'),
  });

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return notas.filter((nota) => {
      if (tipo && nota.type !== tipo) return false;
      if (!termo) return true;
      return [nota.title, nota.content].filter(Boolean).some((c) => c!.toLowerCase().includes(termo));
    });
  }, [notas, busca, tipo]);

  const abrir = (nota: Nota | null) => {
    setEditando(nota);
    setAnexos(lerAnexos(nota?.file_urls ?? null));
    setTipoSelecionado(nota?.type ?? 'general');
    setVinculo(nota?.related_id ?? '');
    setErro('');
    setAberto(true);
  };

  const fechar = () => {
    setAberto(false);
    setEditando(null);
    setAnexos([]);
    setTipoSelecionado('general');
    setVinculo('');
    setErro('');
  };

  const enviarArquivos = async (arquivos: FileList | null) => {
    if (!arquivos || arquivos.length === 0) return;
    setErro('');
    setEnviandoArquivo(true);
    try {
      const { files } = await api.upload(arquivos);
      setAnexos((atuais) => [...atuais, ...files.map((f) => f.url)]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setEnviandoArquivo(false);
    }
  };

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    salvar.mutate({
      title: form.get('title'),
      content: form.get('content'),
      type: tipoSelecionado,
      // Nota geral não carrega vínculo, mesmo que um tenha sido escolhido antes
      // de a pessoa trocar o tipo.
      related_id: tipoSelecionado === 'general' ? null : vinculo || null,
      file_urls: anexos,
    });
  };

  const confirmarExclusao = (nota: Nota) => {
    setErro('');
    if (window.confirm(`Excluir a nota "${nota.title}"? Essa ação não pode ser desfeita.`)) {
      excluir.mutate(nota.id);
    }
  };

  return (
    <>
      <PageHeader
        title="Notas"
        subtitle={`${notas.length} ${notas.length === 1 ? 'nota registrada' : 'notas registradas'}`}
        actions={
          <button className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => abrir(null)}>
            <Plus size={18} /> Nova nota
          </button>
        }
      />

      {erro && !aberto && <div className="alert-error">{erro}</div>}

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Buscar por título ou conteúdo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar notas"
        />
        <select
          className="search-input"
          style={{ maxWidth: '220px' }}
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos os tipos</option>
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <SkeletonCards count={3} />
      ) : filtradas.length === 0 ? (
        <EmptyState
          icon={<StickyNote size={28} />}
          title={notas.length === 0 ? 'Nenhuma nota ainda' : 'Nada encontrado'}
          description={
            notas.length === 0
              ? 'Use as notas para registrar combinados com o cliente, laudos e fotos de peças. Crie a primeira pelo botão Nova nota.'
              : 'Nenhuma nota corresponde à busca. Tente outro termo ou limpe o filtro de tipo.'
          }
        />
      ) : (
        <div className="grid-cards">
          {filtradas.map((nota) => {
            const arquivos = lerAnexos(nota.file_urls);
            return (
              <article key={nota.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.0625rem' }}>{nota.title}</h3>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                      {rotuloTipo(nota.type)} · {formatarData(nota.createdAt)}
                    </p>
                  </div>
                  <div className="card-actions">
                    <button className="icon-btn" onClick={() => abrir(nota)} aria-label={`Editar nota ${nota.title}`}>
                      <Pencil size={16} />
                    </button>
                    <button className="icon-btn danger" onClick={() => confirmarExclusao(nota)} aria-label={`Excluir nota ${nota.title}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {nota.content && (
                  <p style={{ margin: '0.75rem 0 0', fontSize: '0.9375rem', whiteSpace: 'pre-wrap' }}>
                    {nota.content}
                  </p>
                )}

                {arquivos.length > 0 && (
                  <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {arquivos.map((url, i) => (
                      <a
                        key={url}
                        href={api.urlArquivo(url)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}
                      >
                        <Paperclip size={14} /> Anexo {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {aberto && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={editando ? 'Editar nota' : 'Nova nota'}>
          <div className="card modal">
            <h2>{editando ? 'Editar nota' : 'Nova nota'}</h2>
            {erro && <div className="alert-error">{erro}</div>}

            <form onSubmit={enviar}>
              <div className="form-grid">
                <div className="field full">
                  <label htmlFor="title">Título *</label>
                  <input id="title" name="title" defaultValue={editando?.title} required />
                </div>

                <div className="field">
                  <label htmlFor="type">Tipo</label>
                  <select
                    id="type"
                    name="type"
                    value={tipoSelecionado}
                    onChange={(e) => {
                      setTipoSelecionado(e.target.value);
                      // Trocar o tipo invalida o vínculo: uma OS não é um cliente.
                      setVinculo('');
                    }}
                  >
                    {TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Antes isto era um campo de texto pedindo o ID — obrigava a
                    pessoa a achar e colar um UUID de 36 caracteres. */}
                <div className="field">
                  <label htmlFor="related_id">
                    {tipoSelecionado === 'general' ? 'Vínculo' : `${rotuloTipo(tipoSelecionado)} vinculado`}
                  </label>
                  <select
                    id="related_id"
                    name="related_id"
                    value={vinculo}
                    onChange={(e) => setVinculo(e.target.value)}
                    disabled={tipoSelecionado === 'general' || carregandoVinculos}
                  >
                    <option value="">
                      {tipoSelecionado === 'general'
                        ? 'Nota geral, sem vínculo'
                        : carregandoVinculos
                          ? 'Carregando…'
                          : opcoesVinculo.length === 0
                            ? 'Nada cadastrado ainda'
                            : 'Nenhum (opcional)'}
                    </option>
                    {opcoesVinculo.map((opcao) => (
                      <option key={opcao.id} value={opcao.id}>{opcao.rotulo}</option>
                    ))}
                  </select>
                </div>

                <div className="field full">
                  <label htmlFor="content">Conteúdo</label>
                  <textarea id="content" name="content" rows={5} defaultValue={editando?.content ?? ''} />
                </div>

                <div className="field full">
                  <label htmlFor="anexos">Anexos</label>
                  <input
                    id="anexos"
                    type="file"
                    multiple
                    onChange={(e) => enviarArquivos(e.target.files)}
                    disabled={enviandoArquivo}
                  />
                  {enviandoArquivo && (
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Enviando…</p>
                  )}
                  {anexos.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {anexos.map((url, i) => (
                        <span
                          key={url}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.25rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem' }}
                        >
                          <Paperclip size={14} /> Anexo {i + 1}
                          <button
                            type="button"
                            onClick={() => setAnexos((a) => a.filter((u) => u !== url))}
                            aria-label={`Remover anexo ${i + 1}`}
                            style={{ display: 'flex', color: 'var(--status-cancelled)' }}
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={fechar}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={salvar.isPending || enviandoArquivo}>
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

export default Notes;

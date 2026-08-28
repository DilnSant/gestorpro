import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import PageHeader from '../components/PageHeader';

type Empresa = {
  id: string;
  /** Referência persistida. É esta que volta no PUT. */
  logo_url: string | null;
  /** URL assinada, só para renderizar. Gravá-la daria link morto em uma hora. */
  logo_view_url: string | null;
  name: string;
  primary_color: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  cnpj: string | null;
};

const CompanySettings = () => {
  const queryClient = useQueryClient();
  // Duas variáveis de propósito: a referência que se persiste e a URL assinada
  // que se renderiza. Confundi-las grava no banco um link que expira.
  const [logoRef, setLogoRef] = useState<string | null>(null);
  const [logoView, setLogoView] = useState<string | null>(null);
  const [cor, setCor] = useState('#2563EB');
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const { data: empresa, isLoading } = useQuery({
    queryKey: ['company'],
    queryFn: () => api.get<Empresa>('/api/company'),
  });

  useEffect(() => {
    if (empresa) {
      setLogoRef(empresa.logo_url);
      setLogoView(empresa.logo_view_url);
      setCor(empresa.primary_color || '#2563EB');
    }
  }, [empresa]);

  const salvar = useMutation({
    mutationFn: (dados: Record<string, unknown>) => api.put<Empresa>('/api/company', dados),
    onSuccess: (atualizada) => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
      // A cor primária é uma CSS custom property — aplicar já evita o usuário
      // precisar recarregar para ver o efeito.
      document.documentElement.style.setProperty('--primary-color', atualizada.primary_color);
      setSucesso('Dados da empresa salvos.');
      setErro('');
    },
    onError: (e) => {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      setSucesso('');
    },
  });

  const enviarLogo = async (arquivos: FileList | null) => {
    if (!arquivos || arquivos.length === 0) return;
    setErro('');
    setEnviandoLogo(true);
    try {
      const { files } = await api.upload([arquivos[0]!]);
      setLogoRef(files[0]?.url ?? null);
      setLogoView(files[0]?.view_url ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar a logo.');
    } finally {
      setEnviandoLogo(false);
    }
  };

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSucesso('');
    const form = new FormData(e.currentTarget);
    salvar.mutate({
      name: form.get('name'),
      phone: form.get('phone'),
      email: form.get('email'),
      cnpj: form.get('cnpj'),
      address: form.get('address'),
      primary_color: cor,
      logo_url: logoRef,
    });
  };

  if (isLoading) return <p>Carregando dados da empresa…</p>;

  return (
    <>
      <PageHeader title="Configurações da empresa" subtitle="Estes dados aparecem nos seus documentos" />

      <form onSubmit={enviar}>
        <div className="card">
          {erro && <div className="alert-error">{erro}</div>}
          {sucesso && <div className="alert-success">{sucesso}</div>}

          <div className="form-grid">
            <div className="field full">
              <label htmlFor="name">Nome da empresa *</label>
              <input id="name" name="name" defaultValue={empresa?.name} required />
            </div>

            <div className="field">
              <label htmlFor="phone">Telefone</label>
              <input id="phone" name="phone" defaultValue={empresa?.phone ?? ''} />
            </div>

            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" defaultValue={empresa?.email ?? ''} />
            </div>

            <div className="field">
              <label htmlFor="cnpj">CNPJ</label>
              <input id="cnpj" name="cnpj" defaultValue={empresa?.cnpj ?? ''} />
            </div>

            <div className="field">
              <label htmlFor="primary_color">Cor principal</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  id="primary_color"
                  type="color"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  style={{ width: '56px', height: '42px', padding: '0.25rem' }}
                />
                <input
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  pattern="#[0-9a-fA-F]{6}"
                  aria-label="Cor principal em hexadecimal"
                />
              </div>
            </div>

            <div className="field full">
              <label htmlFor="address">Endereço</label>
              <input id="address" name="address" defaultValue={empresa?.address ?? ''} />
            </div>

            <div className="field full">
              <label htmlFor="logo">Logo</label>
              {logoView && (
                <img
                  src={api.urlArquivo(logoView)}
                  alt="Logo da empresa"
                  style={{ maxWidth: '160px', maxHeight: '80px', objectFit: 'contain', marginBottom: '0.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}
                />
              )}
              <input
                id="logo"
                type="file"
                accept="image/*"
                onChange={(e) => enviarLogo(e.target.files)}
                disabled={enviandoLogo}
              />
              {enviandoLogo && (
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Enviando…</p>
              )}
              {logoRef && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}
                  onClick={() => {
                    setLogoRef(null);
                    setLogoView(null);
                  }}
                >
                  Remover logo
                </button>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={salvar.isPending || enviandoLogo}>
              {salvar.isPending ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
};

export default CompanySettings;

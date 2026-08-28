import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, LogIn } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../context/CompanyContext';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonCards } from '../components/Skeleton';

type EmpresaAdmin = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cnpj: string | null;
  stats: { clients: number; vehicles: number; serviceOrders: number; quotes: number };
};

const AdminPanel = () => {
  const navigate = useNavigate();
  const { updateCompanyId } = useCompany();
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState<string | null>(null);

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: () => api.get<EmpresaAdmin[]>('/api/company/admin/all'),
  });

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return empresas;
    return empresas.filter((e) => e.name.toLowerCase().includes(termo));
  }, [empresas, busca]);

  // Impersonação: gravar o company_id da empresa-alvo no perfil do admin faz
  // todas as telas passarem a enxergar os dados dela.
  const acessarComo = async (empresa: EmpresaAdmin) => {
    setErro('');
    setEntrando(empresa.id);
    try {
      localStorage.setItem('gestorpro_impersonando', empresa.name);
      await updateCompanyId(empresa.id);
      navigate('/dashboard');
    } catch (e) {
      localStorage.removeItem('gestorpro_impersonando');
      setErro(e instanceof Error ? e.message : 'Não foi possível acessar a empresa.');
    } finally {
      setEntrando(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Painel administrativo"
        subtitle={`${empresas.length} ${empresas.length === 1 ? 'empresa cadastrada' : 'empresas cadastradas'} na plataforma`}
      />

      {erro && <div className="alert-error">{erro}</div>}

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Buscar empresa pelo nome"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar empresa"
        />
      </div>

      {isLoading ? (
        <SkeletonCards />
      ) : filtradas.length === 0 ? (
        <EmptyState
          icon={<Building2 size={28} />}
          title={empresas.length === 0 ? 'Nenhuma empresa cadastrada' : 'Nada encontrado'}
          description={
            empresas.length === 0
              ? 'As oficinas aparecem aqui assim que concluírem o cadastro inicial.'
              : 'Nenhuma empresa corresponde à busca.'
          }
        />
      ) : (
        <div className="grid-cards">
          {filtradas.map((empresa) => (
            <article key={empresa.id} className="card">
              <h3 style={{ margin: 0, fontSize: '1.0625rem' }}>{empresa.name}</h3>
              <p style={{ margin: '0.25rem 0 1rem', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                {empresa.cnpj || 'CNPJ não informado'} · {empresa.email || 'sem e-mail'}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                {[
                  ['Clientes', empresa.stats.clients],
                  ['Veículos', empresa.stats.vehicles],
                  ['Ordens', empresa.stats.serviceOrders],
                  ['Orçamentos', empresa.stats.quotes],
                ].map(([rotulo, valor]) => (
                  <div key={rotulo as string} style={{ padding: '0.5rem 0.75rem', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-md)' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{rotulo}</p>
                    <strong>{valor}</strong>
                  </div>
                ))}
              </div>

              <button
                className="btn-primary"
                style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                onClick={() => acessarComo(empresa)}
                disabled={entrando !== null}
              >
                <LogIn size={18} />
                {entrando === empresa.id ? 'Entrando…' : 'Acessar como empresa'}
              </button>
            </article>
          ))}
        </div>
      )}
    </>
  );
};

export default AdminPanel;

import { useState } from 'react';
import { useCompany } from '../context/CompanyContext';

const CompanySetup = () => {
  const { user, setupCompany } = useCompany();
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Depois de salvar, o company_id entra no perfil e a rota de setup redireciona
  // sozinha para o painel.
  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    const form = new FormData(e.currentTarget);
    try {
      await setupCompany(Object.fromEntries(form));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar os dados da oficina.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '620px' }}>
        <h2 style={{ color: 'var(--primary-color)', marginTop: 0, marginBottom: '0.5rem' }}>
          Bem-vindo, {user?.name}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: '1.75rem' }}>
          Antes de começar, conte os dados da sua oficina. Eles aparecem nos orçamentos e nas
          ordens de serviço que você emitir.
        </p>

        {erro && <div className="alert-error">{erro}</div>}

        <form onSubmit={enviar}>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="name">Nome da oficina *</label>
              <input id="name" name="name" required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="phone">Telefone</label>
              <input id="phone" name="phone" />
            </div>
            <div className="field">
              <label htmlFor="email">E-mail de contato</label>
              <input id="email" name="email" type="email" />
            </div>
            <div className="field">
              <label htmlFor="cnpj">CNPJ</label>
              <input id="cnpj" name="cnpj" />
            </div>
            <div className="field full">
              <label htmlFor="address">Endereço</label>
              <input id="address" name="address" />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', marginTop: '1.5rem', padding: '0.875rem' }}
            disabled={salvando}
          >
            {salvando ? 'Salvando…' : 'Salvar e continuar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CompanySetup;

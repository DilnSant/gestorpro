import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);
  const { login } = useCompany();
  const navigate = useNavigate();

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setEntrando(true);
    try {
      await login(email);
      navigate('/dashboard');
    } catch (e) {
      // Antes o erro só ia para o console: a tela ficava parada sem explicação.
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar.');
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', marginTop: 0, marginBottom: '0.5rem', color: 'var(--primary-color)' }}>
          GestorPro
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 0, marginBottom: '1.5rem' }}>
          Gestão para oficinas mecânicas
        </p>

        {erro && <div className="alert-error">{erro}</div>}

        <form onSubmit={enviar}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@suaoficina.com.br"
              autoComplete="email"
              required
            />
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '1.25rem', padding: '0.75rem' }} disabled={entrando}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;

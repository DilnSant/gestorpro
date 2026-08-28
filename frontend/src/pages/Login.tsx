import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';

const Login = () => {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [processando, setProcessando] = useState(false);

  const { login, cadastrar } = useCompany();
  const navigate = useNavigate();

  const criando = modo === 'criar';

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setProcessando(true);
    try {
      if (criando) await cadastrar(nome, email, senha);
      else await login(email, senha);
      navigate('/dashboard');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível continuar.');
    } finally {
      setProcessando(false);
    }
  };

  const trocarModo = () => {
    setModo(criando ? 'entrar' : 'criar');
    setErro('');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '420px' }}>
        <h2 style={{ textAlign: 'center', marginTop: 0, marginBottom: '0.5rem', color: 'var(--primary-color)' }}>
          GestorPro
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 0, marginBottom: '1.5rem' }}>
          {criando ? 'Crie sua conta para começar' : 'Gestão para oficinas mecânicas'}
        </p>

        {erro && <div className="alert-error">{erro}</div>}

        <form onSubmit={enviar}>
          <div className="form-grid">
            {criando && (
              <div className="field full">
                <label htmlFor="name">Seu nome</label>
                <input
                  id="name"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}

            <div className="field full">
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

            <div className="field full">
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete={criando ? 'new-password' : 'current-password'}
                minLength={criando ? 8 : undefined}
                required
              />
              {criando && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Pelo menos 8 caracteres.
                </span>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', marginTop: '1.25rem', padding: '0.75rem' }}
            disabled={processando}
          >
            {processando ? 'Aguarde…' : criando ? 'Criar conta' : 'Entrar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.25rem', marginBottom: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {criando ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
          <button
            type="button"
            onClick={trocarModo}
            style={{ color: 'var(--primary-color)', fontWeight: 600 }}
          >
            {criando ? 'Entrar' : 'Criar agora'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;

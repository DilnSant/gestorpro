import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  api,
  descartarToken,
  guardarToken,
  lerToken,
  registrarExpiracaoDeSessao,
} from '../lib/api';

export type Empresa = {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
};

export type Usuario = {
  id: string;
  email: string;
  name: string;
  role: string;
  company_id: string | null;
  company?: Empresa | null;
};

type RespostaAutenticacao = { token: string; user: Usuario };

type ContextoEmpresa = {
  user: Usuario | null;
  isLoading: boolean;
  /** Nome da oficina quando um admin está acessando como ela. */
  impersonando: string | null;
  login: (email: string, senha: string) => Promise<void>;
  cadastrar: (nome: string, email: string, senha: string) => Promise<void>;
  logout: () => void;
  acessarComoEmpresa: (companyId: string, nome: string) => Promise<void>;
  sairDaImpersonacao: () => Promise<void>;
  setupCompany: (dados: Record<string, unknown>) => Promise<void>;
};

const CompanyContext = createContext<ContextoEmpresa | undefined>(undefined);

const CHAVE_IMPERSONACAO = 'gestorpro_impersonando';

const aplicarCorPrimaria = (cor?: string | null) => {
  if (cor) document.documentElement.style.setProperty('--primary-color', cor);
};

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Usuario | null>(null);
  const [impersonando, setImpersonando] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const encerrar = useCallback(() => {
    setUser(null);
    setImpersonando(null);
    descartarToken();
    localStorage.removeItem(CHAVE_IMPERSONACAO);
  }, []);

  // O servidor derrubar o token (expirado ou inválido) precisa derrubar a tela
  // junto — do contrário o app fica mostrando dados de uma sessão que já morreu.
  useEffect(() => registrarExpiracaoDeSessao(encerrar), [encerrar]);

  // A sessão é restaurada perguntando ao servidor quem é o dono do token, não
  // lendo um usuário guardado no navegador: só o servidor sabe se ainda vale.
  useEffect(() => {
    if (!lerToken()) {
      setIsLoading(false);
      return;
    }
    api
      .get<Usuario>('/api/auth/me')
      .then((usuario) => {
        setUser(usuario);
        aplicarCorPrimaria(usuario.company?.primary_color);
        setImpersonando(localStorage.getItem(CHAVE_IMPERSONACAO));
      })
      .catch(() => encerrar())
      .finally(() => setIsLoading(false));
  }, [encerrar]);

  const guardarSessao = useCallback(({ token, user: usuario }: RespostaAutenticacao) => {
    guardarToken(token);
    setUser(usuario);
    aplicarCorPrimaria(usuario.company?.primary_color);
  }, []);

  // Estas funções propagam o erro em vez de só registrar no console: é o que
  // permite a tela mostrar ao usuário o que deu errado.
  const login = useCallback(
    async (email: string, password: string) => {
      guardarSessao(await api.post<RespostaAutenticacao>('/api/auth/login', { email, password }));
    },
    [guardarSessao],
  );

  const cadastrar = useCallback(
    async (name: string, email: string, password: string) => {
      guardarSessao(
        await api.post<RespostaAutenticacao>('/api/auth/register', { name, email, password }),
      );
    },
    [guardarSessao],
  );

  const setupCompany = useCallback(
    async (dados: Record<string, unknown>) => {
      // O token é reemitido com o company_id novo — sem isso as requisições
      // seguintes continuariam sem oficina.
      guardarSessao(await api.post<RespostaAutenticacao>('/api/auth/setup-company', dados));
    },
    [guardarSessao],
  );

  const acessarComoEmpresa = useCallback(
    async (company_id: string, nome: string) => {
      guardarSessao(await api.post<RespostaAutenticacao>('/api/auth/impersonate', { company_id }));
      localStorage.setItem(CHAVE_IMPERSONACAO, nome);
      setImpersonando(nome);
    },
    [guardarSessao],
  );

  const sairDaImpersonacao = useCallback(async () => {
    guardarSessao(
      await api.post<RespostaAutenticacao>('/api/auth/impersonate', { company_id: null }),
    );
    localStorage.removeItem(CHAVE_IMPERSONACAO);
    setImpersonando(null);
  }, [guardarSessao]);

  return (
    <CompanyContext.Provider
      value={{
        user,
        isLoading,
        impersonando,
        login,
        cadastrar,
        logout: encerrar,
        acessarComoEmpresa,
        sairDaImpersonacao,
        setupCompany,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => {
  const contexto = useContext(CompanyContext);
  if (contexto === undefined) {
    throw new Error('useCompany precisa estar dentro de um CompanyProvider');
  }
  return contexto;
};

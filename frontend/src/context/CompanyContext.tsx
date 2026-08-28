import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

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

type ContextoEmpresa = {
  user: Usuario | null;
  isLoading: boolean;
  /** Nome da empresa quando um admin está acessando como ela. */
  impersonando: string | null;
  login: (email: string) => Promise<void>;
  logout: () => void;
  updateCompanyId: (companyId: string) => Promise<void>;
  sairDaImpersonacao: () => Promise<void>;
  setupCompany: (dados: Record<string, unknown>) => Promise<void>;
};

const CompanyContext = createContext<ContextoEmpresa | undefined>(undefined);

const CHAVE_USUARIO = 'gestorpro_user';
const CHAVE_IMPERSONACAO = 'gestorpro_impersonando';

const aplicarCorPrimaria = (cor?: string | null) => {
  if (cor) document.documentElement.style.setProperty('--primary-color', cor);
};

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Usuario | null>(null);
  const [impersonando, setImpersonando] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_USUARIO);
      if (salvo) {
        const usuario = JSON.parse(salvo) as Usuario;
        setUser(usuario);
        aplicarCorPrimaria(usuario.company?.primary_color);
      }
      setImpersonando(localStorage.getItem(CHAVE_IMPERSONACAO));
    } catch {
      // localStorage corrompido ou indisponível: começa deslogado em vez de quebrar.
      localStorage.removeItem(CHAVE_USUARIO);
    }
    setIsLoading(false);
  }, []);

  const guardar = useCallback((usuario: Usuario) => {
    setUser(usuario);
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
    aplicarCorPrimaria(usuario.company?.primary_color);
  }, []);

  // Estas funções propagam o erro em vez de só registrar no console: é o que
  // permite a tela mostrar ao usuário o que deu errado.
  const login = useCallback(
    async (email: string) => {
      const { user: usuario } = await api.post<{ token: string; user: Usuario }>(
        '/api/auth/login',
        { email },
      );
      guardar(usuario);
    },
    [guardar],
  );

  const logout = useCallback(() => {
    setUser(null);
    setImpersonando(null);
    localStorage.removeItem(CHAVE_USUARIO);
    localStorage.removeItem(CHAVE_IMPERSONACAO);
  }, []);

  const updateCompanyId = useCallback(
    async (company_id: string) => {
      if (!user) throw new Error('Nenhum usuário conectado.');
      const atualizado = await api.post<Usuario>('/api/auth/updateMe', {
        userId: user.id,
        company_id,
      });
      guardar(atualizado);
      setImpersonando(localStorage.getItem(CHAVE_IMPERSONACAO));
    },
    [user, guardar],
  );

  const sairDaImpersonacao = useCallback(async () => {
    if (!user) throw new Error('Nenhum usuário conectado.');
    const atualizado = await api.post<Usuario>('/api/auth/updateMe', {
      userId: user.id,
      company_id: null,
    });
    localStorage.removeItem(CHAVE_IMPERSONACAO);
    setImpersonando(null);
    guardar(atualizado);
  }, [user, guardar]);

  const setupCompany = useCallback(
    async (dados: Record<string, unknown>) => {
      if (!user) throw new Error('Nenhum usuário conectado.');
      const atualizado = await api.post<Usuario>('/api/auth/setup-company', {
        userId: user.id,
        ...dados,
      });
      guardar(atualizado);
    },
    [user, guardar],
  );

  return (
    <CompanyContext.Provider
      value={{ user, isLoading, impersonando, login, logout, updateCompanyId, sairDaImpersonacao, setupCompany }}
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

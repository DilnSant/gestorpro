// Lista canônica de papéis.
//
// O SQLite não suporta `enum` no Prisma 5, então o campo é String. Um CHECK
// constraint no banco seria defesa a mais, mas o Prisma não o representa no
// schema e ele apareceria como drift em toda migração futura. A garantia fica
// aqui: `role` nunca é lido do corpo de uma requisição, só atribuído a partir
// desta lista.

export const PAPEIS = ['admin', 'owner'] as const;
export type Papel = (typeof PAPEIS)[number];

/** Papel de quem se cadastra: dono da própria oficina. */
export const PAPEL_PADRAO: Papel = 'owner';

export const ehPapelValido = (valor: unknown): valor is Papel =>
  typeof valor === 'string' && (PAPEIS as readonly string[]).includes(valor);

export const ehAdmin = (papel: string | null | undefined) => papel === 'admin';

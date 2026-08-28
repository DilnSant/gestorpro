import { prisma } from '../prisma';
import { paraCentavos, paraReais } from './dinheiro';

// Lógica compartilhada por Ordem de Serviço e Orçamento: os dois documentos têm a
// mesma estrutura de itens, os mesmos totais e a mesma numeração sequencial.

export const STATUS_OS = [
  'pending',
  'in_progress',
  'waiting_parts',
  'completed',
  'delivered',
  'cancelled',
] as const;

export const STATUS_ORCAMENTO = ['draft', 'sent', 'approved', 'rejected', 'converted'] as const;

export const TIPOS_ITEM = ['service', 'part'] as const;

export type ItemGravavel = {
  type: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  position: number;
};

export type Totais = {
  labor_total_cents: number;
  parts_total_cents: number;
  discount_cents: number;
  total_amount_cents: number;
};

export type ResultadoItens = { itens: ItemGravavel[]; totais: Totais } | { erro: string };

/**
 * Valida a lista de itens vinda da requisição e recalcula tudo no servidor.
 *
 * O total de cada item é derivado de quantidade × preço unitário — nunca aceito
 * pronto do cliente, que poderia mandar `total: 0` numa peça de mil reais.
 */
export function processarItens(itemsBruto: unknown, descontoBruto: unknown): ResultadoItens {
  let lista: unknown = itemsBruto;

  // O frontend manda array; aceitar string JSON mantém compatibilidade com
  // clientes antigos sem obrigar os dois lados a mudarem juntos.
  if (typeof itemsBruto === 'string') {
    try {
      lista = JSON.parse(itemsBruto);
    } catch {
      return { erro: 'A lista de itens está em formato inválido.' };
    }
  }

  if (lista === null || lista === undefined) lista = [];
  if (!Array.isArray(lista)) {
    return { erro: 'A lista de itens está em formato inválido.' };
  }

  const itens: ItemGravavel[] = [];
  let maoDeObra = 0;
  let pecas = 0;

  for (const [indice, bruto] of lista.entries()) {
    const posicao = indice + 1;

    if (typeof bruto !== 'object' || bruto === null) {
      return { erro: `O item ${posicao} está incompleto.` };
    }
    const item = bruto as Record<string, unknown>;

    if (!TIPOS_ITEM.includes(item.type as (typeof TIPOS_ITEM)[number])) {
      return { erro: `O item ${posicao} precisa ser peça ou serviço.` };
    }

    const descricao = typeof item.description === 'string' ? item.description.trim() : '';
    if (!descricao) return { erro: `Descreva o item ${posicao}.` };

    const quantidade = Number(item.quantity);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return { erro: `A quantidade do item ${posicao} é inválida.` };
    }

    // Aceita `unit_price` (reais, o que a API expõe) ou `unit_price_cents`.
    const precoUnitario =
      item.unit_price_cents !== undefined
        ? Number(item.unit_price_cents)
        : paraCentavos(item.unit_price);

    if (precoUnitario === null || !Number.isFinite(precoUnitario) || precoUnitario < 0) {
      return { erro: `O preço do item ${posicao} é inválido.` };
    }

    const totalItem = Math.round(precoUnitario * quantidade);
    if (item.type === 'service') maoDeObra += totalItem;
    else pecas += totalItem;

    itens.push({
      type: item.type as string,
      description: descricao,
      quantity: quantidade,
      unit_price_cents: Math.round(precoUnitario),
      total_cents: totalItem,
      position: indice,
    });
  }

  const desconto =
    descontoBruto === undefined || descontoBruto === null || descontoBruto === ''
      ? 0
      : paraCentavos(descontoBruto);

  if (desconto === null || desconto < 0) {
    return { erro: 'O desconto informado é inválido.' };
  }

  const subtotal = maoDeObra + pecas;
  if (desconto > subtotal) {
    return { erro: 'O desconto não pode ser maior que o total do documento.' };
  }

  return {
    itens,
    totais: {
      labor_total_cents: maoDeObra,
      parts_total_cents: pecas,
      discount_cents: desconto,
      total_amount_cents: subtotal - desconto,
    },
  };
}

/**
 * Numeração sequencial por empresa.
 *
 * Ordena por número, não por data: duas criações no mesmo instante (a precisão de
 * datetime do SQLite é grosseira) davam o mesmo "último" e o mesmo número novo.
 *
 * A corrida entre requisições simultâneas continua existindo, mas agora o
 * @@unique([company_id, order_number]) a transforma em P2002, que as rotas tratam
 * com retry — em vez de gravar duas OS com o mesmo número em silêncio.
 */
export async function proximoNumero(tipo: 'os' | 'orcamento', companyId: string): Promise<string> {
  const prefixo = tipo === 'os' ? 'OS-' : 'ORC-';

  const ultimo =
    tipo === 'os'
      ? await prisma.serviceOrder.findFirst({
          where: { company_id: companyId },
          orderBy: { order_number: 'desc' },
          select: { order_number: true },
        })
      : await prisma.quote.findFirst({
          where: { company_id: companyId },
          orderBy: { quote_number: 'desc' },
          select: { quote_number: true },
        });

  if (!ultimo) return `${prefixo}0001`;

  const atual = 'order_number' in ultimo ? ultimo.order_number : ultimo.quote_number;
  const sequencial = Number.parseInt(atual.replace(/\D/g, ''), 10);
  const proximo = Number.isFinite(sequencial) ? sequencial + 1 : 1;

  return `${prefixo}${String(proximo).padStart(4, '0')}`;
}

export type Snapshots = {
  client_name_snapshot: string;
  vehicle_plate_snapshot: string;
  vehicle_desc_snapshot: string;
};

/**
 * Confirma que cliente e veículo existem, pertencem à empresa e combinam entre si,
 * e devolve os dados congelados do documento.
 *
 * Sem esta checagem dá para criar um documento na própria empresa apontando para o
 * cliente de outra: a foreign key aceita, porque o banco não sabe nada sobre tenant.
 */
export async function validarClienteEVeiculo(
  clientId: string,
  vehicleId: string,
  companyId: string,
): Promise<{ erro: string } | Snapshots> {
  const [cliente, veiculo] = await Promise.all([
    prisma.client.findFirst({
      where: { id: clientId, company_id: companyId },
      select: { id: true, name: true },
    }),
    prisma.vehicle.findFirst({
      where: { id: vehicleId, company_id: companyId },
      select: { id: true, client_id: true, plate: true, brand: true, model: true, year: true },
    }),
  ]);

  if (!cliente) return { erro: 'Cliente não encontrado.' };
  if (!veiculo) return { erro: 'Veículo não encontrado.' };
  if (veiculo.client_id !== clientId) {
    return { erro: 'O veículo informado não pertence a esse cliente.' };
  }

  const descricao = [veiculo.brand, veiculo.model, veiculo.year].filter(Boolean).join(' ');

  return {
    client_name_snapshot: cliente.name,
    vehicle_plate_snapshot: veiculo.plate,
    vehicle_desc_snapshot: descricao || 'Veículo sem descrição',
  };
}

/** Campos de texto e data comuns aos dois documentos. */
export function extrairCamposComuns(
  body: unknown,
  statusValidos: readonly string[],
  camposData: readonly string[],
): Record<string, unknown> | { __erro: string } {
  const dados: Record<string, unknown> = {};
  if (typeof body !== 'object' || body === null) return dados;
  const origem = body as Record<string, unknown>;

  for (const campo of ['description', 'notes']) {
    const valor = origem[campo];
    if (valor === undefined) continue;
    if (valor === null) dados[campo] = null;
    else if (typeof valor === 'string') dados[campo] = valor;
  }

  if (origem.status !== undefined) {
    if (typeof origem.status !== 'string' || !statusValidos.includes(origem.status)) {
      return { __erro: 'Situação inválida para o documento.' };
    }
    dados.status = origem.status;
  }

  for (const campo of camposData) {
    const valor = origem[campo];
    if (valor === undefined) continue;
    if (valor === null || valor === '') {
      dados[campo] = null;
    } else if (typeof valor === 'string' || valor instanceof Date) {
      const data = new Date(valor as string);
      if (Number.isNaN(data.getTime())) {
        return { __erro: 'Data informada é inválida.' };
      }
      dados[campo] = data;
    }
  }

  return dados;
}

// ---------------------------------------------------------------------------
// Serialização
//
// O banco fala centavos e colunas com sufixo `_snapshot`; a API fala reais e os
// nomes que o frontend já usa. A tradução acontece só aqui.
// ---------------------------------------------------------------------------

type ItemDoBanco = {
  type: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
};

type DocumentoDoBanco = {
  client_name_snapshot: string;
  vehicle_plate_snapshot: string;
  vehicle_desc_snapshot: string;
  labor_total_cents: number;
  parts_total_cents: number;
  discount_cents: number;
  total_amount_cents: number;
  items?: ItemDoBanco[];
};

export function serializarDocumento<T extends DocumentoDoBanco>(doc: T) {
  const {
    client_name_snapshot,
    vehicle_plate_snapshot,
    vehicle_desc_snapshot,
    labor_total_cents,
    parts_total_cents,
    discount_cents,
    total_amount_cents,
    items,
    ...resto
  } = doc;

  return {
    ...resto,
    client_name: client_name_snapshot,
    vehicle_info: `${vehicle_plate_snapshot} - ${vehicle_desc_snapshot}`,
    vehicle_plate: vehicle_plate_snapshot,
    labor_total: paraReais(labor_total_cents),
    parts_total: paraReais(parts_total_cents),
    discount: paraReais(discount_cents),
    total_amount: paraReais(total_amount_cents),
    items: (items ?? []).map((item) => ({
      type: item.type,
      description: item.description,
      quantity: item.quantity,
      unit_price: paraReais(item.unit_price_cents),
      total: paraReais(item.total_cents),
    })),
  };
}

import { prisma } from '../prisma';

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

// Os totais são dinheiro. O schema ainda usa Float (BACKLOG 01), então a soma é
// feita em centavos inteiros e só o resultado final vira decimal — sem isso o erro
// de ponto flutuante se acumula item a item e a conta do cliente fecha errada.
export function paraCentavos(valor: unknown): number | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? Math.round(valor * 100) : null;
  }
  if (typeof valor === 'string' && valor.trim() !== '') {
    const numero = Number(valor.replace(',', '.'));
    return Number.isFinite(numero) ? Math.round(numero * 100) : null;
  }
  return null;
}

const paraReais = (centavos: number) => centavos / 100;

export type Totais = {
  labor_total: number;
  parts_total: number;
  discount: number;
  total_amount: number;
};

type ItemBruto = { type?: unknown; description?: unknown; quantity?: unknown; unit_price?: unknown };

export type ItemNormalizado = {
  type: 'service' | 'part';
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type ResultadoItens =
  | { itens: ItemNormalizado[]; totais: Totais }
  | { erro: string };

/**
 * Valida a lista de itens e recalcula todos os totais no servidor.
 *
 * O `total` de cada item é derivado de quantidade × preço unitário — nunca aceito
 * pronto do cliente, que poderia enviar `total: 0` numa peça de mil reais.
 */
export function processarItens(itemsBruto: unknown, descontoBruto: unknown): ResultadoItens {
  let lista: unknown;
  try {
    lista = typeof itemsBruto === 'string' ? JSON.parse(itemsBruto) : itemsBruto;
  } catch {
    return { erro: 'A lista de itens está em formato inválido.' };
  }

  if (lista === null || lista === undefined) lista = [];
  if (!Array.isArray(lista)) {
    return { erro: 'A lista de itens está em formato inválido.' };
  }

  const itens: ItemNormalizado[] = [];
  let laborCentavos = 0;
  let partsCentavos = 0;

  for (const [indice, bruto] of lista.entries()) {
    const posicao = indice + 1;
    if (typeof bruto !== 'object' || bruto === null) {
      return { erro: `O item ${posicao} está incompleto.` };
    }
    const item = bruto as ItemBruto;

    if (item.type !== 'service' && item.type !== 'part') {
      return { erro: `O item ${posicao} precisa ser peça ou serviço.` };
    }

    const description = typeof item.description === 'string' ? item.description.trim() : '';
    if (!description) {
      return { erro: `Descreva o item ${posicao}.` };
    }

    const quantidade = Number(item.quantity);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return { erro: `A quantidade do item ${posicao} é inválida.` };
    }

    // Antes: `labor_total += item.total` sem validação. Um `total` em string
    // transformava a soma em concatenação ("0" + "10" = "010") e gravava lixo.
    const precoUnitario = paraCentavos(item.unit_price);
    if (precoUnitario === null || precoUnitario < 0) {
      return { erro: `O preço do item ${posicao} é inválido.` };
    }

    const totalItem = Math.round(precoUnitario * quantidade);
    if (item.type === 'service') laborCentavos += totalItem;
    else partsCentavos += totalItem;

    itens.push({
      type: item.type,
      description,
      quantity: quantidade,
      unit_price: paraReais(precoUnitario),
      total: paraReais(totalItem),
    });
  }

  const descontoCentavos = descontoBruto === undefined || descontoBruto === null || descontoBruto === ''
    ? 0
    : paraCentavos(descontoBruto);

  if (descontoCentavos === null || descontoCentavos < 0) {
    return { erro: 'O desconto informado é inválido.' };
  }

  const subtotal = laborCentavos + partsCentavos;
  if (descontoCentavos > subtotal) {
    return { erro: 'O desconto não pode ser maior que o total do documento.' };
  }

  return {
    itens,
    totais: {
      labor_total: paraReais(laborCentavos),
      parts_total: paraReais(partsCentavos),
      discount: paraReais(descontoCentavos),
      total_amount: paraReais(subtotal - descontoCentavos),
    },
  };
}

/**
 * Numeração sequencial por empresa.
 *
 * Ordena por número, não por data: duas criações no mesmo instante (a precisão de
 * datetime do SQLite é grosseira) davam o mesmo "último" e o mesmo número novo.
 *
 * BACKLOG 02 — ainda há corrida entre requisições simultâneas. O
 * @@unique([company_id, order_number]) é o que transformaria isso num erro
 * tratável (P2002) em vez de uma duplicata silenciosa.
 */
export async function proximoNumero(
  tipo: 'os' | 'orcamento',
  companyId: string,
): Promise<string> {
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

/**
 * Confirma que cliente e veículo existem, pertencem à empresa e combinam entre si.
 *
 * Sem isto dá para criar um documento na própria empresa apontando para o cliente
 * de outra: a foreign key aceita, porque o banco não sabe nada sobre tenant.
 * Devolve também os textos desnormalizados que o schema espera (client_name,
 * vehicle_info) — a tela lê esses campos sem precisar de join.
 */
export async function validarClienteEVeiculo(
  clientId: string,
  vehicleId: string,
  companyId: string,
): Promise<{ erro: string } | { client_name: string; vehicle_info: string }> {
  const [cliente, veiculo] = await Promise.all([
    prisma.client.findFirst({
      where: { id: clientId, company_id: companyId },
      select: { id: true, name: true },
    }),
    prisma.vehicle.findFirst({
      where: { id: vehicleId, company_id: companyId },
      select: { id: true, client_id: true, plate: true, brand: true, model: true },
    }),
  ]);

  if (!cliente) return { erro: 'Cliente não encontrado.' };
  if (!veiculo) return { erro: 'Veículo não encontrado.' };
  if (veiculo.client_id !== clientId) {
    return { erro: 'O veículo informado não pertence a esse cliente.' };
  }

  const descricao = [veiculo.brand, veiculo.model].filter(Boolean).join(' ');
  return {
    client_name: cliente.name,
    vehicle_info: descricao ? `${veiculo.plate} - ${descricao}` : veiculo.plate,
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

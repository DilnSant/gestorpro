import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, formatarMoeda, lerItens, type Item } from '../lib/api';
import ItemsEditor from './ItemsEditor';

// Ordem de serviço e orçamento têm a mesma estrutura de formulário: cliente,
// veículo, situação, datas, itens e resumo financeiro. O que muda são os status
// disponíveis, os rótulos das datas e o endpoint.

type Cliente = { id: string; name: string };
type Veiculo = { id: string; client_id: string; plate: string; brand?: string; model?: string };

export type DocumentoBase = {
  id?: string;
  client_id?: string;
  vehicle_id?: string;
  status?: string;
  description?: string | null;
  notes?: string | null;
  items?: string | null;
  discount?: number;
  entry_date?: string | null;
  estimated_date?: string | null;
  completion_date?: string | null;
  valid_until?: string | null;
};

type CampoData = { name: string; label: string };

type Props = {
  titulo: string;
  documento?: DocumentoBase | null;
  statusOpcoes: { value: string; label: string }[];
  camposData: CampoData[];
  somenteLeitura?: boolean;
  aviso?: string;
  onSalvar: (dados: Record<string, unknown>) => Promise<unknown>;
  voltarPara: string;
};

const paraInputDate = (valor: string | null | undefined) =>
  valor ? new Date(valor).toISOString().slice(0, 10) : '';

const DocumentForm = ({
  titulo,
  documento,
  statusOpcoes,
  camposData,
  somenteLeitura = false,
  aviso,
  onSalvar,
  voltarPara,
}: Props) => {
  const navigate = useNavigate();

  const [clientId, setClientId] = useState(documento?.client_id ?? '');
  const [vehicleId, setVehicleId] = useState(documento?.vehicle_id ?? '');
  const [status, setStatus] = useState(documento?.status ?? statusOpcoes[0]?.value ?? '');
  const [description, setDescription] = useState(documento?.description ?? '');
  const [notes, setNotes] = useState(documento?.notes ?? '');
  const [discount, setDiscount] = useState(documento?.discount ?? 0);
  const [items, setItems] = useState<Item[]>(() => lerItens(documento?.items));
  const [datas, setDatas] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      camposData.map((c) => [c.name, paraInputDate(documento?.[c.name as keyof DocumentoBase] as string)]),
    ),
  );
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const { data: clientes = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<Cliente[]>('/api/clients'),
  });

  const { data: veiculos = [] } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get<Veiculo[]>('/api/vehicles'),
  });

  // O veículo é sempre escolhido dentro do cliente selecionado — evita a
  // combinação inválida que o servidor recusaria.
  const veiculosDoCliente = useMemo(
    () => veiculos.filter((v) => v.client_id === clientId),
    [veiculos, clientId],
  );

  // Trocar de cliente invalida o veículo escolhido antes.
  useEffect(() => {
    if (vehicleId && !veiculosDoCliente.some((v) => v.id === vehicleId)) {
      setVehicleId('');
    }
  }, [clientId, veiculosDoCliente, vehicleId]);

  const totais = useMemo(() => {
    const mao = items.filter((i) => i.type === 'service').reduce((s, i) => s + i.total, 0);
    const pecas = items.filter((i) => i.type === 'part').reduce((s, i) => s + i.total, 0);
    return { mao, pecas, total: mao + pecas - (Number(discount) || 0) };
  }, [items, discount]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    if (!clientId) return setErro('Escolha o cliente.');
    if (!vehicleId) return setErro('Escolha o veículo.');
    if (items.length === 0) return setErro('Adicione ao menos um serviço ou peça.');
    if (items.some((i) => !i.description.trim())) return setErro('Descreva todos os itens.');
    if (totais.total < 0) return setErro('O desconto não pode ser maior que o total.');

    setSalvando(true);
    try {
      await onSalvar({
        client_id: clientId,
        vehicle_id: vehicleId,
        status,
        description,
        notes,
        discount: Number(discount) || 0,
        items,
        ...Object.fromEntries(camposData.map((c) => [c.name, datas[c.name] || null])),
      });
      navigate(voltarPara);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{titulo}</h2>

        {aviso && <div className="alert-success">{aviso}</div>}
        {erro && <div className="alert-error">{erro}</div>}

        <div className="form-grid">
          <div className="field">
            <label htmlFor="client_id">Cliente *</label>
            <select
              id="client_id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={somenteLeitura}
              required
            >
              <option value="">Selecione…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="vehicle_id">Veículo *</label>
            <select
              id="vehicle_id"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              disabled={somenteLeitura || !clientId}
              required
            >
              <option value="">
                {!clientId
                  ? 'Escolha o cliente primeiro'
                  : veiculosDoCliente.length === 0
                    ? 'Este cliente não tem veículo cadastrado'
                    : 'Selecione…'}
              </option>
              {veiculosDoCliente.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate}{[v.brand, v.model].filter(Boolean).length ? ` — ${[v.brand, v.model].filter(Boolean).join(' ')}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="status">Situação</label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={somenteLeitura}
            >
              {statusOpcoes.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {camposData.map((campo) => (
            <div className="field" key={campo.name}>
              <label htmlFor={campo.name}>{campo.label}</label>
              <input
                id={campo.name}
                type="date"
                value={datas[campo.name] ?? ''}
                onChange={(e) => setDatas((d) => ({ ...d, [campo.name]: e.target.value }))}
                disabled={somenteLeitura}
              />
            </div>
          ))}

          <div className="field full">
            <label htmlFor="description">Descrição do serviço</label>
            <textarea
              id="description"
              rows={3}
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              disabled={somenteLeitura}
              placeholder="O que o cliente relatou e o que será feito"
            />
          </div>

          <ItemsEditor items={items} onChange={setItems} disabled={somenteLeitura} />

          <div className="field">
            <label htmlFor="discount">Desconto (R$)</label>
            <input
              id="discount"
              type="number"
              min="0"
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              disabled={somenteLeitura}
            />
          </div>

          <div className="field full">
            <div className="totals">
              <div className="totals-row">
                <span>Mão de obra</span><span>{formatarMoeda(totais.mao)}</span>
              </div>
              <div className="totals-row">
                <span>Peças</span><span>{formatarMoeda(totais.pecas)}</span>
              </div>
              <div className="totals-row">
                <span>Desconto</span><span>− {formatarMoeda(Number(discount) || 0)}</span>
              </div>
              <div className="totals-row grand">
                <span>Total</span><span>{formatarMoeda(totais.total)}</span>
              </div>
            </div>
          </div>

          <div className="field full">
            <label htmlFor="notes">Observações internas</label>
            <textarea
              id="notes"
              rows={2}
              value={notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              disabled={somenteLeitura}
              placeholder="Não aparece para o cliente"
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate(voltarPara)}>
            {somenteLeitura ? 'Voltar' : 'Cancelar'}
          </button>
          {!somenteLeitura && (
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          )}
        </div>
      </div>
    </form>
  );
};

export default DocumentForm;

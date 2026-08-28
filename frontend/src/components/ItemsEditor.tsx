import { Trash2 } from 'lucide-react';
import { formatarMoeda, type Item } from '../lib/api';

interface Props {
  items: Item[];
  onChange: (items: Item[]) => void;
  disabled?: boolean;
}

const ItemsEditor = ({ items, onChange, disabled = false }: Props) => {
  const adicionar = (type: 'service' | 'part') => {
    onChange([...items, { type, description: '', quantity: 1, unit_price: 0, total: 0 }]);
  };

  // Atualização imutável: a versão anterior copiava o array mas mutava o objeto
  // dentro dele, alterando o estado do React no lugar.
  const atualizar = (indice: number, campo: keyof Item, valor: string | number) => {
    onChange(
      items.map((item, i) => {
        if (i !== indice) return item;
        const atualizado = { ...item, [campo]: valor } as Item;
        atualizado.total = Number((atualizado.quantity * atualizado.unit_price).toFixed(2));
        return atualizado;
      }),
    );
  };

  const remover = (indice: number) => onChange(items.filter((_, i) => i !== indice));

  return (
    <div className="field full">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <label>Itens</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn-secondary" onClick={() => adicionar('service')} disabled={disabled}>
            + Serviço
          </button>
          <button type="button" className="btn-secondary" onClick={() => adicionar('part')} disabled={disabled}>
            + Peça
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
          Nenhum item ainda. Adicione os serviços e as peças para o total ser calculado.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {items.map((item, idx) => (
            <div
              key={idx}
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
            >
              <select
                value={item.type}
                onChange={(e) => atualizar(idx, 'type', e.target.value)}
                disabled={disabled}
                aria-label={`Tipo do item ${idx + 1}`}
                style={{ width: '110px', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
              >
                <option value="service">Serviço</option>
                <option value="part">Peça</option>
              </select>

              <input
                type="text"
                value={item.description}
                onChange={(e) => atualizar(idx, 'description', e.target.value)}
                placeholder="Descrição"
                required
                disabled={disabled}
                aria-label={`Descrição do item ${idx + 1}`}
                style={{ flex: '1 1 180px', minWidth: '140px', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
              />

              <input
                type="number"
                value={item.quantity}
                onChange={(e) => atualizar(idx, 'quantity', Number(e.target.value) || 0)}
                min="0.01"
                step="0.01"
                disabled={disabled}
                aria-label={`Quantidade do item ${idx + 1}`}
                style={{ width: '80px', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
              />

              <input
                type="number"
                value={item.unit_price}
                onChange={(e) => atualizar(idx, 'unit_price', Number(e.target.value) || 0)}
                min="0"
                step="0.01"
                disabled={disabled}
                aria-label={`Preço unitário do item ${idx + 1}`}
                style={{ width: '110px', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
              />

              <span style={{ width: '110px', fontWeight: 600, textAlign: 'right' }}>
                {formatarMoeda(item.total)}
              </span>

              <button
                type="button"
                className="icon-btn danger"
                onClick={() => remover(idx)}
                disabled={disabled}
                aria-label={`Remover item ${idx + 1}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ItemsEditor;

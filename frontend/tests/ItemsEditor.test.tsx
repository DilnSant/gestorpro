import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemsEditor from '../src/components/ItemsEditor';
import type { Item } from '../src/lib/api';

const item = (over: Partial<Item> = {}): Item => ({
  type: 'part',
  description: 'Filtro',
  quantity: 2,
  unit_price: 10,
  total: 20,
  ...over,
});

/**
 * O ItemsEditor é controlado: sem alguém segurando o estado, a prop `items` não
 * muda entre as teclas e cada caractere digitado parte do valor original —
 * digitar "33.33" acabaria gravando só o último "3".
 */
function Palco({ inicial, aoMudar }: { inicial: Item[]; aoMudar?: (i: Item[]) => void }) {
  const [items, setItems] = useState(inicial);
  return (
    <ItemsEditor
      items={items}
      onChange={(novos) => {
        setItems(novos);
        aoMudar?.(novos);
      }}
    />
  );
}

describe('lista vazia', () => {
  it('explica o que fazer em vez de só dizer que está vazia', () => {
    render(<ItemsEditor items={[]} onChange={() => {}} />);
    expect(screen.getByText(/adicione os serviços e as peças/i)).toBeInTheDocument();
  });
});

describe('adicionar', () => {
  it('acrescenta um serviço com quantidade 1 e preço zero', async () => {
    const aoMudar = vi.fn();
    render(<ItemsEditor items={[]} onChange={aoMudar} />);

    await userEvent.click(screen.getByRole('button', { name: '+ Serviço' }));

    expect(aoMudar).toHaveBeenCalledWith([
      { type: 'service', description: '', quantity: 1, unit_price: 0, total: 0 },
    ]);
  });

  it('acrescenta uma peça sem apagar os itens que já existiam', async () => {
    const aoMudar = vi.fn();
    render(<ItemsEditor items={[item()]} onChange={aoMudar} />);

    await userEvent.click(screen.getByRole('button', { name: '+ Peça' }));

    expect(aoMudar.mock.calls[0]![0]).toHaveLength(2);
    expect(aoMudar.mock.calls[0]![0][0].description).toBe('Filtro');
  });
});

describe('cálculo do total da linha', () => {
  it('recalcula ao mudar a quantidade', async () => {
    const aoMudar = vi.fn();
    render(<Palco inicial={[item({ quantity: 2, unit_price: 10, total: 20 })]} aoMudar={aoMudar} />);

    const campo = screen.getByLabelText('Quantidade do item 1');
    await userEvent.clear(campo);
    await userEvent.type(campo, '3');

    const ultimo = aoMudar.mock.calls.at(-1)![0][0];
    expect(ultimo.quantity).toBe(3);
    expect(ultimo.total).toBe(30);
  });

  it('arredonda a duas casas em vez de propagar dízima', async () => {
    const aoMudar = vi.fn();
    render(<Palco inicial={[item({ quantity: 3, unit_price: 0, total: 0 })]} aoMudar={aoMudar} />);

    const campo = screen.getByLabelText('Preço unitário do item 1');
    await userEvent.clear(campo);
    await userEvent.type(campo, '33.33');

    const ultimo = aoMudar.mock.calls.at(-1)![0][0];
    // 3 × 33,33 daria 99,99000000000001 em ponto flutuante puro.
    expect(ultimo.total).toBe(99.99);
    expect(screen.getByText('R$ 99,99')).toBeInTheDocument();
  });

  it('não muta o item original ao atualizar', async () => {
    const original = item();
    const congelado = { ...original };
    const aoMudar = vi.fn();

    render(<ItemsEditor items={[original]} onChange={aoMudar} />);
    const campo = screen.getByLabelText('Quantidade do item 1');
    await userEvent.clear(campo);
    await userEvent.type(campo, '9');

    // A versão anterior copiava o array mas mutava o objeto dentro dele,
    // alterando o estado do React no lugar.
    expect(original).toEqual(congelado);
  });
});

describe('remover', () => {
  it('tira só a linha pedida', async () => {
    const aoMudar = vi.fn();
    render(
      <ItemsEditor
        items={[item({ description: 'Primeiro' }), item({ description: 'Segundo' })]}
        onChange={aoMudar}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remover item 1' }));

    expect(aoMudar).toHaveBeenCalledWith([expect.objectContaining({ description: 'Segundo' })]);
  });
});

describe('somente leitura', () => {
  it('desabilita todos os controles', () => {
    render(<ItemsEditor items={[item()]} onChange={() => {}} disabled />);

    expect(screen.getByRole('button', { name: '+ Serviço' })).toBeDisabled();
    expect(screen.getByLabelText('Descrição do item 1')).toBeDisabled();
    expect(screen.getByLabelText('Quantidade do item 1')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remover item 1' })).toBeDisabled();
  });
});

describe('acessibilidade', () => {
  it('nomeia cada campo, para leitor de tela e para o teste', () => {
    render(<ItemsEditor items={[item(), item()]} onChange={() => {}} />);

    expect(screen.getByLabelText('Tipo do item 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Descrição do item 2')).toBeInTheDocument();
  });
});

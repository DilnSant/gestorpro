// O banco guarda centavos inteiros; a API fala em reais decimais. Toda conversão
// passa por aqui — é o que impede a unidade de se perder no meio do caminho.

/**
 * Converte um valor vindo da requisição em centavos inteiros.
 * Aceita número (12.34), string ("12.34" ou "12,34") e devolve `null` para
 * qualquer coisa que não represente um valor monetário.
 */
export function paraCentavos(valor: unknown): number | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? Math.round(valor * 100) : null;
  }
  if (typeof valor === 'string') {
    const limpo = valor.trim().replace(',', '.');
    if (limpo === '') return null;
    const numero = Number(limpo);
    return Number.isFinite(numero) ? Math.round(numero * 100) : null;
  }
  return null;
}

/** Centavos inteiros para reais decimais, na saída da API. */
export const paraReais = (centavos: number): number => centavos / 100;

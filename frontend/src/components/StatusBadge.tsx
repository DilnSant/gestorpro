const ROTULOS: Record<string, string> = {
  // Ordem de serviço
  pending: 'Pendente',
  in_progress: 'Em andamento',
  waiting_parts: 'Aguardando peças',
  completed: 'Concluída',
  delivered: 'Entregue',
  cancelled: 'Cancelada',
  // Orçamento
  draft: 'Rascunho',
  sent: 'Enviado',
  approved: 'Aprovado',
  rejected: 'Recusado',
  converted: 'Convertido em OS',
};

const StatusBadge = ({ status }: { status: string }) => (
  <span className="status-badge" data-status={status}>
    {ROTULOS[status] ?? status}
  </span>
);

export const rotuloStatus = (status: string) => ROTULOS[status] ?? status;

export default StatusBadge;

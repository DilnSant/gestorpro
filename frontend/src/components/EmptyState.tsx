import React from 'react';

type Props = {
  icon: React.ReactNode;
  title: string;
  /** Diga como criar o primeiro registro — "nenhum resultado" sozinho não ajuda. */
  description: string;
  action?: React.ReactNode;
};

const EmptyState = ({ icon, title, description, action }: Props) => (
  <div className="empty-state">
    <div className="empty-state-icon">{icon}</div>
    <h3>{title}</h3>
    <p>{description}</p>
    {action}
  </div>
);

export default EmptyState;

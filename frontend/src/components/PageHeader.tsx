import React from 'react';

type Props = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

const PageHeader = ({ title, subtitle, actions }: Props) => (
  <header className="page-header">
    <div>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>
);

export default PageHeader;

type PageHeaderProps = {
  title: string;
  description?: string;
  children?: React.ReactNode;
};

/** Page heading: an H1 with an optional supporting sentence. */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-h1">{title}</h1>
      {description ? <p className="text-body text-text-muted">{description}</p> : null}
      {children}
    </div>
  );
}
